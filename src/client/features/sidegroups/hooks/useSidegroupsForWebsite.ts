import { useCallback, useEffect, useState } from 'react'
import { listSidegroups } from '../api/sidegroupsApi.ts'
import type { Sidegroup } from '../model/types.ts'

/**
 * Fetches sidegrupper for the given website. Used by filter UIs that let the
 * user pick a sidegruppe instead of typing URL paths manually.
 */
export const useSidegroupsForWebsite = (websiteId?: string) => {
  const [sidegroups, setSidegroups] = useState<Sidegroup[]>([])
  const [loading, setLoading] = useState(false)

  const loadSidegroups = useCallback(async (id: string, isCancelled: () => boolean) => {
    setLoading(true)
    try {
      const all = await listSidegroups()
      if (!isCancelled()) setSidegroups(all.filter((sidegroup) => sidegroup.websiteId === id))
    } catch {
      if (!isCancelled()) setSidegroups([])
    } finally {
      if (!isCancelled()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!websiteId) return
    let cancelled = false
    void loadSidegroups(websiteId, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [websiteId, loadSidegroups])

  return { sidegroups: websiteId ? sidegroups : [], loading }
}
