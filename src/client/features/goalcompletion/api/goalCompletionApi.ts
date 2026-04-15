import type { GoalCompletionRow, GoalCompletionSummary, QueryStats } from '../model/types'
import { normalizeUrlToPath, getCookieCountByParams } from '../../../shared/lib/utils'

export interface FetchGoalCompletionParams {
  websiteId: string
  startDate: Date
  endDate: Date
  startUrl: string
  startPathOperator: string
  goalUrl: string
  goalPathOperator: string
  usesCookies: boolean
  cookieStartDate: Date | null
}

export interface FetchGoalCompletionResult {
  data: GoalCompletionRow[]
  summary: GoalCompletionSummary
  queryStats: QueryStats | null
  error: string | null
}

export async function fetchGoalCompletionData(params: FetchGoalCompletionParams): Promise<FetchGoalCompletionResult> {
  const {
    websiteId,
    startDate,
    endDate,
    startUrl,
    startPathOperator,
    goalUrl,
    goalPathOperator,
    usesCookies,
    cookieStartDate,
  } = params

  const normalizedStartUrl = normalizeUrlToPath(startUrl)
  const normalizedGoalUrl = normalizeUrlToPath(goalUrl)
  const { countBy, countBySwitchAt } = getCookieCountByParams(usesCookies, cookieStartDate, startDate, endDate)

  const emptySummary: GoalCompletionSummary = {
    totalStarters: 0,
    totalCompleted: 0,
    sameDayCompleted: 0,
    nonCompleted: 0,
  }

  try {
    const response = await fetch('/api/bigquery/goal-completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        websiteId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        startUrl: normalizedStartUrl,
        startPathOperator,
        goalUrl: normalizedGoalUrl,
        goalPathOperator,
        countBy,
        countBySwitchAt,
      }),
    })

    if (!response.ok) {
      return { data: [], summary: emptySummary, queryStats: null, error: 'Kunne ikke hente måloppnåelsesdata' }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result: {
      error?: string
      data?: GoalCompletionRow[]
      summary?: GoalCompletionSummary
      queryStats?: QueryStats
    } = await response.json()

    if (result.error) {
      return { data: [], summary: emptySummary, queryStats: null, error: result.error }
    }

    return {
      data: result.data ?? [],
      summary: result.summary ?? emptySummary,
      queryStats: result.queryStats ?? null,
      error: null,
    }
  } catch (err) {
    console.error('Error fetching goal completion data:', err)
    return { data: [], summary: emptySummary, queryStats: null, error: 'Det oppstod en feil ved henting av data.' }
  }
}
