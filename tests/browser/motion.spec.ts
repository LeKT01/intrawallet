import { expect, test } from '@playwright/test'

test('la navigation conserve le rail et révèle les zones dans un ordre déterministe', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    const animate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options)
      if (animation.id === 'iw-page-reveal') animation.pause()
      return animation
    }
  })
  await page.goto('/?demo=1#overview')
  await expect(page.locator('.valuation-panel')).toBeVisible()
  const sequence = await page.locator('main').evaluate(main => main.getAnimations({ subtree: true })
    .filter(animation => animation.id === 'iw-page-reveal')
    .map(animation => {
      const effect = animation.effect as KeyframeEffect
      return { target: (effect.target as HTMLElement).className, ...effect.getTiming() }
    }))
  expect(sequence[0].target).toContain('page-title')
  expect(sequence[1].target).toContain('valuation-panel')
  expect(sequence[2].target).toContain('allocation-panel')
  expect(sequence[0].delay).toBeLessThan(sequence[1].delay)
  expect(sequence[1].delay).toBeLessThan(sequence[2].delay)

  const sidebar = page.locator('.sidebar')
  const before = await sidebar.boundingBox()
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  const initial = await nav.evaluate(el => (el as HTMLElement).style.getPropertyValue('--active-y'))
  await nav.getByRole('button', { name: 'Analyses' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Analyses')
  await expect(nav.getByRole('button', { name: 'Analyses' })).toHaveAttribute('aria-current', 'page')
  expect(await sidebar.boundingBox()).toEqual(before)
  await expect.poll(() => nav.evaluate(el => (el as HTMLElement).style.getPropertyValue('--active-y'))).not.toBe(initial)
})

test('la feuille mobile se révèle, se ferme et rend le focus au bouton Ajouter', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/?demo=1')
  const add = page.getByRole('button', { name: 'Ouvrir les actions d’ajout' })
  await add.click()
  const sheet = page.getByRole('dialog', { name: 'Ajouter' })
  await expect(sheet).toBeVisible()
  expect(await sheet.evaluate(node => getComputedStyle(node).animationName)).toBe('iw-dialog-enter')
  expect(await sheet.evaluate(node => getComputedStyle(node).getPropertyValue('--sheet-travel').trim())).toBe('24px')
  await page.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
  await expect(add).toBeFocused()
})

test('le mouvement réduit affiche le dashboard et ouvre les actions sans mouvement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?demo=1')
  await expect(page.locator('.dashboard-grid .history-panel')).toBeVisible()
  expect(await page.locator('main').evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0)
  await page.getByRole('button', { name: 'Ouvrir les actions d’ajout' }).click()
  const sheet = page.getByRole('dialog', { name: 'Ajouter' })
  expect(await sheet.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
  await sheet.getByRole('button', { name: 'Ajouter un investissement' }).click()
  const form = page.getByRole('dialog', { name: 'Ajouter une position' })
  await expect(form).toBeVisible()
  expect(await form.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
})

test('la période révèle la courbe sans déplacer les axes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/?demo=1#overview')
  await page.getByRole('button', { name: 'Résultat cumulé', exact: true }).click()
  const chart = page.locator('.history-panel .history-chart')
  const frames = await chart.evaluate(svg => {
    const stroke = svg.querySelector('.chart-line')!
    const animation = stroke.getAnimations()[0]
    animation.pause()
    animation.currentTime = 0
    const start = getComputedStyle(stroke).clipPath
    const axes = Array.from(svg.querySelectorAll('line:not(.chart-crosshair)')).map(line => line.getAttribute('y1'))
    animation.currentTime = 560
    return { start, end: getComputedStyle(stroke).clipPath, axes }
  })
  expect(frames.start).toBe('inset(0px 100% 0px 0px)')
  expect(frames.end).toMatch(/^inset\(0px(?: 0% 0px 0px)?\)$/)
  expect(frames.axes).toEqual(['22', '85', '150'])
})

test('le dashboard et la feuille Ajouter restent utilisables en paysage court', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?demo=1')
  await expect(page.locator('.valuation-amount')).toBeVisible()
  expect(await page.locator('html').evaluate(node => node.scrollWidth)).toBeLessThanOrEqual(844)
  await page.getByRole('button', { name: 'Ouvrir les actions d’ajout' }).click()
  const sheet = page.getByRole('dialog', { name: 'Ajouter' })
  await expect(sheet).toBeInViewport()
  await expect(sheet.getByRole('button', { name: 'Enregistrer une transaction' })).toBeInViewport()
})
