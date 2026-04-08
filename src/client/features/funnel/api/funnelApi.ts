import type {
  FunnelStep,
  QueryStats,
  FunnelApiResponse,
  FunnelResultRow,
  TimingResultRow,
  TimingApiResponse,
  EventsApiResponse,
} from '../model/types'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils'
import { getStepUrlDisplay, splitUrlStepInput } from '../utils/stepUtils'

export interface FetchFunnelParams {
  websiteId: string
  steps: FunnelStep[]
  period: string
  customStartDate?: Date
  customEndDate?: Date
  onlyDirectEntry: boolean
}

export interface FetchFunnelResult {
  data: FunnelResultRow[]
  sql: string | null
  queryStats: QueryStats | null
  shareParams: URLSearchParams | null
  error: string | null
}

export async function fetchFunnelData(params: FetchFunnelParams): Promise<FetchFunnelResult> {
  const { websiteId, steps, period, customStartDate, customEndDate, onlyDirectEntry } = params

  const normalizedSteps = steps
    .map((s) => (s.type === 'url' ? { ...s, ...splitUrlStepInput(s.value, s.query ?? '') } : s))
    .filter((s) => s.value.trim() !== '')

  if (normalizedSteps.length < 2) {
    return { data: [], sql: null, queryStats: null, shareParams: null, error: 'Du må legge inn minst to gyldige steg.' }
  }

  const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
  if (!dateRange) {
    return { data: [], sql: null, queryStats: null, shareParams: null, error: 'Vennligst velg en gyldig periode.' }
  }
  const { startDate, endDate } = dateRange

  try {
    const response = await fetch('/api/bigquery/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteId,
        steps: normalizedSteps,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        onlyDirectEntry,
      }),
    })

    if (!response.ok) {
      return { data: [], sql: null, queryStats: null, shareParams: null, error: 'Kunne ikke hente traktdata' }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data: FunnelApiResponse = await response.json()

    if ('error' in data) {
      return { data: [], sql: null, queryStats: null, shareParams: null, error: data.error }
    }

    const mergedData: FunnelResultRow[] = data.data.map((item) => {
      const stepConfig = normalizedSteps[item.step]
      return {
        ...item,
        params: stepConfig?.params,
      }
    })

    // Build share params
    const newParams = new URLSearchParams(window.location.search)
    newParams.set('period', period)
    newParams.set('strict', String(onlyDirectEntry))
    newParams.delete('step')
    normalizedSteps.forEach((step) => {
      let paramValue: string
      if (step.type === 'event') {
        paramValue = `event:${step.value}|${step.eventScope || 'current-path'}`
      } else {
        paramValue = `url:${getStepUrlDisplay(step)}`
      }
      newParams.append('step', paramValue)
    })

    return {
      data: mergedData,
      sql: data.sql ?? null,
      queryStats: data.queryStats ?? null,
      shareParams: newParams,
      error: null,
    }
  } catch {
    return {
      data: [],
      sql: null,
      queryStats: null,
      shareParams: null,
      error: 'Det oppstod en feil ved henting av data.',
    }
  }
}

export interface FetchTimingParams {
  websiteId: string
  steps: FunnelStep[]
  period: string
  customStartDate?: Date
  customEndDate?: Date
  onlyDirectEntry: boolean
}

export interface FetchTimingResult {
  data: TimingResultRow[]
  sql: string | null
  queryStats: QueryStats | null
  error: string | null
}

function isErrorResponse(data: unknown): data is { error: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error?: unknown }).error === 'string'
  )
}

export async function fetchTimingData(params: FetchTimingParams): Promise<FetchTimingResult> {
  const { websiteId, steps, period, customStartDate, customEndDate, onlyDirectEntry } = params

  const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
  if (!dateRange) {
    return { data: [], sql: null, queryStats: null, error: 'Vennligst velg en gyldig periode.' }
  }
  const { startDate, endDate } = dateRange

  const normalizedSteps = steps
    .map((s) => {
      if (s.type === 'url') {
        return { ...s, ...splitUrlStepInput(s.value, s.query ?? '') }
      }
      return s
    })
    .filter((s) => s.value.trim() !== '')

  try {
    const response = await fetch('/api/bigquery/funnel-timing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteId,
        steps: normalizedSteps,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        onlyDirectEntry,
      }),
    })

    if (!response.ok) {
      let errorMessage = 'Kunne ikke hente tidsdata'
      try {
        const errorData: unknown = await response.json()
        if (isErrorResponse(errorData)) {
          errorMessage = errorData.error
        }
      } catch {
        // no-op: keep default error message
      }
      return { data: [], sql: null, queryStats: null, error: errorMessage }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data: TimingApiResponse = await response.json()

    if ('error' in data) {
      return { data: [], sql: null, queryStats: null, error: data.error }
    }

    return {
      data: data.data,
      sql: data.sql ?? null,
      queryStats: data.queryStats ?? null,
      error: null,
    }
  } catch {
    return { data: [], sql: null, queryStats: null, error: 'Det oppstod en feil ved henting av tidsdata.' }
  }
}

export async function fetchWebsiteEvents(websiteId: string): Promise<string[]> {
  try {
    const response = await fetch(
      `/api/bigquery/websites/${websiteId}/events?startAt=${Date.now() - 30 * 24 * 60 * 60 * 1000}`,
    )
    if (response.ok) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data: EventsApiResponse = await response.json()
      if (data.events) {
        return data.events.map((e) => e.name).sort((a, b) => a.localeCompare(b))
      }
    }
  } catch {
    // silently fail
  }
  return []
}
