import { requestJson } from '../../../shared/lib/apiClient.ts'

/**
 * Distinct-value suggestions for cohort conditions, from
 * GET /api/bigquery/websites/:id/column-values (see columnValuesRoutes.js).
 * Columns mirror the cohort FIELDS list; `key` scopes event_data_value to
 * one event-data key.
 */
export type SuggestibleColumn =
  | 'url_path'
  | 'referrer_domain'
  | 'browser'
  | 'os'
  | 'device'
  | 'country'
  | 'event_name'
  | 'event_data_key'
  | 'event_data_value'

export interface ColumnValuesResponse {
  values: string[]
  /** How far back the server actually scanned (30/14/7) after its cost ladder. */
  scannedDays: number
}

export async function fetchColumnValues(
  websiteId: string,
  column: SuggestibleColumn,
  key?: string,
  eventName?: string,
): Promise<ColumnValuesResponse> {
  const params = new URLSearchParams({ column })
  if (key) params.set('key', key)
  if (eventName) params.set('eventName', eventName)
  return requestJson<ColumnValuesResponse>(
    `/api/bigquery/websites/${encodeURIComponent(websiteId)}/column-values?${params}`,
  )
}
