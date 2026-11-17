import { expect, test } from '@playwright/test'

const viewports = [[320, 568], [360, 800], [375, 812], [390, 844], [414, 896], [440, 956],
  [600, 960], [768, 1024], [820, 1180], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [390, 400]]

for (const [width, height] of viewports) {
  test(`géométrie du menu et du formulaire à ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/#positions')
    const trigger = width <= 900 ? page.getByRole('button', { name: 'Ouvrir les actions d’ajout' }) : page.locator('.header-add')
    await trigger.click()
    const menu = page.getByRole('dialog', { name: 'Ajouter' })
    const anchor = (await trigger.boundingBox())!
    const popup = (await menu.boundingBox())!
    if (width > 900) {
      expect(Math.abs(popup.x + popup.width - anchor.x - anchor.width)).toBeLessThanOrEqual(2)
      expect(popup.y).toBeGreaterThanOrEqual(anchor.y + anchor.height)
    } else {
      expect(popup.y + popup.height).toBeLessThanOrEqual(anchor.y + 12)
    }
    await menu.getByRole('button', { name: 'Créer un portefeuille groupé' }).click()
    const form = page.getByRole('dialog', { name: 'Créer un portefeuille groupé' })
    await expect(form).toBeVisible()
    const errors = await form.evaluate(dialog => {
      const outer = dialog.getBoundingClientRect()
      const errors: string[] = []
      const body = dialog.querySelector('.dialog-body')!
      const footer = dialog.querySelector('footer')!.getBoundingClientRect()
      const header = dialog.querySelector('header')!.getBoundingClientRect()
      if (outer.left < -1 || outer.right > innerWidth + 1) errors.push('fenêtre hors écran')
      if (header.bottom > footer.top || footer.bottom > innerHeight + 1) errors.push(JSON.stringify({ problem: 'pied ou en-tête masqué', header: header.bottom, footer: [footer.top, footer.bottom], viewport: innerHeight, dialog: outer.bottom }))
      if (body.scrollWidth > body.clientWidth + 1) errors.push('défilement horizontal du contenu')
      for (const control of dialog.querySelectorAll('label > input:not([type=checkbox]), label > select, label > textarea')) {
        const field = control.getBoundingClientRect()
        const label = control.parentElement!.getBoundingClientRect()
        const title = document.createRange()
        title.selectNode(control.parentElement!.firstChild!)
        if (field.left < label.left - 1 || field.right > label.right + 1) errors.push('champ hors de sa colonne')
        if (title.getBoundingClientRect().bottom > field.top + 1) errors.push('label superposé')
      }
      return errors
    })
    expect(errors).toEqual([])
    const name = (await form.getByLabel('Nom du groupe').boundingBox())!
    const platform = (await form.getByLabel('Plateforme').boundingBox())!
    if (width <= 440) expect(platform.y).toBeGreaterThan(name.y + name.height)
    if (width >= 1024) expect(platform.x).toBeGreaterThanOrEqual(name.x + name.width)
    const follow = form.getByLabel('Mode de suivi')
    await follow.scrollIntoViewIfNeeded()
    await expect(follow).toBeInViewport()
    await expect(form.getByRole('button', { name: 'Enregistrer le groupe' })).toBeInViewport()
    if ([390, 1440].includes(width) && height >= 800) await form.screenshot({ path: test.info().outputPath('formulaire-groupe.png') })
    await page.keyboard.press('Escape')
    await expect(form).toBeHidden()
    await expect(trigger).toBeFocused()
  })
}

for (const [width, height] of [[390, 844], [1440, 900]]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`captures des pages et actions en mode ${theme} à ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      for (const [route, title] of [['overview', 'Vue d’ensemble'], ['journal', 'Transactions'], ['analytics', 'Analyses'],
        ['space', 'Espace'], ['data', 'Paramètres'], ['platforms', 'Plateformes'], ['diagnostic', 'Diagnostic']]) {
        await page.goto('/?demo=1#' + route)
        await expect(page.locator('main h1')).toHaveText(title)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        await page.screenshot({ path: info.outputPath(route + '.png'), fullPage: true, animations: 'disabled' })
      }
      const trigger = width <= 900 ? page.getByRole('button', { name: 'Ouvrir les actions d’ajout' }) : page.locator('.header-add')
      await trigger.click()
      const menu = page.getByRole('dialog', { name: 'Ajouter' })
      await expect(menu).toBeVisible()
      await page.screenshot({ path: info.outputPath('menu-ajouter.png'), animations: 'disabled' })
      await menu.getByRole('button', { name: 'Ajouter un investissement' }).click()
      await expect(page.getByRole('dialog', { name: 'Ajouter une position' })).toBeVisible()
      await page.screenshot({ path: info.outputPath('formulaire-position.png'), animations: 'disabled' })
    })
  }
}
