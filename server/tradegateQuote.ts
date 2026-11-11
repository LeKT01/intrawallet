import type { Connect, Plugin } from 'vite'
import { fetchWithWindows } from './xetraQuote.ts'
import { tradegateRoute } from '../src/tradegateQuote.ts'

const host = 'https://www.tradegatebsx.com'
const isin = 'IE00B3XXRP09'
const feed = host + '/refresh.php?isin=' + isin
const trades = host + '/orderbuch_umsaetze.php?isin=' + isin
const exchangeTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', timeZoneName: 'shortOffset' })

function parsePrice(value: unknown) {
  if (typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim())) {
    value = Number(value.trim().replace(',', '.'))
  }
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function parseLatestTrade(html: string) {
  const body = /<tbody\b[^>]*\bid=["']umsaetze_body["'][^>]*>([\s\S]*?)<\/tbody>/i.exec(html)?.[1] ?? ''
  for (const [row] of body.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const cells = Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
      ([, value]) => value.replace(/<[^>]*>/g, '').trim())
    if (cells.length !== 5) continue
    const date = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(cells[0])
    const time = /^(\d{2}:\d{2}:\d{2})(?:,(\d{3}))?$/.exec(cells[1])
    const price = parsePrice(cells[4])
    if (!date || !time || price === null) continue

    const local = date[3] + '-' + date[2] + '-' + date[1] + 'T' + time[1] + '.' + (time[2] ?? '000')
    const utc = Date.parse(local + 'Z')
    if (!Number.isFinite(utc) || new Date(utc).toISOString() !== local + 'Z') continue
    const zone = exchangeTime.formatToParts(utc).find(part => part.type === 'timeZoneName')?.value
    const offset = /^GMT\+(\d{1,2})$/.exec(zone ?? '')
    if (!offset) continue
    const sourceAt = utc - Number(offset[1]) * 3600000
    if (sourceAt <= Date.now()) return { price, sourceAt }
  }
  throw new Error('Aucune transaction VUSA exploitable sur Tradegate.')
}

async function fetchBody(url: string, accept: string) {
  try {
    const response = await fetch(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(7500) })
    if (!response.ok) throw new Error('Tradegate HTTP ' + response.status)
    return await response.text()
  } catch (error) {
    if (process.platform !== 'win32') throw error
    return fetchWithWindows(url, false, { accept, maxBuffer: 2 * 1024 * 1024 })
  }
}

async function fetchPrice(): Promise<{ price: number; sourceAt?: number }> {
  try {
    const data = JSON.parse(await fetchBody(feed, 'application/json'))
    const price = parsePrice(data?.last)
    if (price !== null) return { price }
  } catch {
    // The official trade history also works when the quote feed is unavailable.
  }
  return parseLatestTrade(await fetchBody(trades, 'text/html'))
}

export function tradegateQuote(): Plugin {
  let pending: ReturnType<typeof fetchPrice> | undefined
  const install = ({ middlewares }: { middlewares: Connect.Server }) => {
    middlewares.use(async (request, response, next) => {
      if (request.method !== 'GET' || request.url !== tradegateRoute) return next()
      try {
        pending ??= fetchPrice().finally(() => { pending = undefined })
        const quote = await pending
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          .end(JSON.stringify({ ...quote, receivedAt: Date.now() }))
      } catch (error) {
        console.warn('[Tradegate] Cours VUSA indisponible.', error)
        response.writeHead(502, { 'Cache-Control': 'no-store' }).end()
      }
    })
  }
  return { name: 'tradegate-vusa-quote', configureServer: install, configurePreviewServer: install }
}
