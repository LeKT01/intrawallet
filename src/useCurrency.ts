import { useEffect, useState } from 'react'
import { currencyDisplay, dayKey, daysBefore, initialCurrency, persistCurrency, type Currency, type FxRate } from './currency'
import { fetchFxRates, historyDays } from './quotes'
import { demoFxRates, demoMode } from './demo'

type Cache = { from: string; checkedAt: number; rates: FxRate[] }
const cacheKey = 'portefeuille.reference-fx'

function readCache(): Cache | null {
  try {
    const cache = JSON.parse(localStorage.getItem(cacheKey) ?? 'null')
    if (!cache || typeof cache.from !== 'string' || !Number.isFinite(cache.checkedAt) || !Array.isArray(cache.rates)) return null
    const rates = cache.rates.filter((rate: FxRate) => /^\d{4}-\d{2}-\d{2}$/.test(rate?.date)
      && (rate?.quote === 'EUR' || rate?.quote === 'USD') && /^\d+(?:\.\d+)?$/.test(rate?.rate) && Number(rate.rate) > 0)
    return { from: cache.from, checkedAt: cache.checkedAt, rates }
  } catch { return null }
}

export default function useCurrency(start: number) {
  const [currency, setCurrency] = useState<Currency>(() => demoMode ? 'CHF' : initialCurrency())
  const [cache, setCache] = useState(() => demoMode ? null : readCache())
  const [loading, setLoading] = useState(false)
  const today = dayKey(Date.now())
  const marketStart = daysBefore(today, historyDays + 7)
  const journalStart = Number.isFinite(start) ? daysBefore(dayKey(start), 7) : marketStart
  const from = journalStart < marketStart ? journalStart : marketStart

  useEffect(() => {
    if (demoMode || currency === 'CHF' || (cache && cache.from <= from && Date.now() - cache.checkedAt < 3600000)) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void fetchFxRates(from).then(rates => {
      if (!active || !rates.length) return
      const result = { from, checkedAt: Date.now(), rates }
      try { localStorage.setItem(cacheKey, JSON.stringify(result)) } catch { /* Keep in memory. */ }
      setCache(result)
    }).catch(() => { /* Keep rates that are already available. */ }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [currency, from, today, cache?.from, cache?.checkedAt])

  return {
    display: currencyDisplay(currency, demoMode ? demoFxRates(today) : cache?.rates ?? []),
    loading: currency !== 'CHF' && loading,
    choose: (value: Currency) => { if (!demoMode) persistCurrency(value); setLoading(false); setCurrency(value) },
  }
}
