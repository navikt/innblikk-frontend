import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Website } from '../../../shared/types/chart.ts'
import type { SpellingIssue, QualityAssuranceCheck, SpellingCrawlData } from '../model/types.ts'
import { getSiteimproveId } from '../utils/siteimprove.ts'
import { fetchPageId, fetchSpellingOverview, fetchPageSpellings } from '../api/spellings.ts'

const SITEIMPROVE_BASE_URL = '/api/siteimprove'

export const useSpellings = () => {
  const [searchParams] = useSearchParams()

  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [siteimproveId, setSiteimproveId] = useState<string | null>(null)
  const [overviewData, setOverviewData] = useState<QualityAssuranceCheck | null>(null)
  const [activeTab, setActiveTab] = useState<string>('potential')

  const [pageId, setPageId] = useState<number | null>(null)
  const [misspellings, setMisspellings] = useState<SpellingIssue[]>([])
  const [potentialMisspellings, setPotentialMisspellings] = useState<SpellingIssue[]>([])
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false)
  const [crawlInfo, setCrawlInfo] = useState<SpellingCrawlData | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlPath, setUrlPath] = useState<string>(() => searchParams.get('urlPath') || '')

  // Resolve siteimproveId when website changes
  useEffect(() => {
    if (!selectedWebsite) {
      setError(null)
      setSiteimproveId(null)
      return
    }

    // Clear stale warnings immediately when switching website.
    setError(null)

    const sid = getSiteimproveId(selectedWebsite.domain, selectedWebsite.id)
    if (!sid) {
      setError('Denne nettsiden er ikke koblet til Siteimprove eller mangler konfigurasjon.')
      setSiteimproveId(null)
      return
    }
    setSiteimproveId(String(sid))
  }, [selectedWebsite])

  const fetchSpellingData = useCallback(async () => {
    if (!siteimproveId) return

    setLoading(true)
    setError(null)
    setOverviewData(null)
    setPageId(null)
    setMisspellings([])
    setPotentialMisspellings([])
    setHasAttemptedFetch(true)
    setCrawlInfo(null)

    try {
      if (!urlPath) {
        const result = await fetchSpellingOverview(SITEIMPROVE_BASE_URL, siteimproveId)
        setOverviewData(result.overviewData)
        setCrawlInfo(result.crawlInfo)
      } else {
        const foundPageId = await fetchPageId(SITEIMPROVE_BASE_URL, siteimproveId, urlPath)

        if (!foundPageId) {
          setError(`Fant ingen side hos Siteimprove med URL som inneholder "${urlPath}". Sjekk at URL-en er korrekt.`)
          setLoading(false)
          return
        }

        setPageId(foundPageId)

        const result = await fetchPageSpellings(SITEIMPROVE_BASE_URL, siteimproveId, foundPageId)
        setOverviewData(result.overviewData)
        setCrawlInfo(result.crawlInfo)
        setMisspellings(result.misspellings)
        setPotentialMisspellings(result.potentialMisspellings)

        // Update URL for sharing
        const newParams = new URLSearchParams(window.location.search)
        if (urlPath) {
          newParams.set('urlPath', urlPath)
        } else {
          newParams.delete('urlPath')
        }
        window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
      }
    } catch (err) {
      console.error('Error fetching spelling data:', err)
      const message = err instanceof Error ? err.message : 'Det oppstod en feil ved henting av data.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [siteimproveId, urlPath])

  // Auto-submit when URL parameters are present or website is selected
  useEffect(() => {
    const hasConfigParams = searchParams.has('urlPath')
    if (siteimproveId && hasConfigParams && !hasAttemptedFetch) {
      void fetchSpellingData()
    } else if (siteimproveId && !urlPath && !hasAttemptedFetch) {
      void fetchSpellingData()
    }
  }, [siteimproveId, hasAttemptedFetch, searchParams, urlPath, fetchSpellingData])

  return {
    selectedWebsite,
    setSelectedWebsite,
    siteimproveId,
    overviewData,
    activeTab,
    setActiveTab,
    pageId,
    misspellings,
    potentialMisspellings,
    hasAttemptedFetch,
    crawlInfo,
    loading,
    error,
    urlPath,
    setUrlPath,
    fetchSpellingData,
  }
}
