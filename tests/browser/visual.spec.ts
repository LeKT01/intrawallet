import { expect, test } from '@playwright/test'

const screens = { overview: '.valuation-panel', positions: '.portfolio-panel', space: '.space-grid' }
for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`captures ${theme} à ${width}px @visual`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+01:00'))
      for (const [route, selector] of Object.entries(screens)) {
        await page.goto('/?demo=1#' + route)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(page.locator(selector)).toBeVisible()
        if (route === 'positions') {
          await expect(page.getByRole('heading', { name: 'Portefeuilles groupés' })).toBeVisible()
        }
        await expect.soft(page).toHaveScreenshot(`${route}-${theme}-${width}.png`, {
          animations: 'disabled', fullPage: true, maxDiffPixelRatio: 0.005,
        })
      }
    })
  }
}
