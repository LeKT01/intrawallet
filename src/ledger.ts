import { Decimal } from 'decimal.js'
import { assetKey, platformKey, type Position } from './portfolio.ts'
import { dayKey } from './currency.ts'

export type OperationKind = 'buy' | 'sell' | 'transfer'
export const operationNames = { buy: 'Achat', sell: 'Vente', transfer: 'Transfert' } as const

export interface Operation {
  id: string
  category: Position['category']
  reference: string
  name: string
  listing?: string
  kind: OperationKind
  platform: string
  destination?: string
  quantity: string
  gross: string
  fee: string
  feeUnits?: string
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
}

type Asset = Pick<Position, 'category' | 'reference' | 'name' | 'listing'>
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
}

export interface PortfolioData {
  positions: Position[]
  operations: Operation[]
  marks: Mark[]
}

const D = (value: Decimal.Value) => new Decimal(value)
const poolKey = (asset: Asset, platform: string) => assetKey(asset) + '/' + platformKey(platform)
const sum = (buckets: Bucket[]) => buckets.reduce((total, bucket) => total.plus(bucket.quantity), D(0))

export function unitMark(position: Position): Mark | null {
  if (!position.valuation) return null
  const at = position.valuation.updatedAt
  return { id: 'manual/' + position.id + '/' + at, kind: 'manual', target: position.id,
    price: D(position.valuation.amount).div(position.quantity).toFixed(), at, sourceAt: at, source: 'Saisie manuelle' }
}

export function replay(data: PortfolioData, historical: Mark[] = []) {
  const pools = new Map<string, Bucket[]>()
  const manualMarks = new Map<string, Mark>()
  const marketMarks = new Map<string, Mark>()
  const pendingOpenings = new Set<string>()
  const sales = new Map<string, Decimal | null>()
  const history = new Map<string, HistoryPoint>()
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

  function markFor(bucket: Bucket) {
    const manual = bucket.manualId ? manualMarks.get(bucket.manualId) : undefined
    const market = marketMarks.get(assetKey(bucket.asset))
    let best = market
    for (const mark of [bucket.tradeMark, manual]) {
      if (mark && mark.price !== null && (!best || mark.sourceAt >= best.sourceAt)) best = mark
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

  function record(at: number) {
    if (historical.length && pools.size === 0) return
    const date = dayKey(at)
    let value = D(0)
    let complete = true
    let usedOlderPrices = false
    for (const pool of pools.values()) {
      for (const bucket of pool) {
        const mark = markFor(bucket)
        if (!mark || mark.price === null) {
          complete = false
          continue
        }
        if (dayKey(mark.sourceAt) !== date) {
          usedOlderPrices = true
          if (historical.length > 0) complete = false
        }
        value = value.plus(D(mark.price).times(bucket.quantity))
      }
    }
    const flows = unknownFlows || pendingOpenings.size > 0 ? null : netFlows
    history.set(date, { date, at, value: complete ? value : null, usedOlderPrices,
      netFlows: flows, result: complete && flows ? value.minus(flows).minus(transferFees) : null })
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
    if (mark.kind === 'market' || positionsById.has(mark.target)) activeMarks.set(mark.id, mark)
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
    } else manualMarks.set(event.value.target, event.value)
    resolveOpenings()
    const next = events[i + 1]
    if (!next || dayKey(next.at) !== dayKey(event.at)) record(event.at)
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
    let source: Mark | undefined
    for (const bucket of buckets) {
      const mark = markFor(bucket)
      if (mark && mark.price !== null) {
        const price = D(mark.price)
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
      valuation: source ? { amount: value.toFixed(), updatedAt: source.sourceAt } : null, partiallyValued: unpriced,
      cost: !knownBasis ? null : estimated ? { kind: 'estimated', amount: basis.toFixed(), initialPercent: '0', initialValue: '0' }
        : { kind: 'exact', amount: basis.toFixed() }, source, createdAt: 0 })
  }
  return { holdings, history: [...history.values()], sales, realized, unknownSales }
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
  const existing = new Set(recorded.map(point => point.date))
  let previous: HistoryPoint | undefined
  let index = 0
  const additions = replay(data, usable).history.flatMap(point => {
    if (existing.has(point.date) || point.value === null) return []
    while (index < recorded.length && recorded[index].date < point.date) previous = recorded[index++]
    const basis = previous?.value != null && previous.result != null ? previous.value.minus(previous.result) : null
    return [{ ...point, netFlows: previous?.netFlows ?? null, result: basis === null ? null : point.value.minus(basis),
      reconstructed: true }]
  })
  return [...recorded, ...additions].sort((a, b) => a.date.localeCompare(b.date))
}

export function assetChartMarks(data: PortfolioData, target: string, external: Mark[]) {
  const observed = data.marks.filter(mark => mark.kind === 'market' && mark.target === target && mark.price !== null)
  const market = [...external, ...observed.filter(mark => mark.source !== 'Cours manuel')]
  if (market.length) return { marks: market, official: true }
  const positions = data.positions.filter(position => assetKey(position) === target)
  const ids = new Set(positions.map(position => position.id))
  const marks = [...observed, ...data.marks.filter(mark => mark.kind === 'manual' && ids.has(mark.target) && mark.price !== null)]
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
