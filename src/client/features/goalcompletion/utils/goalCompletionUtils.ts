import type { GoalCompletionRow } from '../model/types'
import type { ILineChartDataPoint, ILineChartProps } from '@fluentui/react-charting'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils'

export function getGoalCompletionDateRange(
  usesCookies: boolean,
  period: string,
  customStartDate?: Date,
  customEndDate?: Date,
): { startDate: Date; endDate: Date } | null {
  if (usesCookies) {
    return getDateRangeFromPeriod(period, customStartDate, customEndDate)
  }

  const now = new Date()
  let startDate: Date
  let endDate: Date

  if (period === 'current_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = now
  } else if (period === 'last_month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    endDate = new Date(now.getFullYear(), now.getMonth(), 0)
  } else if (period === 'custom') {
    if (!customStartDate || !customEndDate) return null
    startDate = new Date(customStartDate)
    startDate.setHours(0, 0, 0, 0)

    const isToday =
      customEndDate.getDate() === now.getDate() &&
      customEndDate.getMonth() === now.getMonth() &&
      customEndDate.getFullYear() === now.getFullYear()

    if (isToday) {
      endDate = now
    } else {
      endDate = new Date(customEndDate)
      endDate.setHours(23, 59, 59, 999)
    }
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    endDate = new Date(now.getFullYear(), now.getMonth(), 0)
  }

  return { startDate, endDate }
}

export function buildGoalCompletionChartData(data: GoalCompletionRow[]): ILineChartProps {
  const points: ILineChartDataPoint[] = data.map((item) => ({
    x: item.day,
    y: item.percentage,
    legend: `Dag ${item.day}`,
    xAxisCalloutData: `Dag ${item.day}: ${item.percentage}% (${item.completed_users.toLocaleString('nb-NO')} brukere)`,
    yAxisCalloutData: `${item.percentage}%`,
  }))

  return {
    data: {
      lineChartData: [
        {
          legend: 'Måloppnåelse',
          data: points,
          color: '#0078d4',
        },
      ],
    },
  }
}
