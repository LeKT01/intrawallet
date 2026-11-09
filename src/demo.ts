import { Decimal } from 'decimal.js'
import { dayKey, daysBefore, type FxRate } from './currency.ts'
import type { Mark, Operation, OperationKind, PortfolioData } from './ledger.ts'
import { assetKey, type Position } from './portfolio.ts'

export const demoMode = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('demo') === '1'

export function demoLink(enabled: boolean) {
  const url = new URL(window.location.href)
  if (enabled) url.searchParams.set('demo', '1')
  else url.searchParams.delete('demo')
  return url.pathname + url.search + url.hash
}

const movement = [0, 6, 13, 4, -3, 5, 17, 24, 12, 2, -9, -16, -3, 6, 13, 22, 15, 31, 26, 37, 21, 11, 20, 35, 43, 30, 40, 45, 38, 49]
type DemoAsset = Pick<Position, 'category' | 'reference' | 'name' | 'listing'> & {
  base: number; trend: number; sensitivity: number
}

const bitcoin: DemoAsset = { category: 'crypto', reference: 'BTC', name: 'Bitcoin', base: 60000, trend: 75, sensitivity: 120 }
const etf: DemoAsset = { category: 'etf', reference: 'IE00BFMXXD54', name: 'Vanguard S&P 500 UCITS ETF',
  listing: 'XETR:VUAA', base: 98, trend: 0.27, sensitivity: 0.08 }
const apple: DemoAsset = { category: 'stock', reference: 'XNAS:AAPL', name: 'Apple', listing: 'XNAS:AAPL',
  base: 187, trend: 0.26, sensitivity: -0.32 }

function price(asset: DemoAsset, index: number) {
  return new Decimal(asset.base).plus(new Decimal(asset.trend).times(index))
    .plus(new Decimal(asset.sensitivity).times(movement[index]))
}

function identity({ category, reference, name, listing }: DemoAsset) {
  return { category, reference, name, listing }
}

export function makeDemo(now = Date.now()): PortfolioData {
  const today = dayKey(now)
  const last = movement.length - 1
  const date = (index: number) => index === last ? now : Date.parse(daysBefore(today, last - index) + 'T12:00:00Z')
  const platformA = 'Compte démo A'
  const platformB = 'Compte démo B'

  function opening(id: string, asset: DemoAsset, platform: string, quantity: string, cost: string): Position {
    return { ...identity(asset), id, platform, quantity, createdAt: date(0), valuation: null,
      initialValue: price(asset, 0).times(quantity).toFixed(), cost: { kind: 'exact', amount: cost } }
  }

  function operation(id: string, index: number, asset: DemoAsset, kind: OperationKind, platform: string,
    quantity: string, fee: string, destination?: string): Operation {
    const at = date(index)
    return { ...identity(asset), id, kind, platform, destination, quantity, fee, at, createdAt: at,
      gross: kind === 'transfer' ? '0' : price(asset, index).times(quantity).toFixed() }
  }

  const positions = [
    opening('demo-btc-a', bitcoin, platformA, '0.03', '1575'),
    opening('demo-btc-b', bitcoin, platformB, '0.01', '630'),
    opening('demo-etf', etf, platformA, '12', '1120'),
    opening('demo-apple', apple, platformB, '8', '1460'),
  ]
  const operations = [
    operation('demo-achat-etf', 5, etf, 'buy', platformA, '4', '2'),
    operation('demo-vente-apple', 11, apple, 'sell', platformB, '2', '1'),
    operation('demo-transfert-btc', 17, bitcoin, 'transfer', platformA, '0.006', '0.5', platformB),
    operation('demo-achat-btc', 24, bitcoin, 'buy', platformB, '0.005', '1.5'),
  ]
  const marks = [bitcoin, etf, apple].flatMap((asset): Mark[] => movement.map((_, index) => {
    const at = date(index)
    const target = assetKey(asset)
    return { id: 'demo/' + target + '/' + index, kind: 'market', target, at, sourceAt: at,
      price: price(asset, index).toFixed(), source: 'Cours simulé' }
  }))
  return { positions, operations, marks }
}

export function demoFxRates(today: string): FxRate[] {
  return Array.from({ length: 100 }, (_, index): FxRate[] => {
    const date = daysBefore(today, index)
    return [{ date, quote: 'EUR', rate: '1.08' }, { date, quote: 'USD', rate: '1.21' }]
  }).flat()
}
