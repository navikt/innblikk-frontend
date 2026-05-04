// UI Components
export { default as TrafficAnalysis } from './ui/TrafficAnalysis'
export { default as MarketingAnalysis } from './ui/MarketingAnalysis'

// Types
export type {
  SeriesPoint,
  PageMetricRow,
  BreakdownEntry,
  BreakdownData,
  ExternalReferrerRow,
  QueryStats,
  SeriesResponse,
  BreakdownResponse,
  PageMetricsResponse,
  ExternalReferrerResponse,
  MarketingRow,
  MarketingData,
  Granularity,
  DateRange,
} from './model/types'

// Hooks
export { useTrafficAnalysis } from './hooks/useTrafficAnalysis'
export { useMarketingAnalysis } from './hooks/useMarketingAnalysis'

// API
export {
  buildSeriesUrl,
  fetchTrafficSeries,
  fetchPreviousTrafficSeries,
  fetchTrafficBreakdown,
  fetchPageMetrics,
  fetchExternalReferrers,
  fetchMarketingStats,
} from './api/trafficApi'

// Utils
export {
  getMetricLabelCapitalized,
  getMetricLabelWithCount,
  getMetricUnitLabel,
  getMetricLabel,
  getCSVMetricLabel,
  getMarketingMetricLabel,
  isCompareEnabled,
  getPreviousDateRange,
  aggregateSeriesData,
  getComparablePeriodValue,
  formatMetricValue,
  formatMetricDelta,
  formatCsvValue,
  downloadCsvFile,
} from './utils/trafficUtils'
