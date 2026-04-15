import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ILineChartProps } from '@fluentui/react-charting'
import { parseISO } from 'date-fns'
import type { GoalCompletionRow, GoalCompletionSummary, QueryStats } from '../model/types'
import type { Website } from '../../../shared/types/chart'
import { useCookieSupport, useCookieStartDate } from '../../../shared/hooks/useSiteimproveSupport'
import { normalizeUrlToPath, getStoredPeriod, getCookieBadge } from '../../../shared/lib/utils'
import { fetchGoalCompletionData } from '../api/goalCompletionApi'
import { getGoalCompletionDateRange, buildGoalCompletionChartData } from '../utils/goalCompletionUtils'

const EMPTY_SUMMARY: GoalCompletionSummary = {
  totalStarters: 0,
  totalCompleted: 0,
  sameDayCompleted: 0,
  nonCompleted: 0,
}

export interface GoalCompletionState {
  selectedWebsite: Website | null
  setSelectedWebsite: (w: Website | null) => void
  usesCookies: boolean
  startUrl: string
  setStartUrl: (v: string) => void
  startPathOperator: string
  setStartPathOperator: (v: string) => void
  goalUrl: string
  setGoalUrl: (v: string) => void
  goalPathOperator: string
  setGoalPathOperator: (v: string) => void
  period: string
  setPeriod: (p: string) => void
  customStartDate: Date | undefined
  setCustomStartDate: (d: Date | undefined) => void
  customEndDate: Date | undefined
  setCustomEndDate: (d: Date | undefined) => void
  data: GoalCompletionRow[]
  summary: GoalCompletionSummary
  chartData: ILineChartProps | null
  queryStats: QueryStats | null
  loading: boolean
  error: string | null
  hasAttemptedFetch: boolean
  hasUnappliedFilterChanges: boolean
  cookieBadge: string
  isPreCookieRange: boolean
  cookieStartDate: Date | null
  fetchData: () => Promise<void>
}

export function useGoalCompletion(): GoalCompletionState {
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const usesCookies = useCookieSupport(selectedWebsite?.domain)
  const cookieStartDate = useCookieStartDate(selectedWebsite?.domain)
  const [searchParams] = useSearchParams()

  const [startUrl, setStartUrl] = useState<string>(() => searchParams.get('startUrl') || '')
  const [startPathOperator, setStartPathOperator] = useState<string>(
    () => searchParams.get('startPathOperator') || 'equals',
  )
  const [goalUrl, setGoalUrl] = useState<string>(() => searchParams.get('goalUrl') || '')
  const [goalPathOperator, setGoalPathOperator] = useState<string>(
    () => searchParams.get('goalPathOperator') || 'equals',
  )

  const [period, setPeriod] = useState<string>(() => {
    const initial = getStoredPeriod(searchParams.get('goalPeriod') || searchParams.get('period'))
    const validPeriods = ['current_month', 'last_month', 'custom']
    return validPeriods.includes(initial) ? initial : 'last_month'
  })

  const fromDateFromUrl = searchParams.get('from')
  const toDateFromUrl = searchParams.get('to')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(
    fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined,
  )
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(
    toDateFromUrl ? parseISO(toDateFromUrl) : undefined,
  )

  const [data, setData] = useState<GoalCompletionRow[]>([])
  const [summary, setSummary] = useState<GoalCompletionSummary>(EMPTY_SUMMARY)
  const [chartData, setChartData] = useState<ILineChartProps | null>(null)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false)
  const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null)

  const buildFilterKey = useCallback(
    () =>
      JSON.stringify({
        websiteId: selectedWebsite?.id ?? null,
        startUrl: normalizeUrlToPath(startUrl),
        startPathOperator,
        goalUrl: normalizeUrlToPath(goalUrl),
        goalPathOperator,
        period,
        customStartDate: customStartDate?.toISOString() ?? null,
        customEndDate: customEndDate?.toISOString() ?? null,
      }),
    [
      selectedWebsite?.id,
      startUrl,
      startPathOperator,
      goalUrl,
      goalPathOperator,
      period,
      customStartDate,
      customEndDate,
    ],
  )

  const hasUnappliedFilterChanges = buildFilterKey() !== lastAppliedFilterKey

  const dateRange = useMemo(
    () => getGoalCompletionDateRange(usesCookies, period, customStartDate, customEndDate),
    [usesCookies, period, customStartDate, customEndDate],
  )

  const cookieBadge = useMemo(() => {
    if (!dateRange) return ''
    return getCookieBadge(usesCookies, cookieStartDate, dateRange.startDate, dateRange.endDate)
  }, [usesCookies, cookieStartDate, dateRange])

  const isPreCookieRange = useMemo(() => {
    if (!dateRange || !cookieStartDate) return false
    return dateRange.endDate.getTime() < cookieStartDate.getTime()
  }, [cookieStartDate, dateRange])

  const fetchData = useCallback(async () => {
    if (!selectedWebsite) return
    const appliedFilterKey = buildFilterKey()
    const normalizedStartUrl = normalizeUrlToPath(startUrl)
    const normalizedGoalUrl = normalizeUrlToPath(goalUrl)

    if (!normalizedStartUrl || !normalizedGoalUrl) {
      setError('Vennligst velg både start-URL og mål-URL.')
      return
    }

    setLoading(true)
    setError(null)
    setData([])
    setSummary(EMPTY_SUMMARY)
    setChartData(null)
    setHasAttemptedFetch(true)

    const range = getGoalCompletionDateRange(usesCookies, period, customStartDate, customEndDate)
    if (!range) {
      setError('Vennligst velg en gyldig periode.')
      setLoading(false)
      return
    }

    const result = await fetchGoalCompletionData({
      websiteId: selectedWebsite.id,
      startDate: range.startDate,
      endDate: range.endDate,
      startUrl: normalizedStartUrl,
      startPathOperator,
      goalUrl: normalizedGoalUrl,
      goalPathOperator,
      usesCookies,
      cookieStartDate,
    })

    if (result.error) {
      setError(result.error)
    } else {
      setData(result.data)
      setSummary(result.summary)
      setChartData(buildGoalCompletionChartData(result.data))
      setQueryStats(result.queryStats)

      const newParams = new URLSearchParams(window.location.search)
      newParams.set('goalPeriod', period)
      newParams.delete('period')
      newParams.set('startUrl', normalizedStartUrl)
      newParams.set('startPathOperator', startPathOperator)
      newParams.set('goalUrl', normalizedGoalUrl)
      newParams.set('goalPathOperator', goalPathOperator)
      window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
      setLastAppliedFilterKey(appliedFilterKey)
    }

    setLoading(false)
  }, [
    selectedWebsite,
    buildFilterKey,
    startUrl,
    startPathOperator,
    goalUrl,
    goalPathOperator,
    usesCookies,
    cookieStartDate,
    period,
    customStartDate,
    customEndDate,
  ])

  return {
    selectedWebsite,
    setSelectedWebsite,
    usesCookies,
    startUrl,
    setStartUrl,
    startPathOperator,
    setStartPathOperator,
    goalUrl,
    setGoalUrl,
    goalPathOperator,
    setGoalPathOperator,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    data,
    summary,
    chartData,
    queryStats,
    loading,
    error,
    hasAttemptedFetch,
    hasUnappliedFilterChanges,
    cookieBadge,
    isPreCookieRange,
    cookieStartDate,
    fetchData,
  }
}
