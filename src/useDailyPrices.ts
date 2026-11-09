import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { catalogEntry } from './catalog'
import { dayKey } from './currency'
import { loadDailyPrices, saveDailyPrices } from './database'
import { quoteTarget } from './ledger'
import type { Position } from './portfolio'
import { fetchDailyPrices } from './quotes'

type Asset = Pick<Position, 'category' | 'reference' | 'name' | 'listing'>

export default function useDailyPrices(assets: Asset[]) {
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
        const key = quoteTarget(asset)
        const series = cached.get(key)
        return catalogEntry(asset.category, asset.reference)?.coinId
          && (!series || dayKey(series.fetchedAt) !== today)
          && now - (attempts.current.get(key) ?? 0) >= 300000
      }).slice(0, 2)
      if (!missing.length) return
      pending.current = true
      try {
        for (const asset of missing) {
          const target = quoteTarget(asset)
          attempts.current.set(target, Date.now())
          try {
            const marks = await fetchDailyPrices(asset)
            if (marks.length) await saveDailyPrices({ target, fetchedAt: Date.now(), marks })
          } catch { /* A later check can retry without discarding prices already stored. */ }
        }
      } finally {
        pending.current = false
      }
    }
    void update()
    const timer = window.setInterval(() => void update(), 60000)
    return () => window.clearInterval(timer)
  }, [tracked, ready])

  return series ?? []
}
