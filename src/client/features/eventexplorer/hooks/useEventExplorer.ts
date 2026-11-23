import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useReplaceSearchParams } from '../../../shared/hooks/useReplaceSearchParams'
import { EVENT_LIST_PATH, EVENT_PARAMETER_PATH } from '../utils/navigation'
import { format, parseISO } from 'date-fns'
import type { Website } from '../../../shared/types/chart'
import { normalizeDomain } from '../../../shared/lib/domain'
import {
  normalizeUrlToPath,
  getDateRangeFromPeriod,
  getStoredPeriod,
  savePeriodPreference,
} from '../../../shared/lib/utils'
import {
  fetchEvents,
  fetchEventSeries,
  fetchEventProperties,
  fetchParameterValues,
  fetchLatestEvents,
} from '../api/eventExplorerApi'
import type { SeriesPoint, EventProperty, ParameterValue, LatestEvent, QueryStats } from '../model/types'

export const useEventExplorer = () => {
  const [website, setSelectedWebsite] = useState<Website | null>(null)
  const [searchParams] = useSearchParams()

  const websiteId = searchParams.get('websiteId')
  const domain = searchParams.get('domain')
  const matchesWebsite = websiteId
    ? website?.id === websiteId
    : domain
      ? Boolean(website && normalizeDomain(website.domain) === normalizeDomain(domain))
      : true
  const selectedWebsite = matchesWebsite ? website : null
  const location = useLocation()
  const replaceSearchParams = useReplaceSearchParams()
  const latestSearch = useRef(location.search)
  useEffect(() => {
    latestSearch.current = location.search
  }, [location.search])
  const updateParams = useCallback(
    (update: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(latestSearch.current)
      update(params)
      latestSearch.current = params.toString()
      replaceSearchParams(params)
    },
    [replaceSearchParams],
  )

  const urlPaths = useMemo(() => {
    const paths = searchParams.getAll('urlPath')
    const legacyPath = searchParams.get('pagePath')
    return (paths.length ? paths : legacyPath ? [legacyPath] : []).map(normalizeUrlToPath).filter(Boolean)
  }, [searchParams])
  const pathOperator = searchParams.get('pathOperator') || 'equals'
  const selectedEvent = location.pathname === EVENT_LIST_PATH ? '' : searchParams.get('event') || ''
  const selectedParameterForDrilldown =
    location.pathname === EVENT_PARAMETER_PATH ? searchParams.get('parameter') : null
  const period = getStoredPeriod(searchParams.get('period'))
  useEffect(() => {
    if (!searchParams.has('period')) updateParams((params) => params.set('period', period))
  }, [period, searchParams, updateParams])
  const from = searchParams.get('from') || searchParams.get('startDate')
  const to = searchParams.get('to') || searchParams.get('endDate')
  const customStartDate = useMemo(() => (from ? parseISO(from) : undefined), [from])
  const customEndDate = useMemo(() => (to ? parseISO(to) : undefined), [to])
  const setUrlPaths = (paths: string[]) =>
    updateParams((params) => {
      params.delete('urlPath')
      params.delete('pagePath')
      paths.forEach((path) => params.append('urlPath', path))
    })
  const setPathOperator = (operator: string) => updateParams((params) => params.set('pathOperator', operator))
  const setPeriod = (value: string) => {
    savePeriodPreference(value)
    updateParams((params) => {
      params.set('period', value)
      if (value !== 'custom') {
        params.delete('from')
        params.delete('to')
        params.delete('startDate')
        params.delete('endDate')
      }
    })
  }
  const setCustomStartDate = (date: Date | undefined) =>
    updateParams((params) => {
      params.delete('startDate')
      if (date && !isNaN(date.getTime())) params.set('from', format(date, 'yyyy-MM-dd'))
      else params.delete('from')
    })
  const setCustomEndDate = (date: Date | undefined) =>
    updateParams((params) => {
      params.delete('endDate')
      if (date && !isNaN(date.getTime())) params.set('to', format(date, 'yyyy-MM-dd'))
      else params.delete('to')
    })
  const [events, setEvents] = useState<{ name: string; count: number }[]>([])
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false)
  const [hasSearched, setHasSearched] = useState<boolean>(false)

  // Data states
  const [seriesData, setSeriesData] = useState<SeriesPoint[]>([])
  const [propertiesData, setPropertiesData] = useState<EventProperty[]>([])
  const [loadingData, setLoadingData] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)
  const [eventsQueryStats, setEventsQueryStats] = useState<QueryStats | null>(null)
  const [generatedSql, setGeneratedSql] = useState<string | null>(null)

  // Parameter values state
  const [allParameterValues, setAllParameterValues] = useState<Record<string, ParameterValue[]>>({})
  const [loadingValues, setLoadingValues] = useState<boolean>(false)
  const [hasLoadedValues, setHasLoadedValues] = useState<boolean>(false)
  const [latestEvents, setLatestEvents] = useState<LatestEvent[]>([])
  const [parameterValuesQueryStats, setParameterValuesQueryStats] = useState<QueryStats | null>(null)

  const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null)

  const buildFilterKey = useCallback(
    () =>
      JSON.stringify({
        websiteId: selectedWebsite?.id ?? null,
        urlPaths,
        pathOperator,
        period,
        customStartDate: customStartDate?.toJSON() ?? null,
        customEndDate: customEndDate?.toJSON() ?? null,
      }),
    [selectedWebsite?.id, urlPaths, pathOperator, period, customStartDate, customEndDate],
  )

  const requestKey = JSON.stringify([buildFilterKey(), selectedEvent])
  const currentRequest = useRef(0)
  useEffect(() => {
    currentRequest.current += 1
    return () => {
      currentRequest.current += 1
    }
  }, [requestKey])
  const [listDataKey, setListDataKey] = useState<string | null>(null)
  const [detailDataKey, setDetailDataKey] = useState<string | null>(null)

  const hasUnappliedFilterChanges = buildFilterKey() !== lastAppliedFilterKey

  // Calculate dates based on selection
  const getDates = useCallback(() => {
    const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
    if (!dateRange) {
      throw new Error('Vennligst velg en gyldig periode.')
    }
    return { startAt: dateRange.startDate, endAt: dateRange.endDate }
  }, [period, customStartDate, customEndDate])

  // Fetch available events
  const fetchEventsData = useCallback(async () => {
    if (!selectedWebsite) return
    const appliedFilterKey = buildFilterKey()
    const version = currentRequest.current
    const isCurrent = () => currentRequest.current === version

    setLoadingEvents(true)
    setHasSearched(true)
    setEvents([])
    setSeriesData([])
    setPropertiesData([])
    setError(null)

    try {
      const { startAt, endAt } = getDates()
      const pagePath = urlPaths.length > 0 ? urlPaths[0] : ''

      const result = await fetchEvents({
        websiteId: selectedWebsite.id,
        startAt: startAt.getTime(),
        endAt: endAt.getTime(),
        urlPath: pagePath,
        pathOperator,
      })

      if (!isCurrent()) return
      setEvents(result.events ?? [])
      setListDataKey(requestKey)
      if (result.queryStats) {
        setEventsQueryStats(result.queryStats)
      }
      if (result.generatedSql) {
        setGeneratedSql(result.generatedSql)
      }

      setLastAppliedFilterKey(appliedFilterKey)
    } catch (err) {
      if (!isCurrent()) return
      setListDataKey(requestKey)
      console.error('Error fetching events:', err)
      setError((err as Error).message || 'Kunne ikke hente hendelser.')
    } finally {
      if (isCurrent()) setLoadingEvents(false)
    }
  }, [selectedWebsite, buildFilterKey, getDates, urlPaths, pathOperator, requestKey])

  const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
  const canRefresh = Boolean(selectedWebsite && dateRange && dateRange.endDate >= dateRange.startDate)
  useEffect(() => {
    if (!canRefresh || selectedEvent) return
    const timer = window.setTimeout(() => void fetchEventsData(), 300)
    return () => window.clearTimeout(timer)
  }, [canRefresh, selectedEvent, requestKey, fetchEventsData])

  // Fetch data when an event is selected
  const fetchEventData = useCallback(async () => {
    if (!selectedWebsite || !selectedEvent) return
    const version = currentRequest.current
    const isCurrent = () => currentRequest.current === version

    setLoadingData(true)
    setError(null)
    setSeriesData([])
    setPropertiesData([])
    setQueryStats(null)
    setAllParameterValues({})
    setHasLoadedValues(false)
    setLoadingValues(false)

    try {
      const { startAt, endAt } = getDates()
      const pagePath = urlPaths.length > 0 ? urlPaths[0] : ''

      // Fetch Series Data
      const seriesResult = await fetchEventSeries({
        websiteId: selectedWebsite.id,
        eventName: selectedEvent,
        interval: 'day',
        startAt: startAt.getTime(),
        endAt: endAt.getTime(),
        urlPath: pagePath,
        pathOperator,
      })
      if (!isCurrent()) return
      setSeriesData(seriesResult.data ?? [])

      // Fetch Properties Data
      const propsResult = await fetchEventProperties({
        websiteId: selectedWebsite.id,
        eventName: selectedEvent,
        includeParams: true,
        startAt: startAt.getTime(),
        endAt: endAt.getTime(),
        urlPath: pagePath,
        pathOperator,
      })

      if (!isCurrent()) return
      setDetailDataKey(requestKey)
      setPropertiesData(propsResult.properties ?? [])
      if (propsResult.gbProcessed !== undefined) {
        const gbProcessed = Number(propsResult.gbProcessed)
        setQueryStats({
          totalBytesProcessedGB: Number.isFinite(gbProcessed) ? gbProcessed : undefined,
          estimatedCostUSD: Number.isFinite(gbProcessed)
            ? parseFloat(((gbProcessed / 1024) * 6.25).toFixed(3))
            : undefined,
        })
      }
    } catch (err) {
      if (!isCurrent()) return
      setDetailDataKey(requestKey)
      console.error('Error fetching data:', err)
      setError('Det oppstod en feil ved henting av data.')
    } finally {
      if (isCurrent()) setLoadingData(false)
    }
  }, [selectedWebsite, selectedEvent, getDates, urlPaths, pathOperator, requestKey])

  useEffect(() => {
    if (!canRefresh || !selectedEvent) return
    const timer = window.setTimeout(() => void fetchEventData(), 300)
    return () => window.clearTimeout(timer)
  }, [canRefresh, selectedEvent, requestKey, fetchEventData])

  // Fetch values for ALL parameters
  const fetchAllParameterValues = useCallback(async () => {
    if (!selectedWebsite || !selectedEvent || propertiesData.length === 0 || detailDataKey !== requestKey) return
    const version = currentRequest.current
    const isCurrent = () => currentRequest.current === version

    setLoadingValues(true)
    setError(null)
    setAllParameterValues({})

    try {
      const { startAt, endAt } = getDates()
      const pagePath = urlPaths.length > 0 ? urlPaths[0] : ''

      // Fetch values for all parameters in parallel
      const fetchPromises = propertiesData.map(async (prop) => {
        const result = await fetchParameterValues({
          websiteId: selectedWebsite.id,
          eventName: selectedEvent,
          parameterName: prop.propertyName,
          startAt: startAt.getTime(),
          endAt: endAt.getTime(),
          urlPath: pagePath,
          pathOperator,
        })

        return {
          parameterName: prop.propertyName,
          values: result.values ?? [],
          queryStats: result.queryStats ?? undefined,
        }
      })

      const results = await Promise.all(fetchPromises)
      if (!isCurrent()) return

      // Convert array to object for easier lookup
      const valuesMap: Record<string, ParameterValue[]> = {}
      let combinedQueryStats: QueryStats | null = null
      results.forEach((result) => {
        valuesMap[result.parameterName] = result.values
        if (!combinedQueryStats && result.queryStats) {
          combinedQueryStats = result.queryStats
        }
      })

      setAllParameterValues(valuesMap)
      setParameterValuesQueryStats(combinedQueryStats)

      // Fetch latest 20 events
      const latestResult = await fetchLatestEvents({
        websiteId: selectedWebsite.id,
        eventName: selectedEvent,
        startAt: startAt.getTime(),
        endAt: endAt.getTime(),
        limit: 20,
        urlPath: pagePath,
        pathOperator,
      })

      if (!isCurrent()) return
      setLatestEvents(latestResult.events ?? [])
      setHasLoadedValues(true)
    } catch (err) {
      if (!isCurrent()) return
      console.error('Error fetching parameter values:', err)
      setError('Kunne ikke hente parameterverdier.')
    } finally {
      if (isCurrent()) setLoadingValues(false)
    }
  }, [selectedWebsite, selectedEvent, propertiesData, getDates, urlPaths, pathOperator, detailDataKey, requestKey])

  // Auto-fetch values when drilling down into a parameter
  useEffect(() => {
    if (selectedParameterForDrilldown && !hasLoadedValues && !loadingValues && !error) {
      void fetchAllParameterValues()
    }
  }, [selectedParameterForDrilldown, hasLoadedValues, loadingValues, error, fetchAllParameterValues])

  return {
    selectedWebsite,
    setSelectedWebsite,
    urlPaths,
    setUrlPaths,
    pathOperator,
    setPathOperator,
    selectedEvent,
    events: listDataKey === requestKey ? events : [],
    loadingEvents: !selectedEvent && (loadingEvents || (canRefresh && listDataKey !== requestKey)),
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    hasSearched,
    seriesData: detailDataKey === requestKey ? seriesData : [],
    propertiesData: detailDataKey === requestKey ? propertiesData : [],
    loadingData: Boolean(selectedEvent) && (loadingData || (canRefresh && detailDataKey !== requestKey)),
    error,
    queryStats,
    eventsQueryStats,
    generatedSql,
    allParameterValues,
    loadingValues,
    hasLoadedValues,
    latestEvents,
    selectedParameterForDrilldown,
    parameterValuesQueryStats,
    hasUnappliedFilterChanges,
    fetchEventsData,
    fetchAllParameterValues,
  }
}
