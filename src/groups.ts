import { Decimal } from 'decimal.js'
import { currencies, type Currency } from './currency.ts'
import { replay, type Mark, type Operation } from './ledger.ts'
import { assetKey, summarize, type Position } from './portfolio.ts'
import type { CatalogAsset } from './catalog.ts'

export type GroupAsset = Pick<CatalogAsset, 'category' | 'reference' | 'name' | 'isin' | 'listing' | 'market'>
export type Allocation = { asset: GroupAsset; percent: string }
export type AllocationSnapshot = { at: number; entries: Allocation[] }
export type GroupEntry = { id: string; at: number; amount: string }
export type InvestmentGroup = {
  id: string; name: string; platform: string; type: 'managed' | 'strategy'; mode: 'estimate' | 'exact'
  currency: Currency; initial: string; createdAt: number; description: string
  allocations: AllocationSnapshot[]
  flows: (GroupEntry & { kind: 'deposit' | 'withdrawal' })[]
  valuations: GroupEntry[]
  positions: Position[]
  operations: Operation[]
}

const zero = new Decimal(0)
export const groupTypes = { managed: 'Portefeuille géré', strategy: 'Stratégie personnelle' } as const
export const currentAllocation = (group: InvestmentGroup) => group.allocations.at(-1)?.entries ?? []

export function allocationTotal(entries: Allocation[]) {
  const keys = new Set<string>()
  let total = zero
  for (const { asset, percent } of entries) {
    const key = assetKey(asset)
    if (asset.category !== 'etf' || keys.has(key)) throw new Error('Chaque ligne de cotation ETF doit être unique.')
    keys.add(key)
    if (typeof percent !== 'string' || !/^\d{1,3}(?:\.\d{1,18})?$/.test(percent)) throw new Error('Renseigne un pourcentage valide pour chaque ETF.')
    total = total.plus(percent)
  }
  if (total.gt(100)) throw new Error('L’allocation totale dépasse 100 %.')
  return total
}

export function groupCapital(group: InvestmentGroup, at = Infinity) {
  return group.flows.filter(flow => flow.at <= at).reduce((total, flow) =>
    flow.kind === 'deposit' ? total.plus(flow.amount) : total.minus(flow.amount), new Decimal(group.initial))
}

export function allocationAmounts(group: InvestmentGroup) {
  const capital = Decimal.max(0, groupCapital(group))
  const entries = currentAllocation(group)
  return {
    entries: entries.map(entry => ({ ...entry, amount: capital.times(entry.percent).div(100) })),
    remaining: capital.times(new Decimal(100).minus(allocationTotal(entries))).div(100),
  }
}

export function groupLedger(group: InvestmentGroup, marks: Mark[]) {
  const assets = new Set([...group.positions, ...group.operations].map(assetKey))
  const positions = new Set(group.positions.map(position => position.id))
  return { positions: group.positions, operations: group.operations,
    marks: marks.filter(mark => mark.kind === 'market' ? assets.has(mark.target) : positions.has(mark.target)) }
}

export function groupValue(group: InvestmentGroup, marks: Mark[], rate: (currency: string) => Decimal | null) {
  const exact = group.mode === 'exact'
  const holdings = exact ? replay(groupLedger(group, marks), [], rate, true).holdings : []
  const summary = summarize(holdings)
  const declared = group.valuations.reduce<GroupEntry | undefined>((last, entry) => !last || entry.at >= last.at ? entry : last, undefined)
  const fx = declared && !exact ? rate(group.currency) : null
  return { holdings, summary, declared, value: exact
    ? summary.priced ? summary.amount : null
    : declared && fx ? fx.times(declared.amount) : null }
}

export function validateGroup(group: InvestmentGroup) {
  if (!group.id || !group.name.trim() || group.name.length > 100 || !group.platform.trim() || group.platform.length > 80
    || !currencies.includes(group.currency) || !Object.hasOwn(groupTypes, group.type) || !['estimate', 'exact'].includes(group.mode)
    || typeof group.description !== 'string' || group.description.length > 500) throw new Error('Informations du groupe invalides.')
  const amount = (value: string) => typeof value === 'string' && /^\d{1,18}(?:\.\d{1,18})?$/.test(value)
  const date = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= Date.now() + 300000
  if (!date(group.createdAt) || !amount(group.initial)) throw new Error('Capital initial ou date invalide.')
  for (const [index, snapshot] of group.allocations.entries()) {
    if (!date(snapshot.at) || snapshot.at < group.createdAt || (index && snapshot.at <= group.allocations[index - 1].at)) {
      throw new Error('Les dates des allocations doivent être distinctes et croissantes.')
    }
    allocationTotal(snapshot.entries)
  }
  for (const entries of [group.flows, group.valuations]) {
    if (new Set(entries.map(entry => entry.id)).size !== entries.length
      || entries.some(entry => !entry.id || !date(entry.at) || entry.at < group.createdAt || !amount(entry.amount))) {
      throw new Error('Versement, retrait ou relevé invalide.')
    }
  }
  if (group.flows.some(flow => !['deposit', 'withdrawal'].includes(flow.kind) || new Decimal(flow.amount).lte(0))) {
    throw new Error('Le montant d’un versement ou retrait doit être positif.')
  }
  if ([...group.positions, ...group.operations].some(entry => entry.category !== 'etf' || entry.platform !== group.platform)
    || group.operations.some(operation => operation.kind === 'transfer')
    || (group.mode === 'estimate' && (group.positions.length || group.operations.length))) {
    throw new Error('Les opérations du groupe doivent concerner ses ETF et sa plateforme.')
  }
  replay(groupLedger(group, []))
}
