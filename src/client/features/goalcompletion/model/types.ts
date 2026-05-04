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

export type GoalStepParam = {
  key: string
  value: string
  operator: 'equals' | 'contains'
}

export type GoalStep = {
  type: 'url' | 'event'
  value: string
  query?: string
  urlPath?: string
  urlQuery?: string
  params?: GoalStepParam[]
}

export type { QueryStats } from '../../../shared/types/queryStats'
