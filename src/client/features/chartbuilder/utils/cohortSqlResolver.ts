import type { CohortDetailDto, CohortEntryDto, CohortConditionType } from '../../../shared/types/cohort.ts'
import type { Filter, SegmentDefinition, SegmentPerformed } from '../../../shared/types/chart.ts'

export function conditionTypeToOperator(type: CohortConditionType): string {
  switch (type) {
    case 'EQUALS':
      return '='
    case 'NOT_EQUALS':
      return '!='
    case 'CONTAINS':
      return 'LIKE'
    case 'IN_SET':
      return 'IN'
    case 'NOT_IN_SET':
      return 'NOT IN'
    case 'STARTS_WITH':
      return 'STARTS_WITH'
    case 'ENDS_WITH':
      return 'ENDS_WITH'
    case 'GREATER_THAN_OR_EQUAL':
      return '>='
    case 'LESS_THAN_OR_EQUAL':
      return '<='
    default:
      return '='
  }
}

// ─── Datetime value handling ──────────────────────────────────────────────────

interface RelativeDateTimeValue {
  mode: 'relative'
  anchor: string
  offset: number
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
}

function isRelativeDateTimeValue(value: unknown): value is RelativeDateTimeValue {
  return typeof value === 'object' && value !== null && (value as RelativeDateTimeValue).mode === 'relative'
}

const BQ_DATE_UNIT: Record<RelativeDateTimeValue['unit'], string> = {
  minute: 'MINUTE',
  hour: 'HOUR',
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
}

const BQ_ANCHOR: Record<string, string> = {
  now: 'CURRENT_TIMESTAMP()',
  startOfDay: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)',
  endOfDay: 'TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 1 DAY)',
  startOfWeek: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), WEEK)',
  endOfWeek: 'TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), WEEK), INTERVAL 1 WEEK)',
  startOfMonth: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)',
  endOfMonth: 'TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH), INTERVAL 1 MONTH)',
  startOfYear: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), YEAR)',
  endOfYear: 'TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), YEAR), INTERVAL 1 YEAR)',
}

/**
 * Converts a stored created_at value to a BigQuery SQL expression.
 *
 * Absolute ISO string → TIMESTAMP('2024-01-01T00:00:00')
 * RelativeDateTimeValue JSON → TIMESTAMP_SUB/ADD(anchor, INTERVAL N unit)
 *
 * The resulting expression is injected verbatim into SQL by buildSegmentFilterCondition
 * via the isTimestampFunction check (value contains 'TIMESTAMP').
 */
export function dateValueToBigQuery(rawValue: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    parsed = rawValue
  }

  if (isRelativeDateTimeValue(parsed)) {
    const anchor = BQ_ANCHOR[parsed.anchor] ?? 'CURRENT_TIMESTAMP()'
    const unit = BQ_DATE_UNIT[parsed.unit] ?? 'DAY'
    if (parsed.offset === 0) return anchor
    const fn = parsed.offset < 0 ? 'TIMESTAMP_SUB' : 'TIMESTAMP_ADD'
    return `${fn}(${anchor}, INTERVAL ${Math.abs(parsed.offset)} ${unit})`
  }

  // Absolute ISO string — wrap in TIMESTAMP() so BQ parses it correctly
  const isoString = typeof parsed === 'string' ? parsed : rawValue
  return `TIMESTAMP('${isoString.replace(/'/g, "''")}')`
}

// ─── Entry → Filters ──────────────────────────────────────────────────────────

/**
 * Maps a single cohort entry to a list of SQL Filter objects.
 *
 * Each entry holds N conditions — ALL applied as AND at the event-row level.
 *
 * created_at conditions produce raw BigQuery TIMESTAMP expressions that are
 * injected verbatim by buildSegmentFilterCondition (via isTimestampFunction check).
 *
 * event_name conditions are hoisted to SegmentDefinition.performed (IN / NOT IN).
 * All other field conditions become SegmentDefinition.filters (row-level WHERE).
 */
export function cohortEntryToFilters(entry: CohortEntryDto): Filter[] {
  if (entry.inCohort) {
    // TODO(v2): fetch and expand referenced cohort inline
    return []
  }

  const negated = entry.negated

  return entry.conditions.map((c) => {
    const isSet = c.conditionType === 'IN_SET' || c.conditionType === 'NOT_IN_SET'
    let operator = conditionTypeToOperator(c.conditionType)

    // Flip operator when entry is negated (NOT_PERFORMED)
    if (negated) {
      operator = negateOperator(operator)
    }

    // created_at: value → BigQuery TIMESTAMP expression (raw SQL injection)
    if (c.field === 'created_at') {
      return {
        column: c.field,
        operator,
        value: dateValueToBigQuery(c.value),
      }
    }

    if (isSet) {
      return {
        column: c.field,
        operator,
        multipleValues: [c.value],
      }
    }
    return {
      column: c.field,
      operator,
      value: c.value,
    }
  })
}

function negateOperator(op: string): string {
  switch (op) {
    case '=':
      return '!='
    case '!=':
      return '='
    case 'LIKE':
      return 'NOT LIKE'
    case 'NOT LIKE':
      return 'LIKE'
    case 'IN':
      return 'NOT IN'
    case 'NOT IN':
      return 'IN'
    case '>=':
      return '<'
    case '<=':
      return '>'
    default:
      return op
  }
}

export function resolveCohortToSegmentDefinition(cohort: CohortDetailDto, index: number): SegmentDefinition {
  const allFilters = cohort.entries.flatMap(cohortEntryToFilters)

  // event_name filters → hoisted to performed field
  const eventFilters = allFilters.filter((f) => f.column === 'event_name')
  const nonEventFilters = allFilters.filter((f) => f.column !== 'event_name')

  // Build performed from positive event_name IN conditions
  const positiveEventValues = eventFilters
    .filter((f) => f.operator === 'IN' || f.operator === '=')
    .flatMap((f) => f.multipleValues ?? (f.value ? [f.value] : []))

  const performed: SegmentPerformed | null =
    positiveEventValues.length > 0 ? { operator: 'IN', events: positiveEventValues } : null

  // Negative event conditions stay as regular filters
  const negativeEventFilters = eventFilters.filter((f) => f.operator === 'NOT IN' || f.operator === '!=')

  return {
    id: index + 1,
    name: cohort.name,
    filters: [...nonEventFilters, ...negativeEventFilters],
    performed,
  }
}
