import { format } from 'date-fns'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils.ts'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig'
import { buildSidegroupSqlCondition } from '../../../shared/lib/sidegroupSql.ts'
import type { Sidegroup } from '../../sidegroups/model/types.ts'

interface FilterState {
  urlFilters: string[]
  dateRange: string
  pathOperator: string
  metricType: 'visitors' | 'pageviews' | 'proportion' | 'visits'
  customStartDate?: Date
  customEndDate?: Date
  sidegroup?: Sidegroup | null
}

export const supportsMetricTypeSelection = (sql: string): boolean => /\bUnike_besokende\b/i.test(sql)

export const processDashboardSql = (sql: string, websiteId: string, filters: FilterState): string => {
  // 0. Define timezone (default to Europe/Oslo)
  const timezone = 'Europe/Oslo'

  let processedSql = sql

  // 1. Substitute website_id
  processedSql = processedSql.replace(/{{website_id}}/g, websiteId)

  // 2. Substitute URL Path
  const directUrlVarPattern = /\{\{\s*url_(?:sti|path)\s*\}\}/gi
  if (filters.sidegroup) {
    const sidegroup = filters.sidegroup
    const optionalAndUrlPattern = /\[\[\s*AND\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*\]\]/gi
    processedSql = processedSql.replace(
      optionalAndUrlPattern,
      () => `AND ${buildSidegroupSqlCondition(sidegroup, 'url_path')}`,
    )
    // Optional-clause form: column = [[ {{url_sti}} --]] 'value'
    const optionalClauseColumnRegex = /(\S+)\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']+')/gi
    processedSql = processedSql.replace(optionalClauseColumnRegex, (_match, column: string) =>
      buildSidegroupSqlCondition(sidegroup, column),
    )
    // Direct form: column = {{url_sti}} / {{url_path}}
    const directAssignmentColumnRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi
    processedSql = processedSql.replace(directAssignmentColumnRegex, (_match, column: string) =>
      buildSidegroupSqlCondition(sidegroup, column),
    )
  } else if (filters.urlFilters.length > 0) {
    const operator = filters.pathOperator || 'equals'

    if (operator === 'starts-with') {
      if (filters.urlFilters.length === 1) {
        // Single value: simple LIKE
        const assignmentRegex = /=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']+')/gi
        processedSql = processedSql.replace(assignmentRegex, `LIKE '${filters.urlFilters[0]}%'`)
      } else {
        // Multiple values: OR conditions
        const multiLikeRegex = /(\S+)\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']+')/gi
        processedSql = processedSql.replace(multiLikeRegex, (_match, column) => {
          const likeConditions = filters.urlFilters.map((p) => `${column} LIKE '${p}%'`).join(' OR ')
          return `(${likeConditions})`
        })
      }
    } else {
      // equals operator
      const assignmentRegex = /=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']+')/gi
      if (filters.urlFilters.length === 1) {
        processedSql = processedSql.replace(assignmentRegex, `= '${filters.urlFilters[0]}'`)
      } else {
        // Multiple values: IN clause
        const quotedPaths = filters.urlFilters.map((p) => `'${p}'`).join(', ')
        processedSql = processedSql.replace(assignmentRegex, `IN (${quotedPaths})`)
      }
    }

    // Direct URL placeholder substitution: column = {{url_sti}} / {{url_path}}
    const directAssignmentRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi
    if (operator === 'starts-with') {
      if (filters.urlFilters.length === 1) {
        processedSql = processedSql.replace(directAssignmentRegex, `$1 LIKE '${filters.urlFilters[0]}%'`)
      } else {
        processedSql = processedSql.replace(directAssignmentRegex, (_match, column) => {
          const likeConditions = filters.urlFilters.map((p) => `${column} LIKE '${p}%'`).join(' OR ')
          return `(${likeConditions})`
        })
      }
    } else if (filters.urlFilters.length === 1) {
      processedSql = processedSql.replace(directAssignmentRegex, `$1 = '${filters.urlFilters[0]}'`)
    } else {
      const quotedPaths = filters.urlFilters.map((p) => `'${p}'`).join(', ')
      processedSql = processedSql.replace(directAssignmentRegex, `$1 IN (${quotedPaths})`)
    }

    // Fallback replacement if placeholder appears outside a direct assignment.
    processedSql = processedSql.replace(directUrlVarPattern, `'${filters.urlFilters[0]}'`)
  } else {
    // No URL filter selected: treat as whole website (remove URL filter clauses).
    const optionalClausePattern = /\s+AND\s+[\w`.-]*url_path\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*'\/'/gi
    const directClausePattern =
      /\s+AND\s+[\w`.-]*url_path\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi
    const placeholderLinePattern = /^\s*AND\s+[^\n]*url_path[^\n]*\{\{\s*url_(?:sti|path)\s*\}\}[^\n]*$/gim
    const optionalPlaceholderLinePattern =
      /^\s*AND\s+[^\n]*url_path[^\n]*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\][^\n]*$/gim
    const directAssignmentRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi
    processedSql = processedSql.replace(optionalClausePattern, '')
    processedSql = processedSql.replace(directClausePattern, '')
    processedSql = processedSql.replace(placeholderLinePattern, '')
    processedSql = processedSql.replace(optionalPlaceholderLinePattern, '')
    // Fallback if placeholder assignment is inline (not line-based)
    processedSql = processedSql.replace(directAssignmentRegex, '1=1')
    processedSql = processedSql.replace(/\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]/gi, '')
    // Do not force '/' when URL is blank; keep whole-site behavior.
    processedSql = processedSql.replace(directUrlVarPattern, '')
  }

  // 3. Substitute Date / Created At
  const range =
    getDateRangeFromPeriod(filters.dateRange, filters.customStartDate, filters.customEndDate) ??
    getDateRangeFromPeriod('last_28_days')!
  const { startDate, endDate } = range

  const fromSql = `TIMESTAMP('${format(startDate, 'yyyy-MM-dd')}', '${timezone}')`
  const toSql = `TIMESTAMP('${format(endDate, 'yyyy-MM-dd')}T23:59:59', '${timezone}')`

  const projectId = getGcpProjectId()
  const SQL_KEYWORDS = new Set([
    'WHERE',
    'GROUP',
    'ORDER',
    'LIMIT',
    'HAVING',
    'JOIN',
    'LEFT',
    'RIGHT',
    'INNER',
    'OUTER',
    'FULL',
    'CROSS',
    'ON',
    'AND',
    'OR',
    'UNION',
    'WINDOW',
    'QUALIFY',
  ])
  const aliasCandidate = processedSql.match(
    /FROM\s+`[^`]+\.umami_views\.event`\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)/i,
  )?.[1]
  const eventTableAlias = aliasCandidate && !SQL_KEYWORDS.has(aliasCandidate.toUpperCase()) ? aliasCandidate : undefined
  const eventDateColumn = eventTableAlias
    ? `${eventTableAlias}.created_at`
    : `\`${projectId}.umami_views.event\`.created_at`
  const dateReplacement = `AND ${eventDateColumn} BETWEEN ${fromSql} AND ${toSql}`
  processedSql = processedSql.replace(/\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/gi, dateReplacement)

  // 4. Handle metric type substitutions
  if (filters.metricType === 'pageviews') {
    processedSql = processedSql.replace(
      /COUNT\s*\(\s*DISTINCT\s+(?:[a-zA-Z_.]+\.)?session_id\s*\)\s+as\s+Unike_besokende/gi,
      'COUNT(*) as Sidevisninger',
    )
    processedSql = processedSql.replace(/\bUnike_besokende\b/g, 'Sidevisninger')
  } else if (filters.metricType === 'proportion') {
    const totalSiteVisitorsSubquery = `(SELECT COUNT(DISTINCT session_id) FROM \`${projectId}.umami_views.event\` WHERE website_id = '${websiteId}' AND event_type = 1 AND created_at BETWEEN ${fromSql} AND ${toSql})`
    processedSql = processedSql.replace(
      /COUNT\s*\(\s*DISTINCT\s+(?:([a-zA-Z_.]+)\.)?session_id\s*\)\s+as\s+Unike_besokende/gi,
      (_match, tablePrefix) => {
        const sessionRef = tablePrefix ? `${tablePrefix}.session_id` : 'session_id'
        return `CONCAT(REGEXP_REPLACE(REGEXP_REPLACE(FORMAT('%.6f', COALESCE(SAFE_DIVIDE(COUNT(DISTINCT ${sessionRef}) * 100.0, ${totalSiteVisitorsSubquery}), 0)), r'(\\.\\d*?[1-9])0+$', '\\\\1'), r'\\.0+$', ''), '%') as Andel`
      },
    )
    processedSql = processedSql.replace(/\bUnike_besokende\b/g, 'Andel')
  } else if (filters.metricType === 'visits') {
    processedSql = processedSql.replace(
      /COUNT\s*\(\s*DISTINCT\s+(?:[a-zA-Z_.]+\.)?session_id\s*\)\s+as\s+Unike_besokende/gi,
      'COUNT(DISTINCT visit_id) as `Antall økter`',
    )
    processedSql = processedSql.replace(/\bUnike_besokende\b/g, '`Antall økter`')
  }

  return processedSql
}
