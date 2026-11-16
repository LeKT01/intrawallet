import type { Connect, Plugin } from 'vite'
import { coinMarketCapIds } from '../src/marketProviders.ts'

const knownIds = new Set(coinMarketCapIds.values())
export const providerRelay: Connect.NextHandleFunction = async (request, response, next) => {
  if (request.method !== 'GET' || !request.url) return next()
  const incoming = new URL(request.url, 'http://localhost')
  let upstream: URL
  if (incoming.pathname === '/market/coinmarketcap/quotes') {
    const ids = incoming.searchParams.get('id')?.split(',')
    if (!ids?.length || ids.length > knownIds.size || ids.some(id => !knownIds.has(Number(id)))) {
      response.writeHead(400).end()
      return
    }
    upstream = new URL('https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/quotes/latest')
    upstream.search = new URLSearchParams({ id: [...new Set(ids.map(Number))].sort((a, b) => a - b).join(','), convert: 'CHF' }).toString()
  } else if (incoming.pathname.startsWith('/market/eodhd/')) {
    const route = /^\/market\/eodhd\/(eod|search)\/([^/]+)$/.exec(incoming.pathname)
    const key = request.headers['x-eodhd-token']
    if (!route || typeof key !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(key)) {
      response.writeHead(400).end()
      return
    }
    const [, endpoint, encoded] = route
    let value: string
    try { value = decodeURIComponent(encoded) } catch { response.writeHead(400).end(); return }
    if (value === '.' || value === '..' || !(endpoint === 'eod' ? /^[A-Z0-9][A-Z0-9._-]{0,63}$/ : /^[\p{L}\p{N} .&()'_-]{1,100}$/u).test(value)) {
      response.writeHead(400).end()
      return
    }
    upstream = new URL('https://eodhd.com/api/' + endpoint + '/' + encodeURIComponent(value))
    upstream.searchParams.set('api_token', key)
    upstream.searchParams.set('fmt', 'json')
    for (const parameter of endpoint === 'eod' ? ['from', 'to', 'period', 'order'] : ['limit']) {
      const argument = incoming.searchParams.get(parameter)
      if (argument && /^[a-z0-9-]{1,10}$/.test(argument)) upstream.searchParams.set(parameter, argument)
    }
  } else return next()

  try {
    const result = await fetch(upstream, { signal: AbortSignal.timeout(8500), redirect: 'error' })
    if (!result.ok) { response.writeHead(result.status).end(); return }
    const data: unknown = await result.json()
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(data))
  } catch {
    response.writeHead(502, { 'Cache-Control': 'no-store' }).end()
  }
}

export function providerRelayPlugin(): Plugin {
  const install = ({ middlewares }: { middlewares: Connect.Server }) => { middlewares.use(providerRelay) }
  return { name: 'market-provider-relay', configureServer: install, configurePreviewServer: install }
}
