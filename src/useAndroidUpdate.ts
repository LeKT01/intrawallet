import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAndroidUpdate } from './updates'

export default function useAndroidUpdate(enabled: boolean, online: boolean) {
  const [update, setUpdate] = useState<Awaited<ReturnType<typeof fetchAndroidUpdate>>>(null)
  const [status, setStatus] = useState<'idle' | 'checking' | 'checked' | 'error'>('idle')
  const lastAttempt = useRef(-Infinity)
  const pending = useRef<AbortController | null>(null)

  const check = useCallback(async (manual = false) => {
    if (!enabled || !navigator.onLine || pending.current || (!manual && Date.now() - lastAttempt.current < 3600000)) return
    const controller = new AbortController()
    pending.current = controller
    lastAttempt.current = Date.now()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    setStatus('checking')
    try {
      const result = await fetchAndroidUpdate(__APP_VERSION__, controller.signal)
      if (pending.current !== controller) return
      setUpdate(result)
      setStatus('checked')
    } catch {
      if (pending.current === controller) setStatus('error')
    } finally {
      window.clearTimeout(timeout)
      if (pending.current === controller) pending.current = null
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const foreground = () => {
      if (document.visibilityState === 'visible') void check()
    }
    foreground()
    document.addEventListener('visibilitychange', foreground)
    return () => document.removeEventListener('visibilitychange', foreground)
  }, [enabled, online, check])

  useEffect(() => () => {
    const active = pending.current
    pending.current = null
    active?.abort()
  }, [])

  return { update, status, check }
}
