import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Decimal } from 'decimal.js'
import { catalogEntry } from '../src/catalog.ts'
import { allocationAmounts, groupCapital, groupValue, validateGroup } from '../src/groups.ts'
import { backupText, readBackup } from '../src/backup.ts'
import { quoteTarget, replay } from '../src/ledger.ts'
import { summarize } from '../src/portfolio.ts'

const at = Date.parse('2025-06-10T10:00Z')
const assets = ['XETR:NQSE', 'TGAT:VUSA', 'XSWX:CSNDX', 'XETR:VWCE'].map(code => catalogEntry('etf', code))
const group = {
  id: 'robo', name: 'Robo-Advisor', platform: 'Revolut', type: 'managed', mode: 'estimate',
  currency: 'CHF', initial: '1000', createdAt: at, description: '',
  allocations: [{ at, entries: assets.map((asset, index) => ({ asset, percent: ['40', '30', '20', '10'][index] })) }],
  flows: [], valuations: [], positions: [], operations: [],
}
const fx = currency => ({ CHF: new Decimal(1), EUR: new Decimal('0.95'), USD: new Decimal('0.85') })[currency] ?? null
const position = { ...assets[0], id: 'lot', platform: 'Revolut', quantity: '2.5', createdAt: at,
  cost: { amount: '25', kind: 'exact' }, valuation: null, initialValue: '25' }
const mark = { id: 'm', kind: 'market', target: quoteTarget(position), price: '16', at: at + 1000,
  sourceAt: at + 1000, source: 'Xetra', originalPrice: '16', currency: 'CHF' }

test('quatre ETF partagent 1000 CHF sans fabriquer de positions ni de performance', () => {
  validateGroup(group)
  const result = allocationAmounts(group)
  assert.deepEqual(result.entries.map(row => row.amount.toFixed()), ['400', '300', '200', '100'])
  assert.equal(result.remaining.toFixed(), '0')
  const estimate = groupValue(group, [mark], fx)
  assert.equal(estimate.value, null)
  assert.equal(estimate.summary.gain, null)
  assert.deepEqual(estimate.holdings, [])
})

test('les apports, retraits et cibles décimales conservent le solde non alloué et les anciennes cibles', () => {
  const entries = [{ asset: assets[0], percent: '12.75' }, { asset: assets[3], percent: '0.25' }]
  const next = { ...group, initial: '1100', allocations: [...group.allocations, { at: at + 1000, entries }],
    flows: [{ id: 'in', at, kind: 'deposit', amount: '200' }, { id: 'out', at, kind: 'withdrawal', amount: '100' }] }
  validateGroup(next)
  assert.equal(groupCapital(next).toFixed(), '1200')
  assert.deepEqual(allocationAmounts(next).entries.map(row => row.amount.toFixed()), ['153', '3'])
  assert.equal(allocationAmounts(next).remaining.toFixed(), '1044')
  assert.equal(next.allocations[0].entries.length, 4)
  assert.throws(() => validateGroup({ ...next, allocations: [{ at, entries: [{ ...entries[0], percent: '100.01' }] }] }), /dépasse/)
  assert.throws(() => validateGroup({ ...next, allocations: [{ at, entries: [entries[0], entries[0]] }] }), /unique/)
})

test('un relevé déclaré est converti dans les trois devises et ne constitue pas un gain latent', () => {
  for (const [currency, expected] of [['CHF', '1100'], ['EUR', '1045'], ['USD', '935']]) {
    const result = groupValue({ ...group, currency, valuations: [{ id: 'v', at, amount: '1100' }] }, [], fx)
    assert.equal(result.value.toFixed(), expected)
    assert.equal(result.summary.returnRate, null)
  }
  assert.equal(groupValue({ ...group, currency: 'EUR', valuations: [{ id: 'v', at, amount: '100' }] }, [], () => null).value, null)
})

test('les positions exactes réutilisent le cours et les règles du journal, sans appliquer les cibles aux quantités', () => {
  const sell = { ...position, id: 'sell', kind: 'sell', quantity: '0.5', gross: '8', fee: '0.2', at: at + 2000 }
  const exact = { ...group, mode: 'exact', positions: [position], operations: [sell],
    valuations: [{ id: 'v', at, amount: '200' }], allocations: [] }
  validateGroup(exact)
  const missing = groupValue(exact, [], fx)
  assert.equal(missing.value, null)
  const live = groupValue(exact, [mark], fx)
  assert.equal(live.holdings[0].quantity, '2')
  assert.equal(live.value.toFixed(), '32')
  assert.equal(live.summary.gain.toFixed(), '12')
  const standalone = replay({ positions: [{ ...position, id: 'independent', quantity: '1' }], operations: [], marks: [mark] }, [], fx, true)
  assert.equal(summarize([...standalone.holdings, ...live.holdings]).amount.toFixed(), '48')
  assert.equal(groupValue(exact, [{ ...mark, price: '20', originalPrice: '20' }], fx).value.toFixed(), '40')
})

test('sauvegardes anciennes et nouvelles préservent leurs positions et rejettent les groupes invalides', () => {
  const original = { positions: [position], operations: [], marks: [mark] }
  assert.deepEqual(readBackup(backupText(original)), original)
  const withGroup = { ...original, groups: [{ ...group, mode: 'exact', positions: [{ ...position, id: 'group-lot' }] }] }
  assert.deepEqual(readBackup(backupText(withGroup)), JSON.parse(JSON.stringify(withGroup)))
  assert.throws(() => readBackup(backupText({ ...original, groups: [{ ...group, initial: '-1' }] })), /invalides/)
})
