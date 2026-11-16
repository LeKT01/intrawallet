import { expect, test, type Page, type TestInfo } from '@playwright/test'

// Review artifacts, not golden snapshots. Never rewrite baselines automatically.
test.skip(process.env.INTRAWALLET_CAPTURE !== '1', 'Capture à la demande dans le workflow de revue.')
const fixedTime = new Date('2026-11-11T12:00:00+01:00')

async function capture(page: Page, info: TestInfo, name: string, preview = false) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true, animations: 'disabled' })
  if (preview) {
    const image = await page.screenshot({ type: 'jpeg', quality: 45, animations: 'disabled' })
    console.log('IW_PREVIEW:' + name + ':' + image.toString('base64') + ':END_PREVIEW')
  }
}

for (const [theme, width, height] of [
  ['light', 1440, 900], ['dark', 1440, 900], ['dark', 1920, 1080],
  ['light', 390, 844], ['dark', 390, 844], ['dark', 440, 956], ['dark', 768, 1024],
] as const) {
  test(`dashboard ${theme} ${width} @capture`, async ({ page }, info) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.clock.setFixedTime(fixedTime)
    await page.goto('/?demo=1#overview')
    await expect(page.locator('.valuation-amount')).toContainText('CHF')
    await expect(page.locator('.chart-line').first()).toBeVisible()
    await capture(page, info, `dashboard-${theme}-${width}`, true)
  })
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`parcours ${theme} ${width} @capture`, async ({ page }, info) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.clock.setFixedTime(fixedTime)
      const previews: { name: string; data: string }[] = []
      async function shot(name: string) {
        await capture(page, info, name + '-' + theme + '-' + width)
        previews.push({ name, data: 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 55 })).toString('base64') })
      }
      for (const [route, selector] of [
        ['positions', '.portfolio-panel'], ['journal', '.journal-panel'], ['analytics', '.analysis-grid'],
        ['platforms', '.platform-workspace'], ['space', '.space-grid'], ['data', '.appearance-panel'],
      ]) {
        await page.goto('/?demo=1#' + route)
        await expect(page.locator(selector).first()).toBeVisible()
        await shot(route)
        if (route === 'positions') {
          await page.getByRole('button', { name: 'Cartes', exact: true }).click()
          await expect(page.locator('.asset-card').first()).toBeVisible()
          await shot('cartes')
          await page.locator('.asset-card').first().click()
          await expect(page.locator('.asset-detail-hero')).toBeVisible()
          await shot('actif')
        }
      }
      await page.goto('/?demo=1#overview')
      const trigger = width === 390 ? page.getByRole('button', { name: 'Ouvrir les actions d’ajout' }) : page.locator('.header-add')
      await trigger.click()
      const menu = page.getByRole('dialog', { name: 'Ajouter', exact: true })
      await expect(menu).toBeVisible()
      await shot('menu-ajouter')
      await menu.getByRole('button', { name: 'Ajouter un investissement' }).click()
      await expect(page.getByRole('dialog', { name: 'Ajouter une position' })).toBeVisible()
      await shot('formulaire')
      // A compact contact sheet can be inspected via the CI logs without downloading a ZIP.
      const sheet = await page.context().newPage()
      await sheet.setContent('<canvas></canvas>')
      const data = await sheet.evaluate(async ({ previews, width }) => {
        const cellWidth = width === 390 ? 260 : 560
        const cellHeight = Math.round(cellWidth * (width === 390 ? 844 / 390 : 900 / 1440)) + 30
        const columns = width === 390 ? 5 : 2
        const canvas = document.querySelector('canvas')!
        canvas.width = columns * cellWidth
        canvas.height = Math.ceil(previews.length / columns) * cellHeight
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#e9e2da'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        for (let i = 0; i < previews.length; i++) {
          const picture = new Image()
          picture.src = previews[i].data
          await picture.decode()
          const x = (i % columns) * cellWidth, y = Math.floor(i / columns) * cellHeight
          ctx.fillStyle = '#302420'; ctx.font = '14px sans-serif'
          ctx.fillText(previews[i].name, x + 8, y + 20)
          ctx.drawImage(picture, x, y + 30, cellWidth, cellHeight - 30)
        }
        return canvas.toDataURL('image/jpeg', .65).split(',')[1]
      }, { previews, width })
      console.log('IW_PREVIEW:parcours-' + theme + '-' + width + ':' + data + ':END_PREVIEW')
      await sheet.close()
    })
  }
}
