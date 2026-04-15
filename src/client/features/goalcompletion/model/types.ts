export type GoalCompletionRow = {
  day: number
  percentage: number
  completed_users: number
}

export type GoalCompletionSummary = {
  totalStarters: number
  totalCompleted: number
  sameDayCompleted: number
  nonCompleted: number
}

export type { QueryStats } from '../../../shared/types/queryStats'
