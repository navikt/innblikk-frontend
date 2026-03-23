import type { Filter, Metric, Website } from '../../../shared/types/chart.ts'
import { isRecord } from '../../../shared/lib/typeGuards'
export { isRecord }

export const safeParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export const isMetricArray = (value: unknown): value is Metric[] => {
  return Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.function === 'string')
}

export const isWebsiteLike = (value: unknown): value is Website => {
  return isRecord(value) && typeof value.id === 'string' && typeof value.domain === 'string'
}

export const isFilterLike = (value: unknown): value is Filter => {
  return isRecord(value) && typeof value.column === 'string' && typeof value.operator === 'string'
}

export const isFilterArray = (value: unknown): value is Filter[] => {
  return Array.isArray(value) && value.every(isFilterLike)
}
