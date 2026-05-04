export type RetentionRow = {
  day: number
  percentage: number
  returning_users: number
}

export type { QueryStats } from '../../../shared/types/queryStats'

export type RetentionStats = {
  baseline: number
  sameDayReturningUsers: number
  nonReturningUsers: number
  day1: RetentionRow | undefined
  day7: RetentionRow | undefined
  lastDay: RetentionRow | undefined
}
