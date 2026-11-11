import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('navigation mobile, ajout et modification d’une position, transaction et préférences', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?demo=1')
  const nav = page.getByRole('navigation', { name: 'Navigation mobile' })
  const add = nav.getByRole('button', { name: 'Ouvrir les actions d’ajout' })
  await add.click()
  await page.getByRole('dialog', { name: 'Ajouter' }).getByRole('button', { name: 'Ajouter une plateforme' }).click()
  await page.getByRole('textbox', { name: 'Nom de la plateforme' }).fill('Plateforme QA')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Plateforme QA', { exact: true })).toBeVisible()

  await add.click()
  await page.getByRole('dialog', { name: 'Ajouter' }).getByRole('button', { name: 'Ajouter un investissement' }).click()
  let form = page.getByRole('dialog')
  await form.getByRole('button', { name: 'Ajouter un actif manuellement' }).click()
  await form.getByPlaceholder('Ex. Vanguard Global Aggregate Bond').fill('ETF de contrôle QA')
  await form.getByLabel('Plateforme', { exact: true }).fill('Plateforme QA')
  await form.getByLabel('Quantité détenue').fill('2')
  await form.getByRole('button', { name: 'Enregistrer la position' }).click()
  await expect(form).toBeHidden()

  await nav.getByRole('button', { name: 'Portefeuille' }).click()
  await page.getByRole('searchbox').fill('ETF de contrôle QA')
  await page.getByRole('button', { name: /ETF de contrôle QA/ }).click()
  await page.getByRole('button', { name: 'Modifier', exact: true }).press('Enter')
  form = page.getByRole('dialog')
  await form.getByLabel('Quantité détenue').fill('3')
  await form.getByRole('button', { name: 'Enregistrer la position' }).click()
  await expect(form).toBeHidden()

  await add.click()
  await page.getByRole('dialog', { name: 'Ajouter' }).getByRole('button', { name: 'Enregistrer une transaction' }).click()
  form = page.getByRole('dialog')
  const asset = form.getByRole('combobox', { name: 'Actif déjà suivi' })
  await asset.selectOption({ label: 'ETF de contrôle QA · Ajout manuel' })
  await form.getByLabel('Plateforme', { exact: true }).fill('Plateforme QA')
  await form.getByLabel('Quantité', { exact: true }).fill('1')
  await form.getByLabel('Montant payé hors frais').fill('40')
  await form.getByRole('button', { name: 'Enregistrer l’opération', exact: true }).click()
  await expect(form).toBeHidden()

  await nav.getByRole('button', { name: 'Espace', exact: true }).click()
  await page.getByRole('link', { name: /Apparence/ }).click()
  await page.getByLabel('Thème').selectOption('dark')
  await page.getByLabel('Devise du portefeuille').selectOption('EUR')
  await expect(page.getByLabel('Devise du portefeuille')).toHaveValue('EUR')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Espace', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Diagnostic/ }).click()
  await page.getByRole('button', { name: 'Lancer les vérifications' }).click()
  await expect(page.getByRole('button', { name: 'Copier le rapport' })).toBeEnabled()
  await expect(page.getByText('0 · Échec', { exact: true })).toBeVisible()
})

test('sauvegarde et restauration dans un profil isolé, avec fournisseurs indisponibles', async ({ page }) => {
  await page.route('**/market/**', route => route.fulfill({ status: 503 }))
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, headers: { 'Access-Control-Allow-Origin': '*' } }))
  await page.route('https://api.frankfurter.dev/**', route => route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' } }))
  await page.goto('/#data/backup')
  const at = Date.UTC(2025, 0, 2, 17)
  const target = 'crypto/BTC'
  const backup = { format: 'portefeuille-local', version: 1, positions: [], operations: [], marks: [],
    dailyPrices: [{ target, fetchedAt: at, marks: [{ id: 'test-btc', kind: 'market', target, price: '100', at,
      sourceAt: at, source: 'Test', timing: 'close' }] }], platforms: ['Compte de test restauration'] }
  await page.locator('input[type=file]').setInputFiles({ name: 'portefeuille-test.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByRole('button', { name: 'Restaurer le fichier' }).click()
  await expect(page.getByText('Portefeuille restauré.', { exact: true })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter la sauvegarde' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^portefeuille-.*\.json$/)
  expect(JSON.parse(await readFile(await file.path(), 'utf8'))).toMatchObject(backup)
  await page.goto('/#platforms')
  await expect(page.getByText('Compte de test restauration', { exact: true })).toBeVisible()
  await page.goto('/#data/appearance')
  await page.getByLabel('Devise du portefeuille').selectOption('EUR')
  await page.reload()
  await expect(page.getByLabel('Devise du portefeuille')).toHaveValue('EUR')
  await page.goto('/#diagnostic')
  await page.getByRole('button', { name: 'Lancer les vérifications' }).click()
  await expect(page.getByRole('button', { name: 'Copier le rapport' })).toBeEnabled()
  await page.getByText('CoinGecko', { exact: true }).click()
  await expect(page.getByText(/Limite de requêtes atteinte/)).toBeVisible()
  await expect(page.locator('.diagnostic-results').getByText('Échec', { exact: true }).first()).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 390, 440, 768, 1440, 1920]) {
    test(`mise en page ${theme} à ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
      await page.emulateMedia({ colorScheme: theme })
      await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+01:00'))
      for (const route of ['overview', 'positions', 'journal', 'analytics', 'platforms', 'data', 'space', 'diagnostic']) {
        await page.goto('/?demo=1#' + route)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(page.getByText('Ouverture du portefeuille…')).toBeHidden()
        if (route === 'diagnostic') await expect(page.getByRole('button', { name: 'Lancer les vérifications' })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)

      }
    })
  }
}
