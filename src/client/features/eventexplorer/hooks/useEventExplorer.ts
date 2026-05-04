import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import type { Website } from '../../../shared/types/chart'
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
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [searchParams] = useSearchParams()

  // Initialize state from URL params
  const pathsFromUrl = searchParams.getAll('urlPath')
  const legacyPath = searchParams.get('pagePath')
  const initialPaths =
    pathsFromUrl.length > 0
      ? pathsFromUrl.map((p) => normalizeUrlToPath(p)).filter(Boolean)
      : legacyPath
        ? [normalizeUrlToPath(legacyPath)].filter(Boolean)
        : []

  const [urlPaths, setUrlPaths] = useState<string[]>(initialPaths)
  const [pathOperator, setPathOperator] = useState<string>(() => searchParams.get('pathOperator') || 'equals')
  const [selectedEvent, setSelectedEvent] = useState<string>(() => searchParams.get('event') || '')
  const [events, setEvents] = useState<{ name: string; count: number }[]>([])
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false)
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
  const [selectedParameterForDrilldown, setSelectedParameterForDrilldown] = useState<string | null>(null)
  const [parameterValuesQueryStats, setParameterValuesQueryStats] = useState<QueryStats | null>(null)

  const [hasAutoSubmitted, setHasAutoSubmitted] = useState<boolean>(false)
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
      }),
    [selectedWebsite?.id, urlPaths, pathOperator, period, customStartDate, customEndDate],
  )

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

    setLoadingEvents(true)
    setHasSearched(true)
    setEvents([])
    setSelectedEvent('')
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

      setEvents(result.events ?? [])
      if (result.queryStats) {
        setEventsQueryStats(result.queryStats)
      }
      if (result.generatedSql) {
        setGeneratedSql(result.generatedSql)
      }

      // Update URL with configuration for sharing
      const newParams = new URLSearchParams(window.location.search)
      newParams.set('period', period)
      newParams.delete('urlPath')
      newParams.delete('pagePath')
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
      console.error('Error fetching events:', err)
      setError((err as Error).message || 'Kunne ikke hente hendelser.')
    } finally {
      setLoadingEvents(false)
    }
  }, [selectedWebsite, buildFilterKey, getDates, urlPaths, pathOperator, period, customStartDate, customEndDate])

  // Auto-submit when website is selected
  useEffect(() => {
    if (selectedWebsite && !hasAutoSubmitted && !loadingEvents) {
      setHasAutoSubmitted(true)
      void fetchEventsData()
    }
  }, [selectedWebsite, hasAutoSubmitted, loadingEvents, fetchEventsData])

  // Fetch data when an event is selected
  const fetchEventData = useCallback(async () => {
    if (!selectedWebsite || !selectedEvent) return

    setLoadingData(true)
    setError(null)
    setSeriesData([])
    setPropertiesData([])
    setQueryStats(null)
    setAllParameterValues({})
    setHasLoadedValues(false)

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

      // Update URL with selected event for sharing
      const newParams = new URLSearchParams(window.location.search)
      newParams.set('period', period)
      newParams.set('event', selectedEvent)
      newParams.delete('urlPath')
      newParams.delete('pagePath')
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
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Det oppstod en feil ved henting av data.')
    } finally {
      setLoadingData(false)
    }
  }, [selectedWebsite, selectedEvent, getDates, urlPaths, pathOperator, period, customStartDate, customEndDate])

  useEffect(() => {
    void fetchEventData()
  }, [fetchEventData])

  // Fetch values for ALL parameters
  const fetchAllParameterValues = useCallback(async () => {
    if (!selectedWebsite || !selectedEvent || propertiesData.length === 0) return

    setLoadingValues(true)
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

      setLatestEvents(latestResult.events ?? [])
      setHasLoadedValues(true)
    } catch (err) {
      console.error('Error fetching parameter values:', err)
      setError('Kunne ikke hente parameterverdier.')
    } finally {
      setLoadingValues(false)
    }
  }, [selectedWebsite, selectedEvent, propertiesData, getDates, urlPaths, pathOperator])

  // Auto-fetch values when drilling down into a parameter
  useEffect(() => {
    if (selectedParameterForDrilldown && !hasLoadedValues && !loadingValues) {
      void fetchAllParameterValues()
    }
  }, [selectedParameterForDrilldown, hasLoadedValues, loadingValues, fetchAllParameterValues])

  return {
    selectedWebsite,
    setSelectedWebsite,
    urlPaths,
    setUrlPaths,
    pathOperator,
    setPathOperator,
    selectedEvent,
    setSelectedEvent,
    events,
    loadingEvents,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    hasSearched,
    seriesData,
    propertiesData,
    loadingData,
    error,
    queryStats,
    eventsQueryStats,
    generatedSql,
    allParameterValues,
    loadingValues,
    hasLoadedValues,
    latestEvents,
    selectedParameterForDrilldown,
    setSelectedParameterForDrilldown,
    parameterValuesQueryStats,
    hasUnappliedFilterChanges,
    fetchEventsData,
    fetchAllParameterValues,
  }
}
