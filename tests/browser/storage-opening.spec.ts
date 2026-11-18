import { expect, test } from '@playwright/test'

test('un ancien onglet bloque la migration et sa fermeture permet de reprendre', async ({ page, context }) => {
  const other = await context.newPage()
  await other.route('**/storage-test', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }))
  await other.goto('/storage-test')
  await other.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('portefeuille-local', 10)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('positions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      // An older client which keeps the connection open during an upgrade.
      request.result.onversionchange = () => {}
      Reflect.set(window, 'openConnection', request.result)
      resolve()
    }
  }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Stockage local bloqué' })).toBeVisible()
  await other.close()
  await expect(page.getByRole('heading', { name: 'Stockage local bloqué' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ajouter un investissement' }).first()).toBeEnabled()
})
