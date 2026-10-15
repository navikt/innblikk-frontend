import { useEffect, useRef } from 'react'

export function useAutoRefresh(key: string, enabled: boolean, loading: boolean, refresh: () => unknown) {
  const latestRefresh = useRef(refresh)
  const requestedKey = useRef<string | null>(null)

  useEffect(() => {
    latestRefresh.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled || loading || requestedKey.current === key) return
    const timer = window.setTimeout(() => {
      requestedKey.current = key
      void latestRefresh.current()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [key, enabled, loading])
}
