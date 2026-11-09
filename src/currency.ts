import { Decimal } from 'decimal.js'
import { money, unitPrice } from './portfolio.ts'

export type Currency = 'CHF' | 'EUR' | 'USD'
export const currencies: Currency[] = ['CHF', 'EUR', 'USD']
export type FxRate = { date: string; quote: 'EUR' | 'USD'; rate: string }
const swissDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
})
const dayMs = 86400000
const storageKey = 'portefeuille.display-currency'

export const dayKey = (at: number) => swissDay.format(at)
export const daysBefore = (day: string, days: number) =>
  new Date(Date.parse(day + 'T00:00:00Z') - days * dayMs).toISOString().slice(0, 10)

export function initialCurrency(): Currency {
  try {
    const value = localStorage.getItem(storageKey) as Currency
    return currencies.includes(value) ? value : 'CHF'
  } catch { return 'CHF' }
}

export function persistCurrency(currency: Currency) {
  try { localStorage.setItem(storageKey, currency) } catch { /* Browser storage may be unavailable. */ }
}

export function currencyDisplay(currency: Currency, rates: FxRate[]) {
  const byDate = new Map(rates.filter(rate => rate.quote === currency).map(rate => [rate.date, rate]))
  const today = dayKey(Date.now())
  function reference(day = today) {
    if (currency === 'CHF') return { date: day, rate: '1' }
    for (let i = 0; i <= 7; i++) {
      const rate = byDate.get(daysBefore(day, i))
      if (rate) return rate
    }
    return null
  }
  function convert(value: Decimal.Value, day = today) {
    const rate = reference(day)
    return rate ? new Decimal(value).times(rate.rate) : null
  }
  function format(value: Decimal.Value, options: { day?: string; unit?: boolean; signed?: boolean } = {}) {
    const converted = convert(value, options.day)
    if (converted === null) return '—'
    return (options.signed && converted.gt(0) ? '+' : '')
      + (options.unit ? unitPrice(converted, currency) : money(converted, 2, currency))
  }
  return { currency, reference, convert, format }
}

export type CurrencyDisplay = ReturnType<typeof currencyDisplay>
