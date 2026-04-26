import type { Website } from '../../../shared/types/website'
import type { QueryResult, QueryStats } from '../../sql/model/types'

export type SlotType = 'metric' | 'timeBucket' | 'groupBy' | 'period' | 'limit'

export type TokenOption = {
  id: string
  label: string
  value: string
  slot: SlotType
  hint?: string
}

export type SentenceState = Record<SlotType, string>

export type SentenceFilter = {
  id: string
  column:
    | 'event_name'
    | 'event_type'
    | 'event_id'
    | 'url_path'
    | 'url_query'
    | 'url_fullpath'
    | 'page_title'
    | 'referrer_domain'
    | 'referrer_path'
    | 'referrer_query'
    | 'referrer_fullpath'
    | 'referrer_fullurl'
    | 'country'
    | 'device'
    | 'os'
    | 'browser'
    | 'language'
    | 'screen'
    | 'session_id'
    | 'visit_id'
    | 'visit_duration'
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with'
  value: string
}

export type BuilderQueryConfig = {
  websiteId: string
  metric: string
  timeBucket: string
  groupBy: string
  period: string
  periodKey?: string
  customStartDate?: Date
  customEndDate?: Date
  limit: string
  filters?: SentenceFilter[]
}

export type DragSentenceState = {
  sentence: SentenceState
  draggingTokenId: string | null
}

export type BuilderResultState = {
  result: QueryResult | null
  queryStats: QueryStats | null
  error: string | null
  loading: boolean
  estimating: boolean
}

export type { Website }
