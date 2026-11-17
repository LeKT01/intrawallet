import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import { catalogEntry, searchCatalog } from '../src/catalog.ts'
import { dayKey } from '../src/currency.ts'
import { assetChartMarks, quoteTarget, replay } from '../src/ledger.ts'
import { nqseIsin, nqseRoute, parseNqseQuote } from '../src/nqseQuote.ts'
import { fetchQuotes, hasAutomaticNqseQuote, probeQuoteProvider, quoteAccess } from '../src/quotes.ts'
import { tradegateRoute } from '../src/tradegateQuote.ts'

test('NQSE récupère le prix Xetra en EUR sans clé et rejette une autre cotation', async t => {
  const sourceAt = Date.now() - 60000
  const fixture = { isin: nqseIsin, mic: 'XETR', currency: { originalValue: 'EUR' },
    lastPrice: 16.25, timestampLastPrice: new Date(sourceAt).toISOString() }
  for (const invalid of [{ isin: 'IE00B53SZB19' }, { mic: 'XSWX' }, { currency: { originalValue: 'USD' } }]) {
    assert.throws(() => parseNqseQuote({ ...fixture, ...invalid }), /cours vérifiable/)
  }
  const server = await createServer({ server: { host: '127.0.0.1', ws: false } })
  t.after(() => server.close())
  await server.listen(0)
  Object.defineProperty(globalThis, 'location', { value: new URL('http://127.0.0.1:' + server.httpServer.address().port), configurable: true })
  t.after(() => { delete globalThis.location })
  const fetchLocal = globalThis.fetch
  const upstream = t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input)
    if (url.origin === location.origin) {
      assert.equal(url.pathname, nqseRoute)
      return fetchLocal(url)
    }
    if (url.hostname === 'api.frankfurter.dev') {
      return Response.json([{ date: dayKey(sourceAt), quote: 'EUR', rate: 1.25 }])
    }
    assert.equal(url.hostname, 'api.boerse-frankfurt.de')
    assert.equal(url.searchParams.get('isin'), nqseIsin)
    assert.equal(url.searchParams.get('mic'), 'XETR')
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(': accueil\r\ndata:' + JSON.stringify(fixture) + '\r\n\r\n'))
    } })
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
  })
  const asset = catalogEntry('etf', 'XETR:NQSE')
  const keys = { eodhd: '', finnhub: '', coingecko: '' }
  assert.equal(quoteAccess(asset, keys), 'available')
  for (const listing of ['XSWX:NQSE', 'XLON:NQSE', 'XETR:NQSB', 'XETR:NQSE:OTHER']) {
    assert.equal(hasAutomaticNqseQuote({ ...asset, listing }), false, listing)
  }
  assert.equal(hasAutomaticNqseQuote({ ...asset, market: { ...asset.market, currency: 'USD' } }), false)
  assert.equal(hasAutomaticNqseQuote({ ...asset, market: { ...asset.market, code: 'NQSE.LSE' } }), false)
  const alias = { ...asset, reference: 'XETR:NQSE' }

  const { marks, issues } = await fetchQuotes([asset], keys)
  assert.deepEqual(issues, [])
  assert.equal(marks.length, 1)
  assert.equal(marks[0].instrument, 'NQSE.XETRA')
  assert.equal(marks[0].originalPrice, '16.25')
  assert.equal(marks[0].price, '13')
  const position = { ...asset, id: 'nqse', platform: 'Démo', quantity: '52.38', createdAt: sourceAt - 1000,
    cost: null, valuation: null }
  assert.equal(replay({ positions: [position], operations: [], marks }, [], undefined, true).holdings[0].valuation.amount, '680.94')
  assert.equal(upstream.mock.calls.filter(call => new URL(call.arguments[0]).hostname === 'api.boerse-frankfurt.de').length, 1)
  const separate = await fetchQuotes([alias], keys)
  assert.equal(separate.marks[0]?.target, quoteTarget(alias))

})

test('VUSA Tradegate est valorisé en EUR indépendamment de la cotation SIX', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', ws: false } })
  t.after(() => server.close())
  await server.listen(0)
  Object.defineProperty(globalThis, 'location', { value: new URL('http://127.0.0.1:' + server.httpServer.address().port), configurable: true })
  t.after(() => { delete globalThis.location })
  const fetchLocal = globalThis.fetch
  let last = 128.91
  const sourceAt = Date.parse('2025-06-10T10:00:02.123Z')
  let tradeRequests = 0
  let tradesAvailable = false
  let bookCurrency = 'EUR'
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input)
    if (url.origin === location.origin) return fetchLocal(url)
    if (url.hostname === 'api.frankfurter.dev') {
      return Response.json([{ date: dayKey(sourceAt), quote: 'EUR', rate: 1.1 }])
    }
    assert.equal(url.hostname, 'www.tradegatebsx.com')
    assert.equal(url.searchParams.get('isin'), 'IE00B3XXRP09')
    if (url.pathname === '/refresh.php') return Response.json({ last })
    if (url.pathname === '/orderbuch.php') return new Response(`<table>
      <tr><td>A1JX53</td><td>VUSA</td><td>IE00B3XXRP09</td><td>${bookCurrency}</td></tr>
      <tr><th>Bid</th><td>128,80</td></tr><tr><th>Last</th><td>128,93</td></tr></table>
      <div>ETF (transparent)</div>`)
    assert.equal(url.pathname, '/orderbuch_umsaetze.php')
    tradeRequests++
    if (!tradesAvailable) return new Response(null, { status: 503 })
    return new Response(`<table><tbody id="umsaetze_body">
      <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>4</td><td>2,50</td></tr>
      <tr><td>10.06.2025</td><td>12:00:02,123</td><td>4</td><td>&nbsp;</td><td>128,915</td></tr>
      <tr><td>10.06.2025</td><td>12:00:01,001</td><td>2</td><td>&nbsp;</td><td>128,90</td></tr>
    </tbody></table>`)
  })
  const route = new URL(tradegateRoute, location.origin)
  assert.equal((await (await fetchLocal(route)).json()).price, 128.91)
  last = '128,92'
  assert.equal((await (await fetchLocal(route)).json()).price, 128.92)
  assert.equal(tradeRequests, 2)
  last = null
  const book = await (await fetchLocal(route)).json()
  assert.equal(book.price, 128.93)
  assert.equal(book.sourceAt, undefined)
  bookCurrency = 'CHF'
  assert.equal((await fetchLocal(route)).status, 502)
  bookCurrency = 'EUR'
  tradesAvailable = true
  const tradegate = catalogEntry('etf', 'TGAT:VUSA')
  const six = catalogEntry('etf', 'XSWX:VUSA')
  const keys = { eodhd: '', finnhub: '', coingecko: '' }
  assert.equal(quoteAccess(tradegate, keys), 'available')
  const { marks, issues } = await fetchQuotes([tradegate], keys)
  assert.deepEqual(issues, [])
  assert.equal(marks[0].target, 'etf/TGAT:VUSA')
  assert.equal(marks[0].originalPrice, '128.915')
  assert.equal(marks[0].currency, 'EUR')
  assert.equal(marks[0].sourceAt, sourceAt)
  assert.equal(marks[0].source, 'Tradegate · transactions')
  assert.equal(tradeRequests, 5)
  const positions = [tradegate, six].map((asset, index) => ({
    ...asset, id: String(index), platform: 'Démo', quantity: '1', createdAt: Date.now() - 2000, cost: null, valuation: null,
  }))
  const { holdings } = replay({ positions, operations: [], marks }, [], undefined, true)
  assert.ok(holdings.find(position => position.reference === tradegate.reference).valuation)
  assert.equal(holdings.find(position => position.reference === six.reference).valuation, null)
  tradesAvailable = false
  const result = await fetchQuotes([tradegate], keys, { force: true, stale: new Map([[quoteTarget(tradegate), marks[0]]]) })
  assert.deepEqual(result.marks, [])
  assert.match(result.issues[0], /dernier cours daté est conservé/)
  const unknown = { ...marks[0], id: 'unknown', source: 'Tradegate · relevé', price: '150', sourceAt: Date.now(), at: Date.now() }
  const restored = { positions, operations: [], marks: [...marks, unknown] }
  assert.equal(replay(restored, [], undefined, true).holdings.find(position => position.reference === tradegate.reference).unitPrice.toFixed(), marks[0].price)
  assert.deepEqual(assetChartMarks(restored, quoteTarget(tradegate), []).marks, marks)
  assert.equal(await probeQuoteProvider('Tradegate', keys), 'undated')
})

test('VWCE et VWRA restent distincts et la recherche par ISIN trouve les deux lignes', () => {
  const [xetra, six] = searchCatalog('etf', 'IE00BK5BQT80')
  assert.equal(xetra.listing, 'XETR:VWCE')
  assert.equal(six.listing, 'XSWX:VWRA')
  assert.notEqual(quoteTarget(xetra), quoteTarget(six))
  assert.equal(quoteTarget(xetra), 'etf/IE00BK5BQT80')
  assert.equal(quoteTarget(six), 'etf/XSWX:VWRA')
})
