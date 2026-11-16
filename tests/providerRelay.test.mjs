import assert from 'node:assert/strict'
import { test } from 'node:test'
import { providerRelay } from '../server/providerRelay.ts'

function request(url, headers = {}) {
  const response = { writeHead(status, headers) { this.status = status; this.headers = headers; return this },
    end(body) { this.body = body } }
  return Promise.resolve(providerRelay({ method: 'GET', url, headers }, response, () => assert.fail('route not handled')))
    .then(() => response)
}

test('le relais EODHD utilise le code NYSE de Lilly et garde la clé hors de son URL publique', async t => {
  t.mock.method(globalThis, 'fetch', async upstream => {
    assert.equal(upstream.hostname, 'eodhd.com')
    assert.equal(upstream.pathname, '/api/eod/LLY.US')
    assert.equal(upstream.searchParams.get('api_token'), 'test-key')
    assert.equal(upstream.searchParams.has('untrusted'), false)
    return Response.json([{ date: '2026-11-13', close: 1000 }])
  })
  const reply = await request('/market/eodhd/eod/LLY.US?order=a&api_token=ignored&untrusted=ignored', { 'x-eodhd-token': 'test-key' })
  assert.equal(reply.status, 200)
  assert.match(reply.body, /1000/)
  assert.equal(reply.headers['Cache-Control'], 'no-store')
  assert.equal((await request('/market/eodhd/eod/LLY.US')).status, 400)
  assert.equal((await request('/market/eodhd/fundamentals/LLY.US', { 'x-eodhd-token': 'test-key' })).status, 400)
})

test('le relais CoinMarketCap limite les appels aux identifiants pris en charge', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async upstream => {
    assert.equal(upstream.hostname, 'pro-api.coinmarketcap.com')
    assert.equal(upstream.searchParams.get('id'), '5690,22974')
    assert.equal(upstream.searchParams.get('convert'), 'CHF')
    return Response.json({ data: [] })
  })
  assert.equal((await request('/market/coinmarketcap/quotes?id=22974,5690')).status, 200)
  assert.equal((await request('/market/coinmarketcap/quotes?id=99999')).status, 400)
  assert.equal(fetch.mock.callCount(), 1)
})
