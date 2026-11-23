import type { Website } from '../types/website'

/**
 * Fetch the list of websites from the BigQuery websites endpoint.
 */
export async function fetchWebsites(): Promise<Website[]> {
  const response = await fetch('/api/bigquery/websites')
  const json = (await response.json()) as { data?: Website[]; error?: string }
  if (!response.ok) {
    throw new Error(
      json && typeof json.error === 'string' ? json.error : `Kunne ikke hente nettsteder (${response.status}).`,
    )
  }
  if (
    !json ||
    !Array.isArray(json.data) ||
    !json.data.every(
      (website) =>
        website &&
        typeof website.id === 'string' &&
        typeof website.name === 'string' &&
        typeof website.domain === 'string',
    )
  ) {
    throw new Error('Kunne ikke hente nettsteder: ugyldig svar fra serveren.')
  }
  return json.data
}
