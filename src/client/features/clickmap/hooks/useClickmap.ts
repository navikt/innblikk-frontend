import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import type { Website } from '../../../shared/types/chart'
import {
  getDateRangeFromPeriod,
  getStoredPeriod,
  normalizeUrlToPath,
  savePeriodPreference,
} from '../../../shared/lib/utils'
import { fetchClickmap } from '../api/clickmapApi'
import type { ClickmapItem } from '../model/types'
import type { QueryStats } from '../../../shared/types/queryStats'

const CLICKMAP_EVENTS = ['navigere', 'accordion åpnet']

type ClickmapDataset = 'clickmap' | 'scrollmap'

export const useClickmap = (dataset: ClickmapDataset = 'clickmap') => {
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [searchParams] = useSearchParams()
  const initialAutoLoadAttemptedRef = useRef(false)

  const [urlPath, setUrlPath] = useState<string>(
    () => searchParams.get('urlPath') || searchParams.get('pagePath') || '',
  )

  const [period, setPeriodState] = useState<string>(() => getStoredPeriod(searchParams.get('period')))
  const setPeriod = (newPeriod: string) => {
    setPeriodState(newPeriod)
    savePeriodPreference(newPeriod)
  }

  const fromDateFromUrl = searchParams.get('from')
  const toDateFromUrl = searchParams.get('to')
  const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined
  const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined

  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate)
  const shouldInitialAutoLoad = searchParams.has('urlPath') || searchParams.has('pagePath')

  const [data, setData] = useState<ClickmapItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState<boolean>(false)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)

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

  const fetchData = useCallback(
    async (overrideUrlPath?: string) => {
      const effectiveUrlPath = overrideUrlPath ?? urlPath

      if (!selectedWebsite) return
      if (!effectiveUrlPath.trim()) return

      const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
      if (!dateRange) {
        setError('Vennligst velg en gyldig periode.')
        return
      }

      const { startDate, endDate } = dateRange
      const normalizedPath = normalizeUrlToPath(effectiveUrlPath)
      const appliedFilterKey = JSON.stringify({
        websiteId: selectedWebsite.id,
        urlPath: normalizedPath,
        period,
        customStartDate: customStartDate?.toISOString() ?? null,
        customEndDate: customEndDate?.toISOString() ?? null,
      })

      setLoading(true)
      setError(null)
      setHasSearched(true)
      setData([])
      setQueryStats(null)

      try {
        const result = await fetchClickmap({
          websiteId: selectedWebsite.id,
          startAt: startDate.getTime(),
          endAt: endDate.getTime(),
          urlPath: normalizedPath,
          pathOperator: 'equals',
          eventNames: CLICKMAP_EVENTS,
          limit: 400,
          dataset,
        })

        setData(result.data ?? [])
        setQueryStats(result.queryStats ?? null)

        const newParams = new URLSearchParams(window.location.search)
        newParams.set('period', period)
        newParams.set('urlPath', normalizedPath)
        newParams.delete('pathOperator')
        newParams.delete('eventName')

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
        console.error('Error fetching clickmap data:', err)
        setError((err as Error).message || 'Kunne ikke hente klikk-kartdata.')
      } finally {
        setLoading(false)
      }
    },
    [selectedWebsite, urlPath, period, customStartDate, customEndDate, dataset],
  )

  useEffect(() => {
    if (initialAutoLoadAttemptedRef.current) return
    if (!selectedWebsite) return

    initialAutoLoadAttemptedRef.current = true

    if (!shouldInitialAutoLoad || !urlPath.trim()) return
    void fetchData()
  }, [selectedWebsite, shouldInitialAutoLoad, urlPath, fetchData])

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
    queryStats,
    hasUnappliedFilterChanges,
    fetchData,
  }
}
