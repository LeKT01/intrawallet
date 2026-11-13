import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

test('la PWA précharge son interface et recharge les données locales hors ligne', async ({ page, context }) => {
  const seen: string[] = []
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname
    seen.push(path)
    if (!path.startsWith('/intrawallet/')) { response.writeHead(404).end(); return }
    const file = path.slice('/intrawallet/'.length) || 'index.html'
    const mime = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css'
      : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html'
    try {
      response.setHeader('Content-Type', mime)
      response.end(await readFile(new URL('../../dist/' + file, import.meta.url)))
    } catch { response.writeHead(404).end() }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Serveur indisponible')
    await page.goto('http://127.0.0.1:' + address.port + '/intrawallet/?demo=1')
    await expect(page.getByText('Mode démo', { exact: true })).toBeVisible()
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    await context.setOffline(true)
    await expect(page.getByText('Hors ligne · données locales et derniers cours enregistrés.')).toBeVisible()
    await page.goto(page.url() + '&offline-check=1')
    await expect(page.getByText('Hors ligne · données locales et derniers cours enregistrés.')).toBeVisible()
    await expect(page.getByText('Mode démo', { exact: true })).toBeVisible()
    await page.evaluate(() => { location.hash = '#positions' })
    await expect(page.getByRole('heading', { name: 'Positions consolidées' })).toBeVisible()
    expect(seen.some(path => path.startsWith('/market/'))).toBe(false)
  } finally {
    await context.setOffline(false)
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
      server.closeAllConnections()
    })
  }
})
