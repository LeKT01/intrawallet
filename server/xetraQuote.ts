import { execFile } from 'node:child_process'
import { win32 } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { nqseIsin, nqseRoute, parseNqseQuote } from '../src/nqseQuote.ts'

const endpoint = 'https://api.boerse-frankfurt.de/v1/data/price_information?isin=' + nqseIsin + '&mic=XETR'

async function readStream(response: Response) {
  if (!response.ok || !response.body) throw new Error('Deutsche Börse HTTP ' + response.status)
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    let pending = ''
    let received = 0
    while (received < 32768) {
      const { done, value } = await reader.read()
      if (done) break
      pending += value
      received += value.length
      const end = pending.lastIndexOf('\n')
      if (end < 0) continue
      for (const line of pending.slice(0, end + 1).split('\n')) {
        if (line.startsWith('data:')) return line.slice(5).trim()
      }
      pending = pending.slice(end + 1)
    }
    throw new Error('Deutsche Börse n’a pas envoyé de cotation.')
  } finally {
    void reader.cancel().catch(() => {})
  }
}

export function fetchWithWindows(url: string, stream: boolean) {
  const powershell = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$request = [System.Net.HttpWebRequest]::Create('" + url + "')",
    "$request.Accept = '" + (stream ? "text/event-stream" : "application/json") + "'",
    '$request.Timeout = 8000',
    '$request.ReadWriteTimeout = 8000',
    'if ($request.Proxy -and !$request.Proxy.IsBypassed($request.RequestUri)) {',
    '  $request.Proxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials',
    '}',
    '$response = $request.GetResponse()',
    'try {',
    '  $reader = [System.IO.StreamReader]::new($response.GetResponseStream())',
    ...(stream ? ['  while ($null -ne ($line = $reader.ReadLine())) {',
    "    if ($line.StartsWith('data:')) { [Console]::Write($line.Substring(5).Trim()); break }",
    '  }'] : ['  [Console]::Write($reader.ReadToEnd())']),
    '} finally { $response.Dispose() }',
  ].join('\n')
  return new Promise<string>((resolve, reject) => {
    execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000, maxBuffer: 32768, windowsHide: true },
      (error, output) => error ? reject(error) : resolve(output))
  })
}

async function loadQuote() {
  const body = await (async () => {
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'text/event-stream' }, signal: AbortSignal.timeout(7500) })
      return await readStream(response)
    } catch (error) {
      if (process.platform !== 'win32') throw error
      return fetchWithWindows(endpoint, true)
    }
  })()
  return parseNqseQuote(JSON.parse(body))
}

export function xetraQuote(): Plugin {
  let pending: ReturnType<typeof loadQuote> | undefined
  let cached: { quote: Awaited<ReturnType<typeof loadQuote>>; at: number } | undefined
  const install = ({ middlewares }: { middlewares: Connect.Server }) => {
    middlewares.use(async (request, response, next) => {
      if (request.method !== 'GET' || request.url !== nqseRoute) return next()
      try {
        if (!cached || Date.now() - cached.at >= 60_000) {
          pending ??= loadQuote().then(quote => {
            cached = { quote, at: Date.now() }
            return quote
          }).finally(() => { pending = undefined })
          await pending
        }
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          .end(JSON.stringify(cached!.quote))
      } catch (error) {
        console.warn('[Xetra] Cours NQSE indisponible.', error)
        response.writeHead(502, { 'Cache-Control': 'no-store' }).end()
      }
    })
  }
  return { name: 'xetra-nqse-quote', configureServer: install, configurePreviewServer: install }
}
