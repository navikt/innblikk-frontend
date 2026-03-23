import type { RetentionRow, RetentionStats } from '../model/types'
import type { ILineChartDataPoint, ILineChartProps } from '@fluentui/react-charting'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils'

/**
 * Compute the retention date range. For non-cookie sites, retention is limited
 * to calendar-month granularity to ensure anonymous IDs stay consistent.
 */
export function getRetentionDateRange(
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
    if (!customStartDate || !customEndDate) {
      return null
    }
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
    // Default fallback for unsupported periods – use last month
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    endDate = new Date(now.getFullYear(), now.getMonth(), 0)
  }

  return { startDate, endDate }
}

/**
 * Build FluentUI LineChart data from retention rows.
 */
export function buildChartData(data: RetentionRow[]): ILineChartProps {
  const points: ILineChartDataPoint[] = data.map((item) => ({
    x: item.day,
    y: item.percentage,
    legend: `Dag ${item.day} `,
    xAxisCalloutData: `Dag ${item.day}: ${item.percentage}% (${item.returning_users.toLocaleString('nb-NO')} brukere)`,
    yAxisCalloutData: `${item.percentage}% `,
  }))

  return {
    data: {
      lineChartData: [
        {
          legend: 'All Users',
          data: points,
          color: '#0078d4',
        },
      ],
    },
  }
}

/**
 * Compute retention summary stats from the data.
 */
export function computeRetentionStats(data: RetentionRow[]): RetentionStats | null {
  if (!data || data.length === 0) return null

  const returningData = data.filter((item) => item.day > 0)
  if (returningData.length === 0) return null

  const day0Data = data.find((item) => item.day === 0)
  const baseline = day0Data?.returning_users || Math.max(...data.map((item) => item.returning_users))

  const day1 = data.find((item) => item.day === 1)
  const day7 = data.find((item) => item.day === 7)
  const lastDay = returningData[returningData.length - 1]

  return { baseline, day1, day7, lastDay }
}

/**
 * Download retention data as CSV.
 */
export function downloadRetentionCSV(data: RetentionRow[], websiteName?: string): void {
  if (!data || data.length === 0) return

  const headers = ['Dag', 'Antall brukere', 'Prosent']
  const csvRows = [
    headers.join(','),
    ...data.map((item) => {
      return [`Dag ${item.day} `, item.returning_users, `${item.percentage}% `].join(',')
    }),
  ]

  const csvContent = csvRows.join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `retention_${websiteName || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Build share URL params for the retention analysis.
 */
export function buildShareParams(period: string, urlPath: string, pathOperator: string): URLSearchParams {
  const newParams = new URLSearchParams(window.location.search)
  newParams.set('retentionPeriod', period)
  newParams.delete('period')
  if (urlPath) {
    newParams.set('urlPath', urlPath)
    newParams.set('pathOperator', pathOperator)
  } else {
    newParams.delete('urlPath')
    newParams.delete('pathOperator')
  }
  return newParams
}

/**
 * Copy the current page URL to the clipboard.
 */
export async function copyShareLink(): Promise<void> {
  await navigator.clipboard.writeText(window.location.href)
}
