import type { EventJourneyResponse } from '../model/types'

export interface FetchEventJourneysParams {
  websiteId: string
  urlPath: string
  startDate: string
  endDate: string
  minEvents?: number
}

export const fetchEventJourneys = async (params: FetchEventJourneysParams): Promise<EventJourneyResponse> => {
  const response = await fetch('/api/bigquery/event-journeys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      websiteId: params.websiteId,
      urlPath: params.urlPath,
      startDate: params.startDate,
      endDate: params.endDate,
      minEvents: params.minEvents ?? 1,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to fetch event journeys')
  }

  const result = (await response.json()) as EventJourneyResponse
  const normalizeGeneratedSql = (sql: string): string =>
    sql
      .replace(/umami\.public_website_event/gi, 'umami_views.event')
      .replace(/umami\.public_session/gi, 'umami_views.session')

  return result.generatedSql ? { ...result, generatedSql: normalizeGeneratedSql(result.generatedSql) } : result
}
