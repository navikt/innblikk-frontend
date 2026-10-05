import { useCallback, useEffect, useState } from 'react'
import { listSidegroups } from '../api/sidegroupsApi.ts'
import type { Sidegroup } from '../model/types.ts'

/**
 * Fetches sidegrupper for the given website. Used by filter UIs that let the
 * user pick a sidegruppe instead of typing URL paths manually.
 */
export const useSidegroupsForWebsite = (websiteId?: string) => {
  const [loadedSidegroups, setLoadedSidegroups] = useState<{
    websiteId: string
    sidegroups: Sidegroup[]
    error: boolean
  } | null>(null)
  const [loadingWebsiteId, setLoadingWebsiteId] = useState<string | null>(null)

  const loadSidegroups = useCallback(async (id: string, isCancelled: () => boolean) => {
    setLoadingWebsiteId(id)
    try {
      const all = await listSidegroups()
      if (!isCancelled()) {
        setLoadedSidegroups({
          websiteId: id,
          sidegroups: all.filter((sidegroup) => sidegroup.websiteId === id),
          error: false,
        })
      }
    } catch {
      if (!isCancelled()) {
        setLoadedSidegroups((current) =>
          current?.websiteId === id ? { ...current, error: true } : { websiteId: id, sidegroups: [], error: true },
        )
      }
    } finally {
      if (!isCancelled()) setLoadingWebsiteId((current) => (current === id ? null : current))
    }
  }, [])

  useEffect(() => {
    if (!websiteId) return
    let cancelled = false
    const refresh = () => void loadSidegroups(websiteId, () => cancelled)
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
    }
  }, [websiteId, loadSidegroups])

  const hasLoadedCurrentWebsite = Boolean(websiteId && loadedSidegroups?.websiteId === websiteId)
  return {
    sidegroups: hasLoadedCurrentWebsite ? (loadedSidegroups?.sidegroups ?? []) : [],
    loading: Boolean(websiteId && (!hasLoadedCurrentWebsite || loadingWebsiteId === websiteId)),
    error: hasLoadedCurrentWebsite && (loadedSidegroups?.error ?? false),
  }
}
