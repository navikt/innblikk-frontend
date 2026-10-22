import { useCallback, useEffect, useState } from 'react'
import {
  fetchManagementContext,
  fetchManagedWebsites,
  type WebsiteManagementContext,
  type WebsiteRegistration,
} from '../../../shared/api/websiteManagementApi.ts'

export function useWebsiteManagementContext() {
  const [context, setContext] = useState<WebsiteManagementContext | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let isMounted = true
    fetchManagementContext()
      .then((value) => {
        if (isMounted) {
          setContext(value)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Kunne ikke laste teaminformasjon'))
          setIsLoading(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [])

  return { context, isLoading, error }
}

export function useManagedWebsites(options: { scope?: 'mine' | 'all'; includeDeleted?: boolean } = {}) {
  const { scope = 'mine', includeDeleted = false } = options
  const [websites, setWebsites] = useState<WebsiteRegistration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [reloadCounter, setReloadCounter] = useState(0)

  useEffect(() => {
    let isMounted = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading state must reset on every scope/filter/reload change so stale registrations are never shown
    setIsLoading(true)
    fetchManagedWebsites({ scope, includeDeleted })
      .then((value) => {
        if (isMounted) {
          setWebsites(value)
          setError(null)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Kunne ikke laste nettsider'))
          setIsLoading(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [scope, includeDeleted, reloadCounter])

  const reload = useCallback(() => setReloadCounter((count) => count + 1), [])

  return { websites, isLoading, error, reload }
}
