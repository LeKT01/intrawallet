import { Decimal } from 'decimal.js'
import { catalogEntry } from './catalog'
import { quoteTarget, type Mark } from './ledger'
import type { Position } from './portfolio'

type QuoteAsset = Pick<Position, 'category' | 'reference' | 'name' | 'listing'>

async function json(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(9000), credentials: 'omit', referrerPolicy: 'no-referrer' })
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

async function equityQuote(asset: QuoteAsset, apiKey: string, rates: Map<string, Promise<Decimal>>) {
  const listing = asset.listing || catalogEntry(asset.category, asset.reference)?.listing || asset.reference
  const [mic, symbol] = listing.split(':')
  if (!symbol || !usExchanges.has(mic)) return null
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
  const equities = apiKey ? unique.filter(asset => asset.category !== 'crypto') : []
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
