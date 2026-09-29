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

  const supportedPeriod = ['current_month', 'last_month', 'custom'].includes(period) ? period : 'last_month'
  return getDateRangeFromPeriod(supportedPeriod, customStartDate, customEndDate)
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
