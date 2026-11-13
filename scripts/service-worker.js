const version = __CACHE_VERSION__
const files = __SHELL_FILES__
const scope = new URL(self.registration.scope)
const prefix = 'intrawallet-shell:' + scope.pathname + ':'
const cacheName = prefix + version
const shell = new URL('index.html', scope).href
const assets = new Set(files.map(file => new URL(file, scope).href))

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' })))))
})

// A new worker waits until all tabs using the previous build are closed.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const appEntry = request.mode === 'navigate' && url.origin === scope.origin
    && (url.pathname === scope.pathname || url.pathname === new URL(shell).pathname)
  if (!appEntry && !assets.has(url.href)) return
  event.respondWith(caches.open(cacheName).then(async cache =>
    await cache.match(appEntry ? shell : request) ?? fetch(request)))
})
