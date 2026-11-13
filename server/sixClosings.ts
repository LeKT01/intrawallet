import childProcess from 'node:child_process'
import os from 'node:os'
import { win32 } from 'node:path'
import type { Connect, Plugin } from 'vite'

const sixQuery = '?select=ISIN,ValorSymbol,TradingBaseCurrency,ClosingPrice,LatestTradeDate,MarketDate,Exchange&where=ProductLine=ET&pagesize=10000'
const sixEndpoints = ['/fqs/closing.json', '/itf/fqs/delayed/closing.json']
  .map(path => 'https://www.six-group.com' + path + sixQuery)

function validateSixResponse(status: number, body: string) {
  if (status === 407 || status === 429) return { status }
  if (status !== 200) throw new Error('SIX HTTP ' + status)
  const data = JSON.parse(body)
  if (!Array.isArray(data?.colNames) || !Array.isArray(data.rowData) || !data.rowData.length) {
    throw new Error('Le relevé de clôture SIX est vide ou invalide.')
  }
  return { status, body }
}

async function fetchSixWithWindows(url: string) {
  const powershell = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    "$target = [uri]'" + url + "'",
    '$proxy = [System.Net.WebRequest]::DefaultWebProxy',
    '$proxyOptions = @{}',
    'if ($proxy -and !$proxy.IsBypassed($target)) {',
    '  $proxyOptions.Proxy = $proxy.GetProxy($target)',
    '  $proxyOptions.ProxyUseDefaultCredentials = $true',
    '}',
    'try {',
    "  $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 4 -Headers @{ Accept = 'application/json' } -Uri $target @proxyOptions",
    '  [Console]::WriteLine([int]$response.StatusCode)',
    '  [Console]::Out.Flush()',
    '  $bytes = $response.RawContentStream.ToArray()',
    '  [Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)',
    '} catch {',
    '  if (!$_.Exception.Response) { throw }',
    '  [Console]::WriteLine([int]$_.Exception.Response.StatusCode)',
    '}',
  ].join('\n')
  const stdout = await new Promise<string>((resolve, reject) => {
    childProcess.execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 12000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      (error, output) => error ? reject(error) : resolve(output))
  })
  const line = stdout.indexOf('\n')
  if (line < 0) throw new Error('La réponse de Windows PowerShell est incomplète.')
  return validateSixResponse(Number(stdout.slice(0, line)), stdout.slice(line + 1))
}

async function fetchSixClosings() {
  const onWindows = os.platform() === 'win32'
  let failure: unknown
  for (const url of sixEndpoints) {
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } })
      if (upstream.status !== 407 || !onWindows) {
        return validateSixResponse(upstream.status, upstream.ok ? await upstream.text() : '')
      }
      failure = new Error('Le proxy réseau exige une authentification (HTTP 407).')
    } catch (error) {
      failure = error
      const transportError = error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')
      if (!onWindows || !transportError) continue
    }
    try {
      return await fetchSixWithWindows(sixEndpoints[1])
    } catch (windowsError) {
      console.warn('[SIX] La connexion via Windows a aussi échoué.', windowsError)
      break
    }
  }
  console.warn('[SIX] Impossible de télécharger le relevé de clôture.', failure)
  return { status: 502 }
}

export function sixClosings(): Plugin {
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
          response.setHeader('Cache-Control', 'no-store')
          if (result.status === 407) {
            console.warn('[SIX] Le proxy réseau exige une authentification (HTTP 407).')
            response.setHeader('X-SIX-Error', 'proxy-auth')
            response.writeHead(502).end()
            return
          }
          response.writeHead(result.status).end()
          return
        }
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body)
    })
  }
  return { name: 'six-etf-closings', configureServer: install, configurePreviewServer: install }
}
