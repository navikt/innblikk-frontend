import type { FunnelStep, StepParam } from '../model/types'
import { normalizeUrlToPath } from '../../../shared/lib/utils'

const decodeParamToken = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Parse funnel steps from URL search params.
 */
export function parseStepsFromParams(searchParams: URLSearchParams): FunnelStep[] {
  const stepParams = searchParams.getAll('step')
  if (stepParams.length === 0)
    return [
      { type: 'url', value: '' },
      { type: 'url', value: '' },
    ]

  return stepParams.map((param) => {
    if (param.startsWith('event:')) {
      // Format: event:name|scope|param:key=value|...
      const parts = param.split('|')
      const eventName = decodeParamToken(parts[0].substring(6))

      let scope: 'current-path' | 'anywhere' = 'current-path'
      const params: StepParam[] = []

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i]
        if (part === 'current-path' || part === 'anywhere') {
          scope = part
        } else if (part.startsWith('param:')) {
          const [key, ...valParts] = part.substring(6).split('=')
          const decodedKey = decodeParamToken(key)
          const decodedValue = decodeParamToken(valParts.join('='))
          if (decodedKey && decodedValue) {
            params.push({ key: decodedKey, value: decodedValue, operator: 'equals' })
          }
        }
      }

      return {
        type: 'event' as const,
        value: eventName,
        eventScope: scope,
        params,
      }
    }
    return { type: 'url' as const, value: param }
  })
}

/**
 * Add a new empty step.
 */
export function addStep(steps: FunnelStep[]): FunnelStep[] {
  return [...steps, { type: 'url', value: '', eventScope: 'current-path' }]
}

/**
 * Remove a step by index (keeps minimum 2 steps).
 */
export function removeStep(steps: FunnelStep[], index: number): FunnelStep[] {
  if (steps.length <= 2) return steps
  return steps.filter((_, i) => i !== index)
}

/**
 * Update a step's value.
 */
export function updateStepValue(steps: FunnelStep[], index: number, value: string): FunnelStep[] {
  const newSteps = [...steps]
  newSteps[index] = { ...newSteps[index], value }
  return newSteps
}

/**
 * Update a step's type (clears value on type change).
 */
export function updateStepType(steps: FunnelStep[], index: number, type: 'url' | 'event'): FunnelStep[] {
  const newSteps = [...steps]
  newSteps[index] = {
    ...newSteps[index],
    type,
    value: '',
    ...(type === 'event' ? { eventScope: index === 0 ? 'anywhere' : 'current-path' } : {}),
  }
  return newSteps
}

/**
 * Update a step's event scope.
 */
export function updateStepEventScope(
  steps: FunnelStep[],
  index: number,
  scope: 'current-path' | 'anywhere',
): FunnelStep[] {
  const newSteps = [...steps]
  newSteps[index] = { ...newSteps[index], eventScope: scope }
  return newSteps
}

/**
 * Add a parameter filter to a step.
 */
export function addStepParam(steps: FunnelStep[], index: number): FunnelStep[] {
  const newSteps = [...steps]
  const params = [...(newSteps[index].params || []), { key: '', operator: 'equals' as const, value: '' }]
  newSteps[index] = { ...newSteps[index], params }
  return newSteps
}

/**
 * Remove a parameter filter from a step.
 */
export function removeStepParam(steps: FunnelStep[], stepIndex: number, paramIndex: number): FunnelStep[] {
  const newSteps = [...steps]
  const currentParams = newSteps[stepIndex].params
  if (currentParams) {
    const params = currentParams.filter((_, i) => i !== paramIndex)
    newSteps[stepIndex] = { ...newSteps[stepIndex], params }
  }
  return newSteps
}

/**
 * Update a parameter filter field on a step.
 */
export function updateStepParam(
  steps: FunnelStep[],
  stepIndex: number,
  paramIndex: number,
  field: 'key' | 'value' | 'operator',
  val: string,
): FunnelStep[] {
  const newSteps = [...steps]
  if (newSteps[stepIndex].params && newSteps[stepIndex].params[paramIndex]) {
    const params = [...newSteps[stepIndex].params]
    params[paramIndex] = { ...params[paramIndex], [field]: val }
    newSteps[stepIndex] = { ...newSteps[stepIndex], params }
  }
  return newSteps
}

/**
 * Normalize a step's URL value on blur.
 */
export function normalizeStepUrl(value: string): string {
  return value.trim() ? normalizeUrlToPath(value) : value
}
