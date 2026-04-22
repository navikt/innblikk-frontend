import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseISO } from 'date-fns'
import type { Website } from '../../../shared/types/chart.ts'
import type { PrivacyRow, QueryStats } from '../model/types.ts'
import { fetchPrivacyCheck } from '../api/privacy.ts'
import { calculatePrivacyDateRange, filterFalsePositives } from '../utils/privacy.ts'

const ROWS_PER_PAGE = 20

export const usePrivacyCheck = () => {
  const [searchParams] = useSearchParams()
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [period, setPeriod] = useState<string>(() => searchParams.get('period') || 'current_month')

  const fromDateFromUrl = searchParams.get('from')
  const toDateFromUrl = searchParams.get('to')
  const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined
  const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined

  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate)
  const [data, setData] = useState<PrivacyRow[] | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)
  const [generatedSql, setGeneratedSql] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('summary')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [showEmpty, setShowEmpty] = useState<boolean>(false)
  const [dryRunStats, setDryRunStats] = useState<QueryStats | null>(null)
  const [showDryRunWarning, setShowDryRunWarning] = useState<boolean>(false)
  const [detailsPage, setDetailsPage] = useState<number>(1)
  const [redactedPage, setRedactedPage] = useState<number>(1)

  const matchTypes = useMemo(
    () => (data ? Array.from(new Set(data.map((row) => row.match_type))).filter((t) => t !== 'Redacted') : []),
    [data],
  )

  const hasRedactions = useMemo(() => (data ? data.some((row) => row.match_type === 'Redacted') : false), [data])

  // Auto-switch to redacted tab if it's the only one available
  useEffect(() => {
    if (data && matchTypes.length === 0 && hasRedactions && activeTab === 'summary') {
      setActiveTab('redacted')
    }
  }, [data, matchTypes.length, hasRedactions, activeTab])

  const fetchData = useCallback(
    async (force: boolean = false) => {
      setLoading(true)
      setError(null)
      if (force) {
        setShowDryRunWarning(false)
      } else {
        setData(null)
        setQueryStats(null)
        setGeneratedSql(null)
        setSelectedType(null)
        setDryRunStats(null)
        setShowDryRunWarning(false)
      }

      const range = calculatePrivacyDateRange(period, customStartDate, customEndDate)
      if (!range) {
        setError('Vennligst velg en gyldig periode.')
        setLoading(false)
        return
      }

      try {
        let dryRun = !force && period === 'custom'
        let shouldRetry = false

        do {
          shouldRetry = false
          const result = await fetchPrivacyCheck({
            websiteId: selectedWebsite?.id,
            startDate: range.startDate,
            endDate: range.endDate,
            dryRun,
          })

          if (result.error) {
            setError(result.error)
          } else if (result.dryRun) {
            const gbProcessed = parseFloat(String(result.queryStats?.totalBytesProcessedGB ?? '0'))
            if (gbProcessed > 50) {
              setDryRunStats(result.queryStats ?? null)
              setShowDryRunWarning(true)
              setLoading(false)
              return
            } else {
              setDryRunStats(result.queryStats ?? null)
              dryRun = false
              shouldRetry = true
            }
          } else {
            const filteredData = filterFalsePositives(result.data ?? [])

            console.log('[Privacy Check] Raw data from API:', (result.data ?? []).length, 'rows')
            console.log('[Privacy Check] Filtered data:', filteredData.length, 'rows')
            console.log(
              '[Privacy Check] Redacted items:',
              (result.data ?? []).filter((r: PrivacyRow) => r.match_type === 'Redacted'),
            )

            setData(filteredData)
            setQueryStats(result.queryStats ?? null)
            setGeneratedSql(result.generatedSql ?? null)
            setLoading(false)

            // Update URL with selected period for sharing
            const newParams = new URLSearchParams(window.location.search)
            newParams.set('period', period)
            window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
          }
        } while (shouldRetry)
      } catch (err) {
        console.error('Error fetching privacy check data:', err)
        setError('Det oppstod en feil ved henting av data.')
        setLoading(false)
      }
    },
    [period, customStartDate, customEndDate, selectedWebsite],
  )

  const handleExplore = useCallback((type: string) => {
    setSelectedType(type)
    setActiveTab('details')
  }, [])

  const filteredData = useMemo(
    () => (data ? (selectedType ? data.filter((row) => row.match_type === selectedType) : data) : []),
    [data, selectedType],
  )

  const visibleData = useMemo(() => filteredData.filter((row) => showEmpty || row.count > 0), [filteredData, showEmpty])

  // Reset pagination when filters change
  useEffect(() => {
    setDetailsPage(1)
  }, [selectedType, showEmpty])

  useEffect(() => {
    setRedactedPage(1)
  }, [data])

  // Paginate details data
  const paginatedDetailsData = useMemo(
    () => visibleData.slice((detailsPage - 1) * ROWS_PER_PAGE, detailsPage * ROWS_PER_PAGE),
    [visibleData, detailsPage],
  )
  const detailsTotalPages = Math.ceil(visibleData.length / ROWS_PER_PAGE)

  // Paginate redacted data
  const redactedData = useMemo(
    () => (data ? data.filter((row) => row.match_type === 'Redacted' && row.count > 0) : []),
    [data],
  )
  const paginatedRedactedData = useMemo(
    () => redactedData.slice((redactedPage - 1) * ROWS_PER_PAGE, redactedPage * ROWS_PER_PAGE),
    [redactedData, redactedPage],
  )
  const redactedTotalPages = Math.ceil(redactedData.length / ROWS_PER_PAGE)

  return {
    // Website & period
    selectedWebsite,
    setSelectedWebsite,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,

    // Data & loading
    data,
    loading,
    error,
    queryStats,
    generatedSql,
    dryRunStats,
    showDryRunWarning,
    setShowDryRunWarning,

    // Tabs & filters
    activeTab,
    setActiveTab,
    matchTypes,
    hasRedactions,
    selectedType,
    setSelectedType,
    showEmpty,
    setShowEmpty,

    // Derived data
    visibleData,
    paginatedDetailsData,
    detailsPage,
    setDetailsPage,
    detailsTotalPages,
    paginatedRedactedData,
    redactedPage,
    setRedactedPage,
    redactedTotalPages,

    // Actions
    fetchData,
    handleExplore,
  }
}
