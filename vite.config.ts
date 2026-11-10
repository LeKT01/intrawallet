import { defineConfig, type Connect, type Plugin } from 'vite'

const sixQuery = '?select=ISIN,ValorSymbol,TradingBaseCurrency,ClosingPrice,LatestTradeDate,MarketDate,Exchange&where=ProductLine=ET&pagesize=10000'
const sixEndpoints = ['/fqs/closing.json', '/itf/fqs/delayed/closing.json']
  .map(path => 'https://www.six-group.com' + path + sixQuery)

async function fetchSixClosings() {
  let failure: unknown
  for (const url of sixEndpoints) {
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } })
      if (upstream.status === 429) return { status: 429 }
      if (!upstream.ok) throw new Error('SIX HTTP ' + upstream.status)
      const body = await upstream.text()
      const data = JSON.parse(body)
      if (!Array.isArray(data?.colNames) || !Array.isArray(data.rowData) || !data.rowData.length) {
        throw new Error('Le relevé de clôture SIX est vide ou invalide.')
      }
      return { status: 200, body }
    } catch (error) {
      failure = error
    }
  }
  console.warn('[SIX] Impossible de télécharger le relevé de clôture.', failure)
  return { status: 502 }
}

function sixClosings(): Plugin {
  let cached: { body: string; at: number } | undefined
  let pending: ReturnType<typeof fetchSixClosings> | undefined
  const install = ({ middlewares }: { middlewares: Connect.Server }) => {
    middlewares.use(async (request, response, next) => {
      if (request.method !== 'GET' || request.url !== '/market/six/etf-closings') return next()
      let body = cached?.body
      if (!cached || Date.now() - cached.at >= 30 * 60000) {
        pending ??= fetchSixClosings().then(result => {
          if (result.body) cached = { body: result.body, at: Date.now() }
          return result
        }).finally(() => { pending = undefined })
        const result = await pending
        body = result.body
        if (!body) {
          response.writeHead(result.status, { 'Cache-Control': 'no-store' }).end()
          return
        }
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body)
    })
  }
  return { name: 'six-etf-closings', configureServer: install, configurePreviewServer: install }
}

const proxy = {
  '^/market/eodhd/(?:search|eod)/': {
    target: 'https://eodhd.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace('/market/eodhd/', '/api/'),
    proxyTimeout: 8500,
  },
}

export default defineConfig({
  base: './',
  plugins: [sixClosings()],
  server: { allowedHosts: ['terminal.local'], proxy },
  preview: { proxy },
})
