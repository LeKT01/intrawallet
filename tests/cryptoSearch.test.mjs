import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coinGeckoId } from '../src/catalog.ts'
import { fetchIntradayPrices, fetchQuotes, quoteAccess, searchCrypto } from '../src/quotes.ts'

const keys = { coingecko: '', eodhd: '', finnhub: '' }

test('TAO et RENDER utilisent les identifiants CoinGecko de leur cotation', async t => {
  const assets = [{ category: 'crypto', reference: 'TAO', name: 'Bittensor' },
    { category: 'crypto', reference: 'RENDER', name: 'Render' }]
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.searchParams.get('ids'), 'bittensor,render-token')
    const last_updated_at = Math.floor(Date.now() / 1000)
    return Response.json({ bittensor: { chf: 200, last_updated_at }, 'render-token': { chf: 2, last_updated_at } })
  })
  const { marks, issues } = await fetchQuotes(assets, keys)
  assert.deepEqual(issues, [])
  assert.deepEqual(marks.map(mark => [mark.target, mark.price]), [['crypto/TAO', '200'], ['crypto/RENDER', '2']])
  assert.equal(coinGeckoId({ category: 'crypto', reference: 'RNDR' }), undefined)
})

test('une crypto hors catalogue conserve son identité pour les cours et l’historique', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.pathname.endsWith('/search')) {
      assert.equal(url.searchParams.get('query'), 'SUI')
      assert.equal(url.searchParams.get('x_cg_demo_api_key'), 'demo-key')
      return Response.json({ coins: [
        { id: 'sui', name: 'Sui', symbol: 'SUI' }, { id: 'other-sui', name: 'Other Sui', symbol: 'SUI' },
        { id: 'bittensor', name: 'Bittensor', symbol: 'TAO' }, { id: '../invalid', name: 'Invalid', symbol: 'I' },
      ] })
    }
    if (url.pathname.endsWith('/simple/price')) {
      assert.equal(url.searchParams.get('ids'), 'sui')
      return Response.json({ sui: { chf: 1, last_updated_at: Math.floor(Date.now() / 1000) } })
    }
    assert.match(url.pathname, /\/coins\/sui\/market_chart$/)
    return Response.json({ prices: [[Date.now() - 60000, 1]] })
  })
  const results = await searchCrypto('SUI', 'demo-key')
  assert.deepEqual(results.map(asset => asset.reference), ['coingecko:sui', 'coingecko:other-sui', 'TAO'])
  const persisted = { category: 'crypto', reference: results[0].reference, name: results[0].name }
  assert.equal(quoteAccess(persisted, keys), 'available')
  assert.equal((await fetchQuotes([persisted], keys)).marks[0].target, 'crypto/coingecko:sui')
  assert.equal((await fetchIntradayPrices(persisted, '')).length, 1)
})
