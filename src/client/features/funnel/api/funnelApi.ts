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
import { serializeStep, splitUrlStepInput } from '../utils/stepUtils'

export const FUNNEL_REQUEST_TIMEOUT_MS = 120000

async function requestFunnelJson<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(
    () => controller.abort(new DOMException('Forespørselen tok for lang tid.', 'TimeoutError')),
    FUNNEL_REQUEST_TIMEOUT_MS,
  )
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      if (response.status === 401) throw new Error('Du må logge inn på nytt. Traktoppsettet er beholdt.')
      if (response.status === 403) throw new Error('Du har ikke tilgang til å hente disse dataene.')
      const fallbackMessage = `Kunne ikke hente data (${response.status}). Prøv igjen.`
      let message = fallbackMessage
      try {
        const payload: unknown = await response.json()
        if (isErrorResponse(payload)) message = payload.error
      } catch {
        message = fallbackMessage
      }
      throw new Error(message)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

const getFetchError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'TimeoutError') {
    return 'Hentingen tok for lang tid. Prøv igjen eller velg en kortere periode.'
  }
  return error instanceof Error && error.name !== 'TypeError'
    ? error.message
    : 'Kunne ikke hente data. Sjekk nettforbindelsen og prøv igjen.'
}

const normalizeGeneratedSql = (sql: string): string =>
  sql
    .replace(/umami\.public_website_event/gi, 'umami_views.event')
    .replace(/umami\.public_session/gi, 'umami_views.session')

export interface FetchFunnelParams {
  websiteId: string
  steps: FunnelStep[]
  period: string
  customStartDate?: Date
  customEndDate?: Date
  onlyDirectEntry: boolean
  signal?: AbortSignal
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

  const normalizedSteps = steps.map((s) =>
    s.type === 'url' ? { ...s, ...splitUrlStepInput(s.value, s.query ?? '') } : s,
  )

  if (
    normalizedSteps.length < 2 ||
    normalizedSteps.some(
      (step) =>
        !step.value.trim() ||
        (step.type === 'event' && (step.params ?? []).some((param) => !param.key.trim() || !param.value.trim())),
    )
  ) {
    return {
      data: [],
      sql: null,
      queryStats: null,
      shareParams: null,
      error: 'Fyll ut minst to steg og alle hendelsesfiltrene.',
    }
  }

  const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
  if (!dateRange || dateRange.endDate < dateRange.startDate) {
    return { data: [], sql: null, queryStats: null, shareParams: null, error: 'Vennligst velg en gyldig periode.' }
  }
  const { startDate, endDate } = dateRange

  try {
    const data = await requestFunnelJson<FunnelApiResponse>(
      '/api/bigquery/funnel',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteId,
          steps: normalizedSteps.map(({ type, value, query, eventScope, params }) => ({
            type,
            value,
            query,
            eventScope,
            params,
          })),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          onlyDirectEntry,
        }),
      },
      params.signal,
    )

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
    newParams.set('websiteId', websiteId)
    newParams.set('period', period)
    newParams.set('strict', String(onlyDirectEntry))
    newParams.delete('from')
    newParams.delete('to')
    if (period === 'custom' && customStartDate && customEndDate) {
      newParams.set('from', customStartDate.toISOString())
      newParams.set('to', customEndDate.toISOString())
    }
    newParams.delete('step')
    normalizedSteps.forEach((step) => {
      newParams.append('step', serializeStep(step))
    })

    return {
      data: mergedData,
      sql: data.sql ? normalizeGeneratedSql(data.sql) : null,
      queryStats: data.queryStats ?? null,
      shareParams: newParams,
      error: null,
    }
  } catch (error: unknown) {
    return {
      data: [],
      sql: null,
      queryStats: null,
      shareParams: null,
      error: getFetchError(error),
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
  signal?: AbortSignal
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
    const data = await requestFunnelJson<TimingApiResponse>(
      '/api/bigquery/funnel-timing',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteId,
          steps: normalizedSteps.map(({ type, value, query, eventScope, params }) => ({
            type,
            value,
            query,
            eventScope,
            params,
          })),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          onlyDirectEntry,
        }),
      },
      params.signal,
    )

    if ('error' in data) {
      return { data: [], sql: null, queryStats: null, error: data.error }
    }

    return {
      data: data.data,
      sql: data.sql ? normalizeGeneratedSql(data.sql) : null,
      queryStats: data.queryStats ?? null,
      error: null,
    }
  } catch (error: unknown) {
    return { data: [], sql: null, queryStats: null, error: getFetchError(error) }
  }
}

export async function fetchWebsiteEvents(websiteId: string, urlPath?: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      startAt: String(Date.now() - 30 * 24 * 60 * 60 * 1000),
    })
    if (urlPath?.trim()) {
      params.set('urlPath', urlPath.trim())
    }
    const response = await fetch(`/api/bigquery/websites/${websiteId}/events?${params.toString()}`)
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
