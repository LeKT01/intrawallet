import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import { catalogEntry } from '../src/catalog.ts'
import { dayKey } from '../src/currency.ts'
import { replay } from '../src/ledger.ts'
import { nqseIsin, nqseRoute, parseNqseQuote } from '../src/nqseQuote.ts'
import { fetchQuotes, quoteAccess } from '../src/quotes.ts'

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
})
