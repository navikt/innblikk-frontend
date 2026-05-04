import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseISO } from 'date-fns'
import type { Website } from '../../../shared/types/chart.ts'
import type { DiagnosisData, HistoryData, QueryStats } from '../model/types.ts'
import { fetchDiagnosisData, fetchDiagnosisHistory } from '../api/diagnosis.ts'
import {
  calculateDateRange,
  filterByEnvironment,
  filterByTab,
  sortDiagnosisData,
  buildChartData,
  type SortState,
} from '../utils/diagnosis.ts'

export const useDiagnosis = () => {
  const [searchParams] = useSearchParams()

  const [period, setPeriod] = useState<string>(() => searchParams.get('period') || 'last_7_days')

  const fromDateFromUrl = searchParams.get('from')
  const toDateFromUrl = searchParams.get('to')
  const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined
  const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined

  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate)
  const [data, setData] = useState<DiagnosisData[] | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)
  const [environment, setEnvironment] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<string>('all')
  const [selectedWebsiteFilter, setSelectedWebsiteFilter] = useState<Website | null>(null)

  // Deep Diagnosis State
  const [selectedWebsite, setSelectedWebsite] = useState<DiagnosisData | null>(null)
  const [historyData, setHistoryData] = useState<HistoryData[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState<boolean>(false)
  const [absoluteLastEvent, setAbsoluteLastEvent] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [historyQueryStats, setHistoryQueryStats] = useState<QueryStats | null>(null)

  const [sort, setSort] = useState<SortState>({
    orderBy: 'total',
    direction: 'descending',
  })

  const handleSort = (sortKey: string) => {
    setSort((prev) => ({
      orderBy: sortKey,
      direction: prev.orderBy === sortKey && prev.direction === 'descending' ? 'ascending' : 'descending',
    }))
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setData(null)
    setQueryStats(null)

    const range = calculateDateRange(period, customStartDate, customEndDate)
    if (!range) {
      setError('Vennligst velg en gyldig periode.')
      setLoading(false)
      return
    }

    try {
      const parsed = await fetchDiagnosisData(range.startDate, range.endDate)
      if (parsed.error) {
        setError(parsed.error)
      } else {
        setData(parsed.data ?? [])
        setQueryStats(parsed.queryStats ?? null)
      }
    } catch (err) {
      console.error('Error fetching diagnosis data:', err)
      setError('Det oppstod en feil ved henting av data.')
    } finally {
      setLoading(false)
    }
  }, [period, customStartDate, customEndDate])

  const environmentData = useMemo(() => (data ? filterByEnvironment(data, environment) : []), [data, environment])

  const filteredData = useMemo(() => filterByTab(environmentData, activeTab), [environmentData, activeTab])

  const sortedData = useMemo(() => sortDiagnosisData(filteredData, sort), [filteredData, sort])

  const totalWebsites = environmentData.length
  const activeWebsites = environmentData.filter((d) => d.last_event_at).length
  const inactiveWebsites = environmentData.filter((d) => !d.last_event_at).length

  const highlightedWebsite =
    selectedWebsiteFilter && environmentData
      ? environmentData.find((row) => row.website_id === selectedWebsiteFilter.id)
      : null

  const handleExplore = async (website: DiagnosisData) => {
    setSelectedWebsite(website)
    setIsModalOpen(true)
    setHistoryLoading(true)
    setHistoryData(null)
    setAbsoluteLastEvent(null)
    setHistoryQueryStats(null)

    try {
      const parsed = await fetchDiagnosisHistory(website.website_id)
      setHistoryData(parsed.history ?? [])
      setAbsoluteLastEvent(parsed.lastEventAt ?? null)
      setHistoryQueryStats(parsed.queryStats ?? null)
    } catch (err) {
      console.error('Error fetching history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  const chartData = useMemo(() => (historyData ? buildChartData(historyData) : null), [historyData])

  return {
    // Period
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,

    // Environment
    environment,
    setEnvironment,

    // Tabs & sort
    activeTab,
    setActiveTab,
    sort,
    handleSort,

    // Website filter
    selectedWebsiteFilter,
    setSelectedWebsiteFilter,

    // Main data
    data,
    loading,
    error,
    queryStats,
    sortedData,
    totalWebsites,
    activeWebsites,
    inactiveWebsites,
    highlightedWebsite,

    // Deep diagnosis modal
    selectedWebsite,
    historyLoading,
    absoluteLastEvent,
    isModalOpen,
    setIsModalOpen,
    historyQueryStats,
    chartData,
    handleExplore,
    fetchData,
  }
}
