import type { GoalStep } from '../model/types'
import { normalizeUrlToPath, normalizeUrlQuery } from '../../../shared/lib/utils'

export function createDefaultStartStep(): GoalStep {
  return { type: 'url', value: '', query: '' }
}

export function createDefaultGoalStep(): GoalStep {
  return { type: 'url', value: '', query: '' }
}

export function splitGoalStepUrlInput(value: string, query = ''): { value: string; query: string } {
  if (!value.trim()) return { value: '', query: normalizeUrlQuery(query) }

  const trimmed = value.trim()
  const queryIndex = trimmed.indexOf('?')
  const rawPath = queryIndex === -1 ? trimmed : trimmed.substring(0, queryIndex)
  const rawQuery = query.trim() ? query : queryIndex === -1 ? '' : trimmed.substring(queryIndex + 1)

  return {
    value: normalizeUrlToPath(rawPath),
    query: normalizeUrlQuery(rawQuery),
  }
}

export function normalizeGoalStep(step: GoalStep): GoalStep {
  if (step.type === 'url') {
    const { value, query } = splitGoalStepUrlInput(step.value, step.query ?? '')
    return { ...step, value, query, urlPath: undefined, urlQuery: undefined, params: [] }
  }

  const normalizedEventUrl = splitGoalStepUrlInput(step.urlPath ?? '', step.urlQuery ?? '')
  const normalizedParams =
    step.params
      ?.filter((param) => param.key.trim() !== '' && param.value.trim() !== '')
      .map((param) => ({
        key: param.key.trim(),
        value: param.value.trim(),
        operator: param.operator,
      })) ?? []

  return {
    ...step,
    value: step.value.trim(),
    query: undefined,
    urlPath: normalizedEventUrl.value || undefined,
    urlQuery: normalizedEventUrl.query || undefined,
    params: normalizedParams,
  }
}

export function getGoalStepUrlDisplay(step: Pick<GoalStep, 'value' | 'query'>): string {
  const path = normalizeUrlToPath(step.value)
  const query = normalizeUrlQuery(step.query ?? '')
  return query ? `${path}?${query}` : path
}

export function parseGoalStepsFromParams(searchParams: URLSearchParams): { startStep: GoalStep; goalStep: GoalStep } {
  const urlPathFallback = searchParams.get('urlPath') || searchParams.get('pagePath') || ''
  const fallbackStart = splitGoalStepUrlInput(urlPathFallback)

  return {
    startStep: urlPathFallback
      ? { type: 'url', value: fallbackStart.value, query: fallbackStart.query }
      : createDefaultStartStep(),
    goalStep: createDefaultGoalStep(),
  }
}
