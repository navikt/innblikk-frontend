import { useState, useCallback } from 'react'
import type { Website } from '../../../shared/types/chart'
import type { UserProfile, ActivityItem, QueryStats } from '../model'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils'

export function useUserProfilesData(
  selectedWebsite: Website | null,
  period: string,
  customStartDate: Date | undefined,
  customEndDate: Date | undefined,
) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [totalUsers, setTotalUsers] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)

  const getDateRange = useCallback(() => {
    const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
    if (!dateRange) {
      throw new Error('Invalid date range')
    }
    return dateRange
  }, [period, customStartDate, customEndDate])

  const fetchUsers = useCallback(
    async (
      page: number,
      maxUsers: number,
      searchQuery?: string,
      pagePath?: string,
      pathOperator?: string,
      usesCookies?: boolean,
    ) => {
      if (!selectedWebsite) return

      setLoading(true)
      setError(null)

      const { startDate, endDate } = getDateRange()

      try {
        const response = await fetch('/api/bigquery/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            websiteId: selectedWebsite.id,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            page,
            limit: maxUsers,
            searchQuery,
            pagePath,
            pathOperator,
            usesCookies,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch user profiles')
        }

        const result = await response.json()
        setUsers(result.users || [])
        setTotalUsers(result.total || 0)

        if (result.queryStats) {
          setQueryStats(result.queryStats)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user profiles')
      } finally {
        setLoading(false)
      }
    },
    [selectedWebsite, getDateRange],
  )

  return {
    users,
    totalUsers,
    loading,
    error,
    queryStats,
    fetchUsers,
    getDateRange,
  }
}

export function useUserActivity(
  selectedWebsite: Website | null,
  getDateRange: () => { startDate: Date; endDate: Date },
) {
  const [activityData, setActivityData] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState<boolean>(false)

  const fetchUserActivity = useCallback(
    async (sessionId: string) => {
      if (!selectedWebsite) return

      setActivityLoading(true)
      const { startDate, endDate } = getDateRange()

      try {
        const response = await fetch(`/api/bigquery/users/${sessionId}/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            websiteId: selectedWebsite.id,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch user activity')
        }

        const result = await response.json()
        setActivityData(result.activity || [])
      } catch (err) {
        console.error('Error fetching activity:', err)
      } finally {
        setActivityLoading(false)
      }
    },
    [selectedWebsite, getDateRange],
  )

  return {
    activityData,
    activityLoading,
    fetchUserActivity,
  }
}
