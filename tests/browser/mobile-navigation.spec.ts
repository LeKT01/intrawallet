import { expect, test } from '@playwright/test'

const tabs = [
  ['Portefeuille', 'Portefeuille'],
  ['Analyses', 'Analyses'],
  ['Espace', 'Espace'],
  ['Accueil', 'Vue d’ensemble'],
] as const

for (const [width, height] of [[320, 568], [375, 812], [390, 844], [440, 956], [768, 1024]]) {
  test(`navigation mobile stable à ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: width === 390 || width === 768 ? 'dark' : 'light' })
    await page.goto('/?demo=1#overview')
    await expect(page.locator('.valuation-panel')).toBeVisible()
    const nav = page.locator('.mobile-nav')
    const bounds = await nav.boundingBox()
    const original = (await nav.elementHandle())!
    const monitor = await nav.evaluateHandle(node => {
      const before = node.getBoundingClientRect()
      const errors: string[] = []
      let frame: number
      const sample = () => {
        const rect = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        if (!node.isConnected || rect.x !== before.x || rect.y !== before.y
          || rect.width !== before.width || rect.height !== before.height
          || style.visibility !== 'visible' || Number(style.opacity) !== 1) {
          errors.push('La barre a bougé ou a été masquée')
        }
        frame = requestAnimationFrame(sample)
      }
      frame = requestAnimationFrame(sample)
      return { errors, stop: () => cancelAnimationFrame(frame) }
    })
    await page.evaluate(() => {
      document.startViewTransition = () => { throw new Error('La navigation mobile ne doit pas capturer le document') }
    })
    for (const [tab, title] of tabs) {
      await page.locator('.workspace').evaluate(node => { node.scrollTop = node.scrollHeight })
      await nav.getByRole('button', { name: tab, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expect(nav.getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(nav).toBeInViewport({ ratio: 1 })
      expect(await nav.boundingBox()).toEqual(bounds)
    }
    await nav.evaluate(node => {
      for (const name of ['Portefeuille', 'Analyses', 'Espace']) {
        Array.from(node.querySelectorAll('button')).find(button => button.textContent?.trim() === name)?.click()
      }
    })
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espace')
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Analyses')
    const add = nav.getByRole('button', { name: 'Ouvrir les actions d’ajout' })
    await add.click()
    const menu = page.getByRole('dialog', { name: 'Ajouter', exact: true })
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: 'Ajouter un investissement' }).click()
    await expect(page.getByRole('dialog', { name: 'Ajouter une position' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Ajouter une position' })).not.toBeVisible()
    await add.click()
    await page.keyboard.press('Escape')
    await expect(add).toBeFocused()
    expect(await nav.boundingBox()).toEqual(bounds)
    const client = await page.context().newCDPSession(page)
    await client.send('Page.setWebLifecycleState', { state: 'frozen' })
    await client.send('Page.setWebLifecycleState', { state: 'active' })
    await client.detach()
    await expect(nav).toBeInViewport({ ratio: 1 })
    expect(await monitor.evaluate(state => {
      state.stop()
      return state.errors
    })).toEqual([])
    await monitor.dispose()
    await page.setViewportSize({ width, height: height - 70 })
    await expect(nav).toBeInViewport({ ratio: 1 })
    await page.setViewportSize({ width, height })
    await expect.poll(() => nav.boundingBox()).toEqual(bounds)
    expect(await original.evaluate(node => node === document.querySelector('.mobile-nav'))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`transition mobile et préférence ${reducedMotion}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion })
    await page.addInitScript(() => {
      const animate = Element.prototype.animate
      Element.prototype.animate = function (frames, options) {
        const animation = animate.call(this, frames, options)
        if (animation.id === 'iw-mobile-route') animation.pause()
        return animation
      }
    })
    await page.goto('/?demo=1#overview')
    await expect(page.locator('.valuation-panel')).toBeVisible()
    await page.locator('.mobile-nav').getByRole('button', { name: 'Portefeuille', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portefeuille')
    const motions = await page.evaluate(() => document.getAnimations().filter(animation => animation.id === 'iw-mobile-route').map(animation => {
      const effect = animation.effect as KeyframeEffect
      return { target: effect.target?.tagName, duration: effect.getTiming().duration }
    }))
    expect(motions).toEqual(reducedMotion === 'reduce' ? [] : [{ target: 'MAIN', duration: 170 }])
  })
}
