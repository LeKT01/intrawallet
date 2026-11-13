import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

test('le cache PWA ne répond qu’à l’interface de son sous-répertoire', async () => {
  const handlers = new Map()
  const scope = 'https://example.test/intrawallet/'
  const source = await readFile(new URL('../scripts/service-worker.js', import.meta.url), 'utf8')
  runInNewContext(source.replace('__CACHE_VERSION__', '"test"').replace('__SHELL_FILES__', '["index.html","assets/main.js"]'), {
    URL, Request, self: { registration: { scope }, addEventListener: (name, fn) => handlers.set(name, fn) },
    caches: { open: async () => ({ match: async key => key }) },
  })
  async function response(url, mode = 'cors', method = 'GET') {
    let result
    handlers.get('fetch')({ request: { url, mode, method }, respondWith: value => { result = value } })
    return await result
  }
  assert.equal(await response(scope + '?demo=1', 'navigate'), scope + 'index.html')
  assert.equal((await response(scope + 'assets/main.js')).url, scope + 'assets/main.js')
  assert.equal(await response(scope + 'market/six/etf-closings'), undefined)
  assert.equal(await response('https://eodhd.com/api/eod/VUSA?api_token=example'), undefined)
  assert.equal(await response(scope, 'navigate', 'POST'), undefined)
})
