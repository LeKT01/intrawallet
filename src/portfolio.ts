import { Decimal } from 'decimal.js'
import { catalogEntry } from './catalog.ts'

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
  listing?: string
  initialValue?: string | null
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

export function money(value: Decimal.Value, digits = 2) {
  const rounded = new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP)
  const [whole, fraction] = rounded.abs().toFixed(digits).split('.')
  const signedWhole = BigInt(whole) * (rounded.isNegative() ? -1n : 1n)
  const parts = chfFormatter.formatToParts(rounded.isNegative() && signedWhole === 0n ? -0 : signedWhole)
  return parts.map(part => part.type === 'fraction' ? fraction : part.value).join('')
}

export function unitPrice(value: Decimal.Value) {
  const price = new Decimal(value)
  const digits = price.gt(0) && price.lt(1) ? Math.min(18, 3 - price.e) : 2
  return money(price, digits)
}

export function signedMoney(value: Decimal) {
  return (value.gt(0) ? '+' : '') + money(value)
}

export function quantity(value: Decimal.Value) {
  return new Decimal(value).toFixed().replace('.', ',')
}

export function assetKey({ category, reference }: Pick<Position, 'category' | 'reference'>) {
  return category + '/' + (catalogEntry(category, reference)?.reference ?? reference)
}
export const platformKey = (platform: string) => platform.toLocaleLowerCase('fr-CH')

export function summarize(positions: (Position & { partiallyValued?: boolean })[]) {
  let amount = new Decimal(0)
  let cost = new Decimal(0)
  let priced = 0
  let comparable = 0
  let estimated = false

  for (const position of positions) {
    if (!position.valuation) continue
    amount = amount.plus(position.valuation.amount)
    priced += 1
    if (position.cost && !position.partiallyValued) {
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

export function consolidate<T extends Position>(positions: T[]) {
  const byAsset = new Map<string, T[]>()
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
