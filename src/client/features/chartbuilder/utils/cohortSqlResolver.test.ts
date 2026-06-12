import { describe, it, expect } from 'vitest'
import {
  conditionTypeToOperator,
  cohortEntryToFilters,
  resolveCohortToSegmentDefinition,
  dateValueToBigQuery,
} from './cohortSqlResolver.ts'
import type { CohortEntryDto, CohortDetailDto } from '../../../shared/types/cohort.ts'

describe('conditionTypeToOperator', () => {
  it("maps EQUALS to '='", () => {
    expect(conditionTypeToOperator('EQUALS')).toBe('=')
  })

  it("maps NOT_EQUALS to '!='", () => {
    expect(conditionTypeToOperator('NOT_EQUALS')).toBe('!=')
  })

  it("maps CONTAINS to 'LIKE'", () => {
    expect(conditionTypeToOperator('CONTAINS')).toBe('LIKE')
  })

  it("maps IN_SET to 'IN'", () => {
    expect(conditionTypeToOperator('IN_SET')).toBe('IN')
  })

  it("maps NOT_IN_SET to 'NOT IN'", () => {
    expect(conditionTypeToOperator('NOT_IN_SET')).toBe('NOT IN')
  })

  it("maps GREATER_THAN_OR_EQUAL to '>='", () => {
    expect(conditionTypeToOperator('GREATER_THAN_OR_EQUAL')).toBe('>=')
  })

  it("maps LESS_THAN_OR_EQUAL to '<='", () => {
    expect(conditionTypeToOperator('LESS_THAN_OR_EQUAL')).toBe('<=')
  })
})

describe('dateValueToBigQuery', () => {
  it('wraps absolute ISO string in TIMESTAMP()', () => {
    expect(dateValueToBigQuery('2024-01-15T00:00:00')).toBe("TIMESTAMP('2024-01-15T00:00:00')")
  })

  it('emits TIMESTAMP_SUB for negative relative offset (last N days)', () => {
    const relative = JSON.stringify({ mode: 'relative', anchor: 'now', offset: -30, unit: 'day' })
    expect(dateValueToBigQuery(relative)).toBe('TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)')
  })

  it('emits TIMESTAMP_ADD for positive relative offset (N days from now)', () => {
    const relative = JSON.stringify({ mode: 'relative', anchor: 'now', offset: 7, unit: 'day' })
    expect(dateValueToBigQuery(relative)).toBe('TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)')
  })

  it('emits anchor expression directly when offset is 0', () => {
    const relative = JSON.stringify({ mode: 'relative', anchor: 'startOfDay', offset: 0, unit: 'day' })
    expect(dateValueToBigQuery(relative)).toBe('TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)')
  })

  it('handles startOfMonth anchor with negative offset', () => {
    const relative = JSON.stringify({ mode: 'relative', anchor: 'startOfMonth', offset: -1, unit: 'month' })
    expect(dateValueToBigQuery(relative)).toBe(
      'TIMESTAMP_SUB(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH), INTERVAL 1 MONTH)',
    )
  })

  it('handles week unit', () => {
    const relative = JSON.stringify({ mode: 'relative', anchor: 'now', offset: -2, unit: 'week' })
    expect(dateValueToBigQuery(relative)).toBe('TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 WEEK)')
  })
})

describe('cohortEntryToFilters', () => {
  it('returns [] for inCohort entries', () => {
    const entry: CohortEntryDto = {
      inCohort: true,
      negated: false,
      operator: 'AND',
      referencedCohortId: 'abc',
      conditions: [],
    }
    expect(cohortEntryToFilters(entry)).toEqual([])
  })

  it('maps non-negated entry to = filter', () => {
    const entry: CohortEntryDto = {
      inCohort: false,
      negated: false,
      operator: 'AND',
      conditions: [{ field: 'event_name', value: 'my-event', conditionType: 'EQUALS' }],
    }
    expect(cohortEntryToFilters(entry)).toEqual([{ column: 'event_name', operator: '=', value: 'my-event' }])
  })

  it('flips operator for negated entry', () => {
    const entry: CohortEntryDto = {
      inCohort: false,
      negated: true,
      operator: 'AND',
      conditions: [{ field: 'event_name', value: 'my-event', conditionType: 'EQUALS' }],
    }
    expect(cohortEntryToFilters(entry)).toEqual([{ column: 'event_name', operator: '!=', value: 'my-event' }])
  })

  it('maps os field condition to filter', () => {
    const entry: CohortEntryDto = {
      inCohort: false,
      negated: false,
      operator: 'AND',
      conditions: [{ field: 'os', value: 'iOS', conditionType: 'EQUALS' }],
    }
    expect(cohortEntryToFilters(entry)).toEqual([{ column: 'os', operator: '=', value: 'iOS' }])
  })

  it('converts absolute created_at to TIMESTAMP() expression', () => {
    const entry: CohortEntryDto = {
      inCohort: false,
      negated: false,
      operator: 'AND',
      conditions: [{ field: 'created_at', value: '2024-01-01T00:00:00', conditionType: 'GREATER_THAN_OR_EQUAL' }],
    }
    expect(cohortEntryToFilters(entry)).toEqual([
      { column: 'created_at', operator: '>=', value: "TIMESTAMP('2024-01-01T00:00:00')" },
    ])
  })

  it('converts relative created_at to TIMESTAMP_SUB expression', () => {
    const relative = JSON.stringify({ mode: 'relative', anchor: 'now', offset: -30, unit: 'day' })
    const entry: CohortEntryDto = {
      inCohort: false,
      negated: false,
      operator: 'AND',
      conditions: [{ field: 'created_at', value: relative, conditionType: 'GREATER_THAN_OR_EQUAL' }],
    }
    expect(cohortEntryToFilters(entry)).toEqual([
      { column: 'created_at', operator: '>=', value: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)' },
    ])
  })

  it('flips >= to < for negated created_at', () => {
    const entry: CohortEntryDto = {
      inCohort: false,
      negated: true,
      operator: 'AND',
      conditions: [{ field: 'created_at', value: '2024-01-01T00:00:00', conditionType: 'GREATER_THAN_OR_EQUAL' }],
    }
    const result = cohortEntryToFilters(entry)
    expect(result[0].operator).toBe('<')
  })
})

describe('resolveCohortToSegmentDefinition', () => {
  it('hoists event_name = filter to performed field', () => {
    const cohort: CohortDetailDto = {
      id: 'c1',
      websiteId: 'w1',
      name: 'Test Cohort',
      entries: [
        {
          inCohort: false,
          negated: false,
          operator: 'AND',
          conditions: [{ field: 'event_name', value: 'click', conditionType: 'EQUALS' }],
        },
      ],
    }
    const result = resolveCohortToSegmentDefinition(cohort, 0)
    expect(result.performed).toEqual({ operator: 'IN', events: ['click'] })
    expect(result.id).toBe(1)
    expect(result.name).toBe('Test Cohort')
  })

  it('maps regular field conditions to filters array', () => {
    const cohort: CohortDetailDto = {
      id: 'c2',
      websiteId: 'w1',
      name: 'OS Cohort',
      entries: [
        {
          inCohort: false,
          negated: false,
          operator: 'AND',
          conditions: [{ field: 'os', value: 'iOS', conditionType: 'EQUALS' }],
        },
      ],
    }
    const result = resolveCohortToSegmentDefinition(cohort, 1)
    expect(result.filters).toEqual([{ column: 'os', operator: '=', value: 'iOS' }])
    expect(result.id).toBe(2)
    expect(result.performed).toBeNull()
  })

  it('includes created_at filter as BigQuery expression in filters array', () => {
    const cohort: CohortDetailDto = {
      id: 'c3',
      websiteId: 'w1',
      name: 'Time Cohort',
      entries: [
        {
          inCohort: false,
          negated: false,
          operator: 'AND',
          conditions: [{ field: 'created_at', value: '2024-06-01T00:00:00', conditionType: 'GREATER_THAN_OR_EQUAL' }],
        },
      ],
    }
    const result = resolveCohortToSegmentDefinition(cohort, 0)
    expect(result.filters).toEqual([
      { column: 'created_at', operator: '>=', value: "TIMESTAMP('2024-06-01T00:00:00')" },
    ])
  })
})
