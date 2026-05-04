// UI Components
export { default as Retention } from './ui/Retention'
export { default as RetentionStatsCards } from './ui/RetentionStatsCards'

// Types
export type { RetentionRow, QueryStats, RetentionStats } from './model/types'

// Hooks
export { useRetention } from './hooks/useRetention'
export type { RetentionState } from './hooks/useRetention'

// API
export { fetchRetentionData } from './api/retentionApi'
export type { FetchRetentionParams, FetchRetentionResult } from './api/retentionApi'

// Utils
export {
  getRetentionDateRange,
  buildChartData,
  computeRetentionStats,
  downloadRetentionCSV,
  buildShareParams,
  copyShareLink,
} from './utils/retentionUtils'
