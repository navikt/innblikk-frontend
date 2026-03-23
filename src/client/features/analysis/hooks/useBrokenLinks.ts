import { useState, useEffect, useCallback } from 'react'
import type { Website } from '../../../shared/types/chart.ts'
import type { BrokenLink, PageWithBrokenLinks, BrokenLinkPage, PageBrokenLink, CrawlData } from '../model/types.ts'
import {
  fetchSiteimproveData,
  fetchPageBrokenLinks as fetchPageBrokenLinksApi,
  fetchBrokenLinkPages as fetchBrokenLinkPagesApi,
} from '../api/siteimprove.ts'
import { getSiteimproveId } from '../utils/siteimprove.ts'

const SITEIMPROVE_BASE_URL = '/api/siteimprove'

export const useBrokenLinks = (selectedWebsite: Website | null) => {
  const [brokenLinks, setBrokenLinks] = useState<BrokenLink[]>([])
  const [pagesWithBrokenLinks, setPagesWithBrokenLinks] = useState<PageWithBrokenLinks[]>([])
  const [siteimproveId, setSiteimproveId] = useState<string | null>(null)
  const [crawlInfo, setCrawlInfo] = useState<CrawlData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedWebsite) {
      setError(null)
      setSiteimproveId(null)
      return
    }

    // Clear stale warnings immediately when switching website.
    setError(null)

    const resolvedSiteimproveId = getSiteimproveId(selectedWebsite.domain, selectedWebsite.id)
    if (!resolvedSiteimproveId) {
      setError('Denne nettsiden er ikke koblet til Siteimprove eller mangler konfigurasjon.')
      setLoading(false)
      setBrokenLinks([])
      setPagesWithBrokenLinks([])
      setSiteimproveId(null)
      return
    }

    const idStr = String(resolvedSiteimproveId)
    setSiteimproveId(idStr)

    const load = async () => {
      setLoading(true)
      setError(null)
      setBrokenLinks([])
      setPagesWithBrokenLinks([])
      setCrawlInfo(null)

      try {
        const data = await fetchSiteimproveData(SITEIMPROVE_BASE_URL, idStr)
        setBrokenLinks(data.brokenLinks)
        setPagesWithBrokenLinks(data.pagesWithBrokenLinks)
        setCrawlInfo(data.crawlInfo)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Det oppstod en feil ved henting av ødelagte lenker.'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [selectedWebsite])

  return {
    brokenLinks,
    pagesWithBrokenLinks,
    siteimproveId,
    crawlInfo,
    loading,
    error,
    siteimproveBaseUrl: SITEIMPROVE_BASE_URL,
  }
}

export const usePageBrokenLinks = (pageId: number, siteimproveId: string, siteimproveBaseUrl: string) => {
  const [pageBrokenLinks, setPageBrokenLinks] = useState<PageBrokenLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const links = await fetchPageBrokenLinksApi(siteimproveBaseUrl, siteimproveId, pageId)
      setPageBrokenLinks(links)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Feil ved henting av ødelagte lenker.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [pageId, siteimproveBaseUrl, siteimproveId])

  useEffect(() => {
    void fetch()
  }, [fetch])

  return { pageBrokenLinks, loading, error, retry: fetch }
}

export const useBrokenLinkPages = (linkId: number, siteimproveId: string, siteimproveBaseUrl: string) => {
  const [pages, setPages] = useState<BrokenLinkPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await fetchBrokenLinkPagesApi(siteimproveBaseUrl, siteimproveId, linkId)
      setPages(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Feil ved henting av sider.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [linkId, siteimproveBaseUrl, siteimproveId])

  useEffect(() => {
    void fetch()
  }, [fetch])

  return { pages, loading, error, retry: fetch }
}
