import { Decimal } from 'decimal.js'

Decimal.set({ precision: 64 })

export const categories = { stock: 'Action', etf: 'ETF', crypto: 'Crypto' } as const
export type Category = keyof typeof categories

export type Cost =
  | { kind: 'exact'; amount: string }
  | { kind: 'estimated'; amount: string; initialPercent: string; initialValue: string }

export interface Position {
  id: string
  category: Category
  name: string
  reference: string
  platform: string
  quantity: string
  valuation: { amount: string; updatedAt: number } | null
  cost: Cost | null
  createdAt: number
}

export function parseAmount(input: string) {
  const normalized = input.trim().replace(',', '.')
  if (!/^[+-]?\d{1,18}(?:\.\d{1,18})?$/.test(normalized)) return null
  return new Decimal(normalized)
}

export function estimatedCost(value: Decimal, percent: Decimal) {
  return value.div(new Decimal(1).plus(percent.div(100)))
}

const chfFormatter = new Intl.NumberFormat('fr-CH', {
  style: 'currency', currency: 'CHF', currencyDisplay: 'code',
})

export function money(value: Decimal.Value) {
  const rounded = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const [whole, fraction] = rounded.abs().toFixed(2).split('.')
  const signedWhole = BigInt(whole) * (rounded.isNegative() ? -1n : 1n)
  const parts = chfFormatter.formatToParts(rounded.isNegative() && signedWhole === 0n ? -0 : signedWhole)
  return parts.map(part => part.type === 'fraction' ? fraction : part.value).join('')
}

export function signedMoney(value: Decimal) {
  return (value.gt(0) ? '+' : '') + money(value)
}

export function quantity(value: Decimal.Value) {
  return new Decimal(value).toFixed().replace('.', ',')
}

export const assetKey = (position: Position) => position.category + '/' + position.reference
export const platformKey = (platform: string) => platform.toLocaleLowerCase('fr-CH')

export function summarize(positions: Position[]) {
  let amount = new Decimal(0)
  let cost = new Decimal(0)
  let priced = 0
  let comparable = 0
  let estimated = false

  for (const position of positions) {
    if (!position.valuation) continue
    amount = amount.plus(position.valuation.amount)
    priced += 1
    if (position.cost) {
      cost = cost.plus(position.cost.amount)
      comparable += 1
      estimated ||= position.cost.kind === 'estimated'
    }
  }

  return {
    amount,
    priced,
    gain: positions.length > 0 && comparable === positions.length ? amount.minus(cost) : null,
    estimated,
  }
}

export function consolidate(positions: Position[]) {
  const byAsset = new Map<string, Position[]>()
  for (const position of positions) {
    const key = assetKey(position)
    const existing = byAsset.get(key)
    if (existing) existing.push(position)
    else byAsset.set(key, [position])
  }

  return [...byAsset.values()].map(entries => {
    const { name, reference, category } = entries[0]
    return {
      key: assetKey(entries[0]), name, reference, category, entries,
      ...summarize(entries),
      quantity: entries.reduce((sum, entry) => sum.plus(entry.quantity), new Decimal(0)),
      platformCount: new Set(entries.map(entry => platformKey(entry.platform))).size,
    }
  }).sort((left, right) => right.amount.cmp(left.amount) || left.name.localeCompare(right.name, 'fr'))
}
