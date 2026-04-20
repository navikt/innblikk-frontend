import type { GoalCompletionRow, GoalCompletionSummary, GoalStep, QueryStats } from '../model/types'
import { normalizeUrlToPath, getCookieCountByParams } from '../../../shared/lib/utils'
import { normalizeGoalStep } from '../utils/goalStepUtils'

export interface FetchGoalCompletionParams {
  websiteId: string
  startDate: Date
  endDate: Date
  startStep: GoalStep
  goalStep: GoalStep
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
  const { websiteId, startDate, endDate, startStep, goalStep, usesCookies, cookieStartDate } = params

  const normalizedStartStep = normalizeGoalStep(startStep)
  const normalizedGoalStep = normalizeGoalStep(goalStep)
  const { countBy, countBySwitchAt } = getCookieCountByParams(usesCookies, cookieStartDate, startDate, endDate)

  const emptySummary: GoalCompletionSummary = {
    totalStarters: 0,
    totalCompleted: 0,
    sameDayCompleted: 0,
    nonCompleted: 0,
  }

  if (
    (normalizedStartStep.type === 'url' && !normalizeUrlToPath(normalizedStartStep.value)) ||
    (normalizedGoalStep.type === 'url' && !normalizeUrlToPath(normalizedGoalStep.value)) ||
    (normalizedStartStep.type === 'event' && !normalizedStartStep.value) ||
    (normalizedGoalStep.type === 'event' && !normalizedGoalStep.value)
  ) {
    return { data: [], summary: emptySummary, queryStats: null, error: 'Vennligst velg både startsteg og målsteg.' }
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
        startStep: normalizedStartStep,
        goalStep: normalizedGoalStep,
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
