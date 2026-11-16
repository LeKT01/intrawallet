import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('les variantes, le mode système et la densité restent mémorisés', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/?demo=1#data/appearance')
  const root = page.locator('html')
  const theme = page.getByLabel('Thème', { exact: true })
  await expect(root).toHaveAttribute('data-variant', 'coral')
  await page.getByLabel('Champagne').check()
  await expect(root).toHaveAttribute('data-variant', 'champagne')
  await page.getByLabel('Noir OLED').check()
  await page.getByLabel('Densité').selectOption('compact')
  await theme.selectOption('dark')
  await expect(root).toHaveAttribute('data-variant', 'oled')
  await page.reload()
  await expect(root).toHaveAttribute('data-density', 'compact')
  await expect(root).toHaveAttribute('data-variant', 'oled')
  await page.getByLabel('Graphite').check()
  await expect(root).toHaveAttribute('data-variant', 'graphite')
  await theme.selectOption('system')
  await expect(root).toHaveAttribute('data-variant', 'champagne')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(root).toHaveAttribute('data-variant', 'graphite')
})

test('les vues Cartes et Tableau partagent les filtres et le choix est mémorisé', async ({ page }) => {
  await page.goto('/?demo=1#positions')
  const search = page.getByRole('searchbox', { name: 'Rechercher un actif' })
  await search.fill('Bitcoin')
  await page.getByRole('button', { name: 'Cartes', exact: true }).click()
  await expect(page.locator('.asset-card')).toHaveCount(1)
  await expect(page.locator('.asset-card')).toContainText('Bitcoin')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cartes', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Tableau', exact: true }).click()
  await expect(page.locator('.asset-card')).toHaveCount(0)
})

test('les indicateurs précèdent le graphique sur mobile et garde ses commandes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?demo=1#overview')
  await expect(page.locator('.history-panel')).toBeVisible()
  const [chart, metrics] = await Promise.all([
    page.locator('.history-panel').boundingBox(), page.locator('.dashboard-metrics').boundingBox(),
  ])
  expect(metrics!.y + metrics!.height).toBeLessThan(chart!.y)
  const result = page.getByRole('button', { name: 'Résultat cumulé', exact: true })
  await result.click()
  await expect(result).toHaveAttribute('aria-pressed', 'true')
})

for (const variant of ['coral', 'champagne', 'graphite', 'oled']) {
  test(`contraste du dashboard et des préférences · ${variant}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(scheme => {
      const mode = scheme === 'coral' || scheme === 'champagne' ? 'light' : 'dark'
      localStorage.setItem('portefeuille.theme', mode)
      localStorage.setItem('portefeuille.theme.' + mode, scheme)
    }, variant)
    for (const [route, section] of [['overview', '.dashboard-grid'], ['data/appearance', '.appearance-panel']]) {
      await page.goto('/?demo=1#' + route)
      await expect(page.locator(section)).toBeVisible()
      const results = await new AxeBuilder({ page }).include(section).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(results.violations).toEqual([])
    }
  })
}

for (const width of [390, 440, 1440]) {
  test(`la carte corail garde trois cartes et une courbe séparée à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 440 ? 956 : 844 })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.goto('/?demo=1')
    const hero = page.locator('.valuation-panel')
    const art = hero.locator('.valuation-art')
    const amount = hero.locator('.valuation-amount')
    const history = page.locator('.dashboard-grid > .history-panel')
    await expect(hero).toBeVisible()
    await expect(art.locator(':scope > span')).toHaveCount(3)
    await expect(art.locator('svg')).toBeVisible()
    await expect(history).toBeVisible()
    const bounds = (await history.boundingBox())!
    const [value, artBounds, heroBounds] = await Promise.all([amount.boundingBox(), art.boundingBox(), hero.boundingBox()])
    expect(value!.x + value!.width).toBeLessThan(artBounds!.x)
    expect(heroBounds!.y + heroBounds!.height).toBeLessThan(bounds.y)
    expect(await hero.evaluate(node => getComputedStyle(node).backgroundImage)).toContain('linear-gradient')
  })
}
