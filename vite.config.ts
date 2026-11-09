import { defineConfig } from 'vite'

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
  server: { allowedHosts: ['terminal.local'], proxy },
  preview: { proxy },
})
