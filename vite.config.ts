import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { tradegateQuote } from './server/tradegateQuote.ts'
import { sixClosings } from './server/sixClosings.ts'
import { xetraQuote } from './server/xetraQuote.ts'

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
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  plugins: [sixClosings(), xetraQuote(), tradegateQuote()],
  server: { allowedHosts: ['terminal.local'], proxy },
  preview: { proxy },
})
