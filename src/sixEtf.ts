import { catalogEntry, type CatalogAsset } from './catalog.ts'
import type { Currency } from './currency.ts'

type SixAsset = Pick<CatalogAsset, 'category' | 'reference' | 'isin' | 'listing' | 'market'>
export type SixClosing = { isin: string; symbol: string; currency: Currency; price: string | number; day: string }

export function sixEtfLine(asset: SixAsset) {
  if (asset.category !== 'etf') return null
  const known = catalogEntry(asset.category, asset.reference)
  const listing = asset.listing ?? known?.listing
  const isin = asset.isin ?? known?.isin ?? asset.reference
  if (!/^XSWX:[A-Z0-9][A-Z0-9._-]{0,30}$/.test(listing ?? '') || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return null
  const symbol = listing!.slice(5)
  if (asset.market && asset.market.code !== symbol + '.SW') return null
  const registered = listing ? catalogEntry(asset.category, listing) : undefined
  const currency = asset.market?.currency ?? (registered?.isin === isin ? registered?.market?.currency : undefined)
  return { isin, symbol, currency }
}

function sixDay(value: unknown) {
  const date = String(value)
  if (!/^\d{8}$/.test(date)) return null
  const day = date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6)
  const parsed = Date.parse(day + 'T00:00:00Z')
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === day ? day : null
}

export function parseSixClosings(value: unknown) {
  const data = value as { colNames?: string[]; rowData?: unknown[][] } | null
  const columns = ['ISIN', 'ValorSymbol', 'TradingBaseCurrency', 'ClosingPrice', 'LatestTradeDate', 'MarketDate', 'Exchange']
  if (!Array.isArray(data?.colNames) || !Array.isArray(data.rowData)) throw new Error('Le relevé SIX a un format inattendu.')
  const positions = columns.map(column => data.colNames!.indexOf(column))
  if (positions.includes(-1)) throw new Error('Les colonnes de cotation SIX sont indisponibles.')
  const result = new Map<string, SixClosing[]>()
  for (const row of data.rowData) {
    if (!Array.isArray(row)) continue
    const [isin, symbol, currency, price, traded, market, venue] = positions.map(index => row[index])
    const day = sixDay(traded)
    const marketDay = sixDay(market)
    if (venue !== 'XSWX' || typeof isin !== 'string' || typeof symbol !== 'string'
      || (currency !== 'CHF' && currency !== 'EUR' && currency !== 'USD') || (typeof price !== 'string' && typeof price !== 'number')
      || !day || !marketDay || day > marketDay) continue
    const key = isin + '/' + symbol
    const entry: SixClosing = { isin, symbol, currency, price, day }
    const entries = result.get(key)
    if (entries) entries.push(entry)
    else result.set(key, [entry])
  }
  return result
}

export function findSixClosing(closings: ReturnType<typeof parseSixClosings>, line: NonNullable<ReturnType<typeof sixEtfLine>>) {
  const matches = closings.get(line.isin + '/' + line.symbol) ?? []
  const currencies = new Set(matches.map(quote => quote.currency))
  if (!line.currency && currencies.size !== 1) return null
  return matches.filter(quote => !line.currency || quote.currency === line.currency)
    .sort((a, b) => b.day.localeCompare(a.day))[0] ?? null
}
