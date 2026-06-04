// UI Components
export { default as UserComposition } from './ui/UserComposition'
export { default as Spellings } from './ui/Spellings'
export { default as BrokenLinks } from './ui/BrokenLinks'
export { default as PrivacyCheck } from './ui/PrivacyCheck'
export { default as Diagnosis } from './ui/Diagnosis'
export { default as Wcag } from './ui/Wcag'
export { default as CookieMixNotice } from './ui/CookieMixNotice'
export { default as PeriodPicker } from './ui/PeriodPicker'
export { default as UrlPathFilter } from './ui/UrlPathFilter'

// Model
export { type AnalyticsPage, analyticsPages } from './model/analyticsNavigation'
export { developerTools } from './model/developerToolsNavigation'
export { chartGroups, chartGroupsOriginal, type ChartGroup, type ChartGroupSimple } from './model/chartGroups'
export type * from './model/types'

// API
export { fetchPageBrokenLinks, fetchBrokenLinkPages, fetchSiteimproveData } from './api/siteimprove'
export { fetchDiagnosisData, fetchDiagnosisHistory } from './api/diagnosis'
export { fetchPrivacyCheck } from './api/privacy'
export { fetchPageId, fetchSpellingOverview, fetchPageSpellings } from './api/spellings'
export { fetchPageWcagIssues } from './api/wcag'

// Hooks
export { useBrokenLinks, usePageBrokenLinks, useBrokenLinkPages } from './hooks/useBrokenLinks'
export { useChartNavigation } from './hooks/useChartNavigation'
export { useChartLayoutOriginal } from './hooks/useChartLayoutOriginal'
export { useDiagnosis } from './hooks/useDiagnosis'
export { usePeriodPicker } from './hooks/usePeriodPicker'
export { usePrivacyCheck } from './hooks/usePrivacyCheck'
export { useSpellings } from './hooks/useSpellings'
export { useWcag } from './hooks/useWcag'
export { useUrlPathFilter } from './hooks/useUrlPathFilter'
export { useOversiktDayDividers } from './hooks/useOversiktDayDividers'
export { useUmamiTraffic } from './hooks/useUmamiTraffic'
export { useUmamiJourney } from './hooks/useUmamiJourney'
export { useHorizontalFunnel } from './hooks/useHorizontalFunnel'

// Utils
export {
  isRecord,
  isBrokenLink,
  isPageWithBrokenLinks,
  isPageBrokenLink,
  isBrokenLinkPage,
  isCrawlData,
  parseListResponse,
  isDiagnosisData,
  isHistoryData,
  isWebsitesResponse,
} from './utils/typeGuards'
export { parseQueryStats, parseDiagnosisResponse, parseDiagnosisHistoryResponse } from './utils/diagnosisParsers'
export { PATTERNS } from './utils/privacyPatterns'
export { getUrlPath } from './utils/url'
export { getSiteimproveId, downloadCsv } from './utils/siteimprove'
export { generateShareUrl, buildEditorUrl, downloadChartCsv, serializeCsvValue } from './utils/chartActions'
export { getCookieMixNoticeContent, formatCookieDate } from './utils/cookieMix'
export {
  isDevDomain,
  getEnvironmentTitle,
  calculateDateRange,
  filterByEnvironment,
  filterByTab,
  sortDiagnosisData,
  buildChartData,
} from './utils/diagnosis'
export { formatDateRange } from './utils/periodPicker'
export { filterFalsePositives, calculatePrivacyDateRange, getEmailStats, getTableColumnGroups } from './utils/privacy'
export { formatPathLabel, parseFormattedPath, hasMultipleValues, parseMultipleUrls } from './utils/urlPathFilter'
export { computeTrafficStats, formatMetricValue, getMetricLabel, getTimeUnitLabel } from './utils/trafficStats'
export { processJourneyData, getConnectedNodeIds } from './utils/umamiTraffic'
export { processJourneyFullData, getJourneyConnectedNodeIds } from './utils/umamiJourney'
export { computeFunnelStepMetrics, getStepLabel, getStepDestination } from './utils/horizontalFunnel'
export { computeFunnelStats } from './utils/funnelStats'

// Storage
export {
  saveToLocalStorage,
  getFromLocalStorage,
  WEBSITES_CACHE_KEY,
  SELECTED_WEBSITE_CACHE_KEY,
} from './storage/websiteCache'
