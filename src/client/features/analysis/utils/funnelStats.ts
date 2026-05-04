import type { FunnelStatsStep } from '../model/types.ts'

export interface FunnelStatsResult {
  totalStarted: number
  totalCompleted: number
  dropoffCount: number
  completionRate: number
  dropoffRate: number
}

export const computeFunnelStats = (data: FunnelStatsStep[]): FunnelStatsResult | null => {
  if (!data || data.length === 0) return null

  const totalStarted = data[0].count
  const totalCompleted = data[data.length - 1].count
  const dropoffCount = totalStarted - totalCompleted
  const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0
  const dropoffRate = totalStarted > 0 ? 100 - completionRate : 0

  return { totalStarted, totalCompleted, dropoffCount, completionRate, dropoffRate }
}
