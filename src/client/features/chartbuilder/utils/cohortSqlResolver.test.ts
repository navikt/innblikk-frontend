import { describe, it, expect } from 'vitest'
import { conditionTypeToOperator, cohortEntryToFilters, resolveCohortToSegmentDefinition } from './cohortSqlResolver.ts'
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
})

describe('cohortEntryToFilters', () => {
  it('returns [] for IN_COHORT entries', () => {
    const entry: CohortEntryDto = {
      condition: 'IN_COHORT',
      negation: false,
      operator: 'AND',
      referencedCohortId: 'abc',
      conditions: [],
    }
    expect(cohortEntryToFilters(entry)).toEqual([])
  })

  it('returns IN filter for PERFORMED entry without negation', () => {
    const entry: CohortEntryDto = {
      condition: 'PERFORMED',
      negation: false,
      operator: 'AND',
      conditions: [{ field: 'event_name', value: 'my-event', conditionType: 'EQUALS' }],
    }
    expect(cohortEntryToFilters(entry)).toEqual([
      { column: 'event_name', operator: 'IN', multipleValues: ['my-event'] },
    ])
  })

  it('returns != filters for PERFORMED entry with negation', () => {
    const entry: CohortEntryDto = {
      condition: 'PERFORMED',
      negation: true,
      operator: 'AND',
      conditions: [{ field: 'event_name', value: 'my-event', conditionType: 'EQUALS' }],
    }
    expect(cohortEntryToFilters(entry)).toEqual([{ column: 'event_name', operator: '!=', value: 'my-event' }])
  })

  it('returns EQUALS filter for regular field condition', () => {
    // IN_COHORT returns [] — need to test via a non-PERFORMED, non-IN_COHORT path
    // Looking at source: only PERFORMED and IN_COHORT are handled specially;
    // any other condition falls through to the regular field mapping.
    // CohortEntryDto.condition is typed as 'PERFORMED' | 'IN_COHORT', so we cast.
    const regularFieldEntry = {
      condition: 'HAS_PROPERTY' as CohortEntryDto['condition'],
      negation: false,
      operator: 'AND' as const,
      conditions: [{ field: 'os_name', value: 'iOS', conditionType: 'EQUALS' as const }],
    }
    expect(cohortEntryToFilters(regularFieldEntry)).toEqual([{ column: 'os_name', operator: '=', value: 'iOS' }])
  })

  it('skips created_at (time-scope) fields', () => {
    const entry = {
      condition: 'HAS_PROPERTY' as CohortEntryDto['condition'],
      negation: false,
      operator: 'AND' as const,
      conditions: [{ field: 'created_at', value: '2024-01-01', conditionType: 'EQUALS' as const }],
    }
    expect(cohortEntryToFilters(entry)).toEqual([])
  })
})

describe('resolveCohortToSegmentDefinition', () => {
  it('maps PERFORMED entry to performed field', () => {
    const cohort: CohortDetailDto = {
      id: 'c1',
      websiteId: 'w1',
      name: 'Test Cohort',
      entries: [
        {
          condition: 'PERFORMED',
          negation: false,
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
          condition: 'HAS_PROPERTY' as CohortEntryDto['condition'],
          negation: false,
          operator: 'AND',
          conditions: [{ field: 'os_name', value: 'iOS', conditionType: 'EQUALS' }],
        },
      ],
    }
    const result = resolveCohortToSegmentDefinition(cohort, 1)
    expect(result.filters).toEqual([{ column: 'os_name', operator: '=', value: 'iOS' }])
    expect(result.id).toBe(2)
    expect(result.performed).toBeNull()
  })
})
