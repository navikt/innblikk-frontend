import type { CohortDefinition } from '../../../shared/types/chart.ts'

/**
 * SQL clauses produced by buildCohortClauses.
 * Each field maps to one insertion point in generateSQLCore.
 *
 * active=false → single-cohort query, all other fields are empty strings.
 */
export type CohortClauses = {
  /** Whether multi-cohort SQL mode is needed at all. */
  active: boolean
  /** The `segmented_base AS (...)` CTE block, including leading `,\n` and trailing `\n)\n\n`. */
  cte: string
  /** SELECT column: `base_query.segment_navn AS segment` */
  selectColumn: string
  /** FROM suffix when cohorts are active: `segmented_base AS base_query` instead of `base_query`. */
  fromTable: string
  /** GROUP BY column: `base_query.segment_navn` */
  groupByColumn: string
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

const buildCohortFilterCondition = (filter: CohortDefinition['filters'][number], tableAlias: string): string | null => {
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

const buildPerformedCondition = (
  performed: NonNullable<CohortDefinition['performed']>,
  tableAlias: string,
): string | null => {
  if (performed.events.length === 0) return null

  const { operator, events } = performed

  if (operator === 'IN') {
    const eventList = events.map((e) => `'${escapeSqlLiteral(e)}'`).join(', ')
    return `${tableAlias}.event_name IN (${eventList})`
  }

  const selectedEvent = events[0]
  if (!selectedEvent) return null

  switch (operator) {
    case 'LIKE':
      return `${tableAlias}.event_name LIKE '%${escapeSqlLiteral(selectedEvent)}%'`
    case '!=':
      return `${tableAlias}.event_name != '${escapeSqlLiteral(selectedEvent)}'`
    case 'STARTS_WITH':
      return `${tableAlias}.event_name LIKE '${escapeSqlLiteral(selectedEvent)}%'`
    case 'ENDS_WITH':
      return `${tableAlias}.event_name LIKE '%${escapeSqlLiteral(selectedEvent)}'`
    default:
      return `${tableAlias}.event_name = '${escapeSqlLiteral(selectedEvent)}'`
  }
}

// TODO(backend-cohorts): When innblikk-backend cohorts branch merges and CohortDetailDto is live:
//   1. Add chartbuilder/api/cohortApi.ts  — GET /api/cohort?websiteId, GET /api/cohort/{id}
//   2. Add chartbuilder/utils/cohortDtoMapper.ts — translate CohortDetailDto → CohortDefinition:
//      - CohortEntryDto.conditions (field/value/conditionType) → Filter[]
//      - CohortEntryDto with EntryConditionType=PERFORMED → CohortDefinition.performed
//      - Skip time-scoped entries (TimeScope/TimeRangeType/TimeQualifier) — deferred per CONTEXT.md v1 scope
//   3. Grafbygger fetches CohortDetailDto per selected cohort and maps before calling buildCohortClauses.
export const buildCohortClauses = (cohorts: CohortDefinition[]): CohortClauses => {
  const inactive: CohortClauses = {
    active: false,
    cte: '',
    selectColumn: '',
    fromTable: 'base_query',
    groupByColumn: '',
  }

  const isActive =
    cohorts.length > 0 &&
    (cohorts.length > 1 || cohorts.some((c) => (c.filters?.length ?? 0) > 0 || (c.performed?.events?.length ?? 0) > 0))

  if (!isActive) return inactive

  const tableAlias = 'b'

  const cohortQueries = cohorts.map((cohort) => {
    const conditions: string[] = (cohort.filters ?? [])
      .map((f) => buildCohortFilterCondition(f, tableAlias))
      .filter((c): c is string => Boolean(c))

    if (cohort.performed) {
      const performedCond = buildPerformedCondition(cohort.performed, tableAlias)
      if (performedCond) conditions.push(performedCond)
    }

    const whereClause = conditions.length > 0 ? conditions.join('\n    AND ') : '1=1'

    return `  SELECT '${escapeSqlLiteral(cohort.name)}' AS segment_navn, b.*\n  FROM base_query b\n  WHERE ${whereClause}`
  })

  const cte = ',\nsegmented_base AS (\n' + cohortQueries.join('\n  UNION ALL\n') + '\n)\n\n'

  return {
    active: true,
    cte,
    selectColumn: 'base_query.segment_navn AS segment',
    fromTable: 'segmented_base AS base_query',
    groupByColumn: 'base_query.segment_navn',
  }
}
