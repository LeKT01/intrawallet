import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replay } from '../src/ledger.ts'
import { consolidate, summarize, unitPrice } from '../src/portfolio.ts'
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
