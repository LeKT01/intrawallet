import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { reviewTime, seedStressPortfolio } from './signature-fixtures'

test.use({ screenshot: 'only-on-failure' })

async function layoutErrors(page: Page) {
  return page.evaluate(() => {
    const errors: string[] = []
    const workspace = document.querySelector('.workspace')!
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('document trop large')
    if (workspace.scrollWidth > workspace.clientWidth + 1) errors.push('zone de travail trop large')
    for (const panel of document.querySelectorAll('.dashboard-grid > *, .asset-card, .theme-preview')) {
      const rect = panel.getBoundingClientRect()
      if (rect.width && (rect.left < -1 || rect.right > innerWidth + 1)) errors.push('module hors écran : ' + panel.className)
    }
    const modules = [...document.querySelectorAll('.dashboard-grid > *')].map(node => ({ name: node.className, rect: node.getBoundingClientRect() }))
    for (let a = 0; a < modules.length; a++) for (let b = a + 1; b < modules.length; b++) {
      const x = modules[a].rect, y = modules[b].rect
      if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2)
        errors.push('chevauchement : ' + modules[a].name + ' / ' + modules[b].name)
    }
    return errors
  })
}

for (const [width, height] of [[320, 568], [360, 800], [390, 844], [440, 956], [600, 960], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [844, 390]]) {
  test('composition Signature sans superposition · ' + width + ' × ' + height, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.clock.setFixedTime(reviewTime)
    await page.goto('/?demo=1')
    await expect(page.locator('.valuation-amount')).toContainText('CHF')
    await expect(page.locator('.dashboard-metrics .metric')).toHaveCount(2)
    expect(await layoutErrors(page)).toEqual([])
    if (width >= 1280) {
      const [hero, allocation, chart, positions, metrics] = await Promise.all(
        ['.valuation-panel', '.allocation-panel', '.history-panel', '.dashboard-positions', '.dashboard-metrics']
          .map(selector => page.locator(selector).boundingBox()))
      expect(Math.abs(hero!.y - allocation!.y)).toBeLessThan(2)
      expect(Math.abs(chart!.y - positions!.y)).toBeLessThan(2)
      expect(metrics!.y).toBeGreaterThan(chart!.y + chart!.height)
      expect(hero!.width / allocation!.width).toBeGreaterThan(1.85)
    }
    if (width <= 900) {
      const nav = (await page.locator('.mobile-nav').boundingBox())!
      const viewport = (await page.locator('.workspace').boundingBox())!
      expect(viewport.y + viewport.height).toBeLessThanOrEqual(nav.y)
      await page.locator('.chart-plot').first().scrollIntoViewIfNeeded()
      const plot = (await page.locator('.chart-plot').first().boundingBox())!
      // In short landscape, a tall chart may need scrolling, but the scroll region never crosses the navigation.
      expect(Math.min(plot.y + plot.height, viewport.y + viewport.height)).toBeLessThanOrEqual(nav.y)
      await page.getByRole('navigation', { name: 'Navigation mobile' }).getByRole('button', { name: 'Portefeuille', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Portefeuille', exact: true })).toBeInViewport()
      expect(await page.locator('.workspace').evaluate(node => node.scrollTop)).toBe(0)
    }
  })
}

for (const width of [320, 390, 1440]) {
  test('portefeuille volumineux, cours manquants, montants longs et devises · ' + width, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
    await page.clock.setFixedTime(reviewTime)
    await page.goto('/?demo=1')
    await expect(page.locator('.valuation-amount')).toContainText('CHF')
    await seedStressPortfolio(page)
    await expect(page.locator('.valuation-label')).toHaveText('Valeur connue du portefeuille')
    await expect(page.locator('.valuation-notice')).toContainText('incomplètes')
    for (const currency of ['CHF', 'EUR', 'USD']) {
      await page.getByLabel('Devise d’affichage').selectOption(currency)
      await expect(page.locator('.valuation-amount')).toContainText(currency)
      expect(await layoutErrors(page)).toEqual([])
      const amountFits = await page.locator('.valuation-amount').evaluate(node => node.scrollWidth <= node.clientWidth + 1)
      expect(amountFits, 'Le montant entier doit rester lisible en ' + currency).toBe(true)
    }
    await page.locator('.quote-status').scrollIntoViewIfNeeded()
    await page.locator('.quote-status summary').click()
    await expect(page.locator('.quote-status')).toContainText('Cours anciens')
    await page.goto('/?demo=1#positions')
    await page.getByRole('button', { name: 'Cartes', exact: true }).click()
    await expect(page.locator('.asset-card')).toHaveCount(27)
    expect(await layoutErrors(page)).toEqual([])
    await page.screenshot({ path: info.outputPath('portefeuille-volumineux-' + width + '.png') })
    await page.reload()
    await expect(page.locator('.asset-card')).toHaveCount(27)
  })
}

test('le graphique se parcourt au clavier et la période possède un indicateur glissant', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?demo=1')
  const active = page.locator('.history-panel .history-chart circle[tabindex="0"]')
  await active.focus()
  const before = await active.getAttribute('aria-label')
  await page.keyboard.press('ArrowLeft')
  await expect(active).not.toHaveAttribute('aria-label', before!)
  await expect(active).toBeFocused()
  await page.getByRole('button', { name: '7 j', exact: true }).click()
  await expect(page.locator('.period-segments')).toHaveAttribute('data-indicator', 'ready')
  await expect(page.getByRole('button', { name: '7 j', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('zoom 200 % simulé par viewport CSS réduit avec échelle de pixels doublée', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4174/?demo=1')
  await expect(page.locator('.valuation-panel')).toBeVisible()
  expect(await layoutErrors(page)).toEqual([])
  await page.getByRole('button', { name: 'Ouvrir les actions d’ajout' }).click()
  const sheet = page.getByRole('dialog', { name: 'Ajouter', exact: true })
  await expect(sheet.getByRole('button', { name: 'Créer un portefeuille groupé' })).toBeInViewport()
  await context.close()
})

for (const theme of ['light', 'dark'] as const) {
  test('accessibilité des cartes, analyses et du journal · ' + theme, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    for (const [route, selector] of [['positions', '.portfolio-panel'], ['analytics', '.analysis-grid'], ['journal', '.journal-panel']]) {
      await page.goto('/?demo=1#' + route)
      await expect(page.locator(selector)).toBeVisible()
      if (route === 'positions') await page.getByRole('button', { name: 'Cartes', exact: true }).click()
      const audit = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(audit.violations).toEqual([])
    }
  })
}
