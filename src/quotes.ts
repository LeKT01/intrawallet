import { Decimal } from 'decimal.js'
import { catalogEntry, type CatalogAsset } from './catalog.ts'
import { quoteTarget, type Mark } from './ledger.ts'
import { dayKey, daysBefore, type FxRate } from './currency.ts'
import { closeTimestamp, latestClosingDay, marketOpen } from './marketCalendar.ts'
import { findSixClosing, parseSixClosings, sixEtfLine } from './sixEtf.ts'
import { loadDailySeries, saveDailyPrices } from './database.ts'
import { nqseIsin, nqseRoute, parseNqseQuote } from './nqseQuote.ts'

export type QuoteAsset = Pick<CatalogAsset, 'category' | 'reference' | 'name' | 'listing' | 'isin' | 'market'>
export type QuoteKeys = { finnhub: string; eodhd: string; coingecko: string }
type Provider = keyof QuoteKeys
type QuoteResult = { marks: Mark[]; issues: string[]; checked: number }

const venueCodes: Record<string, string> = {
  XNAS: 'US', XNYS: 'US', ARCX: 'US', XASE: 'US', BATS: 'US', US: 'US',
  XSWX: 'SW', XETR: 'XETRA', XPAR: 'PA', XAMS: 'AS', XBRU: 'BR', XMIL: 'MI',
}
const venueNames: Record<string, string> = {
  US: 'États-Unis', SW: 'SIX Swiss Exchange', XETRA: 'Xetra', PA: 'Euronext Paris',
  AS: 'Euronext Amsterdam', BR: 'Euronext Bruxelles', MI: 'Borsa Italiana',
}
const venueMics: Record<string, string> = { US: 'US', SW: 'XSWX', XETRA: 'XETR', PA: 'XPAR', AS: 'XAMS', BR: 'XBRU', MI: 'XMIL' }
const markTime = (stamp: unknown) => Number(stamp) * 1000
const validTime = (at: number) => Number.isSafeInteger(at) && at > 0 && at <= Date.now() + 300000
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const symbolPattern = /^[A-Z0-9][A-Z0-9._-]{0,30}$/
const isinPattern = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/
const supportedCurrency = /^(CHF|EUR|USD)$/
export const historyDays = 365

async function json(url: URL, provider: string, timeout = 9000) {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
  } catch {
    throw new Error(provider + ' est inaccessible depuis ce navigateur.')
  }
  if (response.status === 429) throw new Error(provider + ' a limité les requêtes. Réessaie plus tard.')
  if (response.status === 502 && response.headers.get('X-SIX-Error') === 'proxy-auth') {
    throw new Error('Le proxy du réseau demande une authentification (HTTP 407). Le relais local n’a pas pu joindre SIX.')
  }
  if ([401, 403].includes(response.status)) throw new Error(provider + ' a refusé l’accès. Vérifie la clé et la couverture de l’offre.')
  if (response.status >= 500) throw new Error(provider + ' est temporairement indisponible (HTTP ' + response.status + ').')
  if (!response.ok) throw new Error(provider + ' n’a pas renvoyé de données pour cette demande.')
  return response.json()
}

function positive(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  try {
    const number = new Decimal(value)
    return number.isFinite() && number.gt(0) ? number : null
  } catch { return null }
}

function marketMark(asset: QuoteAsset, price: Decimal, source: string, sourceAt: number, at: number,
  originalPrice: Decimal, currency: string, timing: Mark['timing'], instrument?: string): Mark {
  const target = quoteTarget(asset)
  return { id: [target, source, ...(instrument ? [instrument] : []), sourceAt, price.toFixed()].join('/'), kind: 'market',
    target, price: price.toFixed(), sourceAt, at, source, originalPrice: originalPrice.toFixed(), currency, timing, instrument, receivedAt: Date.now() }
}

export function instrumentCode(asset: QuoteAsset) {
  const exchange = listing(asset)
  return asset.market?.code ?? (exchange ? exchange.symbol + '.' + exchange.venue : undefined)
}

function listing(asset: QuoteAsset) {
  const value = asset.listing || catalogEntry(asset.category, asset.reference)?.listing || asset.reference
  const [mic, symbol] = value.split(':')
  return symbol && symbolPattern.test(symbol) && Object.hasOwn(venueCodes, mic) ? { mic, symbol, venue: venueCodes[mic] } : null
}

function isLocalApp() {
  return typeof location !== 'undefined' && ['127.0.0.1', 'localhost', 'terminal.local'].includes(location.hostname)
}

export function hasAutomaticSixQuote(asset: QuoteAsset) {
  return isLocalApp() && sixEtfLine(asset) !== null
}

export function hasAutomaticNqseQuote(asset: QuoteAsset) {
  const known = catalogEntry(asset.category, asset.reference)
  return isLocalApp() && asset.category === 'etf' && (asset.isin ?? known?.isin ?? asset.reference) === nqseIsin
    && listing(asset)?.mic === 'XETR' && instrumentCode(asset) === 'NQSE.XETRA'
    && (asset.market?.currency ?? 'EUR') === 'EUR'
}

export function quoteAccess(asset: QuoteAsset, keys: QuoteKeys) {
  if (asset.category === 'crypto') return catalogEntry(asset.category, asset.reference)?.coinId ? 'available' : 'manual'
  if (hasAutomaticSixQuote(asset) || hasAutomaticNqseQuote(asset)) return 'available'
  const exchange = listing(asset)
  if (!exchange && !asset.market && !asset.isin && !isinPattern.test(asset.reference)) return 'manual'
  return keys.eodhd || (exchange?.venue === 'US' && keys.finnhub) ? 'available' : 'key'
}

export function readSessionQuoteKey(provider: Provider) {
  try { return sessionStorage.getItem('portefeuille.' + provider + '-key') ?? '' }
  catch { return '' }
}

export function saveSessionQuoteKey(provider: Provider, key: string) {
  try {
    if (key.trim()) sessionStorage.setItem('portefeuille.' + provider + '-key', key.trim())
    else sessionStorage.removeItem('portefeuille.' + provider + '-key')
  } catch { /* Keep the key in memory if browser storage is unavailable. */ }
}

const fxRequests = new Map<string, { at: number; result: Promise<FxRate[]> }>()
export function fetchFxRates(from: string, to?: string) {
  const key = from + '/' + (to ?? '')
  const previous = fxRequests.get(key)
  if (previous && Date.now() - previous.at < 3600000) return previous.result
  const url = new URL('https://api.frankfurter.dev/v2/rates')
  url.search = new URLSearchParams({ base: 'CHF', quotes: 'EUR,USD', from, providers: 'ecb', ...(to ? { to } : {}) }).toString()
  const result = json(url, 'Frankfurter').then((data): FxRate[] => {
    if (!Array.isArray(data)) return []
    return data.flatMap((row): FxRate[] => {
      const rate = positive(row?.rate)
      if (!rate || (row.quote !== 'EUR' && row.quote !== 'USD') || !datePattern.test(row.date)) return []
      return [{ date: row.date, quote: row.quote, rate: rate.toFixed() }]
    })
  }).catch(error => {
    fxRequests.delete(key)
    throw error
  })
  fxRequests.set(key, { at: Date.now(), result })
  return result
}

export function referenceRate(rates: FxRate[], currency: string, day: string) {
  if (currency === 'CHF') return { date: day, rate: '1' }
  return rates.filter(row => row.quote === currency && row.date <= day && row.date >= daysBefore(day, 7))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
}

export async function rateToCHF(currency: string, day: string) {
  if (currency === 'CHF') return { date: day, rate: new Decimal(1) }
  const ref = referenceRate(await fetchFxRates(daysBefore(day, 7), day), currency, day)
  if (!ref) throw new Error('Taux de change indisponible pour la date sélectionnée.')
  return { date: ref.date, rate: new Decimal(1).div(ref.rate) }
}

const quoteCache = new Map<string, { at: number; result: Promise<Mark[]> }>()
function cachedRequest(key: string, interval: number, load: () => Promise<Mark[]>) {
  const cached = quoteCache.get(key)
  if (cached && Date.now() - cached.at < interval) return cached.result
  const result = load()
  quoteCache.set(key, { at: Date.now(), result })
  return result
}

async function cryptoQuotes(assets: QuoteAsset[], key: string) {
  const matched = assets.flatMap(asset => {
    const coinId = catalogEntry(asset.category, asset.reference)?.coinId
    return coinId ? [{ asset, coinId }] : []
  })
  if (!matched.length) return []
  const ids = matched.map(item => item.coinId).sort().join(',')
  return cachedRequest('crypto/' + key + '/' + ids, 60000, async () => {
    const url = new URL('https://api.coingecko.com/api/v3/simple/price')
    url.search = new URLSearchParams({ ids, vs_currencies: 'chf', include_last_updated_at: 'true', ...(key ? { x_cg_demo_api_key: key } : {}) }).toString()
    const prices = await json(url, 'CoinGecko')
    const at = Date.now()
    return matched.flatMap(({ asset, coinId }) => {
      const price = positive(prices?.[coinId]?.chf)
      const sourceAt = markTime(prices?.[coinId]?.last_updated_at)
      return price && validTime(sourceAt) ? [marketMark(asset, price, 'CoinGecko', sourceAt, at, price, 'CHF', 'reported')] : []
    })
  })
}

function finnhubQuote(asset: QuoteAsset, key: string) {
  return cachedRequest('finnhub/' + key + '/' + quoteTarget(asset), 180000, async () => {
    const url = new URL('https://finnhub.io/api/v1/quote')
    url.search = new URLSearchParams({ symbol: listing(asset)!.symbol, token: key }).toString()
    const data = await json(url, 'Finnhub')
    const price = positive(data?.c)
    const sourceAt = markTime(data?.t)
    if (!price || !validTime(sourceAt)) return []
    const { rate } = await rateToCHF('USD', dayKey(sourceAt))
    return [marketMark(asset, price.times(rate), 'Finnhub', sourceAt, Date.now(), price, 'USD', 'reported', listing(asset)!.symbol + '.US')]
  })
}

const budgetKey = 'portefeuille.eodhd-budget'
let budget = { day: '', count: 0 }
async function eodJson(path: string, key: string, params: Record<string, string> = {}) {
  function reserve() {
    const day = new Date().toISOString().slice(0, 10)
    try {
      const saved = JSON.parse(localStorage.getItem(budgetKey) ?? 'null')
      if (saved?.day === day && Number.isInteger(saved.count) && saved.count >= 0) budget = saved
    } catch { /* The in-memory limit still applies. */ }
    if (budget.day !== day) budget = { day, count: 0 }
    if (budget.count >= 20) throw new Error('Quota EODHD de cette journée atteint dans ce navigateur (20 appels).')
    budget.count += 1
    try { localStorage.setItem(budgetKey, JSON.stringify(budget)) } catch { /* Keep count in memory. */ }
  }
  if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(budgetKey, reserve)
  else reserve()
  // The standard local server forwards EODHD only. Static deployments call the provider directly.
  const local = typeof location !== 'undefined' && ['127.0.0.1', 'localhost'].includes(location.hostname)
  const base = local ? location.origin + '/market/eodhd/' : 'https://eodhd.com/api/'
  const url = new URL(base + path)
  url.search = new URLSearchParams({ ...params, api_token: key, fmt: 'json' }).toString()
  return json(url, 'EODHD')
}

type Instrument = NonNullable<CatalogAsset['market']>
type SearchResult = CatalogAsset & { market: Instrument; isin?: string }
const searches = new Map<string, Promise<SearchResult[]>>()

export async function searchMarket(category: 'stock' | 'etf', query: string, key: string) {
  const term = query.trim()
  const cacheKey = [key, category, term.toUpperCase()].join('/')
  const existing = searches.get(cacheKey)
  if (existing) return existing
  const result = eodJson('search/' + encodeURIComponent(term), key, { limit: '30' }).then((data): SearchResult[] => {
    if (!Array.isArray(data)) return []
    return data.flatMap(row => {
      const { Code, Exchange, Name, Currency, Type, ISIN } = row ?? {}
      if (!Object.hasOwn(venueNames, Exchange) || !symbolPattern.test(Code) || !supportedCurrency.test(Currency)
        || typeof Name !== 'string' || !Name.trim() || (category === 'etf' ? Type !== 'ETF' : !['Common Stock', 'Preferred Stock'].includes(Type))) return []
      const listing = venueMics[Exchange] + ':' + Code
      const isin = typeof ISIN === 'string' && isinPattern.test(ISIN) ? ISIN : undefined
      const known = catalogEntry(category, listing)
        ?? (Exchange === 'US' ? ['XNAS', 'XNYS', 'ARCX', 'XASE', 'BATS'].map(mic => catalogEntry(category, mic + ':' + Code)).find(Boolean) : undefined)
      if ((known?.isin && isin && known.isin !== isin) || (known?.market && known.market.currency !== Currency)) return []
      return [{ category, name: (known?.name ?? Name.trim()).slice(0, 100), reference: known?.reference ?? (category === 'etf' && isin ? isin : listing),
        listing: known?.listing ?? listing, detail: venueNames[Exchange] + ' · ' + Code + ' · ' + Currency,
        isin: isin ?? known?.isin, market: { code: Code + '.' + Exchange, currency: Currency } }]
    })
  }).catch(error => { searches.delete(cacheKey); throw error })
  searches.set(cacheKey, result)
  return result
}

async function instrument(asset: QuoteAsset, key: string) {
  if (asset.market) return asset.market
  const exchange = listing(asset)
  if (exchange?.venue === 'US') return { code: exchange.symbol + '.US', currency: 'USD' }
  if (asset.category === 'crypto') return null
  const isin = asset.isin ?? (isinPattern.test(asset.reference) ? asset.reference : '')
  const matches = await searchMarket(asset.category, isin || exchange?.symbol || asset.reference, key)
  const exact = exchange
    ? matches.find(item => item.market.code === exchange.symbol + '.' + exchange.venue && (!isin || item.isin === isin))
    : matches.find(item => item.isin === isin)
  return exact?.market ?? null
}

export async function fetchEodSeries(asset: QuoteAsset, meta: Instrument, key: string, at: number, previous?: Mark) {
  const market = meta.code.split('.').at(-1)!
  const to = latestClosingDay(market, at)
  const earliest = daysBefore(dayKey(at), historyDays - 1)
  const overlap = previous ? daysBefore(dayKey(previous.sourceAt), 2) : earliest
  const from = overlap > earliest ? overlap : earliest
  const data = await eodJson('eod/' + encodeURIComponent(meta.code), key, { from, to, period: 'd', order: 'a' })
  if (!Array.isArray(data)) throw new Error('Réponse EODHD invalide.')
  const rows = data.flatMap(row => {
    const price = positive(row?.close)
    const date = Date.parse(row?.date + 'T00:00:00Z')
    return price && datePattern.test(row.date) && Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === row.date && row.date >= from && row.date <= to ? [{ day: row.date as string, price }] : []
  }).sort((a, b) => a.day.localeCompare(b.day))
  if (!rows.length) return []
  const rates = meta.currency === 'CHF' ? [] : await fetchFxRates(daysBefore(rows[0].day, 7), rows.at(-1)!.day)
  const marks = rows.flatMap(({ day, price }) => {
    const rate = referenceRate(rates, meta.currency, day)
    const sourceAt = closeTimestamp(market, day)
    return rate && validTime(sourceAt) ? [marketMark(asset, price.div(rate.rate), 'EODHD · clôture', sourceAt, sourceAt, price, meta.currency, 'close', meta.code)] : []
  })
  if (!marks.length) throw new Error('Taux de change indisponible pour ' + asset.name + '.')
  return marks
}

const eodAttempts = new Map<string, number>()
async function equityDaily(asset: QuoteAsset, key: string, force: boolean) {
  const target = quoteTarget(asset)
  const explicitCode = instrumentCode(asset)
  const lineKey = explicitCode ? target + '@' + explicitCode : target
  const stored = await loadDailySeries(lineKey) ?? (explicitCode ? await loadDailySeries(target) : undefined)
  const cached = stored && (!explicitCode || !stored.instrument || stored.instrument.code === explicitCode) ? stored : undefined
  const at = Date.now()
  const venue = asset.market?.code.split('.').at(-1) ?? cached?.instrument?.code.split('.').at(-1) ?? listing(asset)?.venue ?? ''
  const expected = latestClosingDay(venue, at)
  const last = cached?.marks.reduce<Mark | undefined>((latest, mark) => !latest || latest.sourceAt < mark.sourceAt ? mark : latest, undefined)
  const attemptKey = [key, target, explicitCode].join('/')
  const recentAttempt = at - (eodAttempts.get(attemptKey) ?? 0) < (force ? 60000 : 3600000)
  if (last && (dayKey(last.sourceAt) >= expected || (!force && cached && at - cached.fetchedAt < 3600000))) return [last]
  return cachedRequest('eodhd/' + attemptKey, 60000, async () => {
    if (recentAttempt) return last ? [last] : []
    eodAttempts.set(attemptKey, at)
    const meta = asset.market ?? cached?.instrument ?? await instrument(asset, key)
    if (!meta) throw new Error('EODHD : aucune cotation vérifiée pour ' + asset.name + '. Essaie une recherche par nom ou ISIN.')
    const marks = await fetchEodSeries(asset, meta, key, at, last)
    if (!marks.length) {
      if (last) return [last]
      throw new Error('EODHD ne fournit pas de clôture pour ' + asset.name + ' avec cette clé.')
    }
    await saveDailyPrices({ target: lineKey, fetchedAt: at, marks, instrument: meta })
    return [marks.at(-1)!]
  })
}

let sixSnapshot: { at: number; result: Promise<ReturnType<typeof parseSixClosings>>; failed?: boolean } | undefined

async function sixQuotes(assets: QuoteAsset[], force: boolean) {
  const at = Date.now()
  if (!sixSnapshot || (sixSnapshot.failed ? force || at - sixSnapshot.at >= 60000 : at - sixSnapshot.at >= 30 * 60000)) {
    const url = new URL('/market/six/etf-closings', location.origin)
    const result = json(url, 'Le relais local SIX', 40000).then(parseSixClosings)
    sixSnapshot = { at, result }
    void result.catch(() => {
      if (sixSnapshot?.result === result) sixSnapshot = { at: Date.now(), result, failed: true }
    })
  }
  const snapshot = await sixSnapshot.result
  const results = await Promise.allSettled(assets.map(async asset => {
    const line = sixEtfLine(asset)
    const quote = line && findSixClosing(snapshot, line)
    const price = positive(quote?.price)
    if (!quote || !price || quote.day > dayKey(at)) return null
    const { rate } = await rateToCHF(quote.currency, quote.day)
    const sourceAt = closeTimestamp('SW', quote.day)
    if (!validTime(sourceAt)) return null
    return marketMark(asset, price.times(rate), 'SIX · clôture', sourceAt, sourceAt, price, quote.currency, 'close', quote.symbol + '.SW')
  }))
  const marks = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
  if (!marks.length) throw new Error('SIX : aucune clôture exploitable pour les lignes demandées.')
  return marks
}

let eodOffset = 0
let finnhubOffset = 0
export const cryptoInterval = (key: string) => key ? 300000 : 60000

function nqseQuote(asset: QuoteAsset) {
  return cachedRequest('xetra/' + nqseIsin, 60000, async () => {
    const quote = parseNqseQuote(await json(new URL(nqseRoute, location.origin), 'Deutsche Börse · Xetra', 21000))
    const sourceAt = Date.parse(quote.timestampLastPrice)
    const { rate } = await rateToCHF('EUR', dayKey(sourceAt))
    const price = new Decimal(quote.lastPrice)
    return [marketMark(asset, price.times(rate), 'Deutsche Börse · Xetra', sourceAt, Date.now(), price, 'EUR', 'reported', 'NQSE.XETRA')]
  })
}

export async function fetchQuotes(assets: QuoteAsset[], keys: QuoteKeys,
  { force = false, opening = false, stale = new Map<string, Mark>() } = {}): Promise<QuoteResult> {
  const unique = [...new Map(assets.map(asset => [quoteTarget(asset), asset])).values()]
  const crypto = unique.filter(asset => asset.category === 'crypto' && (force || opening
    || Date.now() - (stale.get(quoteTarget(asset))?.at ?? 0) >= cryptoInterval(keys.coingecko)))
  const six = unique.filter(hasAutomaticSixQuote)
  const nqse = unique.filter(hasAutomaticNqseQuote)
  const equities = unique.filter(asset => asset.category !== 'crypto' && quoteAccess(asset, keys) === 'available')
  const eligibleUS = equities.filter(asset => keys.finnhub && listing(asset)?.venue === 'US'
    && (force || opening || (marketOpen('US', Date.now()) && Date.now() - (stale.get(quoteTarget(asset))?.at ?? 0) >= 180000)))
  const rotate = (items: QuoteAsset[], limit: number, offset: number) =>
    items.length <= limit ? items : Array.from({ length: limit }, (_, i) => items[(offset + i) % items.length])
  const us = rotate(eligibleUS, 8, finnhubOffset)
  const eod = keys.eodhd ? rotate(equities.filter(asset => !hasAutomaticNqseQuote(asset)), 6, eodOffset) : []
  finnhubOffset += us.length
  eodOffset += eod.length
  const requests = [
    ...(crypto.length ? [cryptoQuotes(crypto, keys.coingecko)] : []),
    ...(six.length ? [sixQuotes(six, force)] : []),
    ...nqse.map(asset => nqseQuote(asset).catch(error => {
      if (keys.eodhd) return equityDaily(asset, keys.eodhd, force)
      throw error
    })),
    ...us.map(asset => finnhubQuote(asset, keys.finnhub)),
    ...eod.map(asset => equityDaily(asset, keys.eodhd, force)),
  ]
  const result = await Promise.allSettled(requests)
  const marks = result.flatMap(value => value.status === 'fulfilled' ? value.value : [])
  const issues = [...new Set(result.flatMap(value => value.status === 'rejected'
    ? [value.reason instanceof Error ? value.reason.message : 'Le fournisseur de données est indisponible.'] : []))]
  return { marks, issues, checked: requests.length }
}

async function cryptoHistory(asset: QuoteAsset, key: string, days: number) {
  const coin = catalogEntry(asset.category, asset.reference)?.coinId
  if (!coin) return []
  const url = new URL('https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(coin) + '/market_chart')
  url.search = new URLSearchParams({ vs_currency: 'chf', days: String(days), ...(key ? { x_cg_demo_api_key: key } : {}) }).toString()
  const data = await json(url, 'CoinGecko')
  if (!Array.isArray(data?.prices)) return []
  return data.prices.flatMap((row: unknown) => {
    if (!Array.isArray(row)) return []
    const [at, raw] = row
    const price = positive(raw)
    if (!price || !validTime(at) || at > Date.now()) return []
    return [marketMark(asset, price, days === 1 ? 'CoinGecko · intrajournalier' : 'CoinGecko · historique quotidien',
      at, at, price, 'CHF', 'reported')]
  }).sort((a: Mark, b: Mark) => a.at - b.at) as Mark[]
}

export function fetchIntradayPrices(asset: QuoteAsset, key: string) {
  return cachedRequest('crypto-history/' + key + '/' + quoteTarget(asset), 300000, () => cryptoHistory(asset, key, 1))
}

export async function fetchDailyPrices(asset: QuoteAsset, key: string) {
  const series = await cryptoHistory(asset, key, historyDays)
  const today = dayKey(Date.now())
  const byDay = new Map<string, Mark>()
  for (const mark of series) {
    const day = dayKey(mark.at)
    if (day < today) byDay.set(day, mark)
  }
  return [...byDay.values()].sort((a, b) => a.at - b.at)
}

export function quoteIsStale(mark: Mark, at = Date.now()) {
  if (mark.source === 'Cours simulé') return false
  if (mark.timing === 'close') {
    const venue = mark.instrument?.split('.').at(-1)
    return dayKey(mark.sourceAt) < latestClosingDay(venue ?? '', at)
  }
  if (mark.source.startsWith('CoinGecko')) return at - mark.sourceAt > 900000
  if (mark.source.startsWith('Finnhub')) {
    return marketOpen('US', at) ? at - mark.sourceAt > 1800000 : dayKey(mark.sourceAt) < latestClosingDay('US', at)
  }
  return at - mark.sourceAt > 86400000
}

export function quoteTiming(mark: Mark) {
  if (mark.timing === 'close') return 'Dernière clôture disponible'
  if (mark.timing === 'reported' && mark.source === 'CoinGecko') {
    return Date.now() - mark.sourceAt > 900000 ? 'Dernier cours crypto connu' : 'Cours indicatif · marché 24 h/24'
  }
  if (mark.timing === 'reported') return 'Dernier cours reçu · délai variable'
  return mark.source.includes('fictif') ? 'Cours fictif' : 'Dernier cours disponible'
}
