import type { Connect, Plugin } from 'vite'
import { fetchWithWindows } from './xetraQuote.ts'
import { tradegateRoute } from '../src/tradegateQuote.ts'

// Tradegate's public VUSA order book reads this instrument-specific feed.
const endpoint = 'https://www.tradegatebsx.com/refresh.php?isin=IE00B3XXRP09'

async function fetchPrice() {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(7500) })
    if (!response.ok) throw new Error('Tradegate HTTP ' + response.status)
    return await response.json()
  } catch (error) {
    if (process.platform !== 'win32') throw error
    return JSON.parse(await fetchWithWindows(endpoint, false))
  }
}

export function tradegateQuote(): Plugin {
  const install = ({ middlewares }: { middlewares: Connect.Server }) => {
    middlewares.use(async (request, response, next) => {
      if (request.method !== 'GET' || request.url !== tradegateRoute) return next()
      try {
        const data = await fetchPrice()
        if (typeof data?.last !== 'number' || !Number.isFinite(data.last) || data.last <= 0) {
          throw new Error('Dernier prix Tradegate indisponible.')
        }
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          .end(JSON.stringify({ price: data.last, receivedAt: Date.now() }))
      } catch (error) {
        console.warn('[Tradegate] Cours VUSA indisponible.', error)
        response.writeHead(502, { 'Cache-Control': 'no-store' }).end()
      }
    })
  }
  return { name: 'tradegate-vusa-quote', configureServer: install, configurePreviewServer: install }
}
