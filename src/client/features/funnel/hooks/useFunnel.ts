import { useState, useEffect, useEffectEvent, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { Events, type KopierLenkeProperties } from '@navikt/analytics-types'
import { trackEvent } from '../../../shared/lib/trackEvent'
import type { FunnelStep, FunnelResultRow, TimingResultRow, QueryStats } from '../model/types'
import type { Website } from '../../../shared/types/chart'
import { getDateRangeFromPeriod, getStoredPeriod, savePeriodPreference } from '../../../shared/lib/utils'
import { fetchFunnelData, fetchTimingData as fetchTimingDataApi, fetchWebsiteEvents } from '../api/funnelApi'
import { parseStepsFromParams, serializeStep } from '../utils/stepUtils'

const normalizeGeneratedSql = (sql: string): string =>
  sql
    .replace(/umami\.public_website_event/gi, 'umami_views.event')
    .replace(/umami\.public_session/gi, 'umami_views.session')

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
  canFetch: boolean
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

  const [steps, setStepsState] = useState<FunnelStep[]>(() =>
    parseStepsFromParams(searchParams).map((step) => ({ ...step, id: crypto.randomUUID() })),
  )
  const setSteps = (nextSteps: FunnelStep[]) => {
    setStepsState(nextSteps.map((step) => (step.id ? step : { ...step, id: crypto.randomUUID() })))
  }

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
  const [activeTab, setActiveTabState] = useState<string>(() => {
    const view = searchParams.get('view')
    return view && ['vertical', 'horizontal', 'visual', 'table', 'timing'].includes(view) ? view : 'vertical'
  })
  const setActiveTab = (view: string) => {
    setActiveTabState(view)
    const params = new URLSearchParams(window.location.search)
    params.set('view', view)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }
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
  const [modalSql, setModalSql] = useState<string | null>(null)
  const [selectedTableUrl, setSelectedTableUrl] = useState<string | null>(null)
  const [selectedTimingUrl, setSelectedTimingUrl] = useState<string | null>(null)
  const configurationVersion = useRef(0)
  const funnelRequest = useRef<AbortController | null>(null)
  const timingRequest = useRef<AbortController | null>(null)
  const automaticRefreshReady = useRef(false)

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
    if (!selectedWebsite || funnelRequest.current) return
    const version = configurationVersion.current
    const controller = new AbortController()
    funnelRequest.current = controller

    setHasAttemptedFetch(true)
    setLoading(true)
    setError(null)
    setFunnelData([])
    setFunnelSql(null)
    setFunnelQueryStats(null)

    try {
      const result = await fetchFunnelData({
        websiteId: selectedWebsite.id,
        steps,
        period,
        customStartDate,
        customEndDate,
        onlyDirectEntry,
        signal: controller.signal,
      })

      if (controller.signal.aborted || version !== configurationVersion.current) return

      if (result.error) {
        setError(result.error)
        setFunnelData([])
      } else {
        automaticRefreshReady.current = true
        setFunnelData(result.data)
        setFunnelQueryStats(result.queryStats)
        setFunnelSql(result.sql ? normalizeGeneratedSql(result.sql) : null)

        if (result.shareParams) {
          window.history.replaceState({}, '', `${window.location.pathname}?${result.shareParams.toString()}`)
        }
      }
    } finally {
      if (funnelRequest.current === controller) {
        funnelRequest.current = null
        setLoading(false)
      }
    }
  }, [customEndDate, customStartDate, onlyDirectEntry, period, selectedWebsite, steps])

  const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
  const hasValidSteps =
    steps.length >= 2 &&
    steps.every(
      (step) =>
        step.value.trim() &&
        (step.type !== 'event' || (step.params ?? []).every((param) => param.key.trim() && param.value.trim())),
    )
  const canFetch = Boolean(
    selectedWebsite && hasValidSteps && dateRange && dateRange.endDate >= dateRange.startDate && !loading,
  )

  useEffect(() => {
    configurationVersion.current += 1
    funnelRequest.current?.abort()
    timingRequest.current?.abort()
    funnelRequest.current = null
    timingRequest.current = null
    setLoading(false)
    setTimingLoading(false)
    setFunnelData([])
    setFunnelSql(null)
    setFunnelQueryStats(null)
    setError(null)
    setHasAttemptedFetch(false)
    setModalSql(null)
    setTimingData([])
    setShowTiming(false)
    setTimingQueryStats(null)
    setTimingError(null)
    setTimingSql(null)
    return () => {
      configurationVersion.current += 1
      funnelRequest.current?.abort()
      timingRequest.current?.abort()
      funnelRequest.current = null
      timingRequest.current = null
    }
  }, [customEndDate, customStartDate, onlyDirectEntry, period, selectedWebsite, steps])

  useEffect(() => {
    automaticRefreshReady.current = false
  }, [selectedWebsite, steps])

  const refreshAfterFilterChange = useEffectEvent(() => {
    if (
      automaticRefreshReady.current &&
      selectedWebsite &&
      hasValidSteps &&
      dateRange &&
      dateRange.endDate >= dateRange.startDate
    ) {
      void fetchData()
    }
  })

  useEffect(() => {
    refreshAfterFilterChange()
  }, [customEndDate, customStartDate, onlyDirectEntry, period])

  const copyShareLink = async () => {
    try {
      const url = new URL(window.location.href)
      if (selectedWebsite) url.searchParams.set('websiteId', selectedWebsite.id)
      url.searchParams.set('period', period)
      url.searchParams.set('strict', String(onlyDirectEntry))
      url.searchParams.set('view', activeTab)
      url.searchParams.delete('step')
      steps.forEach((step) => url.searchParams.append('step', serializeStep(step)))
      url.searchParams.delete('from')
      url.searchParams.delete('to')
      if (period === 'custom' && customStartDate && customEndDate) {
        url.searchParams.set('from', customStartDate.toISOString())
        url.searchParams.set('to', customEndDate.toISOString())
      }
      await navigator.clipboard.writeText(url.toString())
      const properties: KopierLenkeProperties = { seksjon: 'funnel' }
      trackEvent(Events.KOPIER_LENKE, properties)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const fetchTiming = async () => {
    if (!selectedWebsite || funnelData.length === 0 || timingRequest.current) return
    const controller = new AbortController()
    timingRequest.current = controller

    setTimingLoading(true)
    setTimingError(null)
    setTimingSql(null)

    const version = configurationVersion.current
    try {
      const result = await fetchTimingDataApi({
        websiteId: selectedWebsite.id,
        steps,
        period,
        customStartDate,
        customEndDate,
        onlyDirectEntry,
        signal: controller.signal,
      })

      if (controller.signal.aborted || version !== configurationVersion.current) return

      if (result.error) {
        setTimingError(result.error)
        setTimingData([])
        setTimingQueryStats(null)
        setTimingSql(null)
      } else {
        setTimingData(result.data)
        setTimingQueryStats(result.queryStats)
        setTimingSql(result.sql ? normalizeGeneratedSql(result.sql) : null)
        setShowTiming(true)
      }
    } finally {
      if (timingRequest.current === controller) {
        timingRequest.current = null
        setTimingLoading(false)
      }
    }
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
    canFetch,
    fetchTiming,
    copyShareLink,
    setCopySuccess,
    setMetabaseCopySuccess,
    setTimingMetabaseCopySuccess,
  }
}
