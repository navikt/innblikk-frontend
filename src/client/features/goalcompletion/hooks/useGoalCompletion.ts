import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ILineChartProps } from '@fluentui/react-charting'
import { parseISO } from 'date-fns'
import type { GoalCompletionRow, GoalCompletionSummary, GoalStep, QueryStats } from '../model/types'
import type { Website } from '../../../shared/types/chart'
import { useCookieSupport, useCookieStartDate } from '../../../shared/hooks/useSiteimproveSupport'
import { getStoredPeriod, getCookieBadge } from '../../../shared/lib/utils'
import { fetchGoalCompletionData } from '../api/goalCompletionApi'
import { getGoalCompletionDateRange, buildGoalCompletionChartData } from '../utils/goalCompletionUtils'
import { normalizeGoalStep, parseGoalStepsFromParams, serializeGoalStep } from '../utils/goalStepUtils'
import { fetchWebsiteEvents } from '../../funnel/api/funnelApi'

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
  startStep: GoalStep
  setStartStep: (step: GoalStep) => void
  goalStep: GoalStep
  setGoalStep: (step: GoalStep) => void
  fetchAvailableEvents: (urlPath?: string) => Promise<string[]>
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
  const goalPeriodFromUrl = searchParams.get('goalPeriod') || searchParams.get('period')
  const [startStep, setStartStep] = useState<GoalStep>(() => parseGoalStepsFromParams(searchParams).startStep)
  const [goalStep, setGoalStep] = useState<GoalStep>(() => parseGoalStepsFromParams(searchParams).goalStep)

  const [period, setPeriod] = useState<string>(() => {
    const initial = getStoredPeriod(goalPeriodFromUrl)
    const validPeriods = ['current_month', 'last_month', 'custom']
    return validPeriods.includes(initial) ? initial : 'last_month'
  })

  useEffect(() => {
    if (!usesCookies) return
    const requested = getStoredPeriod(goalPeriodFromUrl)
    queueMicrotask(() => {
      setPeriod((prev) => (prev === requested ? prev : requested))
    })
  }, [usesCookies, goalPeriodFromUrl])

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
  const hasAutoSubmittedRef = useRef(false)
  const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null)
  const [eventsCache, setEventsCache] = useState<Record<string, string[]>>({})

  const fetchAvailableEvents = useCallback(
    async (urlPath?: string) => {
      if (!selectedWebsite) return []
      const normalizedUrlPath = urlPath?.trim() || ''
      const cacheKey = `${selectedWebsite.id}:${normalizedUrlPath}`
      const cached = eventsCache[cacheKey]
      if (cached) return cached

      const events = await fetchWebsiteEvents(selectedWebsite.id, normalizedUrlPath || undefined)
      setEventsCache((prev) => ({ ...prev, [cacheKey]: events }))
      return events
    },
    [eventsCache, selectedWebsite],
  )

  const buildFilterKey = useCallback(
    () =>
      JSON.stringify({
        websiteId: selectedWebsite?.id ?? null,
        startStep: normalizeGoalStep(startStep),
        goalStep: normalizeGoalStep(goalStep),
        period,
        customStartDate: customStartDate?.toISOString() ?? null,
        customEndDate: customEndDate?.toISOString() ?? null,
      }),
    [selectedWebsite?.id, startStep, goalStep, period, customStartDate, customEndDate],
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
    const normalizedStartStep = normalizeGoalStep(startStep)
    const normalizedGoalStep = normalizeGoalStep(goalStep)

    if (!normalizedStartStep.value || !normalizedGoalStep.value) {
      setError('Vennligst velg både startsteg og målsteg.')
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
      startStep: normalizedStartStep,
      goalStep: normalizedGoalStep,
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
      newParams.delete('startStep')
      newParams.delete('goalStep')
      newParams.delete('startUrl')
      newParams.delete('goalUrl')
      newParams.delete('startPathOperator')
      newParams.delete('goalPathOperator')
      newParams.set('startStep', serializeGoalStep(normalizedStartStep))
      newParams.set('goalStep', serializeGoalStep(normalizedGoalStep))
      window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
      setLastAppliedFilterKey(appliedFilterKey)
    }

    setLoading(false)
  }, [
    selectedWebsite,
    buildFilterKey,
    startStep,
    goalStep,
    usesCookies,
    cookieStartDate,
    period,
    customStartDate,
    customEndDate,
  ])

  useEffect(() => {
    const hasConfigParams =
      searchParams.has('startStep') ||
      searchParams.has('goalStep') ||
      searchParams.has('startUrl') ||
      searchParams.has('goalUrl') ||
      searchParams.has('urlPath') ||
      searchParams.has('pagePath')

    const normalizedStartStep = normalizeGoalStep(startStep)
    const normalizedGoalStep = normalizeGoalStep(goalStep)
    const hasValidSteps = Boolean(normalizedStartStep.value && normalizedGoalStep.value)

    if (selectedWebsite && hasConfigParams && hasValidSteps && !hasAutoSubmittedRef.current && !loading) {
      hasAutoSubmittedRef.current = true
      const timer = window.setTimeout(() => {
        void fetchData()
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [fetchData, goalStep, loading, searchParams, selectedWebsite, startStep])

  return {
    selectedWebsite,
    setSelectedWebsite,
    usesCookies,
    startStep,
    setStartStep,
    goalStep,
    setGoalStep,
    fetchAvailableEvents,
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
