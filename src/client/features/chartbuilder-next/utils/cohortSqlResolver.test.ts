import { describe, it, expect } from 'vitest'
import { format as formatSql } from 'sql-formatter'
import { resolveCohortToSegmentDefinition } from './cohortSqlResolver.ts'
import type { CohortResolutionContext } from './cohortSqlResolver.ts'
import type { CohortDetailDto, CohortGroupNode } from '../../../shared/types/cohort.ts'

/**
 * This adapter delegates all tree-to-SQL logic to the canonical, fully tested
 * resolver (cohortmanager/utils/cohortSqlResolver.ts, 17 tests covering
 * AND/OR/NOT nesting, cohort references, sequences, and date handling) — so
 * these tests only cover what THIS file is responsible for: wiring Grafbygger
 * context (the `b` row alias, `session_id` identity column, website scoping)
 * and packaging the result as a SegmentDefinition.
 */

const group = (overrides: Partial<Omit<CohortGroupNode, 'nodeType'>> = {}): CohortGroupNode => ({
  nodeType: 'GROUP',
  combinator: 'AND',
  negated: false,
  children: [],
  ...overrides,
})

const cohort = (root: CohortGroupNode | null, overrides: Partial<CohortDetailDto> = {}): CohortDetailDto => ({
  id: 'c1',
  websiteId: 'w1',
  name: 'Test Cohort',
  root,
  ...overrides,
})

const defaultCtx = (overrides: Partial<CohortResolutionContext> = {}): CohortResolutionContext => ({
  eventsTable: 'events',
  sessionTable: 'session',
  websiteId: 'w1',
  cohortLookup: new Map(),
  ...overrides,
})

const pretty = (sql: string) => formatSql(sql, { language: 'bigquery' })

describe('resolveCohortToSegmentDefinition', () => {
  it('returns empty filters and null performed when the cohort has no criteria yet', () => {
    const result = resolveCohortToSegmentDefinition(cohort(null), 0, defaultCtx())
    expect(result.filters).toEqual([])
    expect(result.performed).toBeNull()
  })

  it('sets id (1-indexed) and name, performed always null', () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(group({ children: [{ nodeType: 'CONDITION', field: 'os', conditionType: 'EQUALS', value: 'iOS' }] }), {
        name: 'My Cohort',
      }),
      2,
      defaultCtx(),
    )
    expect(result.id).toBe(3)
    expect(result.name).toBe('My Cohort')
    expect(result.performed).toBeNull()
  })

  it('packages the resolved expression as a single rawExpression filter', () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(group({ children: [{ nodeType: 'CONDITION', field: 'os', conditionType: 'EQUALS', value: 'iOS' }] })),
      0,
      defaultCtx(),
    )
    expect(result.filters).toHaveLength(1)
    expect(result.filters[0].rawExpression).toBeTruthy()
  })

  it("correlates on session_id (this codebase's visitor-identity column) against the `b` row alias", () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(group({ children: [{ nodeType: 'CONDITION', field: 'os', conditionType: 'EQUALS', value: 'iOS' }] })),
      0,
      defaultCtx(),
    )
    const sql = pretty(result.filters[0].rawExpression ?? '')
    expect(sql).toContain('session_id = b.session_id')
  })

  it('adds a bounded created_at fallback when the cohort has no time criteria (partition-enforced tables)', () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(
        group({ children: [{ nodeType: 'CONDITION', field: 'event_name', conditionType: 'EQUALS', value: 'klikk' }] }),
      ),
      0,
      defaultCtx(),
    )
    const expr = result.filters[0].rawExpression ?? ''
    expect(expr).toContain('.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 400 DAY)')
  })

  it('does NOT add the fallback when the cohort already filters on created_at', () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(
        group({
          children: [
            {
              nodeType: 'CONDITION',
              field: 'created_at',
              conditionType: 'GREATER_THAN_OR_EQUAL',
              value: '2026-08-01T00:00:00',
            },
          ],
        }),
      ),
      0,
      defaultCtx(),
    )
    const expr = result.filters[0].rawExpression ?? ''
    expect(expr).toContain('.created_at')
    expect(expr).not.toContain('INTERVAL 400 DAY')
  })

  it('bounds the session join on created_at (public_session is partition-enforced)', () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(group({ children: [{ nodeType: 'CONDITION', field: 'os', conditionType: 'EQUALS', value: 'iOS' }] })),
      0,
      defaultCtx(),
    )
    const expr = result.filters[0].rawExpression ?? ''
    // Session table is joined (aliased) with a partition bound on its created_at.
    expect(expr).toContain('LEFT JOIN session')
    expect(expr).toMatch(
      /JOIN session \w+ ON [^\n]*\.created_at >= TIMESTAMP_SUB\(CURRENT_TIMESTAMP\(\), INTERVAL 400 DAY\)/,
    )
  })

  it("scopes generated subqueries to the cohort's website via extraConditionFn", () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(group({ children: [{ nodeType: 'CONDITION', field: 'os', conditionType: 'EQUALS', value: 'iOS' }] })),
      0,
      defaultCtx({ websiteId: 'my-website-id' }),
    )
    expect(result.filters[0].rawExpression).toContain("website_id = 'my-website-id'")
  })

  it("uses ctx.eventsTable as the correlated subquery's FROM table", () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(group({ children: [{ nodeType: 'CONDITION', field: 'os', conditionType: 'EQUALS', value: 'iOS' }] })),
      0,
      defaultCtx({ eventsTable: '`project.dataset.event`' }),
    )
    expect(result.filters[0].rawExpression).toContain('FROM `project.dataset.event`')
  })

  it("resolves a COHORT_REF via ctx.cohortLookup (inlining the referenced cohort's tree)", () => {
    const referenced = cohort(
      group({ children: [{ nodeType: 'CONDITION', field: 'event_name', conditionType: 'EQUALS', value: 'signup' }] }),
      { id: 'c99', name: 'Referenced' },
    )
    const result = resolveCohortToSegmentDefinition(
      cohort(group({ children: [{ nodeType: 'COHORT_REF', referencedCohortId: 99, negated: false }] })),
      0,
      defaultCtx({ cohortLookup: new Map([['99', referenced]]) }),
    )
    expect(result.filters[0].rawExpression).toContain("event_name = 'signup'")
  })

  it('falls back to "matches everyone" (does not throw) when a referenced cohort is missing from the lookup', () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(group({ children: [{ nodeType: 'COHORT_REF', referencedCohortId: 404, negated: false }] })),
      0,
      defaultCtx({ cohortLookup: new Map() }),
    )
    expect(() => result).not.toThrow()
    expect(result.filters[0].rawExpression?.trim().toUpperCase()).toBe('TRUE')
  })

  it('preserves OR nesting end-to-end through the adapter (the originally reported bug)', () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(
        group({
          combinator: 'OR',
          children: [
            group({ children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/' }] }),
            group({
              children: [{ nodeType: 'CONDITION', field: 'browser', conditionType: 'EQUALS', value: 'Chrome' }],
            }),
          ],
        }),
      ),
      0,
      defaultCtx(),
    )
    const sql = pretty(result.filters[0].rawExpression ?? '')
    expect(sql).toContain('OR')
  })

  it('joins the session table for session-level fields (browser/os/device/country/...) since they are not columns on eventsTable', () => {
    const result = resolveCohortToSegmentDefinition(
      cohort(
        group({
          children: [
            { nodeType: 'CONDITION', field: 'browser', conditionType: 'EQUALS', value: 'Chrome' },
            { nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/' },
          ],
        }),
      ),
      0,
      defaultCtx({ sessionTable: '`project.dataset.session`' }),
    )
    const sql = result.filters[0].rawExpression ?? ''
    expect(sql).toContain('LEFT JOIN `project.dataset.session`')
    // url_path is an event-table column — it must be referenced via the row alias, not the joined session alias
    expect(sql).toContain('e.url_path')
    expect(sql).not.toContain('ej0.url_path')
  })
})
