export interface UserStatsResponse {
  totalUsers: number
  activeUsers: number
  activeUserWindowDays: number
  settings: Record<string, Record<string, number>>
}
