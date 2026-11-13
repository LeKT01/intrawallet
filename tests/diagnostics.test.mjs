import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkFinancialCalculations, checkPortfolioBackup, safeProviderError } from '../src/diagnostics.ts'

test('le diagnostic financier valide ses scénarios isolés', () => {
  const checks = checkFinancialCalculations()
  assert.equal(checks.length, 5)
  assert.deepEqual(checks.filter(check => check.status !== 'ok'), [])
})

test('le diagnostic ne transmet pas les détails bruts des erreurs', () => {
  assert.deepEqual(safeProviderError(new Error('HTTP 429 https://example.test/?token=secret')),
    { status: 'warning', detail: 'Limite de requêtes atteinte.' })
  assert.equal(safeProviderError(new Error('token=secret')).detail, 'Source inaccessible ou réponse invalide.')
})

test('la sauvegarde conserve les historiques de cotation et accepte les anciens fichiers', () => {
  const base = { positions: [], operations: [], marks: [], platforms: ['Test'] }
  const time = Date.UTC(2025, 0, 1)
  const price = { id: 'quote', kind: 'market', target: 'crypto/BTC', source: 'Test', at: time, sourceAt: time, price: '25' }
  const series = { target: 'crypto/BTC', fetchedAt: time, marks: [price] }
  const backup = { ...base, dailyPrices: [series] }
  assert.deepEqual(checkPortfolioBackup(base), base)
  assert.deepEqual(checkPortfolioBackup(backup), backup)
  assert.throws(() => checkPortfolioBackup({ ...backup, dailyPrices: [series, series] }), /Historique/)
})
