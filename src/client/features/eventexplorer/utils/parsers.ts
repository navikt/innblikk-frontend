import type {
  SeriesPoint,
  EventProperty,
  ParameterValue,
  LatestEvent,
  QueryStats,
  EventsResponse,
  SeriesResponse,
  PropertiesResponse,
  ParameterValuesResponse,
  LatestEventsResponse,
} from '../model/types'
import { isRecord } from '../../../shared/lib/typeGuards'

// Type guards

export const isSeriesPoint = (value: unknown): value is SeriesPoint => {
  return isRecord(value) && typeof value.time === 'string' && typeof value.count === 'number'
}

export const isEventProperty = (value: unknown): value is EventProperty => {
  return isRecord(value) && typeof value.propertyName === 'string' && typeof value.total === 'number'
}

export const isParameterValue = (value: unknown): value is ParameterValue => {
  return isRecord(value) && typeof value.value === 'string' && typeof value.count === 'number'
}

export const isLatestEvent = (value: unknown): value is LatestEvent => {
  return (
    isRecord(value) &&
    typeof value.created_at === 'string' &&
    (!('properties' in value) || value.properties === undefined || isRecord(value.properties))
  )
}

// Response parsers
export const parseQueryStats = (value: unknown): QueryStats | null => {
  if (!isRecord(value)) return null
  const totalBytesProcessedGB =
    typeof value.totalBytesProcessedGB === 'number' ? value.totalBytesProcessedGB : undefined
  const estimatedCostUSD = typeof value.estimatedCostUSD === 'number' ? value.estimatedCostUSD : undefined
  return totalBytesProcessedGB !== undefined || estimatedCostUSD !== undefined
    ? { totalBytesProcessedGB, estimatedCostUSD }
    : null
}

export const parseEventsResponse = (value: unknown): EventsResponse => {
  if (!isRecord(value)) return {}
  const events = Array.isArray(value.events)
    ? value.events.filter((item) => isRecord(item) && typeof item.name === 'string' && typeof item.count === 'number')
    : undefined
  const queryStats = parseQueryStats(value.queryStats) ?? undefined
  const generatedSql = typeof value.generatedSql === 'string' ? value.generatedSql : undefined
  return { events, queryStats, generatedSql }
}

export const parseSeriesResponse = (value: unknown): SeriesResponse => {
  if (!isRecord(value)) return {}
  const data = Array.isArray(value.data) ? value.data.filter(isSeriesPoint) : undefined
  return { data }
}

export const parsePropertiesResponse = (value: unknown): PropertiesResponse => {
  if (!isRecord(value)) return {}
  const properties = Array.isArray(value.properties) ? value.properties.filter(isEventProperty) : undefined
  const gbProcessed =
    typeof value.gbProcessed === 'number' || typeof value.gbProcessed === 'string' ? value.gbProcessed : undefined
  return { properties, gbProcessed }
}

export const parseParameterValuesResponse = (value: unknown): ParameterValuesResponse => {
  if (!isRecord(value)) return {}
  const values = Array.isArray(value.values) ? value.values.filter(isParameterValue) : undefined
  const queryStats = parseQueryStats(value.queryStats) ?? undefined
  return { values, queryStats }
}

export const parseLatestEventsResponse = (value: unknown): LatestEventsResponse => {
  if (!isRecord(value)) return {}
  const events = Array.isArray(value.events) ? value.events.filter(isLatestEvent) : undefined
  return { events }
}
