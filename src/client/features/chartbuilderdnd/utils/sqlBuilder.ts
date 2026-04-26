import { getGcpProjectId } from '../../../shared/lib/runtimeConfig'
import type { BuilderQueryConfig, SentenceFilter } from '../model/types'

const TIME_EXPRESSIONS: Record<string, string> = {
  day: "DATE(e.created_at, 'Europe/Oslo')",
  week: "DATE_TRUNC(DATE(e.created_at, 'Europe/Oslo'), WEEK(MONDAY))",
  month: "DATE_TRUNC(DATE(e.created_at, 'Europe/Oslo'), MONTH)",
}

const METRIC_EXPRESSIONS: Record<string, string> = {
  events: 'COUNT(*)',
  users: 'COUNT(DISTINCT e.session_id)',
  visits: 'COUNT(DISTINCT e.visit_id)',
  pageviews: "COUNTIF(e.event_name = 'pageview')",
}

const GROUP_EXPRESSIONS: Record<string, { expression: string; requiresSessionJoin?: boolean }> = {
  event_name: { expression: 'e.event_name' },
  event_type: { expression: 'e.event_type' },
  event_id: { expression: 'e.event_id' },
  url_path: { expression: 'e.url_path' },
  url_query: { expression: 'e.url_query' },
  url_fullpath: { expression: 'e.url_fullpath' },
  page_title: { expression: 'e.page_title' },
  referrer_domain: { expression: 'e.referrer_domain' },
  referrer_path: { expression: 'e.referrer_path' },
  referrer_query: { expression: 'e.referrer_query' },
  referrer_fullpath: { expression: 'e.referrer_fullpath' },
  referrer_fullurl: { expression: 'e.referrer_fullurl' },
  session_id: { expression: 'e.session_id' },
  visit_id: { expression: 'e.visit_id' },
  browser: { expression: 's.browser', requiresSessionJoin: true },
  os: { expression: 's.os', requiresSessionJoin: true },
  device: { expression: 's.device', requiresSessionJoin: true },
  screen: { expression: 's.screen', requiresSessionJoin: true },
  language: { expression: 's.language', requiresSessionJoin: true },
  country: { expression: 's.country', requiresSessionJoin: true },
  visit_duration: { expression: 's.visit_duration', requiresSessionJoin: true },
}

const FILTER_EXPRESSIONS: Record<SentenceFilter['column'], { expression: string; requiresSessionJoin?: boolean }> = {
  event_name: { expression: 'e.event_name' },
  event_type: { expression: 'e.event_type' },
  event_id: { expression: 'e.event_id' },
  url_path: { expression: 'e.url_path' },
  url_query: { expression: 'e.url_query' },
  url_fullpath: { expression: 'e.url_fullpath' },
  page_title: { expression: 'e.page_title' },
  referrer_domain: { expression: 'e.referrer_domain' },
  referrer_path: { expression: 'e.referrer_path' },
  referrer_query: { expression: 'e.referrer_query' },
  referrer_fullpath: { expression: 'e.referrer_fullpath' },
  referrer_fullurl: { expression: 'e.referrer_fullurl' },
  browser: { expression: 's.browser', requiresSessionJoin: true },
  os: { expression: 's.os', requiresSessionJoin: true },
  country: { expression: 's.country', requiresSessionJoin: true },
  device: { expression: 's.device', requiresSessionJoin: true },
  screen: { expression: 's.screen', requiresSessionJoin: true },
  language: { expression: 's.language', requiresSessionJoin: true },
  session_id: { expression: 'e.session_id' },
  visit_id: { expression: 'e.visit_id' },
  visit_duration: { expression: 's.visit_duration', requiresSessionJoin: true },
}

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''")
const toSqlDate = (value: Date): string => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const isValidDate = (value: Date | undefined): value is Date =>
  value instanceof Date && Number.isNaN(value.getTime()) === false

const buildPeriodWhereClause = (
  period: string,
  periodKey?: string,
  customStartDate?: Date,
  customEndDate?: Date,
): string => {
  if (periodKey === 'custom' && isValidDate(customStartDate) && isValidDate(customEndDate)) {
    const from = toSqlDate(customStartDate)
    const to = toSqlDate(customEndDate)
    return `AND DATE(e.created_at, 'Europe/Oslo') BETWEEN DATE '${from}' AND DATE '${to}'`
  }

  if (periodKey === 'today') {
    return "AND DATE(e.created_at, 'Europe/Oslo') = CURRENT_DATE('Europe/Oslo')"
  }
  if (periodKey === 'yesterday') {
    return "AND DATE(e.created_at, 'Europe/Oslo') = DATE_SUB(CURRENT_DATE('Europe/Oslo'), INTERVAL 1 DAY)"
  }
  if (periodKey === 'this_week') {
    return "AND DATE(e.created_at, 'Europe/Oslo') >= DATE_TRUNC(CURRENT_DATE('Europe/Oslo'), WEEK(MONDAY))"
  }
  if (periodKey === 'last_week') {
    return `AND DATE(e.created_at, 'Europe/Oslo') BETWEEN
  DATE_SUB(DATE_TRUNC(CURRENT_DATE('Europe/Oslo'), WEEK(MONDAY)), INTERVAL 7 DAY)
  AND DATE_SUB(DATE_TRUNC(CURRENT_DATE('Europe/Oslo'), WEEK(MONDAY)), INTERVAL 1 DAY)`
  }
  if (periodKey === 'last_28_days') {
    return "AND DATE(e.created_at, 'Europe/Oslo') >= DATE_SUB(CURRENT_DATE('Europe/Oslo'), INTERVAL 27 DAY)"
  }
  if (periodKey === 'current_month') {
    return "AND DATE(e.created_at, 'Europe/Oslo') >= DATE_TRUNC(CURRENT_DATE('Europe/Oslo'), MONTH)"
  }
  if (periodKey === 'last_month') {
    return `AND DATE(e.created_at, 'Europe/Oslo') BETWEEN
  DATE_TRUNC(DATE_SUB(CURRENT_DATE('Europe/Oslo'), INTERVAL 1 MONTH), MONTH)
  AND DATE_SUB(DATE_TRUNC(CURRENT_DATE('Europe/Oslo'), MONTH), INTERVAL 1 DAY)`
  }

  const periodDays = Math.max(1, Number.parseInt(period, 10) || 7)
  return `AND e.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${periodDays} DAY)`
}

export const buildSentenceSql = ({
  websiteId,
  metric,
  timeBucket,
  groupBy,
  period,
  periodKey,
  customStartDate,
  customEndDate,
  limit,
  filters = [],
}: BuilderQueryConfig): string => {
  const projectId = getGcpProjectId()
  const timeExpression = TIME_EXPRESSIONS[timeBucket] ?? null
  const metricExpression = METRIC_EXPRESSIONS[metric] ?? METRIC_EXPRESSIONS.events
  const groupByValues = groupBy
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== 'none')
  const groupings = groupByValues
    .map((value) => GROUP_EXPRESSIONS[value])
    .filter((grouping): grouping is { expression: string; requiresSessionJoin?: boolean } => grouping !== undefined)
  const needsSessionJoinFromGrouping = groupings.some((grouping) => grouping.requiresSessionJoin === true)
  const needsSessionJoinFromFilters = filters.some((filter) => FILTER_EXPRESSIONS[filter.column].requiresSessionJoin)
  const needsSessionJoin = needsSessionJoinFromGrouping || needsSessionJoinFromFilters
  const rowLimit = Math.max(1, Number.parseInt(limit, 10) || 100)
  const periodWhereClause = buildPeriodWhereClause(period, periodKey, customStartDate, customEndDate)

  const dimensions: string[] = []
  if (timeExpression) {
    dimensions.push(`${timeExpression} AS dato`)
  }
  groupings.forEach((grouping, index) => {
    const alias = index === 0 ? 'gruppe' : `gruppe_${index + 1}`
    dimensions.push(`${grouping.expression} AS ${alias}`)
  })
  const selectList = [...dimensions, `${metricExpression} AS verdi`].join(',\n    ')
  const groupByList = dimensions.map((_, index) => String(index + 1)).join(', ')
  const orderByList = dimensions.map((_, index) => String(index + 1)).join(', ')
  const groupByClause = dimensions.length > 0 ? `\nGROUP BY ${groupByList}` : ''
  const orderByClause = dimensions.length > 0 ? `\nORDER BY ${orderByList}` : ''
  const joinClause = needsSessionJoin
    ? `\nLEFT JOIN \`${projectId}.umami_views.session\` s\n  ON s.session_id = e.session_id`
    : ''
  const filterClauses = filters
    .map((filter) => {
      const columnExpression = FILTER_EXPRESSIONS[filter.column].expression
      const escapedValue = escapeSqlLiteral(filter.value)

      if (filter.operator === 'equals') {
        return `${columnExpression} = '${escapedValue}'`
      }

      if (filter.operator === 'not_equals') {
        return `${columnExpression} != '${escapedValue}'`
      }

      if (filter.operator === 'contains') {
        return `${columnExpression} LIKE '%${escapedValue}%'`
      }

      return `${columnExpression} LIKE '${escapedValue}%'`
    })
    .join('\n  AND ')
  const whereFiltersClause = filterClauses ? `\n  AND ${filterClauses}` : ''

  return `SELECT
    ${selectList}
FROM \`${projectId}.umami_views.event\` e${joinClause}
WHERE e.website_id = '${escapeSqlLiteral(websiteId)}'
  ${periodWhereClause}
  ${whereFiltersClause}
${groupByClause}
${orderByClause}
LIMIT ${rowLimit}`
}
