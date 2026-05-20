import { differenceInCalendarDays, subDays } from 'date-fns'
import type { SeriesPoint, Granularity } from '../model/types'

export const getMetricLabelCapitalized = (type: string): string => {
  switch (type) {
    case 'pageviews':
      return 'Sidevisninger'
    case 'proportion':
      return 'Andel'
    case 'visits':
      return 'Økter'
    default:
      return 'Besøkende'
  }
}

export const getMetricLabelWithCount = (type: string): string => {
  switch (type) {
    case 'pageviews':
      return 'Sidevisninger'
    case 'proportion':
      return 'Andel'
    case 'visits':
      return 'Økter'
    default:
      return 'Besøkende'
  }
}

export const getMetricUnitLabel = (type: string): string => {
  switch (type) {
    case 'pageviews':
      return 'sidevisninger'
    case 'proportion':
      return 'prosentpoeng'
    case 'visits':
      return 'økter'
    default:
      return 'besøkende'
  }
}

export const getMetricLabel = (type: string): string => {
  switch (type) {
    case 'pageviews':
      return 'sidevisninger'
    case 'proportion':
      return 'andel'
    case 'visits':
      return 'økter'
    default:
      return 'unike besøkende'
  }
}

export const getCSVMetricLabel = (type: string): string => {
  switch (type) {
    case 'pageviews':
      return 'Antall sidevisninger'
    case 'proportion':
      return 'Andel'
    case 'visits':
      return 'Antall økter'
    default:
      return 'Antall unike besøkende'
  }
}

/** Label used in the MarketingAnalysis metric selector */
export const getMarketingMetricLabel = (type: string): string => {
  switch (type) {
    case 'pageviews':
      return 'Sidevisninger'
    case 'proportion':
      return 'Andel'
    case 'visits':
      return 'Økter'
    default:
      return 'Besøkende'
  }
}

export const isCompareEnabled = (value: string | null): boolean => value === '1' || value === 'true'

export const getPreviousDateRange = (startDate: Date, endDate: Date) => {
  const numberOfDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1)
  return {
    startDate: subDays(startDate, numberOfDays),
    endDate: subDays(endDate, numberOfDays),
  }
}

export const aggregateSeriesData = (data: SeriesPoint[], _granularity: Granularity, _metricType: string) => {
  // Backend now buckets natively per `interval` (day/week/month/hour) and dedupes
  // unique visitors per bucket. Client-side aggregation summed daily uniques,
  // which double-counted return visitors. Pass through as-is.
  return data
}

export const getComparablePeriodValue = (data: SeriesPoint[], metricType: string, totalCount?: number) => {
  if (!data.length) return 0

  if (metricType === 'proportion') {
    const values = data
      .map((item) => Number(item.count) || 0)
      .filter((value) => value >= 0 && value <= 1.01)
      .map((value) => Math.min(value, 1))

    if (!values.length) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  if ((metricType === 'visits' || metricType === 'visitors') && typeof totalCount === 'number') {
    return totalCount
  }

  return data.reduce((sum, item) => sum + (Number(item.count) || 0), 0)
}

export const formatMetricValue = (value: number, metricType: string): string => {
  if (metricType === 'proportion') {
    return `${(value * 100).toFixed(1)}%`
  }
  return Math.round(value).toLocaleString('nb-NO')
}

export const formatMetricDelta = (value: number, metricType: string): string => {
  if (metricType === 'proportion') {
    return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`
  }
  return `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('nb-NO')}`
}

export const formatCsvValue = (value: number, metricType: string): string | number => {
  if (metricType === 'proportion') {
    return `${(value * 100).toFixed(1)}%`
  }
  return Math.round(value)
}

export const downloadCsvFile = (csvContent: string, filename: string) => {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
