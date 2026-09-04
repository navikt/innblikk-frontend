import type { ChartConfig, Filter, Metric, Parameter, SegmentDefinition } from '../../../shared/types/chart.ts'
import type { CohortDetailDto } from '../../../shared/types/cohort.ts'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts'
import { DATE_FORMATS } from '../model/constants.ts'
import { sanitizeColumnName, sanitizeFieldNameForBigQuery } from './sanitize.ts'
import { getParameterAggregator } from './metricColumns.ts'
import { isSessionColumn, getRequiredSessionColumns, getRequiredTables } from './sessionUtils.ts'
import { resolveCohortToSegmentDefinition } from './cohortSqlResolver.ts'

export const getDateFilterConditions = (filters: Filter[]): string => {
  const dateFilters = filters.filter(
    (f) => f.column === 'created_at' || (f.column === 'custom_column' && f.customColumn?.includes('created_at')),
  )

  if (dateFilters.length === 0) return ''

  let conditions = ''

  dateFilters.forEach((filter) => {
    if (filter.value) {
      const column = filter.column === 'custom_column' ? filter.customColumn : filter.column
      conditions += ` AND ${column} ${filter.operator} ${filter.value}`
    }
  })

  return conditions
}

/**
 * Session-table partition predicate. umami_views.session is a view over
 * public_session, which has REQUIRE_PARTITION_FILTER — BigQuery rejects any
 * query referencing it without a predicate on its own `created_at` (the
 * event-side filter doesn't cover the joined table).
 * Interactive (Metabase `{{created_at}}`) mode can't alias-qualify the
 * placeholder, so it can't drive the session side — fall back to a wide
 * bounded window there.
 */
const getSessionDateFilterConditions = (
  filters: Filter[],
  sessionPrefix: string,
  hasInteractiveDateFilter: boolean,
): string => {
  if (hasInteractiveDateFilter) {
    return ` AND ${sessionPrefix}created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 400 DAY)`
  }
  return getDateFilterConditions(filters).replace(/(?<![.\w])created_at/g, `${sessionPrefix}created_at`)
}

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''")

const needsQuotedValue = (column: string, value: string): boolean => {
  return (
    isNaN(Number(value)) ||
    column === 'event_name' ||
    column === 'url_path' ||
    column.includes('_path') ||
    column.includes('_name')
  )
}

const buildSegmentFilterCondition = (filter: Filter, tableAlias: string): string | null => {
  if (filter.rawExpression) {
    // Pre-built nested boolean expression (e.g. from a cohort's criteria tree) —
    // inject verbatim, bypassing column/operator/value formatting entirely.
    // The alias substitution happens at build time (see cohortSqlResolver.ts),
    // so tableAlias isn't used here.
    return filter.rawExpression
  }

  if (filter.column.startsWith('param_')) return null
  if (!filter.operator) return null

  const columnRef = `${tableAlias}.${filter.column}`

  if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
    return `${columnRef} ${filter.operator}`
  }

  if (filter.operator === 'IN' && filter.multipleValues && filter.multipleValues.length > 0) {
    const values = filter.multipleValues
      .map((value) => (needsQuotedValue(filter.column, value) ? `'${escapeSqlLiteral(value)}'` : value))
      .join(', ')
    return `${columnRef} IN (${values})`
  }

  if (!filter.value) return null

  if (filter.operator === 'STARTS_WITH') {
    return `${columnRef} LIKE '${escapeSqlLiteral(filter.value)}%'`
  }

  if (filter.operator === 'ENDS_WITH') {
    return `${columnRef} LIKE '%${escapeSqlLiteral(filter.value)}'`
  }

  if ((filter.operator === 'LIKE' || filter.operator === 'NOT LIKE') && !filter.value.includes('%')) {
    return `${columnRef} ${filter.operator} '%${escapeSqlLiteral(filter.value)}%'`
  }

  const isMetabaseParam =
    filter.metabaseParam === true || (typeof filter.value === 'string' && /^\s*\{\{.*\}\}\s*$/.test(filter.value))

  const isTimestampFunction =
    typeof filter.value === 'string' &&
    filter.value.toUpperCase().includes('TIMESTAMP(') &&
    !filter.value.startsWith("'")

  if (isMetabaseParam) {
    return `${columnRef} ${filter.operator} ${filter.value.trim()}`
  }

  const formattedValue = isTimestampFunction
    ? filter.value.replace(/^['"]|['"]$/g, '')
    : needsQuotedValue(filter.column, filter.value)
      ? `'${escapeSqlLiteral(filter.value)}'`
      : filter.value

  return `${columnRef} ${filter.operator} ${formattedValue}`
}

export const getMetricSQLByType = (
  func: string,
  filters: Filter[],
  websiteId: string,
  column?: string,
  alias: string = 'metric',
  metric?: Metric,
  hasGroupBy: boolean = false,
): string => {
  const hasInteractiveFilters = filters.some((f) => f.interactive === true && f.metabaseParam === true)

  const sanitizedAlias = sanitizeFieldNameForBigQuery(alias)

  const quotedAlias = hasInteractiveFilters ? `${sanitizedAlias}` : `\`${sanitizedAlias}\``

  // Special handling for count_where
  if (func === 'count_where' && metric) {
    const whereColumn = metric.whereColumn || 'event_name'
    const whereOperator = metric.whereOperator || '='

    if (
      ['IN', 'NOT IN'].includes(whereOperator) &&
      metric.whereMultipleValues &&
      metric.whereMultipleValues.length > 0
    ) {
      const valueList = metric.whereMultipleValues
        .map((val) => {
          const needsQuotes = isNaN(Number(val)) || whereColumn === 'event_name' || whereColumn === 'url_path'
          return needsQuotes ? `'${val.replace(/'/g, "''")}'` : val
        })
        .join(', ')

      return `COUNT(CASE WHEN base_query.${whereColumn} ${whereOperator} (${valueList}) THEN 1 ELSE NULL END) as ${quotedAlias}`
    } else if (['LIKE', 'NOT LIKE'].includes(whereOperator) && metric.whereValue) {
      return `COUNT(CASE WHEN base_query.${whereColumn} ${whereOperator} '%${metric.whereValue.replace(/'/g, "''")}%' THEN 1 ELSE NULL END) as ${quotedAlias}`
    } else if (metric.whereValue) {
      const needsQuotes = isNaN(Number(metric.whereValue)) || whereColumn === 'event_name' || whereColumn === 'url_path'
      const formattedValue = needsQuotes ? `'${metric.whereValue.replace(/'/g, "''")}'` : metric.whereValue

      return `COUNT(CASE WHEN base_query.${whereColumn} ${whereOperator} ${formattedValue} THEN 1 ELSE NULL END) as ${quotedAlias}`
    }

    return `COUNT(*) as ${quotedAlias} /* count_where missing conditions */`
  }

  // If it's a custom parameter metric
  if (column?.startsWith('param_')) {
    const paramKey = column.replace('param_', '')

    switch (func) {
      case 'distinct':
        return `COUNT(DISTINCT CASE WHEN event_data.data_key = '${paramKey}' THEN event_data.string_value END) as ${quotedAlias}`
      case 'sum':
      case 'average':
      case 'median':
        return `${func === 'average' ? 'AVG' : func.toUpperCase()}(
            CASE 
              WHEN event_data.data_key = '${paramKey}'
              THEN CAST(event_data.number_value AS NUMERIC)
            END
          ) as ${quotedAlias}`
      case 'min':
        return `MIN(CASE WHEN event_data.data_key = '${paramKey}' THEN event_data.string_value END) as ${quotedAlias}`
      case 'max':
        return `MAX(CASE WHEN event_data.data_key = '${paramKey}' THEN event_data.string_value END) as ${quotedAlias}`
      case 'percentage':
        return `ROUND(
            100.0 * COUNT(*) / (
              SUM(COUNT(*)) OVER()
            )
          , 1) as ${quotedAlias}`
      case 'andel':
        return `ROUND(
            100.0 * COUNT(*) / (
              SELECT COUNT(*) FROM base_query
            )
          , 1) as ${quotedAlias}`
      default:
        return `COUNT(*) as ${quotedAlias}`
    }
  }

  // Add support for bounce_rate calculation
  if (func === 'bounce_rate') {
    return `ROUND(
        100.0 * SUM(CASE WHEN base_query.visit_counts = 1 THEN 1 ELSE 0 END) / COUNT(DISTINCT base_query.visit_id)
      , 1) as ${quotedAlias}`
  }

  // For regular columns
  switch (func) {
    case 'count':
      return `COUNT(*) as ${quotedAlias}`
    case 'distinct':
      if (column === 'session_id') {
        return `COUNT(DISTINCT base_query.session_id) as ${quotedAlias}`
      }
      return `COUNT(DISTINCT ${column || 'base_query.session_id'}) as ${quotedAlias}`
    case 'sum':
      if (column === 'visit_duration') {
        return `SUM(base_query.visit_duration) as ${quotedAlias}`
      }
      return column ? `SUM(${column}) as ${quotedAlias}` : `COUNT(*) as ${quotedAlias}`
    case 'average':
      if (column === 'visit_duration') {
        if (metric?.showInMinutes) {
          return `ROUND(AVG(NULLIF(base_query.visit_duration, 0)) / 60, 2) as ${quotedAlias}`
        }
        return `ROUND(AVG(NULLIF(base_query.visit_duration, 0)), 0) as ${quotedAlias}`
      }
      return column ? `AVG(${column}) as ${quotedAlias}` : `COUNT(*) as ${quotedAlias}`
    case 'median':
      if (column === 'visit_duration') {
        if (metric?.showInMinutes) {
          return `ROUND(APPROX_QUANTILES(NULLIF(base_query.visit_duration, 0), 100 IGNORE NULLS)[OFFSET(50)] / 60, 2) as ${quotedAlias}`
        }
        return `APPROX_QUANTILES(NULLIF(base_query.visit_duration, 0), 100 IGNORE NULLS)[OFFSET(50)] as ${quotedAlias}`
      }
      return column
        ? `APPROX_QUANTILES(${column}, 100 IGNORE NULLS)[OFFSET(50)] as ${quotedAlias}`
        : `COUNT(*) as ${quotedAlias}`
    case 'mode':
      if (column === 'visit_duration') {
        if (hasGroupBy) {
          if (metric?.showInMinutes) {
            return `ROUND(APPROX_TOP_COUNT(NULLIF(base_query.visit_duration, 0), 1)[OFFSET(0)].value / 60, 2) as ${quotedAlias}`
          }
          return `APPROX_TOP_COUNT(NULLIF(base_query.visit_duration, 0), 1)[OFFSET(0)].value as ${quotedAlias}`
        }
        if (metric?.showInMinutes) {
          return `ROUND((SELECT visit_duration FROM duration_mode) / 60, 2) as ${quotedAlias}`
        }
        return `(SELECT visit_duration FROM duration_mode) as ${quotedAlias}`
      }
      return `COUNT(*) as ${quotedAlias}`
    case 'min':
      return column ? `MIN(${column}) as ${quotedAlias}` : `COUNT(*) as ${quotedAlias}`
    case 'max':
      return column ? `MAX(${column}) as ${quotedAlias}` : `COUNT(*) as ${quotedAlias}`
    case 'percentage':
      if (column) {
        if (column === 'alle_rader_prosent') {
          return `ROUND(
              100.0 * COUNT(*) / (
                SUM(COUNT(*)) OVER()
              )
            , 1) as ${quotedAlias}`
        }
        return `ROUND(
            100.0 * COUNT(DISTINCT base_query.${column}) / (
              SUM(COUNT(DISTINCT base_query.${column})) OVER()
            )
          , 1) as ${quotedAlias}`
      }
      return `ROUND(
          100.0 * COUNT(*) / (
            SUM(COUNT(*)) OVER()
          )
        , 1) as ${quotedAlias}`
    case 'andel':
      if (column && websiteId) {
        let subqueryFilters = ''

        const interactiveDateFilter = filters.find((f) => f.column === 'created_at' && f.interactive === true)
        if (interactiveDateFilter) {
          subqueryFilters += '\n  [[AND {{created_at}} ]]'
        } else {
          subqueryFilters += getDateFilterConditions(filters)
        }

        const urlPathFilter = filters.find((f) => f.column === 'url_path')
        if (urlPathFilter) {
          if (urlPathFilter.interactive === true && urlPathFilter.metabaseParam === true) {
            subqueryFilters += `\n  AND url_path = [[ {{url_sti}} --]] '/'`
          } else if (urlPathFilter.value) {
            subqueryFilters += `\n  AND url_path = '${urlPathFilter.value.replace(/'/g, "''")}'`
          }
        }

        filters.forEach((filter) => {
          if (filter.column === 'created_at' || filter.column === 'url_path') return
          if (filter.column.startsWith('param_')) return
          if (isSessionColumn(filter.column)) return

          if (filter.interactive === true && filter.metabaseParam === true && filter.value) {
            const paramName = filter.value.replace(/[{}]/g, '').trim()
            subqueryFilters += `\n  AND ${filter.column} = {{${paramName}}}`
          } else if (filter.value) {
            const needsQuotes = isNaN(Number(filter.value))
            const val = needsQuotes ? `'${filter.value.replace(/'/g, "''")}'` : filter.value
            subqueryFilters += `\n  AND ${filter.column} ${filter.operator || '='} ${val}`
          }
        })

        const projectId = getGcpProjectId()
        if (column === 'session_id') {
          return `ROUND(
              100.0 * COUNT(DISTINCT base_query.${column}) / NULLIF((
                SELECT COUNT(DISTINCT ${column}) 
                FROM \`${projectId}.umami_views.event\`
                WHERE website_id = '${websiteId}'${subqueryFilters}
              ), 0)
            , 1) as ${quotedAlias}`
        } else if (column === 'visit_id') {
          return `ROUND(
              100.0 * COUNT(DISTINCT base_query.${column}) / NULLIF((
                SELECT COUNT(DISTINCT ${column})
                FROM \`${projectId}.umami_views.event\`
                WHERE website_id = '${websiteId}'${subqueryFilters}
              ), 0)
            , 1) as ${quotedAlias}`
        }
      }
      return `COUNT(*) as ${quotedAlias} /* Andel calculation skipped */`
    default:
      return `COUNT(*) as ${quotedAlias}`
  }
}

export const getMetricSQL = (
  metric: Metric,
  index: number,
  filters: Filter[],
  websiteId: string,
  hasGroupBy: boolean = false,
): string => {
  if (metric.alias) {
    return getMetricSQLByType(metric.function, filters, websiteId, metric.column, metric.alias, metric, hasGroupBy)
  }
  const defaultAlias = `metrikk_${index + 1}`
  return getMetricSQLByType(metric.function, filters, websiteId, metric.column, defaultAlias, metric, hasGroupBy)
}

export const generateSQLCore = (
  config: ChartConfig,
  filters: Filter[],
  parameters: Parameter[],
  resolvedCohorts?: CohortDetailDto[],
  cohortLookup?: Map<string, CohortDetailDto>,
): string => {
  if (!config.website) return ''

  const hasInteractiveDateFilter = filters.some(
    (f) => f.column === 'created_at' && f.interactive === true && f.metabaseParam === true,
  )

  const projectId = getGcpProjectId()
  const fullWebsiteTable = `\`${projectId}.umami_views.event\``
  const fullSessionTable = `\`${projectId}.umami_views.session\``
  const websiteId = config.website.id

  const hasInteractiveFieldFilter = filters.some(
    (f) => f.interactive === true && f.metabaseParam === true && f.column === 'created_at',
  )
  const segmentDefinitions = config.segments || []
  const effectiveSegmentDefinitions: SegmentDefinition[] =
    config.cohortIds && config.cohortIds.length > 0 && resolvedCohorts && resolvedCohorts.length > 0
      ? resolvedCohorts.map((c, i) =>
          resolveCohortToSegmentDefinition(c, i, {
            eventsTable: fullWebsiteTable,
            sessionTable: fullSessionTable,
            websiteId,
            cohortLookup: cohortLookup ?? new Map(resolvedCohorts.map((rc) => [String(rc.id), rc])),
          }),
        )
      : segmentDefinitions
  const segmentFilters = effectiveSegmentDefinitions.flatMap((segment) => segment.filters || [])
  const isRatioMode = Boolean(config.segmentRatioMode) && effectiveSegmentDefinitions.length >= 2
  const hasSegmentBreakdown =
    !isRatioMode &&
    effectiveSegmentDefinitions.length > 0 &&
    (effectiveSegmentDefinitions.length > 1 ||
      effectiveSegmentDefinitions.some(
        (segment) => (segment.filters?.length || 0) > 0 || (segment.performed?.events?.length || 0) > 0,
      ))

  let websiteAlias, sessionAlias, tablePrefix
  let websiteRef, sessionRef

  if (hasInteractiveFieldFilter) {
    websiteAlias = fullWebsiteTable
    sessionAlias = fullSessionTable
    tablePrefix = `${fullWebsiteTable}.`
    websiteRef = fullWebsiteTable
    sessionRef = fullSessionTable
  } else {
    websiteAlias = 'e'
    sessionAlias = 's'
    tablePrefix = 'e.'
    websiteRef = 'e'
    sessionRef = 's'
  }

  // Force usage of aliases to avoid TS errors
  if (websiteAlias && sessionAlias) {
    void websiteAlias
    void sessionAlias
  }

  const allFilters = [...filters, ...segmentFilters]
  const requiredTables = getRequiredTables(config, allFilters)
  const needsSessionJoin = requiredTables.session
  const requiredSessionColumns = getRequiredSessionColumns(config, allFilters)

  const needsUrlFullpath =
    allFilters.some((f) => f.column === 'url_fullpath') || config.groupByFields.includes('url_fullpath')

  const needsReferrerFullpath =
    allFilters.some((f) => f.column === 'referrer_fullpath') || config.groupByFields.includes('referrer_fullpath')

  const needsVisitDuration =
    config.metrics.some((m) => m.column === 'visit_duration') || config.groupByFields.includes('visit_duration')

  const needsBounceCounts = config.metrics.some((m) => m.function === 'bounce_rate')

  let sql = ''

  if (needsBounceCounts) {
    sql = 'WITH visit_counts AS (\n'
    sql += '  SELECT\n'
    sql += '    visit_id,\n'
    sql += '    COUNT(*) AS events_count\n'
    sql += `  FROM ${fullWebsiteTable}\n`
    sql += `  WHERE website_id = '${config.website.id}'\n`

    if (hasInteractiveDateFilter) {
      const interactiveDateFilter = filters.find(
        (f) => f.column === 'created_at' && f.interactive === true && f.metabaseParam === true,
      )
      if (interactiveDateFilter) {
        sql += `  [[AND {{created_at}} ]]\n`
      }
    } else {
      sql += getDateFilterConditions(filters)
      sql += '\n'
    }

    sql += '  GROUP BY visit_id\n'
    sql += '),\n'

    sql += 'base_query AS (\n'
    sql += '  SELECT\n'
    sql += `    ${websiteRef}.*,\n`
    sql += '    vc.events_count AS visit_counts\n'

    if (needsVisitDuration) {
      sql += '    ,COALESCE(vd.duration, 0) as visit_duration\n'
    }

    if (requiredTables.session && requiredSessionColumns.length > 0) {
      sql += '    ,' + requiredSessionColumns.map((col) => `${sessionRef}.${col}`).join(',\n    ') + '\n'
    }

    if (hasInteractiveFieldFilter) {
      sql += `  FROM ${fullWebsiteTable}\n`
      sql += '  LEFT JOIN visit_counts vc\n'
      sql += `    ON ${fullWebsiteTable}.visit_id = vc.visit_id\n`

      if (needsVisitDuration) {
        sql += '  LEFT JOIN visit_durations vd\n'
        sql += `    ON ${fullWebsiteTable}.visit_id = vd.visit_id\n`
      }

      if (requiredTables.session) {
        sql += `  LEFT JOIN ${fullSessionTable}\n`
        sql += `    ON ${fullWebsiteTable}.session_id = ${fullSessionTable}.session_id\n`
      }
    } else {
      sql += `  FROM ${fullWebsiteTable} e\n`
      sql += '  LEFT JOIN visit_counts vc\n'
      sql += '    ON e.visit_id = vc.visit_id\n'

      if (needsVisitDuration) {
        sql += '  LEFT JOIN visit_durations vd\n'
        sql += '    ON e.visit_id = vd.visit_id\n'
      }

      if (requiredTables.session) {
        sql += `  LEFT JOIN ${fullSessionTable} s\n`
        sql += '    ON e.session_id = s.session_id\n'
      }
    }
  } else if (needsVisitDuration) {
    sql += 'WITH visit_metrics AS (\n'
    sql += '  SELECT\n'
    sql += '    visit_id,\n'
    sql += '    MIN(created_at) AS first_event_time,\n'
    sql +=
      '    CASE WHEN COUNT(*) > 1 THEN TIMESTAMP_DIFF(MAX(created_at), MIN(created_at), SECOND) ELSE 0 END AS duration_seconds\n'
    sql += `  FROM \`${projectId}.umami_views.event\`\n`
    sql += `  WHERE website_id = '${config.website.id}'\n`

    if (hasInteractiveDateFilter) {
      const interactiveDateFilter = filters.find(
        (f) => f.column === 'created_at' && f.interactive === true && f.metabaseParam === true,
      )
      if (interactiveDateFilter) {
        sql += `  [[AND {{created_at}} ]]\n`
      }
    } else {
      sql += getDateFilterConditions(filters)
      sql += '\n'
    }

    sql += '  GROUP BY visit_id\n'
    sql += '),\n'

    sql += 'base_query AS (\n'
    sql += '  SELECT\n'
    sql += `    ${websiteRef}.*,\n`
    sql += '    vm.duration_seconds as visit_duration\n'

    if (requiredTables.session && requiredSessionColumns.length > 0) {
      sql += '    ,' + requiredSessionColumns.map((col) => `${sessionRef}.${col}`).join(',\n    ') + '\n'
    }

    if (hasInteractiveFieldFilter) {
      sql += `  FROM ${fullWebsiteTable}\n`
      sql += '  LEFT JOIN visit_metrics vm\n'
      sql += `    ON ${fullWebsiteTable}.visit_id = vm.visit_id\n`

      if (requiredTables.session) {
        sql += `  LEFT JOIN ${fullSessionTable}\n`
        sql += `    ON ${fullWebsiteTable}.session_id = ${fullSessionTable}.session_id\n`
      }
    } else {
      sql += `  FROM ${fullWebsiteTable} e\n`
      sql += '  LEFT JOIN visit_metrics vm\n'
      sql += '    ON e.visit_id = vm.visit_id\n'

      if (requiredTables.session) {
        sql += `  LEFT JOIN ${fullSessionTable} s\n`
        sql += '    ON e.session_id = s.session_id\n'
      }
    }
  } else {
    sql += 'WITH base_query AS (\n'
    sql += '  SELECT\n'

    if (hasInteractiveFieldFilter) {
      sql += `    ${fullWebsiteTable}.*`

      if (needsSessionJoin && requiredSessionColumns.length > 0) {
        sql += ',\n'
        sql += '    ' + requiredSessionColumns.map((col) => `${fullSessionTable}.${col}`).join(',\n    ')
      }

      if (needsUrlFullpath) {
        sql += needsSessionJoin ? ',\n' : '\n'
        sql += `    CONCAT(IFNULL(${fullWebsiteTable}.url_path, ''), IFNULL(${fullWebsiteTable}.url_query, '')) as url_fullpath`
      }

      if (needsReferrerFullpath) {
        sql += needsSessionJoin || needsUrlFullpath ? ',\n' : '\n'
        sql += `    CONCAT(IFNULL(${fullWebsiteTable}.referrer_path, ''), IFNULL(${fullWebsiteTable}.referrer_query, '')) as referrer_fullpath`
      }

      sql += `  FROM ${fullWebsiteTable}\n`

      if (needsSessionJoin) {
        sql += `  LEFT JOIN ${fullSessionTable}\n`
        sql += `    ON ${fullWebsiteTable}.session_id = ${fullSessionTable}.session_id\n`
      }
    } else {
      sql += '    e.*'

      if (needsSessionJoin && requiredSessionColumns.length > 0) {
        sql += ',\n'
        sql += '    ' + requiredSessionColumns.map((col) => `s.${col}`).join(',\n    ')
      }

      if (needsUrlFullpath) {
        sql += needsSessionJoin ? ',\n' : '\n'
        sql += "    CONCAT(IFNULL(e.url_path, ''), IFNULL(e.url_query, '')) as url_fullpath"
      }

      if (needsReferrerFullpath) {
        sql += needsSessionJoin || needsUrlFullpath ? ',\n' : '\n'
        sql += "    CONCAT(IFNULL(e.referrer_path, ''), IFNULL(e.referrer_query, '')) as referrer_fullpath"
      }

      sql += `  FROM ${fullWebsiteTable} e\n`

      if (needsSessionJoin) {
        sql += `  LEFT JOIN ${fullSessionTable} s\n`
        sql += '    ON e.session_id = s.session_id\n'
      }
    }
  }

  sql += `  WHERE ${tablePrefix}website_id = '${config.website.id}'\n`

  // Partition filter for the joined session table — without it BigQuery
  // rejects the whole query (REQUIRE_PARTITION_FILTER on public_session).
  if (requiredTables.session) {
    sql += getSessionDateFilterConditions(
      filters,
      sessionRef === 's' ? 's.' : `${fullSessionTable}.`,
      hasInteractiveDateFilter,
    )
    sql += '\n'
  }

  // Process filters with consistent table references
  filters.forEach((filter) => {
    if (filter.column.startsWith('param_')) {
      return
    } else {
      if (filter.interactive === true && filter.metabaseParam === true && filter.value) {
        if (filter.column === 'created_at') {
          sql += `  [[AND {{created_at}} ]]\n`
        } else {
          const tablePrefix2 = isSessionColumn(filter.column) && needsSessionJoin ? 's.' : 'e.'
          const paramName = filter.value.replace(/[{}]/g, '').trim()
          sql += `  AND ${tablePrefix2}${filter.column} = {{${paramName}}}\n`
        }
      } else if (filter.operator === 'IN' && filter.multipleValues && filter.multipleValues.length > 0) {
        const valueList = filter.multipleValues
          .map((val) => {
            const needsQuotes =
              isNaN(Number(val)) ||
              filter.column === 'event_name' ||
              filter.column === 'url_path' ||
              filter.column.includes('_path') ||
              filter.column.includes('_name')
            return needsQuotes ? `'${val.replace(/'/g, "''")}'` : val
          })
          .join(', ')

        if (hasInteractiveFieldFilter) {
          const tableName = isSessionColumn(filter.column) && needsSessionJoin ? fullSessionTable : fullWebsiteTable
          sql += `  AND ${tableName}.${filter.column} IN (${valueList})\n`
        } else {
          const prefix = isSessionColumn(filter.column) && needsSessionJoin ? 's.' : 'e.'
          sql += `  AND ${prefix}${filter.column} IN (${valueList})\n`
        }
      } else if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
        if (hasInteractiveFieldFilter) {
          const tableName = isSessionColumn(filter.column) && needsSessionJoin ? fullSessionTable : fullWebsiteTable
          sql += `  AND ${tableName}.${filter.column} ${filter.operator}\n`
        } else {
          const prefix = isSessionColumn(filter.column) && needsSessionJoin ? 's.' : 'e.'
          sql += `  AND ${prefix}${filter.column} ${filter.operator}\n`
        }
      } else if (filter.value) {
        let tableRef
        if (hasInteractiveFieldFilter) {
          tableRef =
            isSessionColumn(filter.column) && needsSessionJoin ? `${fullSessionTable}.` : `${fullWebsiteTable}.`
        } else {
          tableRef = isSessionColumn(filter.column) && needsSessionJoin ? 's.' : 'e.'
        }

        if (filter.operator === 'STARTS_WITH') {
          sql += `  AND ${tableRef}${filter.column} LIKE '${filter.value.replace(/'/g, "''")}%'\n`
        } else if (filter.operator === 'ENDS_WITH') {
          sql += `  AND ${tableRef}${filter.column} LIKE '%${filter.value.replace(/'/g, "''")}'\n`
        } else if ((filter.operator === 'LIKE' || filter.operator === 'NOT LIKE') && !filter.value.includes('%')) {
          sql += `  AND ${tableRef}${filter.column} ${filter.operator} '%${filter.value.replace(/'/g, "''")}%'`
        } else {
          const isMetabaseParam =
            filter.metabaseParam === true ||
            (typeof filter.value === 'string' && /^\s*\{\{.*\}\}\s*$/.test(filter.value))

          const isTimestampFunction =
            typeof filter.value === 'string' &&
            filter.value.toUpperCase().includes('TIMESTAMP(') &&
            !filter.value.startsWith("'")

          if (isMetabaseParam) {
            if (filter.column === 'url_path') {
              sql += `  AND ${tableRef}${filter.column} = [[ ${filter.value.trim()} --]] '/'\n`
            } else {
              sql += `  AND ${tableRef}${filter.column} ${filter.operator} ${filter.value.trim()}\n`
            }
          } else {
            const needsQuotes =
              !isTimestampFunction &&
              (isNaN(Number(filter.value)) ||
                filter.column === 'event_name' ||
                filter.column === 'url_path' ||
                filter.column.includes('_path') ||
                filter.column.includes('_name'))

            const formattedValue = isTimestampFunction
              ? filter.value.replace(/^['"]|['"]$/g, '')
              : needsQuotes
                ? `'${filter.value.replace(/'/g, "''")}'`
                : filter.value

            sql += `  AND ${tableRef}${filter.column} ${filter.operator} ${formattedValue}\n`
          }
        }
      } else if (filter.operator !== 'IS NULL' && filter.operator !== 'IS NOT NULL') {
        console.warn(`Skipping filter with no value: ${filter.column} ${filter.operator}`)
      }
    }
  })

  const needsDurationMode = config.metrics.some((m) => m.function === 'mode' && m.column === 'visit_duration')
  const hasGroupBy = config.groupByFields.length > 0 || hasSegmentBreakdown

  if (needsDurationMode && !hasGroupBy) {
    sql += '),\nduration_mode AS (\n'
    sql += '  SELECT visit_duration\n'
    sql += '  FROM base_query\n'
    sql += '  WHERE visit_duration IS NOT NULL AND visit_duration != 0\n'
    sql += '  GROUP BY visit_duration\n'
    sql += '  ORDER BY COUNT(*) DESC, visit_duration ASC\n'
    sql += '  LIMIT 1\n'
    sql += ')\n'
  } else {
    sql += ')\n'
  }

  if (hasSegmentBreakdown) {
    const segmentQueries = effectiveSegmentDefinitions.map((segment) => {
      const segmentFilters = segment.filters || []
      const segmentConditions = segmentFilters
        .map((filter) => buildSegmentFilterCondition(filter, 'b'))
        .filter((condition): condition is string => Boolean(condition))

      if (segment.performed && segment.performed.events.length > 0) {
        const { operator, events } = segment.performed

        if (operator === 'IN') {
          const eventList = events.map((event) => `'${escapeSqlLiteral(event)}'`).join(', ')
          segmentConditions.push(`b.event_name IN (${eventList})`)
        } else {
          const selectedEvent = events[0]
          if (selectedEvent) {
            if (operator === 'LIKE') {
              segmentConditions.push(`b.event_name LIKE '%${escapeSqlLiteral(selectedEvent)}%'`)
            } else if (operator === '!=') {
              segmentConditions.push(`b.event_name != '${escapeSqlLiteral(selectedEvent)}'`)
            } else if (operator === 'STARTS_WITH') {
              segmentConditions.push(`b.event_name LIKE '${escapeSqlLiteral(selectedEvent)}%'`)
            } else if (operator === 'ENDS_WITH') {
              segmentConditions.push(`b.event_name LIKE '%${escapeSqlLiteral(selectedEvent)}'`)
            } else {
              segmentConditions.push(`b.event_name = '${escapeSqlLiteral(selectedEvent)}'`)
            }
          }
        }
      }

      const whereClause = segmentConditions.length > 0 ? segmentConditions.join('\n    AND ') : '1=1'

      return `  SELECT '${escapeSqlLiteral(segment.name)}' AS segment_navn, b.*\n  FROM base_query b\n  WHERE ${whereClause}`
    })

    sql += ',\nsegmented_base AS (\n'
    sql += segmentQueries.join('\n  UNION ALL\n')
    sql += '\n)\n\n'
  } else if (isRatioMode) {
    const buildSegmentCte = (segment: (typeof effectiveSegmentDefinitions)[0], cteName: string) => {
      const sFilters = segment.filters || []
      const conditions = sFilters
        .map((filter) => buildSegmentFilterCondition(filter, 'b'))
        .filter((c): c is string => Boolean(c))

      if (segment.performed && segment.performed.events.length > 0) {
        const { operator, events } = segment.performed
        if (operator === 'IN') {
          const eventList = events.map((e) => `'${escapeSqlLiteral(e)}'`).join(', ')
          conditions.push(`b.event_name IN (${eventList})`)
        } else {
          const ev = events[0]
          if (ev) {
            if (operator === 'LIKE') conditions.push(`b.event_name LIKE '%${escapeSqlLiteral(ev)}%'`)
            else if (operator === '!=') conditions.push(`b.event_name != '${escapeSqlLiteral(ev)}'`)
            else if (operator === 'STARTS_WITH') conditions.push(`b.event_name LIKE '${escapeSqlLiteral(ev)}%'`)
            else if (operator === 'ENDS_WITH') conditions.push(`b.event_name LIKE '%${escapeSqlLiteral(ev)}'`)
            else conditions.push(`b.event_name = '${escapeSqlLiteral(ev)}'`)
          }
        }
      }

      const whereClause = conditions.length > 0 ? conditions.join('\n    AND ') : '1=1'
      return `,\n${cteName} AS (\n  SELECT b.*\n  FROM base_query b\n  WHERE ${whereClause}\n)\n`
    }

    const seg1 = effectiveSegmentDefinitions[0]
    const seg2 = effectiveSegmentDefinitions[1]
    sql += buildSegmentCte(seg1, 'seg1')
    sql += buildSegmentCte(seg2, 'seg2')

    const activeMetric = config.metrics[0]
    const metricAlias = activeMetric?.alias || 'ratio'

    const getRatioAggregation = (segName: string): string => {
      if (!activeMetric) return `COUNT(*)`
      switch (activeMetric.function) {
        case 'distinct': {
          const col = activeMetric.column === 'session_id' ? 'session_id' : (activeMetric.column ?? 'session_id')
          return `COUNT(DISTINCT ${segName}.${col})`
        }
        case 'count':
        default:
          return `COUNT(*)`
      }
    }

    const seg1Name = escapeSqlLiteral(seg1.name)
    const seg2Name = escapeSqlLiteral(seg2.name)
    sql += `\nSELECT\n`
    sql += `  ROUND(\n`
    sql += `    SAFE_DIVIDE(\n`
    sql += `      (SELECT ${getRatioAggregation('seg1')} FROM seg1),\n`
    sql += `      (SELECT ${getRatioAggregation('seg2')} FROM seg2)\n`
    sql += `    ), 4) AS \`${metricAlias}\`,\n`
    sql += `  '${seg1Name}' AS segment_1,\n`
    sql += `  '${seg2Name}' AS segment_2\n`
    return sql
  } else {
    sql += '\n'
  }

  sql += 'SELECT\n'
  const groupingSelectClauses: string[] = []
  const metricSelectClauses: string[] = []

  if (hasSegmentBreakdown) {
    groupingSelectClauses.push('base_query.segment_navn AS segment')
  }

  config.groupByFields.forEach((field) => {
    if (field === 'created_at') {
      const format =
        DATE_FORMATS.find((f: { value: string; format: string }) => f.value === config.dateFormat)?.format || '%Y-%m-%d'
      groupingSelectClauses.push(`FORMAT_TIMESTAMP('${format}', base_query.created_at) AS dato`)
    } else if (field.startsWith('param_')) {
      const paramBase = field.replace('param_', '')
      const matchingParams = parameters.filter((p) => {
        const baseName = p.key.split('.').pop()
        return sanitizeColumnName(baseName!) === paramBase
      })
      if (matchingParams.length > 0) {
        const param = matchingParams[0]
        const valueField = param.type === 'number' ? 'number_value' : 'string_value'
        if (config.paramAggregation === 'unique' && param.type === 'string') {
          groupingSelectClauses.push(`event_data_${paramBase}.${valueField} AS ${field}`)
        } else {
          const aggregator = getParameterAggregator(param.type)
          groupingSelectClauses.push(
            `${aggregator}(CASE 
                WHEN SUBSTR(event_data.data_key, INSTR(event_data.data_key, '.') + 1) = '${paramBase}' THEN event_data.${valueField}
                ELSE NULL
              END) AS ${field}`,
          )
        }
      }
    } else if (field === 'visit_duration') {
      const visitDurationBucketFilter = filters.find(
        (f) =>
          f.column === 'custom_column' &&
          f.customColumn &&
          f.customColumn.includes('visit_duration') &&
          f.customColumn.includes('CASE'),
      )

      if (visitDurationBucketFilter && visitDurationBucketFilter.customColumn) {
        groupingSelectClauses.push(`${visitDurationBucketFilter.customColumn} AS visit_duration_bucket`)
      } else {
        groupingSelectClauses.push(`base_query.visit_duration AS visit_duration`)
      }
    } else {
      groupingSelectClauses.push(`base_query.${field}`)
    }
  })

  config.metrics.forEach((metric, index) => {
    metricSelectClauses.push(getMetricSQL(metric, index, filters, config.website!.id, hasGroupBy))
  })

  const orderedSelectClauses =
    config.columnOrderMode === 'metrics_first'
      ? [...metricSelectClauses, ...groupingSelectClauses]
      : [...groupingSelectClauses, ...metricSelectClauses]
  const dedupedSelectClauses = Array.from(new Set(orderedSelectClauses))

  sql += '  ' + dedupedSelectClauses.join(',\n  ')

  sql += hasSegmentBreakdown ? '\nFROM segmented_base AS base_query\n' : '\nFROM base_query\n'

  if (parameters.length > 0) {
    const needsEventData =
      config.groupByFields.some((field) => field.startsWith('param_')) ||
      filters.some((filter) => filter.column.startsWith('param_')) ||
      config.metrics.some((metric) => metric.column?.startsWith('param_'))

    if (needsEventData) {
      sql += `LEFT JOIN \`${projectId}.umami_views.event_data\` AS ed_view\n`
      sql += '  ON base_query.event_id = ed_view.website_event_id\n'
      sql += '  AND base_query.website_id = ed_view.website_id\n'
      sql += '  AND base_query.created_at = ed_view.created_at\n'

      // OPTIMIZATION: Add explicit date filters for partition pruning on the joined table
      filters
        .filter((f) => f.column === 'created_at' && (!f.interactive || !f.metabaseParam) && f.value)
        .forEach((f) => {
          sql += `  AND ed_view.created_at ${f.operator} ${f.value}\n`
        })

      sql += 'LEFT JOIN UNNEST(ed_view.event_parameters) AS event_data\n'

      // Add additional UNNEST joins for unique param aggregation BEFORE the WHERE clause
      if (config.paramAggregation === 'unique') {
        config.groupByFields.forEach((field) => {
          if (field.startsWith('param_')) {
            const paramBase = field.replace('param_', '')
            const matchingParam = parameters.find((p) => {
              const baseName = p.key.split('.').pop()
              return sanitizeColumnName(baseName!) === paramBase
            })
            if (matchingParam && matchingParam.type === 'string') {
              sql += `LEFT JOIN UNNEST(ed_view.event_parameters) AS event_data_${paramBase}\n`
              sql += `  ON SUBSTR(event_data_${paramBase}.data_key, INSTR(event_data_${paramBase}.data_key, '.') + 1) = '${paramBase}'\n`
            }
          }
        })
      }

      // Add WHERE clause for param_ filters AFTER all JOINs
      const paramFilters = filters.filter((f) => f.column.startsWith('param_'))
      if (paramFilters.length > 0) {
        paramFilters.forEach((filter, idx) => {
          const paramBase = filter.column.replace('param_', '')
          const matchingParams = parameters.filter((p) => {
            const baseName = p.key.split('.').pop()
            return sanitizeColumnName(baseName!) === paramBase
          })
          if (matchingParams.length > 0) {
            const param = matchingParams[0]
            const valueField = param.type === 'number' ? 'number_value' : 'string_value'
            const connector = idx === 0 ? 'WHERE' : '  AND'

            let formattedValue = filter.value
            if (param.type === 'string' && filter.value) {
              formattedValue = `'${String(filter.value).replace(/'/g, "''")}'`
            }

            sql += `${connector} event_data.data_key = '${paramBase}' AND event_data.${valueField} ${filter.operator} ${formattedValue}\n`
          }
        })
      }
    }
  }

  if (config.groupByFields.length > 0) {
    const groupByCols: string[] = []
    if (hasSegmentBreakdown) {
      groupByCols.push('base_query.segment_navn')
    }
    config.groupByFields.forEach((field) => {
      if (field === 'created_at') {
        groupByCols.push('dato')
      } else if (field === 'visit_duration') {
        const visitDurationBucketFilter = filters.find(
          (f) =>
            f.column === 'custom_column' &&
            f.customColumn &&
            f.customColumn.includes('visit_duration') &&
            f.customColumn.includes('CASE'),
        )

        if (visitDurationBucketFilter) {
          groupByCols.push('visit_duration_bucket')
        } else {
          groupByCols.push('visit_duration')
        }
      } else if (field.startsWith('param_') && config.paramAggregation === 'unique') {
        const paramBase = field.replace('param_', '')
        const matchingParam = parameters.find((p) => {
          const baseName = p.key.split('.').pop()
          return sanitizeColumnName(baseName!) === paramBase
        })
        if (matchingParam && matchingParam.type === 'string') {
          groupByCols.push(field)
        } else if (!matchingParam) {
          groupByCols.push(field)
        }
      } else if (!field.startsWith('param_')) {
        groupByCols.push(`base_query.${field}`)
      }
    })
    if (groupByCols.length > 0) {
      sql += 'GROUP BY\n  '
      sql += groupByCols.join(',\n  ')
      sql += '\n'
    }
  } else if (hasSegmentBreakdown) {
    sql += 'GROUP BY\n  base_query.segment_navn\n'
  }

  if (config.orderBy && config.orderBy.column && config.orderBy.direction) {
    const hasInteractiveFilters = filters.some((f) => f.interactive === true && f.metabaseParam === true)
    const metricWithAlias = config.metrics.find((m) => m.alias === config.orderBy?.column)

    let finalColumn = config.orderBy.column

    finalColumn = sanitizeFieldNameForBigQuery(finalColumn)

    if (config.orderBy.column === 'andel' && !metricWithAlias) {
      const percentageMetrics = config.metrics.filter((m) => m.function === 'percentage' && !m.alias)
      if (percentageMetrics.length === 1) {
        finalColumn = 'andel'
      }
    }

    const orderColumn =
      config.orderBy.column === 'created_at' ? 'dato' : hasInteractiveFilters ? finalColumn : `\`${finalColumn}\``

    const columnExists =
      config.groupByFields.some(
        (field) => (field === 'created_at' && config.orderBy?.column === 'dato') || field === config.orderBy?.column,
      ) ||
      config.metrics.some((m, i) => {
        if (m.alias === config.orderBy?.column) return true
        if (`metrikk_${i + 1}` === config.orderBy?.column) return true
        if (
          m.function === 'percentage' &&
          (config.orderBy?.column === 'andel' || config.orderBy?.column === `andel_${i + 1}`)
        )
          return true
        return false
      })

    if (columnExists) {
      sql += `ORDER BY ${orderColumn} ${config.orderBy.direction}\n`
    } else {
      if (config.groupByFields.includes('created_at')) {
        sql += 'ORDER BY dato ASC\n'
      } else {
        sql += 'ORDER BY 1 DESC\n'
      }
    }
  } else if (config.groupByFields.length > 0 || config.metrics.length > 0) {
    if (config.groupByFields.includes('created_at')) {
      sql += 'ORDER BY dato ASC\n'
    } else if (config.metrics.length > 0) {
      const firstMetric = config.metrics[0]
      const firstMetricAlias = firstMetric.alias || 'metrikk_1'
      const sanitizedAlias = sanitizeFieldNameForBigQuery(firstMetricAlias)
      sql += `ORDER BY \`${sanitizedAlias}\` ${config.orderBy?.direction || 'DESC'}\n`
    } else {
      sql += `ORDER BY 1 ${config.orderBy?.direction || 'DESC'}\n`
    }
  }

  if (needsDurationMode && !hasGroupBy) {
    sql += 'LIMIT 1\n'
    return sql
  }

  if (config.limit && config.limit > 0) {
    sql += `LIMIT ${config.limit}\n`
  }

  return zeroPadTimeSeries(sql, config, filters)
}

/**
 * Zero-padding for time-grouped queries: when the chart groups by Tidspunkt
 * (`created_at` in groupByFields) with day/week/month granularity, a plain
 * GROUP BY silently drops buckets that have no rows — the chart then shows a
 * gap in the line instead of dipping to 0, which reads as "no data collected"
 * rather than "nothing happened".
 *
 * Fix: wrap the finished aggregation, RIGHT JOIN it onto a calendar series
 * generated with GENERATE_DATE_ARRAY bounded by the query's own created_at
 * filter values (MIN/MAX over the data would keep leading/trailing zero-days
 * hidden, so the bounds must come from the filter, not the data), and
 * COALESCE every metric to 0.
 *
 * Skipped (deliberately) for:
 * - 'year' granularity — a year bucket without a single event is vanishingly
 *   rare in practice.
 * - 'week' granularity — the '%Y-%U' label can't be round-tripped to a DATE,
 *   so the calendar join has nothing to equate.
 * - interactive (Metabase {{created_at}}) filters — bounds live in the
 *   dashboard, not in the SQL text, so there's nothing to generate the
 *   calendar from.
 * - the segment-ratio early return and the duration-mode `LIMIT 1` path,
 *   neither of which is a time series at all.
 */
function zeroPadTimeSeries(sql: string, config: ChartConfig, filters: Filter[]): string {
  if (!config.groupByFields.includes('created_at')) return sql
  if (config.dateFormat === 'year') return sql

  // Week buckets are labelled '%Y-%U' — a format BigQuery cannot round-trip
  // back to a DATE, so a calendar join has nothing to equate. Day/month are
  // the granularities where zero-gaps actually occur and parse cleanly.
  if (config.dateFormat !== 'day' && config.dateFormat !== 'month') return sql

  const dateBounds = findCreatedAtBounds(filters)
  if (!dateBounds) return sql

  // `LIMIT` already got appended to the inner query above; keep it as-is
  // (inner LIMIT only thins the aggregated rows — the calendar join below
  // re-supplies any bucket the LIMIT dropped, which is exactly what we want
  // for day-scale charts where the row count is tiny anyway).
  const metricCols = config.metrics.map((m, i) => sanitizeFieldNameForBigQuery(m.alias || `metrikk_${i + 1}`))

  // Both join keys as DATE — the inner `dato` is a FORMAT_TIMESTAMP string,
  // which USING() refuses to equate with the calendar's DATE.
  const innerDatoExpr =
    config.dateFormat === 'month'
      ? "DATE(CONCAT(SPLIT(dato, '-')[OFFSET(0)], '-', SPLIT(dato, '-')[OFFSET(1)], '-01'))"
      : 'DATE(dato)'

  const calendar = `GENERATE_DATE_ARRAY(${toDateExpr(dateBounds.lower, config)}, ${toDateExpr(dateBounds.upper, config)})`

  // The padded rows come from the calendar side of the LEFT JOIN, where the
  // inner query's `dato` is NULL (rendered «(ukjent)» in the results table) —
  // the bucket date must carry the label. It must also be a STRING: a raw
  // DATE column deserializes to an object client-side (rendered «[object
  // Object]» on chart axes), while the inner query's dato is a
  // FORMAT_TIMESTAMP string — match that shape exactly.
  const datoFormat = config.dateFormat === 'month' ? '%Y-%m' : '%Y-%m-%d'
  let padded = `SELECT\n  FORMAT_DATE('${datoFormat}', bucket_date) AS dato,\n`
  padded += '  ' + metricCols.map((c) => `COALESCE(\`${c}\`, 0) AS \`${c}\``).join(',\n  ') + '\n'
  padded += `FROM UNNEST(${calendar}) AS bucket_date\n`
  padded += 'LEFT JOIN (\n'
  padded += sql.replace(/\n$/, '')
  padded += `\n) ON bucket_date = ${innerDatoExpr}\n`
  padded += 'ORDER BY bucket_date ASC\n'
  if (config.limit && config.limit > 0) {
    padded += `LIMIT ${config.limit}\n`
  }
  return padded
}

/**
 * Extracts `[lower, upper]` timestamp expressions from the created_at
 * filters. `<=` bounds that are open-ended "now" (`CURRENT_TIMESTAMP()`)
 * don't pin the calendar to a wall clock — pad through today anyway, since a
 * chart of "siste 7 dager" should show today-with-zero rather than silently
 * ending yesterday.
 */
function findCreatedAtBounds(filters: Filter[]): { lower: string; upper: string } | null {
  let lower: string | null = null
  let upper: string | null = null
  for (const f of filters) {
    const column = f.column === 'custom_column' ? f.customColumn : f.column
    if (column !== 'created_at' || !f.value) continue
    if (f.interactive && f.metabaseParam) return null // bounds live in Metabase
    if (f.operator === '>=') lower = f.value
    if (f.operator === '<=') upper = f.value
  }
  if (!lower) return null
  return { lower, upper: upper ?? 'CURRENT_TIMESTAMP()' }
}

/** Truncates a timestamp expression to the configured bucket granularity as a DATE. */
function toDateExpr(tsExpr: string, config: ChartConfig): string {
  const base = `DATE(${tsExpr})`
  if (config.dateFormat === 'week') return `DATE_TRUNC(${base}, WEEK(MONDAY))`
  if (config.dateFormat === 'month') return `DATE_TRUNC(${base}, MONTH)`
  return base
}
