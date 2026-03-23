import type { QueryStats } from '../../../shared/types/queryStats'

export type ParsedStepDetail = {
  key: string
  value: string
}

export type ParsedJourneyStep = {
  eventName: string
  details: ParsedStepDetail[]
}

export type JourneyStats = {
  total_sessions?: number
  sessions_with_events?: number
  sessions_no_events_navigated?: number
  sessions_no_events_bounced?: number
}

export type { QueryStats }

export type EventJourneyResponse = {
  journeys?: { path: string[]; count: number }[]
  journeyStats?: JourneyStats
  queryStats?: QueryStats
}
