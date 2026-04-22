import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Events, type KopierLenkeProperties } from '@navikt/analytics-types'
import {
  useMarketingSupport,
  useCookieSupport,
  useCookieStartDate,
} from '../../../shared/hooks/useSiteimproveSupport.ts'
import type { Website } from '../../../shared/types/chart.ts'
import {
  normalizeUrlToPath,
  getDateRangeFromPeriod,
  getStoredPeriod,
  savePeriodPreference,
  getStoredMetricType,
  saveMetricTypePreference,
  getCookieCountByParams,
  getCookieBadge,
  getVisitorLabelWithBadge,
} from '../../../shared/lib/utils.ts'
import type { MarketingData, QueryStats } from '../model/types'
import { fetchMarketingStats } from '../api/trafficApi'

export const useMarketingAnalysis = () => {
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [searchParams] = useSearchParams()

  // Initialize state from URL params
  const pathsFromUrl = searchParams.getAll('urlPath')
  const initialPaths = pathsFromUrl.length > 0 ? pathsFromUrl.map((p) => normalizeUrlToPath(p)).filter(Boolean) : []
  const [urlPaths, setUrlPaths] = useState<string[]>(initialPaths)
  const [pathOperator, setPathOperator] = useState<string>(() => searchParams.get('pathOperator') || 'equals')
  const [period, setPeriodState] = useState<string>(() => getStoredPeriod(searchParams.get('period')))

  const setPeriod = (newPeriod: string) => {
    setPeriodState(newPeriod)
    savePeriodPreference(newPeriod)
  }

  // Support custom dates from URL
  const fromDateFromUrl = searchParams.get('from')
  const toDateFromUrl = searchParams.get('to')
  const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined
  const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined

  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate)
  const usesCookies = useCookieSupport(selectedWebsite?.domain, selectedWebsite?.id)
  const cookieStartDate = useCookieStartDate(selectedWebsite?.domain, selectedWebsite?.id)

  const hasMarketing = useMarketingSupport(selectedWebsite?.domain, selectedWebsite?.name, selectedWebsite?.id)

  const currentDateRange = useMemo(
    () => getDateRangeFromPeriod(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate],
  )
  const cookieBadge = useMemo(() => {
    if (!currentDateRange) return ''
    return getCookieBadge(usesCookies, cookieStartDate, currentDateRange.startDate, currentDateRange.endDate)
  }, [usesCookies, cookieStartDate, currentDateRange])
  const isPreCookieRange = useMemo(() => {
    if (!currentDateRange || !cookieStartDate) return false
    return currentDateRange.endDate.getTime() < cookieStartDate.getTime()
  }, [currentDateRange, cookieStartDate])

  // Tab states
  const [activeTab, setActiveTab] = useState<string>('referrer')

  // View options
  const [metricType, setMetricTypeState] = useState<string>(() => getStoredMetricType(searchParams.get('metricType')))
  const [submittedMetricType, setSubmittedMetricType] = useState<string>(() =>
    getStoredMetricType(searchParams.get('metricType')),
  )

  const setMetricType = (newMetricType: string) => {
    setMetricTypeState(newMetricType)
    saveMetricTypePreference(newMetricType)
  }

  // Data states
  const [marketingData, setMarketingData] = useState<MarketingData>({})
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false)
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null)

  const buildFilterKey = useCallback(
    () =>
      JSON.stringify({
        websiteId: selectedWebsite?.id ?? null,
        urlPaths,
        pathOperator,
        period,
        customStartDate: customStartDate?.toISOString() ?? null,
        customEndDate: customEndDate?.toISOString() ?? null,
        metricType,
      }),
    [selectedWebsite?.id, urlPaths, pathOperator, period, customStartDate, customEndDate, metricType],
  )
  const hasUnappliedFilterChanges = buildFilterKey() !== lastAppliedFilterKey

  const fetchData = useCallback(async () => {
    if (!selectedWebsite) return
    const appliedFilterKey = buildFilterKey()

    setLoading(true)
    setError(null)
    setMarketingData({})
    setHasAttemptedFetch(true)
    setSubmittedMetricType(metricType)

    const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
    if (!dateRange) {
      setError('Vennligst velg en gyldig periode.')
      setLoading(false)
      return
    }
    const { startDate, endDate } = dateRange
    const { countBy, countBySwitchAt } = getCookieCountByParams(usesCookies, cookieStartDate, startDate, endDate)
    const countByParams = countBy ? `&countBy=${countBy}` : ''
    const countBySwitchAtParam = countBySwitchAt ? `&countBySwitchAt=${countBySwitchAt}` : ''

    try {
      const urlPath = urlPaths.length > 0 ? urlPaths[0] : ''
      const normalizedPath = urlPath !== '/' && urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath

      const result = await fetchMarketingStats(
        selectedWebsite.id,
        startDate,
        endDate,
        normalizedPath,
        pathOperator,
        metricType,
        countByParams,
        countBySwitchAtParam,
      )
      console.log('[MarketingAnalysis] Received data:', result)

      if (result.data) {
        setMarketingData(result.data)
      }
      if (result.queryStats) {
        setQueryStats(result.queryStats)
      }

      // Update URL with configuration for sharing
      const newParams = new URLSearchParams(window.location.search)
      newParams.set('period', period)
      newParams.set('metricType', metricType)
      newParams.delete('urlPath')
      if (urlPaths.length > 0) {
        urlPaths.forEach((p) => newParams.append('urlPath', p))
        newParams.set('pathOperator', pathOperator)
      } else {
        newParams.delete('pathOperator')
      }

      if (period === 'custom' && customStartDate && customEndDate) {
        newParams.set('from', format(customStartDate, 'yyyy-MM-dd'))
        newParams.set('to', format(customEndDate, 'yyyy-MM-dd'))
      } else {
        newParams.delete('from')
        newParams.delete('to')
      }

      window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
      setLastAppliedFilterKey(appliedFilterKey)
    } catch (err) {
      console.error('Error fetching marketing data:', err)
      const message = err instanceof Error ? err.message : 'Det oppstod en feil ved henting av data.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [
    selectedWebsite,
    buildFilterKey,
    metricType,
    period,
    customStartDate,
    customEndDate,
    urlPaths,
    pathOperator,
    usesCookies,
    cookieStartDate,
  ])

  // Auto-submit when website is selected
  useEffect(() => {
    if (selectedWebsite && !hasAttemptedFetch) {
      void fetchData()
    }
  }, [selectedWebsite, hasAttemptedFetch, fetchData])

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      const properties: KopierLenkeProperties = { seksjon: 'markedsføring' }
      window.umami?.track(Events.KOPIER_LENKE, properties)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  return {
    // Website
    selectedWebsite,
    setSelectedWebsite,
    hasMarketing,

    // Filters
    urlPaths,
    setUrlPaths,
    pathOperator,
    setPathOperator,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    metricType,
    setMetricType,

    // Submitted state
    submittedMetricType,

    // Data
    marketingData,
    queryStats,

    // Loading / Error
    loading,
    error,
    hasAttemptedFetch,

    // Actions
    fetchData,
    copyShareLink,
    copySuccess,
    hasUnappliedFilterChanges,

    // Tab
    activeTab,
    setActiveTab,

    // Cookie
    currentDateRange,
    cookieBadge,
    cookieStartDate,
    isPreCookieRange,

    // Re-export
    getVisitorLabelWithBadge,
  }
}
