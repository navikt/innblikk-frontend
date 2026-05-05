import type { UserStatsResponse } from '../model/types'

export async function fetchStats(): Promise<UserStatsResponse> {
  const res = await fetch('/api/backend/stats')
  if (!res.ok) {
    throw new Error(`Failed to fetch stats: ${res.status}`)
  }
  return res.json() as Promise<UserStatsResponse>
}
