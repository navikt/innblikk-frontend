import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseISO } from 'date-fns'
import type { FunnelStep, FunnelResultRow, TimingResultRow, QueryStats } from '../model/types'
import type { Website } from '../../../shared/types/chart'
import { getStoredPeriod, savePeriodPreference } from '../../../shared/lib/utils'
import { fetchFunnelData, fetchTimingData as fetchTimingDataApi, fetchWebsiteEvents } from '../api/funnelApi'
import { parseStepsFromParams } from '../utils/stepUtils'

export interface FunnelState {
  // Website
  selectedWebsite: Website | null
  setSelectedWebsite: (w: Website | null) => void

  // Steps
  steps: FunnelStep[]
  setSteps: (s: FunnelStep[]) => void

  // Panel toggle
  isStepsOpen: boolean
  setIsStepsOpen: (v: boolean) => void

  // Period
  period: string
  setPeriod: (p: string) => void
  customStartDate: Date | undefined
  setCustomStartDate: (d: Date | undefined) => void
  customEndDate: Date | undefined
  setCustomEndDate: (d: Date | undefined) => void

  // Flow mode
  onlyDirectEntry: boolean
  setOnlyDirectEntry: (v: boolean) => void

  // Funnel data
  funnelData: FunnelResultRow[]
  loading: boolean
  error: string | null
  funnelSql: string | null
  funnelQueryStats: QueryStats | null
  hasAttemptedFetch: boolean

  // Timing data
  timingData: TimingResultRow[]
  timingLoading: boolean
  timingError: string | null
  showTiming: boolean
  timingQueryStats: QueryStats | null
  timingSql: string | null

  // Events
  availableEvents: string[]
  loadingEvents: boolean

  // Tab
  activeTab: string
  setActiveTab: (t: string) => void

  // Copy states
  copySuccess: boolean
  metabaseCopySuccess: boolean
  timingMetabaseCopySuccess: boolean

  // Modal
  modalSql: string | null
  setModalSql: (s: string | null) => void

  // Table action modals
  selectedTableUrl: string | null
  setSelectedTableUrl: (u: string | null) => void
  selectedTimingUrl: string | null
  setSelectedTimingUrl: (u: string | null) => void

  // Actions
  fetchData: () => Promise<void>
  fetchTiming: () => Promise<void>
  copyShareLink: () => Promise<void>
  setCopySuccess: (v: boolean) => void
  setMetabaseCopySuccess: (v: boolean) => void
  setTimingMetabaseCopySuccess: (v: boolean) => void
}

export function useFunnel(): FunnelState {
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [searchParams] = useSearchParams()
  const [isStepsOpen, setIsStepsOpen] = useState(true)

  const [steps, setSteps] = useState<FunnelStep[]>(() => parseStepsFromParams(searchParams))

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

  const [onlyDirectEntry, setOnlyDirectEntry] = useState<boolean>(() => {
    const param = searchParams.get('strict')
    return param === null ? true : param === 'true'
  })

  const [funnelData, setFunnelData] = useState<FunnelResultRow[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('vertical')
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false)

  const [timingData, setTimingData] = useState<TimingResultRow[]>([])
  const [timingLoading, setTimingLoading] = useState<boolean>(false)
  const [timingError, setTimingError] = useState<string | null>(null)
  const [showTiming, setShowTiming] = useState<boolean>(false)
  const [timingQueryStats, setTimingQueryStats] = useState<QueryStats | null>(null)
  const [timingSql, setTimingSql] = useState<string | null>(null)
  const [funnelSql, setFunnelSql] = useState<string | null>(null)
  const [funnelQueryStats, setFunnelQueryStats] = useState<QueryStats | null>(null)
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [metabaseCopySuccess, setMetabaseCopySuccess] = useState<boolean>(false)
  const [timingMetabaseCopySuccess, setTimingMetabaseCopySuccess] = useState<boolean>(false)
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState<boolean>(false)
  const [modalSql, setModalSql] = useState<string | null>(null)
  const [selectedTableUrl, setSelectedTableUrl] = useState<string | null>(null)
  const [selectedTimingUrl, setSelectedTimingUrl] = useState<string | null>(null)

  const [availableEvents, setAvailableEvents] = useState<string[]>([])
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false)

  // Fetch available events when website changes
  useEffect(() => {
    if (!selectedWebsite) return
    let cancelled = false
    const loadEvents = async () => {
      setLoadingEvents(true)
      const events = await fetchWebsiteEvents(selectedWebsite.id)
      if (!cancelled) {
        setAvailableEvents(events)
        setLoadingEvents(false)
      }
    }
    void loadEvents()
    return () => {
      cancelled = true
    }
  }, [selectedWebsite])

  const fetchData = useCallback(async () => {
    if (!selectedWebsite) return

    setHasAttemptedFetch(true)
    setLoading(true)
    setError(null)
    setFunnelData([])
    setFunnelSql(null)

    const result = await fetchFunnelData({
      websiteId: selectedWebsite.id,
      steps,
      period,
      customStartDate,
      customEndDate,
      onlyDirectEntry,
    })

    if (result.error) {
      setError(result.error)
      setFunnelData([])
    } else {
      setFunnelData(result.data)
      setFunnelQueryStats(result.queryStats)
      setFunnelSql(result.sql)

      if (result.shareParams) {
        window.history.replaceState({}, '', `${window.location.pathname}?${result.shareParams.toString()}`)
      }
    }

    setLoading(false)
  }, [customEndDate, customStartDate, onlyDirectEntry, period, selectedWebsite, steps])

  // Auto-submit when URL parameters are present (for shared links)
  useEffect(() => {
    const hasConfigParams = searchParams.has('period') || searchParams.has('strict') || searchParams.has('step')
    const stepsWithValues = steps.filter((s) => s.value.trim() !== '').length
    if (selectedWebsite && hasConfigParams && stepsWithValues >= 2 && !hasAutoSubmitted && !loading) {
      setHasAutoSubmitted(true)
      void fetchData()
    }
  }, [fetchData, hasAutoSubmitted, loading, searchParams, selectedWebsite, steps])

  // Reset timing state when funnel configuration changes.
  // Keep this effect scoped to config dependencies so timing results are not
  // immediately cleared after a successful fetch.
  useEffect(() => {
    setTimingData([])
    setShowTiming(false)
    setTimingQueryStats(null)
    setTimingError(null)
    setTimingSql(null)
  }, [customEndDate, customStartDate, onlyDirectEntry, period, selectedWebsite, steps])

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const fetchTiming = async () => {
    if (!selectedWebsite || funnelData.length === 0) return

    setTimingLoading(true)
    setTimingError(null)
    setTimingSql(null)

    const result = await fetchTimingDataApi({
      websiteId: selectedWebsite.id,
      steps,
      period,
      customStartDate,
      customEndDate,
      onlyDirectEntry,
    })

    if (result.error) {
      setTimingError(result.error)
      setTimingData([])
      setTimingQueryStats(null)
      setTimingSql(null)
    } else {
      setTimingData(result.data)
      setTimingQueryStats(result.queryStats)
      setTimingSql(result.sql)
      setShowTiming(true)
    }

    setTimingLoading(false)
  }

  return {
    selectedWebsite,
    setSelectedWebsite,
    steps,
    setSteps,
    isStepsOpen,
    setIsStepsOpen,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    onlyDirectEntry,
    setOnlyDirectEntry,
    funnelData,
    loading,
    error,
    funnelSql,
    funnelQueryStats,
    hasAttemptedFetch,
    timingData,
    timingLoading,
    timingError,
    showTiming,
    timingQueryStats,
    timingSql,
    availableEvents,
    loadingEvents,
    activeTab,
    setActiveTab,
    copySuccess,
    metabaseCopySuccess,
    timingMetabaseCopySuccess,
    modalSql,
    setModalSql,
    selectedTableUrl,
    setSelectedTableUrl,
    selectedTimingUrl,
    setSelectedTimingUrl,
    fetchData,
    fetchTiming,
    copyShareLink,
    setCopySuccess,
    setMetabaseCopySuccess,
    setTimingMetabaseCopySuccess,
  }
}
