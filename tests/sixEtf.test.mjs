import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { catalogEntry } from '../src/catalog.ts'
import { findSixClosing, parseSixClosings, sixEtfLine } from '../src/sixEtf.ts'
import { fetchQuotes, quoteAccess } from '../src/quotes.ts'
import { dayKey } from '../src/currency.ts'

const colNames = ['ISIN', 'ValorSymbol', 'TradingBaseCurrency', 'ClosingPrice', 'LatestTradeDate', 'MarketDate', 'Exchange']
const vusa = catalogEntry('etf', 'IE00B3XXRP09')
const nasdaq = catalogEntry('etf', 'IE00B53SZB19')
const row = (isin, symbol, currency, price, day, venue = 'XSWX') => [isin, symbol, currency, price, day, day, venue]

test('SIX vérifie la place, la devise, le symbole et l’ISIN ensemble', () => {
  const feed = parseSixClosings({ colNames, rowData: [
    row(vusa.isin, 'VUSA', 'CHF', 99, 20260403, 'XETR'),
    row(vusa.isin, 'VUSD', 'USD', 101, 20260403),
    row(nasdaq.isin, 'VUSA', 'CHF', 102, 20260403),
    row(vusa.isin, 'VUSA', 'USD', 103, 20260403),
    row(vusa.isin, 'VUSA', 'CHF', 104, 20260402),
    row(vusa.isin, 'VUSA', 'CHF', 105, 20260231),
  ] })
  assert.equal(findSixClosing(feed, sixEtfLine(vusa))?.price, 104)
  assert.equal(findSixClosing(feed, { isin: vusa.isin, symbol: 'VUSA' }), null)
  assert.equal(sixEtfLine({ ...vusa, listing: 'XETR:VUSA', market: undefined }), null)
})

test('les ETF SIX se cotent sans clé avec une seule requête groupée après un 502', async t => {
  Object.defineProperty(globalThis, 'location', { value: new URL('http://127.0.0.1:4173'), configurable: true })
  t.after(() => { delete globalThis.location })
  const day = dayKey(Date.now() - 86400000)
  const compactDay = Number(day.replaceAll('-', ''))
  let localRequests = 0
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.hostname === 'api.frankfurter.dev') return Response.json([{ date: day, quote: 'USD', rate: 1.25 }])
    assert.equal(url.pathname, '/market/six/etf-closings')
    assert.equal(url.search, '')
    if (++localRequests === 1) return new Response(null, { status: 502 })
    return Response.json({ colNames, rowData: [
      row(vusa.isin, 'VUSA', 'CHF', 104, compactDay),
      row(nasdaq.isin, 'CSNDX', 'USD', 125, compactDay),
    ] })
  })
  const keys = { coingecko: '', finnhub: '', eodhd: '' }
  assert.equal(quoteAccess(vusa, keys), 'available')
  assert.match((await fetchQuotes([vusa], keys)).issues[0], /502/)
  assert.equal((await fetchQuotes([vusa], keys)).marks.length, 0)
  assert.equal(localRequests, 1)
  const result = await fetchQuotes([vusa, nasdaq], keys, { force: true })
  assert.equal(result.checked, 1)
  assert.equal(result.marks.length, 2)
  assert.equal(result.marks.find(mark => mark.instrument === 'VUSA.SW')?.price, '104')
  assert.equal(result.marks.find(mark => mark.instrument === 'CSNDX.SW')?.price, '100')
  assert.equal(localRequests, 2)
})

test('le relais SIX bascule sur le deuxième accès et partage le relevé entre les requêtes', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', ws: false } })
  t.after(() => server.close())
  await server.listen(0)
  const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/market/six/etf-closings'
  const fetchLocal = globalThis.fetch
  const upstreamPaths = []
  const feed = { colNames, rowData: [row(vusa.isin, 'VUSA', 'CHF', 104, 20261109)] }
  t.mock.method(globalThis, 'fetch', async upstream => {
    const { hostname, pathname } = new URL(upstream)
    assert.equal(hostname, 'www.six-group.com')
    upstreamPaths.push(pathname)
    if (pathname === '/fqs/closing.json') return new Response(null, { status: 502 })
    await new Promise(resolve => setTimeout(resolve, 50))
    return Response.json(feed)
  })
  const responses = await Promise.all([fetchLocal(url), fetchLocal(url)])
  responses.push(await fetchLocal(url))
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), feed)
  }
  assert.deepEqual(upstreamPaths, ['/fqs/closing.json', '/itf/fqs/delayed/closing.json'])
})
