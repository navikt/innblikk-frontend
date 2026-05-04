import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ILineChartProps } from '@fluentui/react-charting'
import { parseISO } from 'date-fns'
import { Events, type KopierLenkeProperties } from '@navikt/analytics-types'
import type { RetentionRow, QueryStats, RetentionStats } from '../model/types'
import type { Website } from '../../../shared/types/chart'
import { useCookieSupport, useCookieStartDate } from '../../../shared/hooks/useSiteimproveSupport'
import { normalizeUrlToPath, getStoredPeriod, getCookieBadge } from '../../../shared/lib/utils'
import { fetchRetentionData } from '../api/retentionApi'
import {
  getRetentionDateRange,
  buildChartData,
  computeRetentionStats,
  downloadRetentionCSV,
  buildShareParams,
  copyShareLink as copyShareLinkUtil,
} from '../utils/retentionUtils'

export interface RetentionState {
  // Website
  selectedWebsite: Website | null
  setSelectedWebsite: (w: Website | null) => void
  usesCookies: boolean

  // Filters
  urlPath: string
  setUrlPath: (v: string) => void
  pathOperator: string
  setPathOperator: (v: string) => void
  returnScope: 'same_url' | 'site'
  setReturnScope: (v: 'same_url' | 'site') => void
  period: string
  setPeriod: (p: string) => void
  customStartDate: Date | undefined
  setCustomStartDate: (d: Date | undefined) => void
  customEndDate: Date | undefined
  setCustomEndDate: (d: Date | undefined) => void

  // Data
  retentionData: RetentionRow[]
  chartData: ILineChartProps | null
  retentionStats: RetentionStats | null
  queryStats: QueryStats | null
  generatedSql: string | null

  // UI state
  loading: boolean
  error: string | null
  hasAttemptedFetch: boolean
  activeTab: string
  setActiveTab: (t: string) => void
  copySuccess: boolean
  hasUnappliedFilterChanges: boolean

  // Cookie-related
  cookieBadge: string
  isPreCookieRange: boolean
  cookieStartDate: Date | null
  overriddenGlobalPeriod: string | null
  isCurrentMonthData: boolean

  // Actions
  fetchData: () => Promise<void>
  downloadCSV: () => void
  copyShareLink: () => Promise<void>
}

export function useRetention(): RetentionState {
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const usesCookies = useCookieSupport(selectedWebsite?.domain)
  const cookieStartDate = useCookieStartDate(selectedWebsite?.domain)
  const [searchParams] = useSearchParams()
  const retentionPeriodFromUrl = searchParams.get('retentionPeriod') || searchParams.get('period')
  const returnScopeFromUrl = searchParams.get('retentionReturnScope')

  // Initialize state from URL params
  const [urlPath, setUrlPath] = useState<string>(() => searchParams.get('urlPath') || '')
  const [pathOperator, setPathOperator] = useState<string>(() => searchParams.get('pathOperator') || 'equals')
  const [returnScope, setReturnScope] = useState<'same_url' | 'site'>(() =>
    returnScopeFromUrl === 'site' ? 'site' : 'same_url',
  )
  const [period, setPeriodState] = useState<string>(() => {
    const initial = getStoredPeriod(searchParams.get('retentionPeriod') || searchParams.get('period'))
    const validPeriods = ['current_month', 'last_month', 'custom']
    return validPeriods.includes(initial) ? initial : 'last_month'
  })

  const [overriddenGlobalPeriod, setOverriddenGlobalPeriod] = useState<string | null>(() => {
    const retentionParam = searchParams.get('retentionPeriod')
    if (retentionParam) return null

    const requested = getStoredPeriod(searchParams.get('period'))
    const validPeriods = ['current_month', 'last_month', 'custom']
    return !validPeriods.includes(requested) ? requested : null
  })

  const setPeriod = (newPeriod: string) => {
    setPeriodState(newPeriod)
    setOverriddenGlobalPeriod(null)
  }

  useEffect(() => {
    if (!usesCookies) return
    const requested = getStoredPeriod(retentionPeriodFromUrl)
    queueMicrotask(() => {
      setPeriodState((prev) => (prev === requested ? prev : requested))
    })
  }, [usesCookies, retentionPeriodFromUrl])

  // Custom dates from URL
  const fromDateFromUrl = searchParams.get('from')
  const toDateFromUrl = searchParams.get('to')
  const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined
  const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined

  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate)

  // Data state
  const [retentionData, setRetentionData] = useState<RetentionRow[]>([])
  const [chartData, setChartData] = useState<ILineChartProps | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('chart')
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)
  const [generatedSql, setGeneratedSql] = useState<string | null>(null)
  const [sameDayReturningUsers, setSameDayReturningUsers] = useState<number>(0)
  const [nonReturningUsers, setNonReturningUsers] = useState<number>(0)
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState<boolean>(false)
  const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null)

  const buildFilterKey = useCallback(
    () =>
      JSON.stringify({
        websiteId: selectedWebsite?.id ?? null,
        urlPath: normalizeUrlToPath(urlPath),
        pathOperator,
        returnScope,
        period,
        customStartDate: customStartDate?.toISOString() ?? null,
        customEndDate: customEndDate?.toISOString() ?? null,
      }),
    [selectedWebsite?.id, urlPath, pathOperator, returnScope, period, customStartDate, customEndDate],
  )

  const hasUnappliedFilterChanges = buildFilterKey() !== lastAppliedFilterKey

  const dateRange = useMemo(
    () => getRetentionDateRange(usesCookies, period, customStartDate, customEndDate),
    [usesCookies, period, customStartDate, customEndDate],
  )

  // Cookie badge
  const cookieBadge = useMemo(() => {
    if (!dateRange) return ''
    return getCookieBadge(usesCookies, cookieStartDate, dateRange.startDate, dateRange.endDate)
  }, [usesCookies, cookieStartDate, dateRange])

  const isPreCookieRange = useMemo(() => {
    if (!dateRange || !cookieStartDate) return false
    return dateRange.endDate.getTime() < cookieStartDate.getTime()
  }, [cookieStartDate, dateRange])

  // Retention stats
  const retentionStats = useMemo(
    () => computeRetentionStats(retentionData, sameDayReturningUsers, nonReturningUsers),
    [retentionData, sameDayReturningUsers, nonReturningUsers],
  )

  const isCurrentMonthData = useMemo(() => {
    if (period === 'current_month') return true
    if (period === 'custom' && customEndDate) {
      const now = new Date()
      return (
        customEndDate.getDate() === now.getDate() &&
        customEndDate.getMonth() === now.getMonth() &&
        customEndDate.getFullYear() === now.getFullYear()
      )
    }
    return false
  }, [period, customEndDate])

  // Actions
  const fetchData = useCallback(async () => {
    if (!selectedWebsite) return
    const appliedFilterKey = buildFilterKey()

    setLoading(true)
    setError(null)
    setRetentionData([])
    setChartData(null)
    setSameDayReturningUsers(0)
    setNonReturningUsers(0)
    setHasAttemptedFetch(true)

    const range = getRetentionDateRange(usesCookies, period, customStartDate, customEndDate)
    if (!range) {
      setError('Vennligst velg en gyldig periode.')
      setLoading(false)
      return
    }

    const result = await fetchRetentionData({
      websiteId: selectedWebsite.id,
      startDate: range.startDate,
      endDate: range.endDate,
      urlPath,
      pathOperator,
      returnScope,
      usesCookies,
      cookieStartDate,
    })

    if (result.error) {
      setError(result.error)
    } else {
      setRetentionData(result.data)
      setChartData(buildChartData(result.data))
      setQueryStats(result.queryStats)
      if (result.generatedSql) setGeneratedSql(result.generatedSql)
      setSameDayReturningUsers(result.sameDayReturningUsers ?? 0)
      setNonReturningUsers(result.nonReturningUsers ?? 0)

      // Update URL with configuration for sharing
      const normalizedUrl = normalizeUrlToPath(urlPath)
      const newParams = buildShareParams(period, normalizedUrl, pathOperator, returnScope)
      window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
      setLastAppliedFilterKey(appliedFilterKey)
    }

    setLoading(false)
  }, [
    selectedWebsite,
    buildFilterKey,
    urlPath,
    pathOperator,
    returnScope,
    period,
    customStartDate,
    customEndDate,
    usesCookies,
    cookieStartDate,
  ])

  // Auto-submit when website is selected
  useEffect(() => {
    if (selectedWebsite && !hasAutoSubmitted && !loading) {
      setHasAutoSubmitted(true)
      void fetchData()
    }
  }, [selectedWebsite, hasAutoSubmitted, loading, fetchData])

  const downloadCSV = useCallback(() => {
    downloadRetentionCSV(retentionData, selectedWebsite?.name)
  }, [retentionData, selectedWebsite?.name])

  const copyShareLinkAction = useCallback(async () => {
    try {
      await copyShareLinkUtil()
      const properties: KopierLenkeProperties = { seksjon: 'retention' }
      window.umami?.track(Events.KOPIER_LENKE, properties)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }, [])

  return {
    selectedWebsite,
    setSelectedWebsite,
    usesCookies,
    urlPath,
    setUrlPath,
    pathOperator,
    setPathOperator,
    returnScope,
    setReturnScope,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    retentionData,
    chartData,
    retentionStats,
    queryStats,
    generatedSql,
    loading,
    error,
    hasAttemptedFetch,
    activeTab,
    setActiveTab,
    copySuccess,
    hasUnappliedFilterChanges,
    cookieBadge,
    isPreCookieRange,
    cookieStartDate,
    overriddenGlobalPeriod,
    isCurrentMonthData,
    fetchData,
    downloadCSV,
    copyShareLink: copyShareLinkAction,
  }
}
