import { expect, test } from '@playwright/test'

test('la vue d’ensemble relie les relevés espacés en 1 mois et en 24 h', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-11-18T10:00:00Z'))
  await page.addInitScript(() => localStorage.setItem('portefeuille.auto-refresh', 'off'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ajoute ton premier investissement' })).toBeVisible()
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('portefeuille-local')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['positions', 'marks'], 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
        const createdAt = Date.parse('2026-11-11T12:00:00Z')
        transaction.objectStore('positions').put({
          id: 'gap-test', category: 'stock', reference: 'MANUAL:EXAMPLE', name: 'Action de test',
          platform: 'Test', createdAt, quantity: '1', valuation: null,
          cost: { kind: 'exact', amount: '100' },
        })
        for (const [index, date] of [
          '2026-11-11T12:00:00Z', '2026-11-13T12:00:00Z',
          '2026-11-17T16:00:00Z', '2026-11-18T09:00:00Z',
        ].entries()) {
          const at = Date.parse(date)
          transaction.objectStore('marks').put({
            id: 'gap-mark-' + index, kind: 'market', target: 'stock/MANUAL:EXAMPLE',
            price: String(110 + index), at, sourceAt: at, source: 'Cotations de test',
          })
        }
      })
    } finally {
      db.close()
    }
  })
  await page.reload()
  const chart = page.locator('.history-panel')
  await expect(chart.locator('.chart-missing')).toHaveAttribute('d', /^M.+ L.+/)
  await expect(chart.getByText('Liaisons en pointillés · aucun relevé intermédiaire.')).toBeVisible()
  await expect(chart.getByText(/Marchés actions et ETF fermés le week-end/)).toBeVisible()
  await chart.getByRole('button', { name: '24 h', exact: true }).click()
  await expect(chart.locator('.chart-missing')).toHaveAttribute('d', /^M.+ L.+/)
  await expect(chart.locator('svg circle')).toHaveCount(2)
})
