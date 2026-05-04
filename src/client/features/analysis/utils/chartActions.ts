import type { SavedChart } from '../../../shared/types/savedChart'
import type { ChartActionModalFilters } from '../model/types.ts'
import { processDashboardSql } from '../../dashboard'
import { translateValue } from '../../../shared/lib/translations.ts'

export const generateShareUrl = (
  chart: SavedChart,
  websiteId: string,
  filters: ChartActionModalFilters,
  domain?: string,
  dashboardTitle?: string,
): string => {
  const processedSql = processDashboardSql(chart.sql!, websiteId, filters)

  const params = new URLSearchParams()
  params.set('sql', processedSql)
  params.set('desc', chart.title)
  if (dashboardTitle) params.set('dashboard', dashboardTitle)

  let tabParam = 'table'
  if (chart.type === 'line') tabParam = 'linechart'
  if (chart.type === 'bar') tabParam = 'barchart'
  if (chart.type === 'pie') tabParam = 'piechart'
  params.set('tab', tabParam)

  if (websiteId) params.set('websiteId', websiteId)
  if (domain) params.set('domain', domain)

  if (filters.urlFilters?.length) {
    params.set('urlPath', filters.urlFilters.join(','))
    if (filters.pathOperator) params.set('pathOperator', filters.pathOperator)
  }

  if (filters.dateRange) params.set('dateRange', filters.dateRange)
  if (filters.customStartDate) params.set('customStartDate', filters.customStartDate.toISOString())
  if (filters.customEndDate) params.set('customEndDate', filters.customEndDate.toISOString())

  return `${window.location.origin}/grafdeling?${params.toString()}`
}

export const buildEditorUrl = (
  chart: SavedChart,
  websiteId: string,
  filters: ChartActionModalFilters,
  domain?: string,
): string => {
  const params = new URLSearchParams()
  params.set('sql', chart.sql!)

  if (websiteId) params.set('websiteId', websiteId)
  if (domain) params.set('domain', domain)

  if (filters.urlFilters?.length) {
    params.set('urlPath', filters.urlFilters.join(','))
    params.set('pathOperator', filters.pathOperator || 'equals')
  }

  if (filters.dateRange) params.set('dateRange', filters.dateRange)
  if (filters.customStartDate) params.set('customStartDate', filters.customStartDate.toISOString())
  if (filters.customEndDate) params.set('customEndDate', filters.customEndDate.toISOString())

  return `/sql?${params.toString()}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const downloadChartCsv = (data: any[], title: string) => {
  if (!data || data.length === 0) return

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const headers = Object.keys(data[0])
  const csvRows = [
    headers.join(','),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...data.map((row: any) =>
      headers
        .map((header) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const value = row[header]
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const translatedValue = translateValue(header, value)
          const stringValue = translatedValue !== null && translatedValue !== undefined ? String(translatedValue) : ''
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`
          }
          return stringValue
        })
        .join(','),
    ),
  ]
  const csvContent = csvRows.join('\n')

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${title || 'chart_data'}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
