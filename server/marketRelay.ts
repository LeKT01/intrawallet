import { createServer } from 'node:http'
import { sixClosings } from './sixClosings.ts'
import { tradegateQuote } from './tradegateQuote.ts'
import { xetraQuote } from './xetraQuote.ts'
import { nqseRoute } from '../src/nqseQuote.ts'
import { tradegateRoute } from '../src/tradegateQuote.ts'
import type { Connect, PreviewServer } from 'vite'

const allowed = new Set((process.env.MARKET_ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean))
const routes = new Set(['/market/six/etf-closings', nqseRoute, tradegateRoute])
const handlers: Connect.NextHandleFunction[] = []
const preview = { middlewares: { use: (handler: Connect.NextHandleFunction) => handlers.push(handler) } } as PreviewServer
for (const plugin of [sixClosings(), tradegateQuote(), xetraQuote()]) {
  if (typeof plugin.configurePreviewServer !== 'function') throw new Error('Relais mal configuré.')
  plugin.configurePreviewServer(preview)
}

createServer((request, response) => {
  const origin = request.headers.origin
  if (origin && !allowed.has(origin)) {
    response.writeHead(403).end()
    return
  }
  if (request.method !== 'GET' || !request.url || !routes.has(request.url)) {
    response.writeHead(404).end()
    return
  }
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Expose-Headers', 'X-SIX-Error')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  let index = 0
  function next(error?: unknown) {
    if (error) { response.writeHead(502).end(); return }
    const handler = handlers[index++]
    if (handler) void Promise.resolve(handler(request, response, next)).catch(next)
    else response.writeHead(404).end()
  }
  next()
}).listen(Number(process.env.PORT ?? 4180), process.env.HOST ?? '127.0.0.1')
