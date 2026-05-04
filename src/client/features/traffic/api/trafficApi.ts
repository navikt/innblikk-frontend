import type { SeriesResponse, BreakdownResponse, PageMetricsResponse, ExternalReferrerResponse } from '../model/types'

type CountByParams = {
  countByParams: string
  countBySwitchAtParam: string
}

export const buildSeriesUrl = (
  websiteId: string,
  rangeStartDate: Date,
  rangeEndDate: Date,
  pathOperator: string,
  metricType: string,
  interval: string,
  normalizedPath: string,
  countByQueryParams: CountByParams,
): string => {
  let url = `/api/bigquery/websites/${websiteId}/traffic-series?startAt=${rangeStartDate.getTime()}&endAt=${rangeEndDate.getTime()}&pathOperator=${pathOperator}&metricType=${metricType}&interval=${interval}${countByQueryParams.countByParams}${countByQueryParams.countBySwitchAtParam}`
  if (normalizedPath) {
    url += `&urlPath=${encodeURIComponent(normalizedPath)}`
  }
  return url
}

export const fetchTrafficSeries = async (url: string): Promise<SeriesResponse> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Kunne ikke hente trafikkdata')
  return response.json()
}

export const fetchPreviousTrafficSeries = async (url: string): Promise<SeriesResponse> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Kunne ikke hente sammenligningsdata')
  return response.json()
}

export const fetchTrafficBreakdown = async (
  websiteId: string,
  startDate: Date,
  endDate: Date,
  normalizedPath: string,
  pathOperator: string,
  metricType: string,
  countByParams: CountByParams,
): Promise<BreakdownResponse> => {
  const breakdownUrl = `/api/bigquery/websites/${websiteId}/traffic-breakdown?startAt=${startDate.getTime()}&endAt=${endDate.getTime()}&limit=1000${normalizedPath ? `&urlPath=${encodeURIComponent(normalizedPath)}` : ''}&pathOperator=${pathOperator}&metricType=${metricType}${countByParams.countByParams}${countByParams.countBySwitchAtParam}`

  const response = await fetch(breakdownUrl)
  if (!response.ok) throw new Error('Kunne ikke hente trafikkdetaljer')
  return response.json()
}

export const fetchPageMetrics = async (
  websiteId: string,
  startDate: Date,
  endDate: Date,
  normalizedPath: string,
  pathOperator: string,
  metricType: string,
  countByParams: CountByParams,
): Promise<PageMetricsResponse> => {
  const metricsUrl = `/api/bigquery/websites/${websiteId}/page-metrics?startAt=${startDate.getTime()}&endAt=${endDate.getTime()}&limit=1000${normalizedPath ? `&urlPath=${encodeURIComponent(normalizedPath)}` : ''}&pathOperator=${pathOperator}&metricType=${metricType}${countByParams.countByParams}${countByParams.countBySwitchAtParam}`

  const response = await fetch(metricsUrl)
  if (!response.ok) throw new Error('Kunne ikke hente sidemetrikker')
  return response.json()
}

export const fetchExternalReferrers = async (
  websiteId: string,
  startDate: Date,
  endDate: Date,
  normalizedPath: string,
  pathOperator: string,
  metricType: string,
  countByParams: CountByParams,
): Promise<ExternalReferrerResponse> => {
  const url = `/api/bigquery/websites/${websiteId}/marketing-stats?startAt=${startDate.getTime()}&endAt=${endDate.getTime()}&limit=100${normalizedPath ? `&urlPath=${encodeURIComponent(normalizedPath)}` : ''}&pathOperator=${pathOperator}&metricType=${metricType}${countByParams.countByParams}${countByParams.countBySwitchAtParam}`

  const response = await fetch(url)
  if (!response.ok) throw new Error('Kunne ikke hente eksterne trafikkilder')
  return response.json()
}

type MarketingStatsResponse = {
  data?: Record<string, { name: string; count: number }[]>
  queryStats?: { totalBytesProcessedGB?: number; estimatedCostUSD?: number }
}

export const fetchMarketingStats = async (
  websiteId: string,
  startDate: Date,
  endDate: Date,
  normalizedPath: string,
  pathOperator: string,
  metricType: string,
  countByParams: string,
  countBySwitchAtParam: string,
): Promise<MarketingStatsResponse> => {
  const url = `/api/bigquery/websites/${websiteId}/marketing-stats?startAt=${startDate.getTime()}&endAt=${endDate.getTime()}&limit=100${normalizedPath ? `&urlPath=${encodeURIComponent(normalizedPath)}` : ''}&pathOperator=${pathOperator}&metricType=${metricType}${countByParams}${countBySwitchAtParam}`

  const response = await fetch(url)
  if (!response.ok) throw new Error('Kunne ikke hente markedsdata')
  return response.json() as Promise<MarketingStatsResponse>
}
