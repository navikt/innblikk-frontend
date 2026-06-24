import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseISO, format } from 'date-fns'
import type { Website } from '../../../shared/types/chart'
import {
  normalizeUrlToPath,
  getStoredPeriod,
  savePeriodPreference,
  getDateRangeFromPeriod,
} from '../../../shared/lib/utils'
import { fetchEventJourneys } from '../api/eventJourneyApi'
import type { JourneyStats, QueryStats } from '../model/types'

type CachedJourneyResult = {
  data: { path: string[]; count: number }[]
  journeyStats: JourneyStats | null
  queryStats: QueryStats | null
  generatedSql: string | null
}

const eventJourneyCache = new Map<string, CachedJourneyResult>()

const normalizeGeneratedSql = (sql: string): string =>
  sql
    .replace(/umami\.public_website_event/gi, 'umami_views.event')
    .replace(/umami\.public_session/gi, 'umami_views.session')

export const useEventJourney = () => {
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [searchParams] = useSearchParams()

  // Initialize state from URL params
  const [urlPath, setUrlPath] = useState<string>(
    () => searchParams.get('urlPath') || searchParams.get('pagePath') || '',
  )
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

  const [data, setData] = useState<{ path: string[]; count: number }[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState<boolean>(false)
  const [journeyStats, setJourneyStats] = useState<JourneyStats | null>(null)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)
  const [generatedSql, setGeneratedSql] = useState<string | null>(null)
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState<boolean>(false)
  const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null)

  const buildFilterKey = useCallback(
    () =>
      JSON.stringify({
        websiteId: selectedWebsite?.id ?? null,
        urlPath: normalizeUrlToPath(urlPath),
        period,
        customStartDate: customStartDate?.toISOString() ?? null,
        customEndDate: customEndDate?.toISOString() ?? null,
      }),
    [selectedWebsite?.id, urlPath, period, customStartDate, customEndDate],
  )

  const hasUnappliedFilterChanges = buildFilterKey() !== lastAppliedFilterKey

  const fetchData = useCallback(async () => {
    if (!selectedWebsite) return
    if (!urlPath) return

    const appliedFilterKey = buildFilterKey()

    const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
    if (!dateRange) {
      setError('Vennligst velg en gyldig periode.')
      setLoading(false)
      return
    }
    const { startDate, endDate } = dateRange

    const syncSearchParams = () => {
      const newParams = new URLSearchParams(window.location.search)
      newParams.set('period', period)
      newParams.set('urlPath', urlPath)
      newParams.delete('minEvents')
      if (period === 'custom' && customStartDate && customEndDate) {
        newParams.set('from', format(customStartDate, 'yyyy-MM-dd'))
        newParams.set('to', format(customEndDate, 'yyyy-MM-dd'))
      } else {
        newParams.delete('from')
        newParams.delete('to')
      }
      window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
    }

    const cachedResult = eventJourneyCache.get(appliedFilterKey)
    if (cachedResult) {
      setHasSearched(true)
      setHasAutoSubmitted(true)
      setError(null)
      setData(cachedResult.data)
      setJourneyStats(cachedResult.journeyStats)
      setQueryStats(cachedResult.queryStats)
      setGeneratedSql(cachedResult.generatedSql ? normalizeGeneratedSql(cachedResult.generatedSql) : null)
      setLastAppliedFilterKey(appliedFilterKey)
      syncSearchParams()
      return
    }

    setLoading(true)
    setHasSearched(true)
    setError(null)
    setData([])
    setJourneyStats(null)
    setQueryStats(null)
    setHasAutoSubmitted(true)

    try {
      const result = await fetchEventJourneys({
        websiteId: selectedWebsite.id,
        urlPath,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        minEvents: 1,
      })

      const nextData = result.journeys || []
      const nextJourneyStats = result.journeyStats || null
      const nextQueryStats = result.queryStats || null
      const nextGeneratedSql = result.generatedSql ? normalizeGeneratedSql(result.generatedSql) : null
      setData(nextData)
      setJourneyStats(nextJourneyStats)
      setQueryStats(nextQueryStats)
      setGeneratedSql(nextGeneratedSql)
      eventJourneyCache.set(appliedFilterKey, {
        data: nextData,
        journeyStats: nextJourneyStats,
        queryStats: nextQueryStats,
        generatedSql: nextGeneratedSql,
      })
      syncSearchParams()
      setLastAppliedFilterKey(appliedFilterKey)
    } catch (err) {
      console.error(err)
      setError('Kunne ikke laste hendelsesreiser. Prøv igjen senere.')
    } finally {
      setLoading(false)
    }
  }, [selectedWebsite, urlPath, buildFilterKey, period, customStartDate, customEndDate])

  // Auto-submit when URL parameters are present
  useEffect(() => {
    const hasConfigParams = searchParams.has('period') || searchParams.has('urlPath')
    if (selectedWebsite && hasConfigParams && !hasAutoSubmitted && !loading) {
      setHasAutoSubmitted(true)
      void fetchData()
    }
  }, [selectedWebsite, searchParams, hasAutoSubmitted, loading, fetchData])

  return {
    selectedWebsite,
    setSelectedWebsite,
    urlPath,
    setUrlPath,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    data,
    loading,
    error,
    hasSearched,
    journeyStats,
    queryStats,
    generatedSql,
    hasUnappliedFilterChanges,
    fetchData,
  }
}
