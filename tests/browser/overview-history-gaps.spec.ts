import { expect, test } from '@playwright/test'

test('la vue d’ensemble affiche une courbe pleine pour les relevés espacés', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-11-18T10:05:00Z'))
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
          '2026-11-17T16:00:00Z', '2026-11-17T16:05:00Z', '2026-11-17T16:10:00Z',
          '2026-11-17T16:55:00Z', '2026-11-18T09:00:00Z', '2026-11-18T10:02:00Z',
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
  const line = chart.locator('.chart-line')
  const continuous = /^M[^M]+$/
  await expect(line).toHaveAttribute('d', continuous)
  await expect(line).toHaveAttribute('d', / L/)
  await expect(chart.locator('.chart-area')).toHaveCount(1)
  await expect(chart.getByText('Aucun relevé intermédiaire sur certains intervalles.')).toBeVisible()
  await expect(chart.getByText(/Marchés actions et ETF fermés le week-end/)).toBeVisible()
  await chart.getByRole('button', { name: '7 j', exact: true }).click()
  await expect(line).toHaveAttribute('d', continuous)
  await expect(chart.locator('svg circle').filter({ has: page.locator('title', { hasText: 'Marchés actions et ETF fermés' }) })).toHaveCount(2)
  await chart.getByRole('button', { name: '24 h', exact: true }).click()
  await expect(line).toHaveAttribute('d', continuous)
  await expect(chart.locator('.chart-area')).toHaveCount(1)
  await expect(chart.locator('svg circle:not(.chart-hourly-carry)')).toHaveCount(3)
  await expect(chart.locator('svg circle.chart-hourly-carry')).toHaveCount(16)
  const marks = chart.locator('svg circle')
  await expect(marks.last().locator('title')).toContainText('18 nov., 11:00')
  await expect(marks.last().locator('title')).not.toContainText('11:02')
  const x = await marks.evaluateAll(circles => circles.map(circle => Number(circle.getAttribute('cx'))))
  expect(x.slice(1).every((position, index) => Math.abs(position - x[index] - (x[1] - x[0])) < 0.01)).toBe(true)
  const sampled = marks.filter({ has: page.locator('title', { hasText: 'Relevé de 17:55' }) }).first()
  await sampled.click()
  await expect(chart.locator('.history-readout')).toContainText('18:00')
  await expect(chart.locator('.history-readout')).toContainText('115.00')
  const overnight = chart.locator('svg circle.chart-hourly-carry').filter({ has: page.locator('title', { hasText: '03:00' }) })
  await expect(overnight).toHaveAttribute('cy', (await chart.locator('svg circle:not(.chart-hourly-carry)').nth(1).getAttribute('cy'))!)
  await overnight.click()
  await expect(chart.locator('.history-readout')).toContainText('Dernier relevé disponible')
  await expect(chart.getByText('Un point par heure écoulée. Un point creux reprend le dernier relevé disponible.')).toBeVisible()
  await chart.getByRole('button', { name: '6 mois', exact: true }).click()
  await expect(line).toHaveAttribute('d', continuous)
  await expect(chart.locator('.history-axis').getByText('11 nov. 2026')).toBeVisible()
  await page.clock.setFixedTime(new Date('2026-11-14T10:00:00Z'))
  await page.reload()
  await chart.getByRole('button', { name: '24 h', exact: true }).click()
  const saturday = chart.locator('svg circle.chart-hourly-carry').filter({ has: page.locator('title', { hasText: '14 nov., 03:00' }) })
  await saturday.click()
  await expect(chart.locator('.history-readout')).toContainText('Marchés actions et ETF fermés')
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'))
  await page.reload()
  await chart.getByRole('button', { name: '24 h', exact: true }).click()
  await expect(chart.locator('svg circle.chart-hourly-carry')).toHaveCount(24)
  await expect(chart.locator('svg circle:not(.chart-hourly-carry)')).toHaveCount(0)
  await page.clock.setFixedTime(new Date('2026-11-18T10:05:00Z'))
  await page.goto('/#positions/' + encodeURIComponent('stock/MANUAL:EXAMPLE'))
  const assetChart = page.locator('.asset-history')
  await assetChart.getByRole('button', { name: '24 h', exact: true }).click()
  const assetMarks = assetChart.locator('svg circle')
  await expect(assetMarks).toHaveCount(19)
  await expect(assetMarks.last().locator('title')).not.toContainText('11:02')
})
