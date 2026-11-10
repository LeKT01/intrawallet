import { defineConfig, type Connect, type Plugin } from 'vite'

const sixEndpoint = 'https://www.six-group.com/fqs/closing.json?select=ISIN,ValorSymbol,TradingBaseCurrency,ClosingPrice,LatestTradeDate,MarketDate,Exchange&where=ProductLine=ET&pagesize=10000'

function sixClosings(): Plugin {
  const install = ({ middlewares }: { middlewares: Connect.Server }) => {
    middlewares.use(async (request, response, next) => {
      if (request.method !== 'GET' || request.url !== '/market/six/etf-closings') return next()
      try {
        const upstream = await fetch(sixEndpoint, { signal: AbortSignal.timeout(11000), redirect: 'error' })
        if (!upstream.ok) {
          response.writeHead(upstream.status).end()
          return
        }
        const data = await upstream.text()
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(data)
      } catch {
        response.writeHead(502).end()
      }
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
