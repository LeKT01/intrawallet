import { Decimal } from 'decimal.js'
import { catalogEntry } from './catalog'
import { quoteTarget, type Mark } from './ledger'
import type { Position } from './portfolio'
import { dayKey, type FxRate } from './currency'

type QuoteAsset = Pick<Position, 'category' | 'reference' | 'name' | 'listing'>

async function json(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(9000), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('Fournisseur indisponible.')
  return response.json()
}

function positive(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  try {
    const number = new Decimal(value)
    return number.isFinite() && number.gt(0) ? number : null
  } catch {
    return null
  }
}

function marketMark(asset: QuoteAsset, price: Decimal, source: string, sourceAt: number, at: number): Mark {
  const target = quoteTarget(asset)
  return { id: [target, source, sourceAt, price.toFixed()].join('/'), kind: 'market',
    target, price: price.toFixed(), sourceAt, at, source }
}

const cryptoSource = 'CoinGecko'
const equityLimit = 8
let equityOffset = 0

async function cryptoQuotes(assets: QuoteAsset[]) {
  const matched = assets.flatMap(asset => {
    const coinId = catalogEntry(asset.category, asset.reference)?.coinId
    return coinId ? [{ asset, coinId }] : []
  })
  if (matched.length === 0) return []
  const url = new URL('https://api.coingecko.com/api/v3/simple/price')
  url.search = new URLSearchParams({ ids: matched.map(item => item.coinId).join(','), vs_currencies: 'chf',
    include_last_updated_at: 'true' }).toString()
  const prices = await json(url)
  const at = Date.now()
  return matched.flatMap(({ asset, coinId }) => {
    const price = positive(prices?.[coinId]?.chf)
    const sourceAt = Number(prices?.[coinId]?.last_updated_at) * 1000
    return price && Number.isSafeInteger(sourceAt) && sourceAt > 0 && sourceAt <= at + 300000
      ? [marketMark(asset, price, cryptoSource, sourceAt, at)] : []
  })
}

async function exchangeRate(currency: string, day: string) {
  if (currency === 'CHF') return new Decimal(1)
  const url = new URL('https://api.frankfurter.dev/v2/rates')
  url.search = new URLSearchParams({ base: currency, quotes: 'CHF', from: previousWeek(day), to: day }).toString()
  const data = await json(url)
  const rate = Array.isArray(data)
    ? data.filter(row => row.quote === 'CHF' && row.date <= day)
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))[0]
    : null
  if (!rate) throw new Error('Taux CHF indisponible.')
  const value = positive(rate.rate)
  if (!value) throw new Error('Taux CHF invalide.')
  return value
}

function previousWeek(day: string) {
  return new Date(Date.parse(day + 'T12:00:00Z') - 7 * 86400000).toISOString().slice(0, 10)
}

const usExchanges = new Set(['XNAS', 'XNYS', 'ARCX', 'XASE', 'BATS'])

function equitySymbol(asset: QuoteAsset) {
  const listing = asset.listing || catalogEntry(asset.category, asset.reference)?.listing || asset.reference
  const [mic, symbol] = listing.split(':')
  return symbol && usExchanges.has(mic) ? symbol : null
}

export function quoteAccess(asset: QuoteAsset, apiKey: string) {
  if (asset.category === 'crypto') return catalogEntry(asset.category, asset.reference)?.coinId ? 'available' : 'manual'
  return !equitySymbol(asset) ? 'manual' : apiKey ? 'available' : 'key'
}

const keyStorage = 'portefeuille.finnhub-key'

export function readSessionQuoteKey() {
  try { return sessionStorage.getItem(keyStorage) ?? '' }
  catch { return '' }
}

export function saveSessionQuoteKey(key: string) {
  try {
    if (key.trim()) sessionStorage.setItem(keyStorage, key.trim())
    else sessionStorage.removeItem(keyStorage)
  } catch {
    // The key remains available in memory if browser storage is blocked.
  }
}

async function equityQuote(asset: QuoteAsset, apiKey: string, rates: Map<string, Promise<Decimal>>) {
  const symbol = equitySymbol(asset)
  if (!symbol) return null
  const url = new URL('https://finnhub.io/api/v1/quote')
  url.search = new URLSearchParams({ symbol, token: apiKey }).toString()
  const data = await json(url)
  const price = positive(data?.c)
  const sourceAt = Number(data?.t) * 1000
  const at = Date.now()
  if (!price || !Number.isSafeInteger(sourceAt) || sourceAt <= 0 || sourceAt > at + 300000) return null
  const day = new Date(sourceAt).toISOString().slice(0, 10)
  if (!rates.has(day)) rates.set(day, exchangeRate('USD', day))
  const rate = await rates.get(day)!
  return marketMark(asset, price.times(rate), 'Finnhub · cotation USD convertie', sourceAt, at)
}

export async function fetchQuotes(assets: QuoteAsset[], apiKey = '') {
  const unique = [...new Map(assets.map(asset => [quoteTarget(asset), asset])).values()]
  const cryptos = unique.filter(asset => asset.category === 'crypto')
  const equities = apiKey ? unique.filter(asset => asset.category !== 'crypto' && equitySymbol(asset)) : []
  const rates = new Map<string, Promise<Decimal>>()
  const requested = equities.length <= equityLimit ? equities : Array.from({ length: equityLimit },
    (_, index) => equities[(equityOffset + index) % equities.length])
  if (equities.length > equityLimit) equityOffset = (equityOffset + equityLimit) % equities.length
  const providers = [
    cryptoQuotes(cryptos),
    ...requested.map(asset => equityQuote(asset, apiKey, rates).then(mark => mark ? [mark] : [])),
  ]
  const results = await Promise.allSettled(providers)
  const marks = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  return { marks, unavailable: unique.length - new Set(marks.map(mark => mark.target)).size }
}

export const historyDays = 90

export async function fetchDailyPrices(asset: QuoteAsset) {
  const coin = catalogEntry(asset.category, asset.reference)?.coinId
  if (!coin) return []
  const url = new URL('https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(coin) + '/market_chart')
  url.search = new URLSearchParams({ vs_currency: 'chf', days: String(historyDays), interval: 'daily' }).toString()
  const data = await json(url)
  const today = dayKey(Date.now())
  if (!Array.isArray(data?.prices)) return []
  const byDay = new Map<string, Mark>()
  for (const row of data.prices) {
    if (!Array.isArray(row)) continue
    const [at, raw] = row
    const price = positive(raw)
    if (!price || !Number.isSafeInteger(at) || at <= 0 || at > Date.now()) continue
    const day = dayKey(at)
    if (day >= today) continue
    const mark = marketMark(asset, price, 'CoinGecko · historique quotidien', at, at)
    const previous = byDay.get(day)
    if (!previous || previous.at < at) byDay.set(day, mark)
  }
  return [...byDay.values()].sort((a, b) => a.at - b.at)
}

export async function fetchFxRates(from: string) {
  const url = new URL('https://api.frankfurter.dev/v2/rates')
  url.search = new URLSearchParams({ base: 'CHF', quotes: 'EUR,USD', from }).toString()
  const data = await json(url)
  if (!Array.isArray(data)) return []
  return data.flatMap((row): FxRate[] => {
    const rate = positive(row?.rate)
    if (!rate || (row.quote !== 'EUR' && row.quote !== 'USD') || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return []
    return [{ date: row.date, quote: row.quote, rate: rate.toFixed() }]
  })
}
