import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoFxRates, makeDemo } from '../src/demo.ts'
import { currencyDisplay, dayKey } from '../src/currency.ts'
import { replay } from '../src/ledger.ts'
import { backupText, readBackup } from '../src/backup.ts'

test('la démo couvre trente jours complets et inclut les trois types d’opération', () => {
  const now = Date.UTC(2026, 10, 9, 8, 0)
  const data = makeDemo(now)
  const view = replay(data)
  assert.deepEqual([...new Set(data.operations.map(item => item.kind))], ['buy', 'sell', 'transfer'])
  assert.equal(view.history.length, 30)
  assert.equal(view.history.at(-1).date, dayKey(now))
  assert.ok(view.history.every(point => point.value !== null && point.result !== null))
  assert.equal(new Set(view.holdings.map(item => item.platform)).size, 2)
  assert.ok(data.marks.every(mark => mark.at <= now && mark.source === 'Cours simulé'))
  assert.equal(readBackup(backupText(data)).marks.length, 90)
  const display = currencyDisplay('USD', demoFxRates(dayKey(now)))
  assert.equal(display.convert(100, view.history[0].date).toFixed(), '121')
})
