import type { GoalStep } from '../model/types'
import { normalizeUrlToPath, normalizeUrlQuery } from '../../../shared/lib/utils'

const decodeParamToken = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const encodeParamToken = (value: string): string => encodeURIComponent(value)

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

function parseGoalStepParam(param: string): GoalStep | null {
  if (param.startsWith('url:')) {
    const rawValue = decodeParamToken(param.substring(4))
    const { value, query } = splitGoalStepUrlInput(rawValue)
    return { type: 'url', value, query }
  }

  if (param.startsWith('event:')) {
    const parts = param.split('|')
    const eventName = decodeParamToken(parts[0].substring(6)).trim()
    if (!eventName) return null

    let urlPath: string | undefined
    let urlQuery: string | undefined
    const parsedParams: NonNullable<GoalStep['params']> = []

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      if (part.startsWith('url:')) {
        const rawUrl = decodeParamToken(part.substring(4))
        const parsedUrl = splitGoalStepUrlInput(rawUrl)
        urlPath = parsedUrl.value || undefined
        urlQuery = parsedUrl.query || undefined
      } else if (part.startsWith('param:')) {
        const payload = part.substring(6)
        const [encodedKey = '', operator = 'equals', ...encodedValueParts] = payload.split(':')
        const key = decodeParamToken(encodedKey).trim()
        const rawOperator = decodeParamToken(operator)
        const value = decodeParamToken(encodedValueParts.join(':')).trim()
        if (!key || !value) continue

        parsedParams.push({
          key,
          operator: rawOperator === 'contains' ? 'contains' : 'equals',
          value,
        })
      }
    }

    return {
      type: 'event',
      value: eventName,
      query: undefined,
      urlPath,
      urlQuery,
      params: parsedParams,
    }
  }

  return null
}

export function serializeGoalStep(step: GoalStep): string {
  const normalized = normalizeGoalStep(step)
  if (normalized.type === 'url') {
    return `url:${encodeParamToken(getGoalStepUrlDisplay(normalized))}`
  }

  const parts = [`event:${encodeParamToken(normalized.value)}`]
  const eventUrl = getGoalStepUrlDisplay({ value: normalized.urlPath ?? '', query: normalized.urlQuery ?? '' })
  if (eventUrl) {
    parts.push(`url:${encodeParamToken(eventUrl)}`)
  }

  for (const param of normalized.params ?? []) {
    parts.push(
      `param:${encodeParamToken(param.key)}:${encodeParamToken(param.operator)}:${encodeParamToken(param.value)}`,
    )
  }

  return parts.join('|')
}

export function parseGoalStepsFromParams(searchParams: URLSearchParams): { startStep: GoalStep; goalStep: GoalStep } {
  const parsedStart = parseGoalStepParam(searchParams.get('startStep') || '')
  const parsedGoal = parseGoalStepParam(searchParams.get('goalStep') || '')
  if (parsedStart || parsedGoal) {
    return {
      startStep: parsedStart ?? createDefaultStartStep(),
      goalStep: parsedGoal ?? createDefaultGoalStep(),
    }
  }

  const legacyStart = splitGoalStepUrlInput(searchParams.get('startUrl') || '')
  const legacyGoal = splitGoalStepUrlInput(searchParams.get('goalUrl') || '')
  if (legacyStart.value || legacyGoal.value) {
    return {
      startStep: legacyStart.value
        ? { type: 'url', value: legacyStart.value, query: legacyStart.query }
        : createDefaultStartStep(),
      goalStep: legacyGoal.value
        ? { type: 'url', value: legacyGoal.value, query: legacyGoal.query }
        : createDefaultGoalStep(),
    }
  }

  const urlPathFallback = searchParams.get('urlPath') || searchParams.get('pagePath') || ''
  const fallbackStart = splitGoalStepUrlInput(urlPathFallback)

  return {
    startStep: urlPathFallback
      ? { type: 'url', value: fallbackStart.value, query: fallbackStart.query }
      : createDefaultStartStep(),
    goalStep: createDefaultGoalStep(),
  }
}
