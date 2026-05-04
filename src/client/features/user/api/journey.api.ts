import type { JourneyApiRequest, JourneyApiResponse } from '../model/journey.types'

export async function fetchUserJourneys(request: JourneyApiRequest): Promise<JourneyApiResponse> {
  const response = await fetch('/api/bigquery/journeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user journeys: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text()
    throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`)
  }

  return await response.json()
}
