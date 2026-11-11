export const nqseIsin = 'IE00BYVQ9F29'
export const nqseRoute = '/market/xetra/nqse'

export function parseNqseQuote(value: unknown) {
  const quote = value as {
    isin?: unknown; mic?: unknown; currency?: { originalValue?: unknown }; lastPrice?: unknown; timestampLastPrice?: unknown
  } | null
  const at = typeof quote?.timestampLastPrice === 'string' ? Date.parse(quote.timestampLastPrice) : NaN
  if (quote?.isin !== nqseIsin || quote.mic !== 'XETR' || quote.currency?.originalValue !== 'EUR'
    || typeof quote.lastPrice !== 'number' || !Number.isFinite(quote.lastPrice) || quote.lastPrice <= 0
    || !Number.isFinite(at) || at <= 0 || at > Date.now() + 300000) {
    throw new Error('Deutsche Börse n’a pas renvoyé de cours vérifiable pour NQSE sur Xetra en EUR.')
  }
  return { isin: nqseIsin, mic: 'XETR', currency: { originalValue: 'EUR' },
    lastPrice: quote.lastPrice, timestampLastPrice: new Date(at).toISOString() }
}
