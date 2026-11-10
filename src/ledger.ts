import { Decimal } from 'decimal.js'
import { assetKey, platformKey, type Category, type Position } from './portfolio.ts'
import { dayKey, daysBefore } from './currency.ts'
import { marketClosedDay } from './marketCalendar.ts'
import { catalogEntry } from './catalog.ts'

export type OperationKind = 'buy' | 'sell' | 'transfer'
export const operationNames = { buy: 'Achat', sell: 'Vente', transfer: 'Transfert' } as const

export interface Operation {
  id: string
  category: Position['category']
  reference: string
  name: string
  listing?: string
  isin?: string
  market?: Position['market']
  kind: OperationKind
  platform: string
  destination?: string
  quantity: string
  gross: string
  fee: string
  feeUnits?: string
  original?: { gross: string; fee: string; currency: NonNullable<Position['purchase']>['currency']; rate: string }
  at: number
  createdAt: number
}

export interface Mark {
  id: string
  kind: 'manual' | 'market'
  target: string
  price: string | null
  at: number
  sourceAt: number
  source: string
  originalPrice?: string
  currency?: string
  timing?: 'close' | 'reported'
  instrument?: string
  receivedAt?: number
}

type Asset = Pick<Position, 'category' | 'reference' | 'name' | 'listing' | 'market'>
type Bucket = {
  asset: Asset
  platform: string
  quantity: Decimal
  cost: Decimal | null
  estimated: boolean
  manualId?: string
  tradeMark?: Mark
}

export type Holding = Position & {
  source?: Mark
  usesManualValuation: boolean
  partiallyValued: boolean
  unitPrice: Decimal | null
  averageUnitPrice: boolean
}
export interface HistoryPoint {
  date: string
  at: number
  value: Decimal | null
  netFlows: Decimal | null
  result: Decimal | null
  reconstructed?: boolean
  usedOlderPrices?: boolean
  usesNonMarketPrices?: boolean
  transferFees?: Decimal
  allocation?: Partial<Record<Category, Decimal>>
}

export interface PortfolioData {
  positions: Position[]
  operations: Operation[]
  marks: Mark[]
  platforms?: string[]
}

const D = (value: Decimal.Value) => new Decimal(value)
const poolKey = (asset: Asset, platform: string) => assetKey(asset) + '/' + platformKey(platform)
const sum = (buckets: Bucket[]) => buckets.reduce((total, bucket) => total.plus(bucket.quantity), D(0))
const manualValuationSource = 'Valorisation manuelle'
const manualMarkMatches = (mark: Mark, position: Position) =>
  mark.source !== manualValuationSource || mark.instrument === (position.listing ?? position.reference)

export function unitMark(position: Position): Mark | null {
  if (!position.valuation) return null
  const { amount, updatedAt: at, manual } = position.valuation
  return { id: 'manual/' + position.id + '/' + at, kind: 'manual', target: position.id,
    price: D(amount).div(position.quantity).toFixed(), at, sourceAt: at,
    source: manual ? manualValuationSource : 'Saisie manuelle',
    ...(manual ? { originalPrice: D(manual.amount).div(position.quantity).toFixed(), currency: manual.currency,
      instrument: position.listing ?? position.reference } : {}) }
}

export const isMarketMark = (mark: Mark) =>
  mark.kind === 'market' && mark.price !== null && mark.source !== 'Cours manuel' && D(mark.price).gt(0)

export function replay(data: PortfolioData, historical: Mark[] = [],
  currentRate?: (code: string) => Decimal | null, marketOnly = false) {
  const pools = new Map<string, Bucket[]>()
  const manualMarks = new Map<string, Mark>()
  const marketMarks = new Map<string, Mark>()
  const verifiedMarks = new Map<string, Mark>()
  const pendingOpenings = new Set<string>()
  const sales = new Map<string, Decimal | null>()
  const history = new Map<string, HistoryPoint>()
  const intraday: HistoryPoint[] = []
  const intradayStart = Date.now() - 86400000
  let unknownFlows = false
  let netFlows = D(0)
  let transferFees = D(0)
  let realized = D(0)
  let unknownSales = 0

  function add(bucket: Bucket) {
    const key = poolKey(bucket.asset, bucket.platform)
    const pool = pools.get(key)
    if (pool) pool.push(bucket)
    else pools.set(key, [bucket])
  }

  function markFor(bucket: Bucket, verifiedOnly = false) {
    const manual = bucket.manualId ? manualMarks.get(bucket.manualId) : undefined
    const target = assetKey(bucket.asset)
    const fallback = manual?.source === manualValuationSource && manual.price !== null ? manual : undefined
    if (verifiedOnly || fallback) return verifiedMarks.get(target) ?? fallback
    const market = marketMarks.get(target)
    let best = market
    for (const mark of [bucket.tradeMark, manual]) {
      if (mark && mark.price !== null && (!best || mark.sourceAt >= best.sourceAt)
        && !(mark === bucket.tradeMark && best && best.source !== 'Cours manuel')) best = mark
    }
    return best
  }

  function resolveOpenings() {
    if (!pendingOpenings.size) return
    for (const pool of pools.values()) {
      for (const bucket of pool) {
        if (!bucket.manualId || !pendingOpenings.has(bucket.manualId)) continue
        const mark = markFor(bucket)
        if (!mark || mark.price === null) continue
        netFlows = netFlows.plus(D(mark.price).times(bucket.quantity))
        pendingOpenings.delete(bucket.manualId)
      }
    }
  }

  function record(at: number, endOfDay: boolean) {
    if (historical.length && pools.size === 0) return
    const date = dayKey(at)
    let value = D(0)
    let complete = true
    let usedOlderPrices = false
    let usesNonMarketPrices = false
    const allocation: Partial<Record<Category, Decimal>> = {}
    for (const pool of pools.values()) {
      for (const bucket of pool) {
        const mark = markFor(bucket)
        if (!mark || mark.price === null) {
          complete = false
          continue
        }
        if (!isMarketMark(mark)) usesNonMarketPrices = true
        if (dayKey(mark.sourceAt) !== date) {
          usedOlderPrices = true
          if (historical.length > 0) {
            const venue = bucket.asset.market?.code.split('.').at(-1)
              ?? (bucket.asset.listing || catalogEntry(bucket.asset.category, bucket.asset.reference)?.listing)?.split(':')[0]
            let lastSession = date
            if (venue && bucket.asset.category !== 'crypto' && mark.kind === 'market' && mark.timing === 'close') {
              while (marketClosedDay(venue, lastSession)) lastSession = daysBefore(lastSession, 1)
            }
            if (dayKey(mark.sourceAt) !== lastSession) complete = false
          }
        }
        const amount = D(mark.price).times(bucket.quantity)
        value = value.plus(amount)
        const category = bucket.asset.category
        allocation[category] = (allocation[category] ?? D(0)).plus(amount)
      }
    }
    const flows = unknownFlows || pendingOpenings.size > 0 ? null : netFlows
    const point = { date, at, value: complete ? value : null, usedOlderPrices, usesNonMarketPrices, transferFees, allocation: complete ? allocation : undefined,
      netFlows: flows, result: complete && flows ? value.minus(flows).minus(transferFees) : null }
    if (endOfDay) history.set(date, point)
    if (!historical.length && at >= intradayStart) {
      if (intraday.at(-1)?.at === at) intraday[intraday.length - 1] = point
      else intraday.push(point)
    }
  }

  function applyTrade(trade: Operation) {
    const units = D(trade.quantity)
    const fees = D(trade.fee)
    const gross = D(trade.gross)
    const key = poolKey(trade, trade.platform)
    const pool = pools.get(key) ?? []
    if (!units.gt(0) || fees.lt(0) || gross.lt(0)) throw new Error('Montant ou quantité d’opération invalide.')
    if (trade.kind === 'transfer' && (!trade.destination || poolKey(trade, trade.destination) === key)) {
      throw new Error('Un transfert doit relier deux plateformes différentes.')
    }
    const tradePrice: Mark = { id: trade.id, kind: 'manual', target: '', price: gross.div(units).toFixed(),
      at: trade.at, sourceAt: trade.at, source: 'Prix d’opération' }
    if (trade.kind === 'buy') {
      for (const bucket of pool) bucket.tradeMark = tradePrice
      netFlows = netFlows.plus(gross).plus(fees)
      add({ asset: trade, platform: trade.platform, quantity: units, cost: gross.plus(fees), estimated: false, tradeMark: tradePrice })
      return
    }

    const available = sum(pool)
    const feeUnits = D(trade.feeUnits ?? 0)
    const consumed = trade.kind === 'transfer' ? units.plus(feeUnits) : units
    if (consumed.gt(available)) throw new Error(`Quantité insuffisante pour ${trade.name} sur ${trade.platform} à la date de l’opération.`)
    if (feeUnits.lt(0)) throw new Error('Les frais en unités doivent être positifs ou nuls.')
    let leftToConsume = consumed
    let leftToMove = units
    let leftAvailable = available
    let soldCost = D(0)
    let costKnown = true
    for (const bucket of pool) {
      if (bucket.manualId && pendingOpenings.delete(bucket.manualId)) unknownFlows = true
      const otherUnits = leftAvailable.minus(bucket.quantity)
      const fractionOfRemaining = bucket.quantity.div(leftAvailable)
      const targetTaken = leftToConsume.times(fractionOfRemaining).toDecimalPlaces(18)
      const taken = Decimal.max(leftToConsume.minus(otherUnits),
        Decimal.min(targetTaken, leftToConsume, bucket.quantity))
      const targetMoved = leftToMove.times(fractionOfRemaining).toDecimalPlaces(18)
      const moved = Decimal.max(leftToMove.minus(leftToConsume.minus(taken)),
        Decimal.min(targetMoved, leftToMove, taken))
      const takenCost = bucket.cost?.times(taken.div(bucket.quantity)) ?? null
      if (takenCost === null) costKnown = false
      else soldCost = soldCost.plus(takenCost)
      if (trade.kind === 'transfer' && moved.gt(0)) {
        add({ ...bucket, platform: trade.destination!, quantity: moved,
          cost: bucket.cost?.times(moved.div(bucket.quantity)) ?? null })
      }
      leftAvailable = leftAvailable.minus(bucket.quantity)
      leftToConsume = leftToConsume.minus(taken)
      leftToMove = leftToMove.minus(moved)
      bucket.quantity = bucket.quantity.minus(taken)
      bucket.cost = takenCost === null ? null : bucket.cost!.minus(takenCost)
      if (trade.kind === 'sell' && gross.gt(0)) bucket.tradeMark = tradePrice
    }
    const remaining = pool.filter(bucket => bucket.quantity.gt(0))
    if (remaining.length) pools.set(key, remaining)
    else pools.delete(key)

    if (trade.kind === 'transfer') {
      transferFees = transferFees.plus(fees)
      return
    }
    const proceeds = gross.minus(fees)
    netFlows = netFlows.minus(proceeds)
    const gain = costKnown ? proceeds.minus(soldCost) : null
    sales.set(trade.id, gain)
    if (gain === null) unknownSales += 1
    else realized = realized.plus(gain)
  }

  const positionsById = new Map(data.positions.map(position => [position.id, position]))
  const activeMarks = new Map<string, Mark>()
  for (const position of data.positions) {
    const mark = unitMark(position)
    if (mark) activeMarks.set(mark.id, mark)
  }
  for (const mark of data.marks) {
    const position = positionsById.get(mark.target)
    if (mark.kind === 'market' || (position && manualMarkMatches(mark, position))) activeMarks.set(mark.id, mark)
  }
  for (const mark of historical) activeMarks.set(mark.id, mark)
  const events = [
    ...data.positions.map(value => ({ type: 'opening' as const, at: value.createdAt, order: 0, tie: value.createdAt, value })),
    ...[...activeMarks.values()].map(value => ({ type: 'mark' as const, at: value.at, order: 1, tie: value.at, value })),
    ...data.operations.map(value => ({ type: 'trade' as const, at: value.at, order: 2, tie: value.createdAt, value })),
  ].sort((a, b) => a.at - b.at || a.order - b.order || a.tie - b.tie || a.value.id.localeCompare(b.value.id))

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.type === 'opening') {
      const position = event.value
      const initial = position.initialValue ?? (position.valuation?.updatedAt === position.createdAt ? position.valuation.amount : null)
      if (initial === null) pendingOpenings.add(position.id)
      else netFlows = netFlows.plus(initial)
      add({ asset: position, platform: position.platform, quantity: D(position.quantity),
        cost: position.cost ? D(position.cost.amount) : null,
        estimated: position.cost?.kind === 'estimated', manualId: position.id })
    } else if (event.type === 'trade') applyTrade(event.value)
    else if (event.value.kind === 'market') {
      const previous = marketMarks.get(event.value.target)
      if (!previous || previous.sourceAt <= event.value.sourceAt) marketMarks.set(event.value.target, event.value)
      if (isMarketMark(event.value)) {
        const verified = verifiedMarks.get(event.value.target)
        if (!verified || verified.sourceAt <= event.value.sourceAt) verifiedMarks.set(event.value.target, event.value)
      }
    } else manualMarks.set(event.value.target, event.value)
    resolveOpenings()
    const next = events[i + 1]
    const endOfDay = !next || dayKey(next.at) !== dayKey(event.at)
    if (endOfDay || (!historical.length && event.at >= intradayStart)) record(event.at, endOfDay)
  }

  const holdings: Holding[] = []
  for (const [key, buckets] of pools) {
    const first = buckets[0]
    let value = D(0)
    let basis = D(0)
    let unpriced = false
    let knownBasis = true
    let commonPrice: Decimal | undefined
    let mixedPrices = false
    let usesManualValuation = false
    let source: Mark | undefined
    for (const bucket of buckets) {
      const mark = markFor(bucket, marketOnly)
      if (mark && mark.price !== null) {
        usesManualValuation ||= mark.source === manualValuationSource
        const rate = mark.currency && mark.originalPrice ? currentRate?.(mark.currency) : null
        const price = rate && mark.originalPrice ? D(mark.originalPrice).times(rate) : D(mark.price)
        value = value.plus(price.times(bucket.quantity))
        if (commonPrice === undefined) commonPrice = price
        else if (!commonPrice.eq(price)) mixedPrices = true
        if (!source || mark.sourceAt < source.sourceAt) {
          const label: string = source && source.source !== mark.source ? 'Sources mixtes' : mark.source
          source = { ...mark, source: label }
        } else if (source.source !== mark.source) source = { ...source, source: 'Sources mixtes' }
      } else unpriced = true
      if (bucket.cost === null) knownBasis = false
      else basis = basis.plus(bucket.cost)
    }
    const estimated = buckets.some(bucket => bucket.estimated)
    const units = sum(buckets)
    holdings.push({ id: key, ...first.asset, platform: first.platform, quantity: units.toFixed(),
      unitPrice: unpriced ? null : mixedPrices ? value.div(units) : commonPrice ?? null,
      averageUnitPrice: !unpriced && mixedPrices,
      valuation: source ? { amount: value.toFixed(), updatedAt: source.sourceAt } : null, partiallyValued: unpriced, usesManualValuation,
      cost: !knownBasis ? null : estimated ? { kind: 'estimated', amount: basis.toFixed(), initialPercent: '0', initialValue: '0' }
        : { kind: 'exact', amount: basis.toFixed() }, source, createdAt: 0 })
  }
  return { holdings, history: [...history.values()], intraday, sales, realized, unknownSales }
}

export function firstTrackingDate(data: PortfolioData) {
  return data.operations.reduce((earliest, trade) => Math.min(earliest, trade.at),
    data.positions.reduce((earliest, position) => Math.min(earliest, position.createdAt), Infinity))
}

export function quoteTarget(asset: Pick<Position, 'category' | 'reference'>) {
  return assetKey(asset)
}

export function dailyPortfolioHistory(data: PortfolioData, recorded: HistoryPoint[], historical: Mark[]) {
  const start = firstTrackingDate(data)
  const usable = historical.filter(mark => mark.at >= start)
  if (!usable.length) return recorded
  const combined = new Map(recorded.map(point => [point.date, point]))
  let previous: HistoryPoint | undefined
  let index = 0
  for (const point of replay(data, usable).history) {
    while (index < recorded.length && recorded[index].date <= point.date) previous = recorded[index++]
    const existing = combined.get(point.date)
    if (point.value === null || (existing?.value != null && !existing.usedOlderPrices)) continue
    const flows = previous?.netFlows ?? null
    const fees = previous?.transferFees
    combined.set(point.date, { ...point, netFlows: flows,
      result: flows && fees ? point.value.minus(flows).minus(fees) : null, reconstructed: true })
  }
  return [...combined.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function assetChartMarks(data: PortfolioData, target: string, external: Mark[]) {
  const observed = data.marks.filter(mark => mark.kind === 'market' && mark.target === target && mark.price !== null)
  const market = [...external, ...observed.filter(mark => mark.source !== 'Cours manuel')]
  if (market.length) return { marks: market, official: true }
  const positions = data.positions.filter(position => assetKey(position) === target)
  const byId = new Map(positions.map(position => [position.id, position]))
  const marks = [...observed, ...data.marks.filter(mark => {
    const position = byId.get(mark.target)
    return mark.kind === 'manual' && mark.price !== null && position && manualMarkMatches(mark, position)
  })]
  for (const position of positions) {
    const mark = unitMark(position)
    if (mark) marks.push(mark)
  }
  for (const operation of data.operations) {
    if (assetKey(operation) !== target || operation.kind === 'transfer' || !D(operation.gross).gt(0)) continue
    marks.push({ id: operation.id, kind: 'manual', target, price: D(operation.gross).div(operation.quantity).toFixed(),
      at: operation.at, sourceAt: operation.at, source: 'Prix d’opération' })
  }
  return { marks, official: false }
}
