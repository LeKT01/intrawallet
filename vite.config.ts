import { providerRelayPlugin } from './server/providerRelay.ts'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { tradegateQuote } from './server/tradegateQuote.ts'
import { sixClosings } from './server/sixClosings.ts'
import { xetraQuote } from './server/xetraQuote.ts'

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  plugins: [providerRelayPlugin(), sixClosings(), xetraQuote(), tradegateQuote()],
  server: { allowedHosts: ['terminal.local'] },
})
