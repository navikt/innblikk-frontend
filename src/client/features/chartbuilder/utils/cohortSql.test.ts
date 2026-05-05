import { describe, it, expect } from 'vitest'
import { buildCohortClauses } from './cohortSql.ts'
import type { CohortDefinition } from '../../../shared/types/chart.ts'

const emptyCohort = (id: number, name: string): CohortDefinition => ({
  id,
  name,
  filters: [],
  performed: null,
})

describe('buildCohortClauses', () => {
  describe('inactive cases', () => {
    it('returns inactive for empty array', () => {
      const result = buildCohortClauses([])
      expect(result.active).toBe(false)
      expect(result.cte).toBe('')
    })

    it('returns inactive for single cohort with no filters and no performed', () => {
      const result = buildCohortClauses([emptyCohort(1, 'Alle brukere')])
      expect(result.active).toBe(false)
    })
  })

  describe('active cases', () => {
    it('activates when two or more cohorts exist', () => {
      const result = buildCohortClauses([emptyCohort(1, 'A'), emptyCohort(2, 'B')])
      expect(result.active).toBe(true)
    })

    it('activates when single cohort has a filter', () => {
      const cohort: CohortDefinition = {
        id: 1,
        name: 'Med filter',
        filters: [{ column: 'url_path', operator: '=', value: '/home' }],
      }
      const result = buildCohortClauses([cohort])
      expect(result.active).toBe(true)
    })

    it('activates when single cohort has performed events', () => {
      const cohort: CohortDefinition = {
        id: 1,
        name: 'Utforte hendelser',
        filters: [],
        performed: { operator: 'IN', events: ['klikk'] },
      }
      const result = buildCohortClauses([cohort])
      expect(result.active).toBe(true)
    })
  })

  describe('CTE output', () => {
    it('produces a UNION ALL CTE for two cohorts', () => {
      const result = buildCohortClauses([emptyCohort(1, 'Gruppe A'), emptyCohort(2, 'Gruppe B')])
      expect(result.cte).toContain('segmented_base AS (')
      expect(result.cte).toContain("SELECT 'Gruppe A' AS segment_navn")
      expect(result.cte).toContain("SELECT 'Gruppe B' AS segment_navn")
      expect(result.cte).toContain('UNION ALL')
    })

    it('uses 1=1 WHERE clause when cohort has no conditions', () => {
      const result = buildCohortClauses([emptyCohort(1, 'A'), emptyCohort(2, 'B')])
      expect(result.cte).toContain('WHERE 1=1')
    })

    it('builds filter condition for url_path equality', () => {
      const cohort: CohortDefinition = {
        id: 1,
        name: 'Frontside',
        filters: [{ column: 'url_path', operator: '=', value: '/home' }],
        performed: null,
      }
      const result = buildCohortClauses([cohort, emptyCohort(2, 'Andre')])
      expect(result.cte).toContain("b.url_path = '/home'")
    })

    it('builds IN condition for multiple values', () => {
      const cohort: CohortDefinition = {
        id: 1,
        name: 'Sider',
        filters: [{ column: 'url_path', operator: 'IN', multipleValues: ['/a', '/b'] }],
      }
      const result = buildCohortClauses([cohort, emptyCohort(2, 'Resten')])
      expect(result.cte).toContain("b.url_path IN ('/a', '/b')")
    })

    it('builds STARTS_WITH as LIKE pattern', () => {
      const cohort: CohortDefinition = {
        id: 1,
        name: 'Prefiks',
        filters: [{ column: 'url_path', operator: 'STARTS_WITH', value: '/soknad' }],
      }
      const result = buildCohortClauses([cohort, emptyCohort(2, 'Resten')])
      expect(result.cte).toContain("b.url_path LIKE '/soknad%'")
    })

    it('escapes single quotes in cohort name', () => {
      const result = buildCohortClauses([emptyCohort(1, "O'Brien"), emptyCohort(2, 'Andre')])
      expect(result.cte).toContain("SELECT 'O''Brien' AS segment_navn")
    })

    it('builds performed IN condition', () => {
      const cohort: CohortDefinition = {
        id: 1,
        name: 'Klikket',
        filters: [],
        performed: { operator: 'IN', events: ['klikk', 'trykk'] },
      }
      const result = buildCohortClauses([cohort, emptyCohort(2, 'Resten')])
      expect(result.cte).toContain("b.event_name IN ('klikk', 'trykk')")
    })

    it('builds performed STARTS_WITH condition', () => {
      const cohort: CohortDefinition = {
        id: 1,
        name: 'Starter med',
        filters: [],
        performed: { operator: 'STARTS_WITH', events: ['nav_'] },
      }
      const result = buildCohortClauses([cohort, emptyCohort(2, 'Resten')])
      expect(result.cte).toContain("b.event_name LIKE 'nav_%'")
    })
  })

  describe('clause values', () => {
    it('returns correct selectColumn', () => {
      const result = buildCohortClauses([emptyCohort(1, 'A'), emptyCohort(2, 'B')])
      expect(result.selectColumn).toBe('base_query.segment_navn AS segment')
    })

    it('returns correct fromTable', () => {
      const result = buildCohortClauses([emptyCohort(1, 'A'), emptyCohort(2, 'B')])
      expect(result.fromTable).toBe('segmented_base AS base_query')
    })

    it('returns correct groupByColumn', () => {
      const result = buildCohortClauses([emptyCohort(1, 'A'), emptyCohort(2, 'B')])
      expect(result.groupByColumn).toBe('base_query.segment_navn')
    })

    it('inactive result has empty string fromTable fallback', () => {
      const result = buildCohortClauses([])
      expect(result.fromTable).toBe('base_query')
    })
  })
})
