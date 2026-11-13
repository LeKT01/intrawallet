import { expect, test } from '@playwright/test'

for (const width of [390, 1440]) {
  test(`portefeuille groupé persistant à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/#positions')
    if (width === 390) await page.getByRole('button', { name: 'Ouvrir les actions d’ajout' }).click()
    const entry = width === 390 ? page.getByRole('dialog', { name: 'Ajouter' }) : page.locator('main')
    await entry.getByRole('button', { name: 'Créer un portefeuille groupé' }).click()
    const form = page.getByRole('dialog', { name: 'Créer un portefeuille groupé' })
    await form.getByLabel('Nom du groupe').fill('Robo Test')
    await form.getByLabel('Plateforme').fill('Revolut')
    await form.getByLabel('Capital initial').fill('1000')
    await form.getByRole('button', { name: 'Ajouter un ETF' }).click()
    await form.getByRole('searchbox').fill('NQSE')
    await form.getByRole('button', { name: /iShares Nasdaq 100 UCITS ETF EUR Hedged/ }).click()
    await form.getByLabel('Allocation de XETR:NQSE').fill('40,5')
    await form.getByRole('button', { name: 'Enregistrer le groupe' }).click()
    await expect(page.getByRole('heading', { name: 'Robo Test' })).toBeVisible()
    await page.getByLabel('Montant en CHF').fill('1050')
    await page.getByRole('button', { name: 'Enregistrer l’événement' }).click()
    await expect(page.getByText(/Valeur déclarée ·/)).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Robo Test' })).toBeVisible()
    await expect(page.getByText('40.5 %', { exact: true })).toBeVisible()
    await expect(page.getByText(/Valeur déclarée ·/)).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
