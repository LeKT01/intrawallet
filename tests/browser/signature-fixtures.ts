import type { Page } from '@playwright/test'
import { makeDemo } from '../../src/demo'
import { assetKey, type Position } from '../../src/portfolio'
import type { Mark } from '../../src/ledger'

export const reviewTime = new Date('2026-11-11T12:00:00+01:00')

// Synthetic records are written only to the isolated demo database in a fresh browser context.
export async function seedStressPortfolio(page: Page) {
  const now = reviewTime.getTime()
  const data = makeDemo(now)
  const positions: Position[] = Array.from({ length: 24 }, (_, index) => ({
    id: 'review-position-' + index, category: 'etf', reference: 'MANUAL:REVIEW' + index,
    name: 'ETF de démonstration ' + (index + 1) + ' — Allocation internationale diversifiée, capitalisante et couverte en euros',
    platform: 'Plateforme de démonstration ' + (index % 6 + 1),
    quantity: index === 0 ? '987654321' : '52.38',
    createdAt: now - 10 * 86400000, valuation: null,
    cost: index % 4 === 0 ? null : { kind: 'exact', amount: '850' },
  }))
  const marks: Mark[] = positions.flatMap((position, index) => index % 3 === 0 ? [] : [{
    id: 'review-mark-' + index, kind: 'market', target: assetKey(position),
    at: now - (index % 2 ? 7 * 86400000 : 0), sourceAt: now - (index % 2 ? 7 * 86400000 : 0),
    price: '16.3', originalPrice: '17.6', currency: 'EUR', source: 'Cours simulé pour test',
  }])
  // The very large holding is valued; other entries deliberately have no quote.
  marks.push({ id: 'review-large', kind: 'market', target: assetKey(positions[0]),
    at: now, sourceAt: now, price: '129.01', source: 'Cours simulé pour test' })
  const groups = [{
    id: 'review-group', name: 'Gestion déléguée — Groupe estimatif de démonstration', type: 'managed', mode: 'estimate',
    platform: 'Plateforme de démonstration 1', currency: 'CHF', initial: '1000', createdAt: now - 10 * 86400000,
    description: 'Fixture de revue visuelle : les allocations sont des estimations.',
    allocations: [{ at: now - 10 * 86400000, entries: [
      { asset: { category: 'etf', reference: 'IE00BYVQ9F29', listing: 'XETR:NQSE', name: 'iShares Nasdaq 100 UCITS ETF EUR Hedged' }, percent: '40.5' },
      { asset: { category: 'etf', reference: 'IE00B3XXRP09', listing: 'TGAT:VUSA', name: 'Vanguard S&P 500 UCITS ETF' }, percent: '35' },
    ] }], flows: [{ id: 'review-deposit', at: now - 6 * 86400000, kind: 'deposit', amount: '50' }],
    valuations: [
      { id: 'review-valuation-1', at: now - 8 * 86400000, amount: '1000' },
      { id: 'review-valuation-2', at: now - 4 * 86400000, amount: '1100' },
      { id: 'review-valuation-3', at: now, amount: '1250' },
    ], positions: [], operations: [],
  }]
  await page.evaluate(async records => {
    if (new URLSearchParams(location.search).get('demo') !== '1') throw new Error('Fixture réservée au mode démo')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('portefeuille-local-demo')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['positions', 'operations', 'marks', 'groups'], 'readwrite')
      for (const [name, values] of Object.entries(records)) {
        const store = transaction.objectStore(name)
        store.clear()
        for (const value of values) store.put(value)
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  }, { positions: [...data.positions, ...positions], operations: data.operations, marks: [...data.marks, ...marks], groups })
  await page.reload()
}
