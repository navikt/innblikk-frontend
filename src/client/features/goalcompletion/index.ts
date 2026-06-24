export { default as GoalCompletion } from './ui/GoalCompletion'
export { default as GoalCompletionStatsCards } from './ui/GoalCompletionStatsCards'

export type { GoalCompletionRow, GoalCompletionSummary, QueryStats } from './model/types'

export { useGoalCompletion } from './hooks/useGoalCompletion'
export type { GoalCompletionState } from './hooks/useGoalCompletion'

export { fetchGoalCompletionData } from './api/goalCompletionApi'
export type { FetchGoalCompletionParams, FetchGoalCompletionResult } from './api/goalCompletionApi'

export { getGoalCompletionDateRange, buildGoalCompletionChartData } from './utils/goalCompletionUtils'
export { getGoalCompletionSqlTemplate } from './utils/goalCompletionDashboardSql.ts'
