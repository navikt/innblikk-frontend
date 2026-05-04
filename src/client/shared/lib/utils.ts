export const sanitizeColumnName = (key: string): string => {
  return key
    .replace(/\./g, '_')
    .replace(/æ/gi, 'ae')
    .replace(/ø/gi, 'oe')
    .replace(/å/gi, 'aa')
    .replace(/[^a-z0-9_]/gi, '_')
}

export const normalizeUrlToPath = (input: string): string => {
  if (!input.trim()) return ''
  let trimmed = input.trim()

  // Strip query parameters if present
  const queryIndex = trimmed.indexOf('?')
  if (queryIndex !== -1) {
    trimmed = trimmed.substring(0, queryIndex)
  }

  try {
    if (trimmed.includes('://')) {
      const url = new URL(trimmed)
      return decodeURIComponent(url.pathname)
    }
    if (trimmed.startsWith('/') && trimmed.includes('.')) {
      const withoutLeadingSlash = trimmed.substring(1)
      const firstSlashIndex = withoutLeadingSlash.indexOf('/')

      if (firstSlashIndex !== -1 && !withoutLeadingSlash.startsWith('/')) {
        const potentialDomain = withoutLeadingSlash.substring(0, firstSlashIndex)
        if (potentialDomain.includes('.')) {
          trimmed = withoutLeadingSlash.substring(firstSlashIndex)
        }
      }
    }
    if (!trimmed.startsWith('/') && trimmed.includes('.') && trimmed.includes('/')) {
      const url = new URL('https://' + trimmed)
      return decodeURIComponent(url.pathname)
    }
  } catch {
    // Ignore
  }
  return trimmed
}

export const normalizeUrlQuery = (input: string): string => {
  if (!input.trim()) return ''

  let trimmed = input.trim()

  const fragmentIndex = trimmed.indexOf('#')
  if (fragmentIndex !== -1) {
    trimmed = trimmed.substring(0, fragmentIndex)
  }

  if (trimmed.startsWith('?')) {
    trimmed = trimmed.substring(1)
  }

  return trimmed
}

export const isDecoratorEvent = (eventName: string): boolean => {
  return eventName.startsWith('dekorator-')
}

// ============================================
// ANALYSIS DEFAULTS & PERSISTENCE
// Centralized defaults and localStorage helpers for analysis pages
// ============================================

/** Default period for analysis pages: "Siste 7 dager" */
export const DEFAULT_ANALYSIS_PERIOD = 'last_7_days'

/** Default metric type for analysis pages: "Sidevisninger" (pageviews) */
export const DEFAULT_ANALYSIS_METRIC_TYPE = 'pageviews'

// LocalStorage keys for user preferences (environment-aware to prevent dev/prod conflicts)
const getHostPrefix = () => window.location.hostname.replace(/\./g, '_')
const PERIOD_STORAGE_KEY = `umami_analysis_period_${getHostPrefix()}`
const METRIC_TYPE_STORAGE_KEY = `umami_analysis_metric_type_${getHostPrefix()}`

/** Get period from localStorage, falling back to URL param or default */
export const getStoredPeriod = (urlParam?: string | null): string => {
  // URL param takes priority (for shared links)
  if (urlParam) return urlParam

  try {
    const stored = localStorage.getItem(PERIOD_STORAGE_KEY)
    if (stored) return stored
  } catch (error) {
    console.error('Error reading period from localStorage:', error)
  }
  return DEFAULT_ANALYSIS_PERIOD
}

/** Save period to localStorage */
export const savePeriodPreference = (period: string): void => {
  try {
    // Don't save 'custom' as it requires dates
    if (period !== 'custom') {
      localStorage.setItem(PERIOD_STORAGE_KEY, period)
    }
  } catch (error) {
    console.error('Error saving period to localStorage:', error)
  }
}

/** Get metric type from localStorage, falling back to URL param or default */
export const getStoredMetricType = (urlParam?: string | null): string => {
  // URL param takes priority (for shared links)
  if (urlParam) return urlParam

  try {
    const stored = localStorage.getItem(METRIC_TYPE_STORAGE_KEY)
    if (stored) return stored
  } catch (error) {
    console.error('Error reading metric type from localStorage:', error)
  }
  return DEFAULT_ANALYSIS_METRIC_TYPE
}

/** Save metric type to localStorage */
export const saveMetricTypePreference = (metricType: string): void => {
  try {
    localStorage.setItem(METRIC_TYPE_STORAGE_KEY, metricType)
  } catch (error) {
    console.error('Error saving metric type to localStorage:', error)
  }
}

/** Available metric types for analysis */
export type MetricType = 'pageviews' | 'visitors' | 'visits' | 'proportion'

/** Available period options with labels */
export const PERIOD_OPTIONS = [
  { value: 'today', label: 'I dag' },
  { value: 'yesterday', label: 'I går' },
  { value: 'this_week', label: 'Denne uken' },
  { value: 'last_7_days', label: 'Siste 7 dager' },
  { value: 'last_week', label: 'Forrige uke' },
  { value: 'last_28_days', label: 'Siste 28 dager' },
  { value: 'current_month', label: 'Denne måneden' },
  { value: 'last_month', label: 'Forrige måned' },
] as const

/**
 * Get start and end dates from a period string.
 * Supports: today, yesterday, this_week, last_7_days, last_week, last_28_days,
 * current_month, last_month, and custom (requires customStartDate/customEndDate).
 */
export const getDateRangeFromPeriod = (
  period: string,
  customStartDate?: Date,
  customEndDate?: Date,
): { startDate: Date; endDate: Date } | null => {
  const now = new Date()
  let startDate: Date
  let endDate: Date

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      endDate = now
      break

    case 'yesterday':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
      break

    case 'this_week': {
      // Get Monday of current week
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Adjust for Monday start
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0, 0)
      endDate = now
      break
    }

    case 'last_7_days':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
      endDate = now
      break

    case 'last_week': {
      // Get Monday and Sunday of previous week
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
      startDate = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7, 0, 0, 0, 0)
      endDate = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 1, 23, 59, 59, 999)
      break
    }

    case 'last_28_days':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27, 0, 0, 0, 0)
      endDate = now
      break

    case 'current_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      endDate = now
      break

    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      break

    case 'custom': {
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
      break
    }

    default:
      // Default to current month if period is not recognized
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      endDate = now
  }

  return { startDate, endDate }
}

export const getCookieCountByParams = (
  usesCookies: boolean,
  cookieStartDate: Date | null | undefined,
  startDate: Date,
  endDate: Date,
): { countBy?: 'distinct_id'; countBySwitchAt?: number } => {
  if (!usesCookies) return {}
  if (!cookieStartDate) {
    return { countBy: 'distinct_id' }
  }

  const switchAt = cookieStartDate.getTime()
  const startMs = startDate.getTime()
  const endMs = endDate.getTime()

  if (endMs < switchAt) return {}
  if (startMs >= switchAt) return { countBy: 'distinct_id' }
  return { countBy: 'distinct_id', countBySwitchAt: switchAt }
}

export const getCookieBadge = (
  usesCookies: boolean,
  cookieStartDate: Date | null | undefined,
  startDate: Date,
  endDate: Date,
): '' | 'cookie' | 'mix' => {
  const { countBy, countBySwitchAt } = getCookieCountByParams(usesCookies, cookieStartDate, startDate, endDate)
  if (countBy !== 'distinct_id') return ''
  return countBySwitchAt ? 'mix' : 'cookie'
}

export const getVisitorLabelWithBadge = (): string => {
  return 'Unike besøkende'
}
