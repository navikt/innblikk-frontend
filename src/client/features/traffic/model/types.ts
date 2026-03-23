import type { QueryStats } from '../../../shared/types/queryStats'

export type SeriesPoint = {
  time: string
  count: number
}

export type PageMetricRow = {
  urlPath: string
  pageviews: number
  proportion: number
  visitors: number
}

export type BreakdownEntry = {
  name: string
  visitors: number
}

export type BreakdownData = {
  sources: BreakdownEntry[]
  exits: BreakdownEntry[]
}

export type ExternalReferrerRow = {
  name: string
  count: number
}

export type { QueryStats }

export type SeriesResponse = {
  data?: SeriesPoint[]
  totalCount?: number
  queryStats?: QueryStats
}

export type BreakdownResponse = {
  sources?: BreakdownEntry[]
  exits?: BreakdownEntry[]
}

export type PageMetricsResponse = {
  data?: PageMetricRow[]
}

export type ExternalReferrerResponse = {
  data?: {
    referrer?: ExternalReferrerRow[]
  }
}

export type MarketingRow = {
  name: string
  count: number
}

export type MarketingData = Record<string, MarketingRow[]>

export type Granularity = 'day' | 'week' | 'month' | 'hour'

export type DateRange = {
  startDate: Date
  endDate: Date
}
