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
    default:
      return '='
  }
}

const TIME_SCOPE_FIELDS = ['created_at', 'date', 'timestamp']

function isTimeScopeField(field: string): boolean {
  return TIME_SCOPE_FIELDS.includes(field)
}

export function cohortEntryToFilters(entry: CohortEntryDto): Filter[] {
  if (entry.condition === 'IN_COHORT') {
    // TODO(v2): fetch and expand referenced cohort inline
    return []
  }

  if (entry.condition === 'PERFORMED') {
    // TODO(v2): handle time-scoped PERFORMED conditions (timeScope, timeRangeType, etc.)
    const eventValues = entry.conditions.filter((c) => c.field === 'event_name').map((c) => c.value)

    if (eventValues.length === 0) return []

    if (!entry.negation) {
      return [
        {
          column: 'event_name',
          operator: 'IN',
          multipleValues: eventValues,
        },
      ]
    }
    return eventValues.map((v) => ({
      column: 'event_name',
      operator: '!=',
      value: v,
    }))
  }

  // Regular field conditions — skip time-scope fields in v1
  return entry.conditions
    .filter((c) => !isTimeScopeField(c.field))
    .map((c) => {
      if (c.conditionType === 'IN_SET' || c.conditionType === 'NOT_IN_SET') {
        return {
          column: c.field,
          operator: conditionTypeToOperator(c.conditionType),
          multipleValues: [c.value],
        }
      }
      return {
        column: c.field,
        operator: conditionTypeToOperator(c.conditionType),
        value: c.value,
      }
    })
}

export function resolveCohortToSegmentDefinition(cohort: CohortDetailDto, index: number): SegmentDefinition {
  const allFilters = cohort.entries.flatMap(cohortEntryToFilters)
  const nonEventFilters = allFilters.filter((f) => f.column !== 'event_name')

  // Use first non-negated PERFORMED entry for the `performed` field
  const performedEntry = cohort.entries.find((e) => e.condition === 'PERFORMED' && !e.negation)
  const performedEvents = performedEntry
    ? performedEntry.conditions.filter((c) => c.field === 'event_name').map((c) => c.value)
    : []

  const performed: SegmentPerformed | null =
    performedEvents.length > 0 ? { operator: 'IN', events: performedEvents } : null

  return {
    id: index + 1,
    name: cohort.name,
    filters: nonEventFilters,
    performed,
  }
}
