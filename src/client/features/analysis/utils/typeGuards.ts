import type {
  BrokenLink,
  PageWithBrokenLinks,
  PageBrokenLink,
  BrokenLinkPage,
  CrawlData,
  SiteimproveListResponse,
  DiagnosisData,
  HistoryData,
  AnalysisActionModalWebsitesResponse,
} from '../model/types.ts'
import { isRecord } from '../../../shared/lib/typeGuards'
export { isRecord }

// ===== BrokenLinks type guards =====

export const isBrokenLink = (value: unknown): value is BrokenLink =>
  isRecord(value) && typeof value.id === 'number' && typeof value.url === 'string' && typeof value.pages === 'number'

export const isPageWithBrokenLinks = (value: unknown): value is PageWithBrokenLinks =>
  isRecord(value) &&
  typeof value.id === 'number' &&
  typeof value.url === 'string' &&
  typeof value.broken_links === 'number'

export const isPageBrokenLink = (value: unknown): value is PageBrokenLink =>
  isRecord(value) && typeof value.url === 'string'

export const isBrokenLinkPage = (value: unknown): value is BrokenLinkPage =>
  isRecord(value) && typeof value.url === 'string'

export const isCrawlData = (value: unknown): value is CrawlData =>
  isRecord(value) &&
  typeof value.last_crawl === 'string' &&
  typeof value.next_crawl === 'string' &&
  typeof value.is_crawl_enabled === 'boolean' &&
  typeof value.is_crawl_running === 'boolean' &&
  typeof value.permission === 'string'

export const parseListResponse = <T>(
  value: unknown,
  itemGuard: (item: unknown) => item is T,
): SiteimproveListResponse<T> => {
  if (!isRecord(value)) return { items: [] }
  const rawItems = Array.isArray(value.items) ? value.items : []
  return { items: rawItems.filter(itemGuard) }
}

// ===== Diagnosis type guards =====

export const isDiagnosisData = (value: unknown): value is DiagnosisData => {
  return (
    isRecord(value) &&
    typeof value.website_id === 'string' &&
    typeof value.website_name === 'string' &&
    (value.domain === null || typeof value.domain === 'string') &&
    typeof value.pageviews === 'number' &&
    typeof value.custom_events === 'number' &&
    (value.last_event_at === null || typeof value.last_event_at === 'string')
  )
}

export const isHistoryData = (value: unknown): value is HistoryData => {
  return (
    isRecord(value) &&
    typeof value.month === 'string' &&
    typeof value.pageviews === 'number' &&
    typeof value.custom_events === 'number'
  )
}

// ===== AnalysisActionModal type guards =====

export const isWebsitesResponse = (value: unknown): value is AnalysisActionModalWebsitesResponse => {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.data)) return false
  return value.data.every((item: unknown) => {
    if (!isRecord(item)) return false
    return typeof item.id === 'string'
  })
}
