import type { RetentionRow, QueryStats } from '../model/types'
import { normalizeUrlToPath, getCookieCountByParams } from '../../../shared/lib/utils'

export interface FetchRetentionParams {
  websiteId: string
  startDate: Date
  endDate: Date
  urlPath: string
  pathOperator: string
  returnScope: 'same_url' | 'site'
  usesCookies: boolean
  cookieStartDate: Date | null
}

export interface FetchRetentionResult {
  data: RetentionRow[]
  queryStats: QueryStats | null
  sameDayReturningUsers: number | null
  nonReturningUsers: number | null
  error: string | null
}

export async function fetchRetentionData(params: FetchRetentionParams): Promise<FetchRetentionResult> {
  const { websiteId, startDate, endDate, urlPath, pathOperator, returnScope, usesCookies, cookieStartDate } = params

  const normalizedUrl = normalizeUrlToPath(urlPath)

  const { countBy, countBySwitchAt } = getCookieCountByParams(usesCookies, cookieStartDate, startDate, endDate)

  try {
    const response = await fetch('/api/bigquery/retention', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        websiteId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        urlPath: normalizedUrl,
        pathOperator,
        returnScope,
        countBy,
        countBySwitchAt,
      }),
    })

    if (!response.ok) {
      return {
        data: [],
        queryStats: null,
        sameDayReturningUsers: null,
        nonReturningUsers: null,
        error: 'Kunne ikke hente retensjonsdata',
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result: {
      error?: string
      data?: RetentionRow[]
      queryStats?: QueryStats
      sameDayReturningUsers?: number
      nonReturningUsers?: number
    } = await response.json()
    console.log('Retention data received:', result)

    if (result.error) {
      return { data: [], queryStats: null, sameDayReturningUsers: null, nonReturningUsers: null, error: result.error }
    }

    return {
      data: result.data ?? [],
      queryStats: result.queryStats ?? null,
      sameDayReturningUsers: result.sameDayReturningUsers ?? null,
      nonReturningUsers: result.nonReturningUsers ?? null,
      error: null,
    }
  } catch (err) {
    console.error('Error fetching retention data:', err)
    return {
      data: [],
      queryStats: null,
      sameDayReturningUsers: null,
      nonReturningUsers: null,
      error: 'Det oppstod en feil ved henting av data.',
    }
  }
}
