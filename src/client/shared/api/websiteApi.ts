import type { Website } from '../types/website'
import { requestJson } from '../lib/apiClient'

/**
 * Fetch the list of websites from the BigQuery websites endpoint.
 */
export async function fetchWebsites(): Promise<Website[]> {
  const payload = await requestJson<unknown>('/api/bigquery/websites')

  if (!payload || typeof payload !== 'object') {
    throw new Error('Ugyldig svar fra nettside-endepunkt')
  }

  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) {
    throw new Error('Klarte ikke hente nettsider: svarformat var ikke gyldig JSON-data')
  }

  return data as Website[]
}
