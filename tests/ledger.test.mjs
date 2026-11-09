import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyPortfolioHistory, replay } from '../src/ledger.ts'
import { consolidate, summarize, unitPrice } from '../src/portfolio.ts'
import { currencyDisplay } from "../src/currency.ts"
import { searchCatalog } from '../src/catalog.ts'
import { backupText, readBackup } from '../src/backup.ts'

const day = dayOfMonth => Date.UTC(2025, 10, dayOfMonth, 12)
const asset = { category: 'crypto', name: 'Ethereum', reference: 'ETH' }
const opening = (id, amount, basis, platform = 'A') => ({
  ...asset, id, platform, quantity: '1', createdAt: day(1),
  valuation: amount === null ? null : { amount, updatedAt: day(1) },
  cost: basis === null ? null : { kind: 'exact', amount: basis },
})
const trade = (kind, id, date, fields = {}) => ({
  ...asset, kind, id, platform: 'A', quantity: '1', gross: '0', fee: '0',
  at: day(date), createdAt: day(date), ...fields,
})
const quote = (id, date, price) => ({
  id, kind: 'market', target: 'crypto/ETH', price, source: 'Cours manuel', at: day(date), sourceAt: day(date),
})
const data = (positions = [], operations = [], marks = []) => ({ positions, operations, marks })

test('un achat à prix stable augmente la valeur et les flux, sans créer de gain', () => {
  const view = replay(data([opening('p', '300', '250')], [trade('buy', 'b', 2, { gross: '300' })]))
  const point = view.history.at(-1)
  assert.equal(point.value.toFixed(), '600')
  assert.equal(point.netFlows.toFixed(), '600')
  assert.equal(point.result.toFixed(), '0')
})

test('une vente partielle utilise le coût moyen pondéré et déduit ses frais', () => {
  const view = replay(data([opening('p1', '3000', '2000'), opening('p2', '3000', '3000')],
    [trade('sell', 's', 2, { gross: '3000', fee: '10' })]))
  assert.equal(view.sales.get('s').toFixed(), '490')
  assert.equal(view.holdings[0].quantity, '1')
  assert.equal(view.holdings[0].cost.amount, '2500')
  assert.equal(view.history.at(-1).result.toFixed(), '-10')
})

test('un transfert garde le coût moyen sur les unités reçues et retire ses frais', () => {
  const transfer = trade('transfer', 't', 2, { destination: 'B', quantity: '0.5', feeUnits: '0.1', fee: '5' })
  const view = replay(data([opening('p', '300', '200')], [transfer]))
  const [a, b] = view.holdings
  assert.equal(a.quantity, '0.4')
  assert.equal(a.cost.amount, '80')
  assert.equal(b.quantity, '0.5')
  assert.equal(b.cost.amount, '100')
  assert.equal(view.history.at(-1).netFlows.toFixed(), '300')
  assert.equal(view.history.at(-1).result.toFixed(), '-35')
  assert.throws(() => replay(data([opening('p', '300', '200')], [{ ...transfer, destination: 'a' }])), /deux plateformes/)
  assert.throws(() => replay(data([opening('p', '300', '200')], [{ ...transfer, quantity: '1' }])), /Quantité insuffisante/)
})

test('une position partiellement valorisée ne masque pas la valeur connue du portefeuille', () => {
  const view = replay(data([opening('p1', '300', '200'), opening('p2', null, '250')]))
  assert.equal(view.holdings[0].partiallyValued, true)
  assert.equal(summarize(view.holdings).amount.toFixed(), '300')
  assert.equal(summarize(view.holdings).gain, null)
  assert.equal(view.history.at(-1).value, null)
})

test('le suivi démarre au premier cours connu pour une position sans valeur initiale', () => {
  const view = replay(data([opening('p', null, null)], [], [quote('q1', 2, '300'), quote('q2', 4, '325')]))
  assert.deepEqual(view.history.map(point => point.result?.toFixed() ?? null), [null, '0', '25'])
  assert.equal(view.history.at(-1).netFlows.toFixed(), '300')
})

test('une cotation ancienne récupérée après une saisie récente ne remplace pas celle-ci', () => {
  const old = { ...quote('q', 3, '280'), sourceAt: day(1), source: 'CoinGecko' }
  const view = replay(data([opening('p', '300', '250')], [], [quote('recent', 2, '320'), old]))
  assert.equal(view.holdings[0].valuation.amount, '320')
})

test('une sauvegarde restaure les données et rejette une opération incohérente', () => {
  const snapshot = data([opening('p', '300', '250')], [trade('sell', 's', 2, { quantity: '0.5', gross: '150' })], [quote('q', 3, '320')])
  assert.deepEqual(readBackup(backupText(snapshot)), snapshot)
  assert.throws(() => readBackup('{'), /JSON/)
  assert.throws(() => readBackup(backupText({ ...snapshot, operations: [{ ...snapshot.operations[0], quantity: '2' }] })), /Quantité insuffisante/)
})

test('les répartitions successives conservent exactement les quantités saisies', () => {
  const view = replay(data([opening('p', '200', '180')], [
    trade('buy', 'b', 2, { gross: '200' }),
    trade('buy', 'b2', 2, { gross: '200' }),
    trade('sell', 's', 3, { quantity: '0.5', gross: '100' }),
    trade('transfer', 't', 4, { destination: 'B', quantity: '0.5' }),
  ]))
  assert.equal(view.holdings.find(item => item.platform === 'A').quantity, '2')
  assert.equal(view.holdings.find(item => item.platform === 'B').quantity, '0.5')
})

test('la recherche ETF accepte le nom, l’indice compact et les symboles', () => {
  assert.deepEqual(searchCatalog('etf', 'Vanguard S&P500 UCITS').map(item => item.detail), ['Capitalisant', 'Distribuant'])
  assert.equal(searchCatalog('etf', 'CNDX')[0].reference, 'IE00B53SZB19')
  assert.equal(searchCatalog('etf', 'VUSA')[0].detail, 'Distribuant')
})

test('la cotation d’un ETF déjà saisi se regroupe avec son ISIN du catalogue', () => {
  const etf = { category: 'etf', name: 'Vanguard S&P 500 UCITS ETF' }
  const view = replay(data([
    { ...opening('old', '100', '90'), ...etf, reference: 'XETR:VUAA' },
    { ...opening('new', '100', '95', 'B'), ...etf, reference: 'IE00BFMXXD54' },
  ], [{ ...trade('sell', 's', 2, { quantity: '0.5', gross: '50' }), ...etf, reference: 'IE00BFMXXD54' }]))
  assert.equal(consolidate(view.holdings).length, 1)
  assert.equal(view.sales.get('s').toFixed(), '5')
})

test('le prix unitaire et la valeur détenue sont calculés séparément', () => {
  const view = replay(data([{ ...opening('p', null, '150'), quantity: '0.002' }], [], [quote('q', 2, '80000')]))
  const holding = view.holdings[0]
  assert.equal(holding.unitPrice.toFixed(), '80000')
  assert.equal(holding.valuation.amount, '160')
  assert.equal(holding.averageUnitPrice, false)
  assert.match(unitPrice('0.00001234'), /0[.,]00001234/)
})

test('des prix différents sur une plateforme donnent un prix moyen clairement identifié', () => {
  const view = replay(data([opening('a', '100', '80'), { ...opening('b', '600', '240'), quantity: '3' }]))
  const holding = view.holdings[0]
  assert.equal(holding.unitPrice.toFixed(), '175')
  assert.equal(holding.valuation.amount, '700')
  assert.equal(holding.averageUnitPrice, true)
  const partial = replay(data([opening('a', '100', '80'), opening('b', null, '90')])).holdings[0]
  assert.equal(partial.unitPrice, null)
  assert.equal(partial.valuation.amount, '100')
})

test('un jour est reconstitué avec les cours de tous les actifs détenus', () => {
  const positions = [opening('p', '100', '80')]
  const day3 = quote('known', 3, '140')
  const input = data(positions, [], [day3])
  const recorded = replay(input).history
  const history = dailyPortfolioHistory(input, recorded, [quote('old', 1, '70'), quote('missing', 2, '120')])
  assert.deepEqual(history.map(point => point.value.toFixed()), ['100', '120', '140'])
  assert.deepEqual(history.map(point => point.result.toFixed()), ['0', '20', '40'])
  assert.deepEqual(history.map(point => Boolean(point.reconstructed)), [false, true, false])
  const other = { ...opening('etf', '100', '90'), category: 'etf', reference: 'IE00B53SZB19' }
  const mixed = data([...positions, other], [], [day3])
  const incomplete = dailyPortfolioHistory(mixed, replay(mixed).history, [quote('missing', 2, '120')])
  assert.equal(incomplete.length, 2)
  assert.equal(incomplete.at(-1).usedOlderPrices, true)
})

test('les devises historiques utilisent le taux du jour ou un taux antérieur récent', () => {
  const display = currencyDisplay('EUR', [
    { date: '2025-11-03', quote: 'EUR', rate: '1.04' },
    { date: '2025-11-06', quote: 'EUR', rate: '1.1' },
  ])
  assert.equal(display.convert('100', '2025-11-03').toFixed(), '104')
  assert.equal(display.convert('100', '2025-11-04').toFixed(), '104')
  assert.equal(display.convert('100', '2025-11-06').toFixed(), '110')
  assert.equal(display.convert('100', '2025-11-01'), null)
  assert.equal(display.convert('100', '2025-11-14'), null)
  assert.match(display.format('100', { day: '2025-11-06' }), /EUR/)
})

test('le change courant modifie la valorisation sans réécrire les relevés passés', () => {
  const source = { ...quote('usd', 2, '90'), originalPrice: '100', currency: 'USD', source: 'Finnhub', timing: 'reported' }
  const position = opening('p', '90', '80')
  const currentRate = currencyDisplay('USD', [{ date: '2025-11-02', quote: 'USD', rate: '1.25' }])
  const view = replay(data([position], [], [source]), [], () => currentRate.convert('1', '2025-11-02').pow(-1))
  assert.equal(view.holdings[0].valuation.amount, '80')
  assert.equal(view.history.at(-1).value.toFixed(), '90')
  assert.equal(summarize(view.holdings).cost.toFixed(), '80')
})

test('une valorisation manquante laisse le coût connu intact et le rendement indéterminé', () => {
  const totals = summarize(replay(data([opening('p', null, '90')])).holdings)
  assert.equal(totals.cost.toFixed(), '90')
  assert.equal(totals.returnRate, null)
})

test('la sauvegarde accepte les métadonnées de cotation et d’acquisition', () => {
  const position = { ...opening('p', '90', '80'), acquiredOn: '2025-11-01',
    purchase: { total: '100', currency: 'USD', date: '2025-11-01', rate: '0.8' } }
  const mark = { ...quote('q', 2, '90'), originalPrice: '100', currency: 'USD', timing: 'reported' }
  const snapshot = data([position], [], [mark])
  assert.deepEqual(readBackup(backupText(snapshot)), snapshot)
})
