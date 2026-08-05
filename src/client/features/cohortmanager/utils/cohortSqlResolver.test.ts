import { describe, it, expect } from 'vitest'
import { format as formatSql } from 'sql-formatter'
import { resolveNodeToSql, dateValueToBigQuery } from './cohortSqlResolver.ts'
import type { ResolveContext } from './cohortSqlResolver.ts'
import type { CohortGroupNode, CohortConditionNode, CohortRefNode, CohortSequenceNode } from '../model/types.ts'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const condition = (
  field: string,
  value: string,
  conditionType: CohortConditionNode['conditionType'] = 'EQUALS',
): CohortConditionNode => ({ nodeType: 'CONDITION', field, conditionType, value })

const paramCondition = (
  paramKey: string,
  value: string,
  conditionType: CohortConditionNode['conditionType'] = 'EQUALS',
): CohortConditionNode => ({ nodeType: 'CONDITION', paramKey, conditionType, value })

const group = (overrides: Partial<Omit<CohortGroupNode, 'nodeType'>> = {}): CohortGroupNode => ({
  nodeType: 'GROUP',
  combinator: 'AND',
  negated: false,
  children: [],
  ...overrides,
})

const cohortRef = (referencedCohortId: number, negated = false): CohortRefNode => ({
  nodeType: 'COHORT_REF',
  referencedCohortId,
  negated,
})

const defaultCtx = (overrides: Partial<ResolveContext> = {}): ResolveContext => ({
  outerAlias: 'b',
  eventsTable: 'events',
  visitorIdColumn: 'visitor_id',
  resolveCohortRef: () => group({ children: [condition('event_name', 'placeholder')] }),
  ...overrides,
})

/**
 * Pretty-prints resolver output as BigQuery SQL so the expected shape is fully
 * readable in the inline snapshot below — no more guessing from scattered
 * toContain() fragments. Run `pnpm exec vitest -u <this file>` after
 * implementing the resolver to auto-fill the snapshots, then read/review them.
 */
const pretty = (sql: string) => formatSql(sql, { language: 'bigquery' })

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

describe('created_at BETWEEN condition', () => {
  it('resolves a single BETWEEN condition into two ANDed bounds on one column', () => {
    const root = group({
      children: [
        condition('created_at', JSON.stringify({ from: '2024-01-01T00:00:00', to: '2024-01-31T23:59:59' }), 'BETWEEN'),
      ],
    })

    const sql = pretty(resolveNodeToSql(root, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "EXISTS (
        SELECT
          1
        FROM
          events e
        WHERE
          e.visitor_id = b.visitor_id
          AND (
            e.created_at >= TIMESTAMP('2024-01-01T00:00:00')
            AND e.created_at <= TIMESTAMP('2024-01-31T23:59:59')
          )
      )"
    `)
  })

  it('resolves a relative BETWEEN condition (both bounds recomputed at evaluation time)', () => {
    const from = JSON.stringify({ mode: 'relative', anchor: 'now', offset: -30, unit: 'day' })
    const to = JSON.stringify({ mode: 'relative', anchor: 'now', offset: 0, unit: 'day' })
    const root = group({
      children: [condition('created_at', JSON.stringify({ from, to }), 'BETWEEN')],
    })

    const sql = pretty(resolveNodeToSql(root, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "EXISTS (
        SELECT
          1
        FROM
          events e
        WHERE
          e.visitor_id = b.visitor_id
          AND (
            e.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
            AND e.created_at <= CURRENT_TIMESTAMP()
          )
      )"
    `)
  })

  it('treats a malformed {from, to} value as "never matches" instead of throwing', () => {
    const root = group({
      children: [condition('created_at', 'not-json', 'BETWEEN')],
    })

    const sql = resolveNodeToSql(root, defaultCtx())

    expect(sql).toContain('FALSE')
  })
})

// ─── Query 5 (baseline): single event, multiple AND'd field + date-range conditions ──
// "did perform radiogroup valgt, where valg=Ja AND tekst=Utenlandsopphold, during <range>"

describe('single group, multiple AND conditions on one event row', () => {
  it('merges all conditions into one correlated EXISTS on the events table', () => {
    const root = group({
      children: [
        condition('event_name', 'radiogroup valgt'),
        condition('valg', 'Ja'),
        condition('tekst', 'Utenlandsopphold'),
        condition('created_at', '2024-01-01T00:00:00', 'GREATER_THAN_OR_EQUAL'),
        condition('created_at', '2024-01-31T00:00:00', 'LESS_THAN_OR_EQUAL'),
      ],
    })

    const sql = pretty(resolveNodeToSql(root, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "EXISTS (
        SELECT
          1
        FROM
          events e
        WHERE
          e.visitor_id = b.visitor_id
          AND e.event_name = 'radiogroup valgt'
          AND e.valg = 'Ja'
          AND e.tekst = 'Utenlandsopphold'
          AND e.created_at >= TIMESTAMP('2024-01-01T00:00:00')
          AND e.created_at <= TIMESTAMP('2024-01-31T00:00:00')
      )"
    `)
  })
})

// ─── Query 1: pageview + platform, AND NOT in other cohort ──────────────────

describe('AND NOT in another cohort', () => {
  it('combines a pageview condition group with a negated inline-resolved cohort reference', () => {
    const root = group({
      combinator: 'AND',
      children: [
        group({
          children: [
            condition('event_name', 'besok'),
            condition('url_path', 'https://www.nav.no/pensjon/kalkulator/start'),
          ],
        }),
        cohortRef(99, true),
      ],
    })

    const otherCohortTree = group({ children: [condition('event_name', 'some_other_event')] })
    const ctx = defaultCtx({ resolveCohortRef: (id) => (id === 99 ? otherCohortTree : group()) })

    const sql = pretty(resolveNodeToSql(root, ctx))

    expect(sql).toMatchInlineSnapshot(`
      "(
        EXISTS (
          SELECT
            1
          FROM
            events e
          WHERE
            e.visitor_id = b.visitor_id
            AND e.event_name = 'besok'
            AND e.url_path = 'https://www.nav.no/pensjon/kalkulator/start'
        )
        AND NOT (
          EXISTS (
            SELECT
              1
            FROM
              events x
            WHERE
              x.visitor_id = b.visitor_id
              AND x.event_name = 'some_other_event'
          )
        )
      )"
    `)
  })
})

// ─── Query 2: same, but positively "are part of" the other cohort ───────────

describe('AND are part of another cohort (positive reference)', () => {
  it('inlines the referenced cohort without wrapping it in NOT', () => {
    const root = group({
      children: [group({ children: [condition('event_name', 'besok')] }), cohortRef(99, false)],
    })
    const otherCohortTree = group({ children: [condition('event_name', 'some_other_event')] })
    const ctx = defaultCtx({ resolveCohortRef: () => otherCohortTree })

    const sql = pretty(resolveNodeToSql(root, ctx))

    expect(sql).toMatchInlineSnapshot(`
      "(
        EXISTS (
          SELECT
            1
          FROM
            events e
          WHERE
            e.visitor_id = b.visitor_id
            AND e.event_name = 'besok'
        )
        AND EXISTS (
          SELECT
            1
          FROM
            events x
          WHERE
            x.visitor_id = b.visitor_id
            AND x.event_name = 'some_other_event'
        )
      )"
    `)
  })
})

// ─── Query 3: cohort A OR cohort B ───────────────────────────────────────────

describe('OR of multiple cohort references', () => {
  it('combines both referenced cohorts with OR, no special-casing needed', () => {
    const root = group({
      combinator: 'OR',
      children: [cohortRef(1), cohortRef(2)],
    })
    const cohortA = group({ children: [condition('event_name', 'cohort_a_event')] })
    const cohortB = group({ children: [condition('event_name', 'cohort_b_event')] })
    const ctx = defaultCtx({ resolveCohortRef: (id) => (id === 1 ? cohortA : cohortB) })

    const sql = pretty(resolveNodeToSql(root, ctx))

    expect(sql).toMatchInlineSnapshot(`
      "(
        EXISTS (
          SELECT
            1
          FROM
            events e
          WHERE
            e.visitor_id = b.visitor_id
            AND e.event_name = 'cohort_a_event'
        )
        OR EXISTS (
          SELECT
            1
          FROM
            events x
          WHERE
            x.visitor_id = b.visitor_id
            AND x.event_name = 'cohort_b_event'
        )
      )"
    `)
  })
})

// ─── Query 4: OR of two condition-groups (each AND of 2 field conditions) ───

describe('OR of two multi-condition event groups', () => {
  it('produces two independent EXISTS clauses joined by OR, each with its own AND-ed conditions', () => {
    const root = group({
      combinator: 'OR',
      children: [
        group({
          children: [condition('event_name', 'info'), condition('text', 'Født før 1963'), condition('data', 'Ja')],
        }),
        group({
          children: [condition('event_name', 'info'), condition('text', 'Er apoteker'), condition('data', 'Ja')],
        }),
      ],
    })

    const sql = pretty(resolveNodeToSql(root, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "(
        EXISTS (
          SELECT
            1
          FROM
            events e
          WHERE
            e.visitor_id = b.visitor_id
            AND e.event_name = 'info'
            AND e.text = 'Født før 1963'
            AND e.data = 'Ja'
        )
        OR EXISTS (
          SELECT
            1
          FROM
            events x
          WHERE
            x.visitor_id = b.visitor_id
            AND x.event_name = 'info'
            AND x.text = 'Er apoteker'
            AND x.data = 'Ja'
        )
      )"
    `)
  })
})

describe('OR of bare sibling conditions directly under one group (regression: reported bug)', () => {
  it('gives each bare condition its own EXISTS instead of silently AND-ing them together', () => {
    // (url_path = '/' OR browser = 'Chrome' OR (os = 'Windows' AND device = 'mobile'))
    const root = group({
      combinator: 'OR',
      children: [
        condition('url_path', '/'),
        condition('browser', 'Chrome'),
        group({ children: [condition('os', 'Windows'), condition('device', 'mobile')] }),
      ],
    })

    const sql = pretty(resolveNodeToSql(root, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "(
        EXISTS (
          SELECT
            1
          FROM
            events e
          WHERE
            e.visitor_id = b.visitor_id
            AND e.url_path = '/'
        )
        OR EXISTS (
          SELECT
            1
          FROM
            events x
          WHERE
            x.visitor_id = b.visitor_id
            AND x.browser = 'Chrome'
        )
        OR EXISTS (
          SELECT
            1
          FROM
            events y
          WHERE
            y.visitor_id = b.visitor_id
            AND y.os = 'Windows'
            AND y.device = 'mobile'
        )
      )"
    `)
  })
})

describe('conditions on a field that lives on a joined table (e.g. session-level columns)', () => {
  const ctxWithSessionJoin = (overrides: Partial<ResolveContext> = {}) =>
    defaultCtx({
      resolveFieldTable: (field) =>
        ['browser', 'os', 'device', 'country'].includes(field)
          ? { table: 'session', joinColumn: 'session_id' }
          : undefined,
      ...overrides,
    })

  it('LEFT JOINs the resolved table once and references the field via the joined alias', () => {
    const root = group({ children: [condition('browser', 'Chrome'), condition('os', 'Windows')] })

    const sql = pretty(resolveNodeToSql(root, ctxWithSessionJoin()))

    expect(sql).toMatchInlineSnapshot(`
      "EXISTS (
        SELECT
          1
        FROM
          events e
          LEFT JOIN session ej0 ON e.session_id = ej0.session_id
        WHERE
          e.visitor_id = b.visitor_id
          AND ej0.browser = 'Chrome'
          AND ej0.os = 'Windows'
      )"
    `)
  })

  it('does not join anything for fields that live directly on eventsTable', () => {
    const root = group({ children: [condition('event_name', 'click')] })

    const sql = pretty(resolveNodeToSql(root, ctxWithSessionJoin()))

    expect(sql).not.toContain('JOIN')
  })

  it('joins once even when multiple conditions in the same subquery need the same joined table', () => {
    const root = group({ children: [condition('browser', 'Chrome'), condition('country', 'Sverige')] })

    const sql = pretty(resolveNodeToSql(root, ctxWithSessionJoin()))

    expect((sql.match(/LEFT JOIN/g) ?? []).length).toBe(1)
  })

  it('applies to sequence anchor/target subqueries too', () => {
    const sequenceNode: CohortSequenceNode = {
      nodeType: 'SEQUENCE',
      anchor: group({ children: [condition('browser', 'Chrome')] }),
      target: group({ children: [condition('event_name', 'click')] }),
      relation: 'FOLLOWED_BY',
      windowValue: 1,
      windowUnit: 'DAY',
    }
    const root = group({ children: [sequenceNode] })

    const sql = pretty(resolveNodeToSql(root, ctxWithSessionJoin()))

    expect((sql.match(/LEFT JOIN/g) ?? []).length).toBe(1)
  })

  it('appends extraJoinConditionFn onto the JOIN...ON clause (e.g. a website_id predicate to help push filtering into an aggregated view, or a partition filter on a raw table)', () => {
    const root = group({ children: [condition('browser', 'Chrome')] })

    const sql = pretty(
      resolveNodeToSql(
        root,
        ctxWithSessionJoin({
          resolveFieldTable: () => ({
            table: 'session',
            joinColumn: 'session_id',
            extraJoinConditionFn: (joinAlias) => `${joinAlias}.website_id = 'abc-123'`,
          }),
        }),
      ),
    )

    expect(sql).toContain("AND ej0.website_id = 'abc-123'")
  })
})

// ─── Queries 4/5/6: custom event parameters (key/value pairs on the event, not plain columns) ──

describe('conditions on a custom event parameter (paramKey, not field)', () => {
  const ctxWithParamsJoin = (overrides: Partial<ResolveContext> = {}) =>
    defaultCtx({
      resolveEventParamsJoin: () => ({
        table: 'event_data_view',
        joinOn: [
          { rowColumn: 'event_id', viewColumn: 'website_event_id' },
          { rowColumn: 'website_id', viewColumn: 'website_id' },
        ],
      }),
      ...overrides,
    })

  it('LEFT JOINs the event-params view then UNNESTs once for a single paramKey', () => {
    const root = group({ children: [condition('event_name', 'info'), paramCondition('tekst', 'Vedtak alderspensjon')] })

    const sql = pretty(resolveNodeToSql(root, ctxWithParamsJoin()))

    expect(sql).toMatchInlineSnapshot(`
      "EXISTS (
        SELECT
          1
        FROM
          events e
          LEFT JOIN event_data_view eed ON e.event_id = eed.website_event_id
          AND e.website_id = eed.website_id
          LEFT JOIN UNNEST (eed.event_parameters) ep0 ON ep0.data_key = 'tekst'
        WHERE
          e.visitor_id = b.visitor_id
          AND e.event_name = 'info'
          AND ep0.string_value = 'Vedtak alderspensjon'
      )"
    `)
  })

  it('uses two separate UNNEST aliases for two different paramKeys in the same AND group (query 4/5 shape)', () => {
    const root = group({ children: [paramCondition('text', 'Født før 1963'), paramCondition('data', 'Ja')] })

    const sql = pretty(resolveNodeToSql(root, ctxWithParamsJoin()))

    expect((sql.match(/UNNEST/g) ?? []).length).toBe(2)
    expect(sql).toContain("ON ep0.data_key = 'text'")
    expect(sql).toContain("ON ep1.data_key = 'data'")
    expect(sql).toContain("ep0.string_value = 'Født før 1963'")
    expect(sql).toContain("ep1.string_value = 'Ja'")
  })

  it('joins the event-params view only once even with multiple paramKey conditions in one subquery', () => {
    const root = group({ children: [paramCondition('text', 'X'), paramCondition('data', 'Y')] })

    const sql = pretty(resolveNodeToSql(root, ctxWithParamsJoin()))

    expect((sql.match(/event_data_view/g) ?? []).length).toBe(1)
  })

  it('reuses the same UNNEST alias when the same paramKey is referenced twice', () => {
    const root = group({
      children: [
        paramCondition('tekst', 'A', 'GREATER_THAN_OR_EQUAL'),
        paramCondition('tekst', 'B', 'LESS_THAN_OR_EQUAL'),
      ],
    })

    const sql = pretty(resolveNodeToSql(root, ctxWithParamsJoin()))

    expect((sql.match(/UNNEST/g) ?? []).length).toBe(1)
  })

  it('applies to sequence anchor/target subqueries too (query 6 shape)', () => {
    const sequenceNode: CohortSequenceNode = {
      nodeType: 'SEQUENCE',
      anchor: group({ children: [condition('event_name', 'info'), paramCondition('tekst', 'Vedtak alderspensjon')] }),
      target: group({ children: [condition('event_name', 'info'), paramCondition('tekst', 'Fremtidig vedtak')] }),
      relation: 'NOT_FOLLOWED_BY',
      windowValue: 1,
      windowUnit: 'DAY',
    }
    const root = group({ children: [sequenceNode] })

    const sql = pretty(resolveNodeToSql(root, ctxWithParamsJoin()))

    expect((sql.match(/UNNEST/g) ?? []).length).toBe(2)
    expect(sql).toContain('NOT EXISTS')
  })

  it('throws a descriptive error if a paramKey condition is used without resolveEventParamsJoin configured', () => {
    const root = group({ children: [paramCondition('tekst', 'X')] })

    expect(() => resolveNodeToSql(root, defaultCtx())).toThrow(/paramKey "tekst"/)
  })
})

describe('sequence: anchor followed (or not) by target within a time window', () => {
  const sequence = (relation: CohortSequenceNode['relation']): CohortSequenceNode => ({
    nodeType: 'SEQUENCE',
    anchor: group({ children: [condition('event_name', 'info'), condition('tekst', 'Vedtak alderspensjon')] }),
    target: group({ children: [condition('event_name', 'info'), condition('tekst', 'Fremtidig vedtak')] }),
    relation,
    windowValue: 1,
    windowUnit: 'DAY',
  })

  it('resolves NOT_FOLLOWED_BY as a correlated NOT EXISTS on the target, anchored to the anchor row time', () => {
    const root = group({ children: [sequence('NOT_FOLLOWED_BY')] })

    const sql = pretty(resolveNodeToSql(root, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "EXISTS (
        SELECT
          1
        FROM
          events e
        WHERE
          e.visitor_id = b.visitor_id
          AND e.event_name = 'info'
          AND e.tekst = 'Vedtak alderspensjon'
          AND NOT EXISTS (
            SELECT
              1
            FROM
              events x
            WHERE
              x.visitor_id = e.visitor_id
              AND x.event_name = 'info'
              AND x.tekst = 'Fremtidig vedtak'
              AND x.created_at > e.created_at
              AND x.created_at <= TIMESTAMP_ADD(e.created_at, INTERVAL 1 DAY)
          )
      )"
    `)
  })

  it('resolves FOLLOWED_BY as a plain correlated EXISTS on the target (no NOT)', () => {
    const root = group({ children: [sequence('FOLLOWED_BY')] })

    const sql = pretty(resolveNodeToSql(root, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "EXISTS (
        SELECT
          1
        FROM
          events e
        WHERE
          e.visitor_id = b.visitor_id
          AND e.event_name = 'info'
          AND e.tekst = 'Vedtak alderspensjon'
          AND EXISTS (
            SELECT
              1
            FROM
              events x
            WHERE
              x.visitor_id = e.visitor_id
              AND x.event_name = 'info'
              AND x.tekst = 'Fremtidig vedtak'
              AND x.created_at > e.created_at
              AND x.created_at <= TIMESTAMP_ADD(e.created_at, INTERVAL 1 DAY)
          )
      )"
    `)
  })
})

// ─── General mechanics ───────────────────────────────────────────────────────
// (trivial outputs — plain assertions read fine without a snapshot here)

describe('general mechanics', () => {
  it('a condition with a missing value resolves to FALSE instead of throwing (malformed/incomplete cohort data must not crash the caller)', () => {
    const malformed = {
      nodeType: 'CONDITION',
      field: 'url_path',
      conditionType: 'EQUALS',
    } as unknown as CohortConditionNode
    const root = group({ children: [malformed] })

    const sql = resolveNodeToSql(root, defaultCtx())

    expect(sql).toContain('FALSE')
  })

  it('a condition with neither field nor paramKey resolves to FALSE instead of throwing', () => {
    const malformed = { nodeType: 'CONDITION', conditionType: 'EQUALS', value: 'x' } as unknown as CohortConditionNode
    const root = group({ children: [malformed] })

    const sql = resolveNodeToSql(root, defaultCtx())

    expect(sql).toContain('FALSE')
  })

  it('an empty root group (no criteria yet) resolves to a tautology, not an error', () => {
    const root = group({ children: [] })

    const sql = resolveNodeToSql(root, defaultCtx())

    expect(sql.trim().toUpperCase()).toBe('TRUE')
  })

  it('a negated group wraps its resolved expression in NOT(...)', () => {
    const root = group({ negated: true, children: [condition('event_name', 'x')] })

    const sql = pretty(resolveNodeToSql(root, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "NOT (
        EXISTS (
          SELECT
            1
          FROM
            events e
          WHERE
            e.visitor_id = b.visitor_id
            AND e.event_name = 'x'
        )
      )"
    `)
  })

  it('deep nesting (5 levels) still resolves without error', () => {
    let node: CohortGroupNode = group({ children: [condition('event_name', 'x')] })
    for (let i = 0; i < 4; i++) {
      node = group({ children: [node] })
    }

    const sql = pretty(resolveNodeToSql(node, defaultCtx()))

    expect(sql).toMatchInlineSnapshot(`
      "EXISTS (
        SELECT
          1
        FROM
          events e
        WHERE
          e.visitor_id = b.visitor_id
          AND e.event_name = 'x'
      )"
    `)
  })

  it("extraConditionFn is ANDed into every generated correlated subquery, keyed by that subquery's own row alias", () => {
    const root = group({
      children: [
        condition('event_name', 'x'),
        {
          nodeType: 'SEQUENCE',
          anchor: group({ children: [condition('event_name', 'a')] }),
          target: group({ children: [condition('event_name', 'b')] }),
          relation: 'FOLLOWED_BY',
          windowValue: 1,
          windowUnit: 'DAY',
        },
      ],
    })
    const ctx = defaultCtx({ extraConditionFn: (alias) => `${alias}.website_id = 'w1'` })

    const sql = pretty(resolveNodeToSql(root, ctx))

    // one occurrence per generated subquery: the flat condition-group, the sequence anchor, and the sequence target
    expect((sql.match(/website_id = 'w1'/g) ?? []).length).toBe(3)
  })
})
