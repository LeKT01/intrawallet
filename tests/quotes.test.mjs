import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchEodSeries, fetchQuotes, quoteAccess, searchMarket } from '../src/quotes.ts'
import { searchCatalog } from '../src/catalog.ts'
import { quoteTarget } from '../src/ledger.ts'
import { closeTimestamp, latestClosingDay, marketOpen, carryWeekendChartPoints } from '../src/marketCalendar.ts'

const eodhd = { code: 'VUAA.XETRA', currency: 'EUR' }
const etf = { category: 'etf', reference: 'IE00BFMXXD54', name: 'Vanguard S&P 500 UCITS ETF', listing: 'XETR:VUAA' }
const bitcoin = { category: 'crypto', reference: 'BTC', name: 'Bitcoin' }
const keys = { eodhd: '', finnhub: '', coingecko: '' }

test('le calendrier utilise l’heure locale, les jours fériés et la clôture anticipée', () => {
  assert.equal(marketOpen('XNAS', Date.parse('2026-11-26T17:00Z')), false)
  assert.equal(marketOpen('XNAS', Date.parse('2026-11-27T17:59Z')), true)
  assert.equal(marketOpen('XNAS', Date.parse('2026-11-27T18:00Z')), false)
  assert.equal(closeTimestamp('US', '2026-11-27'), Date.parse('2026-11-27T18:00Z'))
  assert.equal(latestClosingDay('XETRA', Date.parse('2026-12-25T19:00Z')), '2026-12-23')
  assert.equal(latestClosingDay('SW', Date.parse('2026-04-06T19:00Z')), '2026-04-02')
})

test('la recherche de marché conserve la place, la devise et le bon type de titre', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.hostname, 'eodhd.com')
    assert.match(url.pathname, /search\/VUAA$/)
    return Response.json([
      { Code: 'VUAA', Name: 'Vanguard ETF', Exchange: 'XETRA', Currency: 'EUR', Type: 'ETF', ISIN: etf.reference },
      { Code: 'VUAA', Name: 'Vanguard ETF', Exchange: 'LSE', Currency: 'GBX', Type: 'ETF', ISIN: etf.reference },
      { Code: 'VUAA', Name: 'Une autre action', Exchange: 'US', Currency: 'USD', Type: 'Common Stock' },
    ])
  })
  const results = await searchMarket('etf', 'VUAA', 'test-recherche')
  assert.equal(results.length, 1)
  assert.equal(results[0].reference, etf.reference)
  assert.equal(results[0].listing, 'XETR:VUAA')
  assert.deepEqual(results[0].market, eodhd)
})

test('NQSE en EUR sur Xetra garde son propre cours, séparé du CSNDX en USD', async t => {
  const [nqse] = searchCatalog('etf', 'NQSE')
  const [csndx] = searchCatalog('etf', 'CSNDX')
  assert.deepEqual(searchCatalog('etf', 'IE00BYVQ9F29'), [nqse])
  assert.equal(nqse.listing, 'XETR:NQSE')
  assert.deepEqual(nqse.market, { code: 'NQSE.XETRA', currency: 'EUR' })
  assert.notEqual(quoteTarget(nqse), quoteTarget(csndx))
  assert.equal(quoteAccess(nqse, keys), 'key')
  assert.equal(quoteAccess(nqse, { ...keys, eodhd: 'test-nqse' }), 'available')

  const listing = { Code: 'NQSE', Name: nqse.name, Exchange: 'XETRA', Currency: 'EUR', Type: 'ETF', ISIN: nqse.isin }
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.pathname.endsWith('/search/NQSE')) return Response.json([
      { ...listing, ISIN: csndx.isin }, { ...listing, Currency: 'USD' }, listing,
    ])
    if (url.hostname === 'eodhd.com') {
      assert.match(url.pathname, /\/eod\/NQSE\.XETRA$/)
      return Response.json([{ date: '2026-11-09', close: 16.1 }])
    }
    assert.equal(url.hostname, 'api.frankfurter.dev')
    return Response.json([{ date: '2026-11-09', quote: 'EUR', rate: 1.15 }])
  })
  const results = await searchMarket('etf', 'NQSE', 'test-nqse')
  assert.equal(results.length, 1)
  assert.equal(results[0].isin, nqse.isin)
  const [mark] = await fetchEodSeries(nqse, nqse.market, 'test-nqse', Date.parse('2026-11-10T08:00Z'))
  assert.equal(mark.target, quoteTarget(nqse))
  assert.equal(mark.instrument, 'NQSE.XETRA')
  assert.equal(mark.originalPrice, '16.1')
  assert.equal(mark.currency, 'EUR')
})

test('une clôture d’ETF conserve son prix d’origine, utilise le cours brut et ignore zéro', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.hostname === 'eodhd.com') {
      assert.match(url.pathname, /\/eod\/VUAA\.XETRA$/)
      assert.equal(url.searchParams.get('to'), '2026-04-02')
      return Response.json([
        { date: '2026-04-01', close: 0 },
        { date: '2026-04-02', close: 105, adjusted_close: 87 },
        { date: '2026-04-03', close: 110 },
      ])
    }
    assert.equal(url.hostname, 'api.frankfurter.dev')
    assert.equal(url.searchParams.get('providers'), 'ecb')
    return Response.json([{ date: '2026-04-02', quote: 'EUR', rate: 1.05 }])
  })
  const [mark, ...rest] = await fetchEodSeries(etf, eodhd, 'test-historique', Date.parse('2026-04-06T20:00Z'))
  assert.equal(rest.length, 0)
  assert.equal(mark.price, '100')
  assert.equal(mark.originalPrice, '105')
  assert.equal(mark.currency, 'EUR')
  assert.equal(mark.timing, 'close')
  assert.equal(mark.sourceAt, Date.parse('2026-04-02T15:30Z'))
})

test('les requêtes crypto identiques partagent une réponse et les erreurs de quota sont lisibles', async t => {
  const now = Date.now()
  const request = t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.hostname, 'api.coingecko.com')
    if (url.searchParams.has('x_cg_demo_api_key')) return new Response(null, { status: 429 })
    return Response.json({ bitcoin: { chf: 63000, last_updated_at: Math.floor(now / 1000) } })
  })
  const [one, two] = await Promise.all([fetchQuotes([bitcoin], keys), fetchQuotes([bitcoin], keys)])
  assert.equal(request.mock.callCount(), 1)
  assert.equal(one.marks[0].price, '63000')
  assert.deepEqual(one.marks, two.marks)
  const limited = await fetchQuotes([bitcoin], { ...keys, coingecko: 'test-limite' })
  assert.equal(limited.marks.length, 0)
  assert.match(limited.issues[0], /limité les requêtes/)
})

test('une ancienne clôture est fraîche durant une fermeture et ancienne après une séance attendue', async () => {
  const { quoteIsStale } = await import('../src/quotes.ts')
  const mark = { source: 'EODHD · clôture', timing: 'close', instrument: 'VUAA.XETRA',
    sourceAt: Date.parse('2026-04-02T15:30Z') }
  assert.equal(quoteIsStale(mark, Date.parse('2026-04-06T20:00Z')), false)
  assert.equal(quoteIsStale(mark, Date.parse('2026-04-07T20:00Z')), true)
})

test('les clôtures d’ETF sont enregistrées avec leur ligne de cotation', async t => {
  const markTime = Date.parse('2026-04-02T15:30Z')
  const { instrumentCode } = await import('../src/quotes.ts')
  t.mock.method(globalThis, 'fetch', async url => url.hostname === 'eodhd.com'
    ? Response.json([{ date: '2026-04-02', close: 100 }])
    : Response.json([{ date: '2026-04-02', quote: 'EUR', rate: 1 }]))
  const [result] = await fetchEodSeries(etf, eodhd, 'test-ligne', Date.parse('2026-04-06T20:00Z'))
  assert.equal(result.instrument, 'VUAA.XETRA')
  assert.equal(result.sourceAt, markTime)
  assert.ok(result.receivedAt > markTime)
  assert.notEqual(instrumentCode(etf), instrumentCode({ ...etf, listing: 'XSWX:VUAA' }))
})

test('un ETF hors catalogue garde une identité par place et devise', async t => {
  const isin = 'IE00B1234567'
  t.mock.method(globalThis, 'fetch', async () => Response.json([
    { Code: 'ABC', Exchange: 'XETRA', Currency: 'EUR', Name: 'ETF témoin', Type: 'ETF', ISIN: isin },
    { Code: 'ABC', Exchange: 'SW', Currency: 'CHF', Name: 'ETF témoin', Type: 'ETF', ISIN: isin },
  ]))
  const [xetra, six] = await searchMarket('etf', isin, 'test-lignes-distinctes')
  assert.equal(xetra.isin, six.isin)
  assert.notEqual(quoteTarget(xetra), quoteTarget(six))
  assert.deepEqual([xetra.reference, six.reference], ['XETR:ABC:EUR', 'XSWX:ABC:CHF'])
})

test('le cache crypto permet de relancer après une erreur et de forcer une vérification', async t => {
  const now = Math.floor(Date.now() / 1000)
  let status = 503
  let price = 63000
  const request = t.mock.method(globalThis, 'fetch', async () => status === 200
    ? Response.json({ bitcoin: { chf: price, last_updated_at: now } })
    : new Response(null, { status }))
  const options = { ...keys, coingecko: 'test-cache-relance' }
  const failed = await fetchQuotes([bitcoin], options)
  assert.equal(failed.marks.length, 0)
  status = 200
  const valid = await fetchQuotes([bitcoin], options)
  assert.equal(valid.marks[0].price, '63000')
  assert.deepEqual((await fetchQuotes([bitcoin], options)).marks, valid.marks)
  assert.equal(request.mock.callCount(), 2)
  price = 63001
  const fresh = await Promise.all([
    fetchQuotes([bitcoin], options, { force: true }), fetchQuotes([bitcoin], options, { force: true }),
  ])
  assert.equal(request.mock.callCount(), 3)
  assert.equal(fresh[0].marks[0].price, '63001')
  assert.deepEqual(fresh[0].marks, fresh[1].marks)
  status = 429
  assert.match((await fetchQuotes([bitcoin], options, { force: true })).issues[0], /limité les requêtes/)
  assert.equal(valid.marks[0].price, '63000')
})

test('le graphique global affiche un palier sélectionnable sans combler les jours ouvrés', () => {
  const points = [
    { date: '2026-11-11', value: 1945 },
    { date: '2026-11-13', value: 1920 },
    { date: '2026-11-16', value: 1850 },
  ]
  const chart = carryWeekendChartPoints(points, '2026-11-17')
  assert.deepEqual(chart.map(({ date, value }) => [date, value]), [
    ['2026-11-11', 1945], ['2026-11-13', 1920], ['2026-11-14', 1920],
    ['2026-11-15', 1920], ['2026-11-16', 1850],
  ])
  assert.match(chart[2].detail, /fermés/)
  assert.equal(points.length, 3)
  const saturday = { date: '2026-11-14', value: 1900 }
  const mixed = carryWeekendChartPoints([points[1], saturday], '2026-11-15')
  assert.equal(mixed[1], saturday)
  assert.equal(mixed[2].value, 1900)
  const explicitGap = carryWeekendChartPoints([
    points[1], { date: '2026-11-14', value: null }, { date: '2026-11-16', value: null },
  ], '2026-11-17')
  assert.deepEqual(explicitGap.map(point => point.value), [1920, 1920, 1920, null])
})
