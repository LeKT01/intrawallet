import { expect, test } from '@playwright/test'

test('la barre latérale conserve sa position et mémorise sa largeur', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto('/?demo=1#overview')
  const sidebar = page.locator('.sidebar')
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' })
  const toggle = sidebar.getByRole('button', { name: /la barre latérale/ })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const compact = (await sidebar.boundingBox())!
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(navigation.getByText('Transactions', { exact: true }).first()).toBeVisible()
  const expanded = (await sidebar.boundingBox())!
  expect(expanded.width).toBeGreaterThan(compact.width)
  expect(expanded.x).toBe(compact.x)
  for (const [name, route] of [['Transactions', 'journal'], ['Paramètres', 'data'], ['Vue d’ensemble', 'overview']]) {
    const item = navigation.getByRole('button', { name, exact: true })
    await item.click()
    await expect(page).toHaveURL(new RegExp('#' + route + '$'))
    await expect(item).toHaveAttribute('aria-current', 'page')
    expect(await sidebar.boundingBox()).toEqual(expanded)
  }
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(await sidebar.boundingBox()).toEqual(compact)
})

for (const width of [320, 440]) {
  test(`journal et apparence restent utilisables à ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/?demo=1#journal')
    const row = page.getByRole('list', { name: 'Transactions' }).getByRole('listitem').first()
    await expect(row).toBeVisible()
    const edit = row.getByRole('button', { name: 'Modifier', exact: true })
    const remove = row.getByRole('button', { name: 'Supprimer', exact: true })
    const [left, right] = [(await edit.boundingBox())!, (await remove.boundingBox())!]
    expect(left.width).toBeGreaterThanOrEqual(44)
    expect(left.height).toBeGreaterThanOrEqual(44)
    expect(left.y).toBe(right.y)
    expect(left.x + left.width).toBeLessThan(right.x)
    const [asset, amount] = await Promise.all([row.locator('.journal-asset').boundingBox(), row.locator('.journal-amount').boundingBox()])
    expect(asset!.y).toBe(amount!.y)
    await remove.click()
    const confirm = page.getByRole('dialog', { name: 'Supprimer cette entrée ?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Annuler' }).click()
    await expect(row).toBeVisible()
    await page.goto('/?demo=1#data/appearance')
    const appearance = page.getByRole('region', { name: 'Apparence' })
    await expect(appearance.getByLabel('Thème', { exact: true })).toBeVisible()
    await appearance.getByLabel('Noir OLED').check()
    await appearance.getByLabel('Thème', { exact: true }).selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-variant', 'oled')
    expect(await appearance.evaluate(panel => panel.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
