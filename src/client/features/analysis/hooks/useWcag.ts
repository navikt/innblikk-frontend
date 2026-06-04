import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Website } from '../../../shared/types/chart.ts'
import type { WcagIssue } from '../model/types.ts'
import { getSiteimproveId } from '../utils/siteimprove.ts'
import { fetchPageId } from '../api/spellings.ts'
import { fetchPageWcagIssues } from '../api/wcag.ts'

const SITEIMPROVE_BASE_URL = '/api/siteimprove'

export const useWcag = () => {
  const [searchParams] = useSearchParams()

  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [siteimproveId, setSiteimproveId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('confirmed')

  const [pageId, setPageId] = useState<number | null>(null)
  const [confirmedIssues, setConfirmedIssues] = useState<WcagIssue[]>([])
  const [potentialIssues, setPotentialIssues] = useState<WcagIssue[]>([])
  const [passedIssues, setPassedIssues] = useState<WcagIssue[]>([])
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlPath, setUrlPath] = useState<string>(() => searchParams.get('urlPath') || '')

  useEffect(() => {
    if (!selectedWebsite) {
      setError(null)
      setSiteimproveId(null)
      return
    }

    setError(null)

    const sid = getSiteimproveId(selectedWebsite.domain, selectedWebsite.id)
    if (!sid) {
      setError('Denne nettsiden er ikke koblet til Siteimprove eller mangler konfigurasjon.')
      setSiteimproveId(null)
      return
    }

    setSiteimproveId(String(sid))
  }, [selectedWebsite])

  const fetchWcagData = useCallback(async () => {
    if (!siteimproveId) return

    setLoading(true)
    setError(null)
    setPageId(null)
    setConfirmedIssues([])
    setPotentialIssues([])
    setPassedIssues([])
    setHasAttemptedFetch(true)

    try {
      if (!urlPath) {
        setError('Legg til URL-sti for å se universell utforming-funn for en side.')
        setLoading(false)
        return
      }

      const foundPageId = await fetchPageId(SITEIMPROVE_BASE_URL, siteimproveId, urlPath)
      if (!foundPageId) {
        setError(`Fant ingen side hos Siteimprove med URL som inneholder "${urlPath}". Sjekk at URL-en er korrekt.`)
        setLoading(false)
        return
      }

      setPageId(foundPageId)

      const result = await fetchPageWcagIssues(SITEIMPROVE_BASE_URL, siteimproveId, foundPageId)
      setConfirmedIssues(result.confirmedIssues)
      setPotentialIssues(result.potentialIssues)
      setPassedIssues(result.passedIssues)

      const newParams = new URLSearchParams(window.location.search)
      newParams.set('urlPath', urlPath)
      window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
    } catch (err) {
      console.error('Error fetching WCAG data:', err)
      const message = err instanceof Error ? err.message : 'Det oppstod en feil ved henting av data.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [siteimproveId, urlPath])

  useEffect(() => {
    const hasConfigParams = searchParams.has('urlPath')
    if (siteimproveId && hasConfigParams && !hasAttemptedFetch) {
      void fetchWcagData()
    }
  }, [siteimproveId, hasAttemptedFetch, searchParams, fetchWcagData])

  return {
    selectedWebsite,
    setSelectedWebsite,
    siteimproveId,
    activeTab,
    setActiveTab,
    pageId,
    confirmedIssues,
    potentialIssues,
    passedIssues,
    hasAttemptedFetch,
    loading,
    error,
    urlPath,
    setUrlPath,
    fetchWcagData,
  }
}
