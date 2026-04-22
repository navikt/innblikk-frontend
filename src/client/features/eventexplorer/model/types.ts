// Event Explorer Types
import type { QueryStats } from '../../../shared/types/queryStats'
export type { QueryStats }

export type SeriesPoint = {
  time: string
  count: number
}

export type EventProperty = {
  propertyName: string
  total: number
}

export type ParameterValue = {
  value: string
  count: number
}

export type LatestEvent = {
  created_at: string
  properties?: Record<string, string | undefined>
}

export type EventsResponse = {
  events?: { name: string; count: number }[]
  queryStats?: QueryStats
  generatedSql?: string
}

export type SeriesResponse = {
  data?: SeriesPoint[]
}

export type PropertiesResponse = {
  properties?: EventProperty[]
  gbProcessed?: number | string
}

export type ParameterValuesResponse = {
  values?: ParameterValue[]
  queryStats?: QueryStats
}

export type LatestEventsResponse = {
  events?: LatestEvent[]
}
