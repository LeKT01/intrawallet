import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { coinGeckoId } from './catalog'
import { dayKey } from './currency'
import { loadDailyPrices, saveDailyPrices } from './database'
import { quoteTarget } from './ledger'
import type { Position } from './portfolio'
import { fetchDailyPrices } from './quotes'

const noDailyPrices: Awaited<ReturnType<typeof loadDailyPrices>> = []

type Asset = Pick<Position, 'category' | 'reference' | 'name' | 'listing'>

export default function useDailyPrices(assets: Asset[], key: string) {
  const series = useLiveQuery(loadDailyPrices)
  const latest = useRef({ assets, series })
  latest.current = { assets, series }
  const pending = useRef(false)
  const attempts = useRef(new Map<string, number>())
  const tracked = assets.map(quoteTarget).sort().join('|')
  const ready = series !== undefined

  useEffect(() => {
    if (!ready) return
    async function update() {
      if (document.visibilityState !== 'visible' || pending.current) return
      const now = Date.now()
      const today = dayKey(now)
      const cached = new Map(latest.current.series?.map(item => [item.target, item]))
      const missing = latest.current.assets.filter(asset => {
        const target = quoteTarget(asset)
        const series = cached.get(target)
        return coinGeckoId(asset)
          && (!series || dayKey(series.fetchedAt) !== today)
          && now - (attempts.current.get(key + '/' + target) ?? 0) >= 300000
      }).slice(0, 2)
      if (!missing.length) return
      pending.current = true
      try {
        for (const asset of missing) {
          const target = quoteTarget(asset)
          attempts.current.set(key + '/' + target, Date.now())
          try {
            const marks = await fetchDailyPrices(asset, key)
            if (marks.length) await saveDailyPrices({ target, fetchedAt: Date.now(), marks })
          } catch { /* A later check can retry without discarding prices already stored. */ }
        }
      } finally {
        pending.current = false
      }
    }
    void update()
    const timer = window.setInterval(() => void update(), 60000)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [tracked, ready, key])

  return series ?? noDailyPrices
}
