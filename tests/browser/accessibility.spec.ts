import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  test(`accessibilité du menu, de l’espace et du diagnostic en mode ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/?demo=1#space')
    await expect(page.locator('.space-grid')).toBeVisible()
    const audit = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const results = [(await audit()).violations]
    await page.getByRole('button', { name: 'Ouvrir les actions d’ajout' }).click()
    await expect(page.getByRole('dialog', { name: 'Ajouter' })).toBeVisible()
    results.push((await audit()).violations)
    await page.keyboard.press('Escape')
    await page.getByRole('link', { name: /Diagnostic/ }).click()
    await page.getByRole('button', { name: 'Lancer les vérifications' }).click()
    await expect(page.getByRole('button', { name: 'Copier le rapport' })).toBeEnabled()
    results.push((await audit()).violations)
    expect(results.flat().map(({ id, nodes }) => ({ id, targets: nodes.map(node => [node.target, node.failureSummary]) }))).toEqual([])
  })
}
