import type { Website } from '../types/website'

/**
 * Fetch the list of websites from the BigQuery websites endpoint.
 */
export async function fetchWebsites(): Promise<Website[]> {
  const response = await fetch('/api/bigquery/websites')
  const json = (await response.json()) as { data: Website[] }
  return json.data || []
}
