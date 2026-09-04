import { describe, it, expect } from 'vitest'
import { generateSQLCore } from './sqlGenerator.ts'
import type { ChartConfig, Filter, Metric } from '../../../shared/types/chart.ts'

const website = { id: 'w-1', name: 'Test', domain: 'example.com', teamId: '', createdAt: '' }

const countMetric: Metric = { function: 'count', alias: 'antall' }

const dayFilters: Filter[] = [
  {
    column: 'created_at',
    operator: '>=',
    value: "TIMESTAMP('2026-08-28 00:00:00')",
  },
  {
    column: 'created_at',
    operator: '<=',
    value: 'CURRENT_TIMESTAMP()',
  },
]

const baseConfig: ChartConfig = {
  website,
  filters: [],
  metrics: [countMetric],
  groupByFields: [],
  orderBy: null,
  dateFormat: 'day',
  paramAggregation: 'unique',
  limit: 1000,
}

describe('zero-padding of time-grouped queries', () => {
  it('wraps a day-grouped query in a calendar series that pads missing days with 0', () => {
    const sql = generateSQLCore({ ...baseConfig, groupByFields: ['created_at'] }, dayFilters, [])

    expect(sql).toContain('FROM UNNEST(GENERATE_DATE_ARRAY(')
    expect(sql).toContain("DATE(TIMESTAMP('2026-08-28 00:00:00'))")
    expect(sql).toContain('DATE(CURRENT_TIMESTAMP())')
    expect(sql).toContain('COALESCE(`antall`, 0) AS `antall`')
    // The label comes from the calendar side as a STRING — a raw DATE column
    // deserializes to an object client-side («[object Object]» on chart axes),
    // and the inner query's dato is NULL on padded rows («(ukjent)»).
    expect(sql).toContain("SELECT\n  FORMAT_DATE('%Y-%m-%d', bucket_date) AS dato,")
    // Both join keys are DATE — inner dato is a FORMAT_TIMESTAMP string (USING would reject DATE=STRING).
    expect(sql).toContain(') ON bucket_date = DATE(dato)')
    expect(sql).toMatch(/ORDER BY bucket_date ASC\nLIMIT 1000\n$/)
  })

  it('does NOT pad week granularity (the %Y-%U label cannot round-trip to a DATE)', () => {
    const sql = generateSQLCore({ ...baseConfig, groupByFields: ['created_at'], dateFormat: 'week' }, dayFilters, [])
    expect(sql).not.toContain('GENERATE_DATE_ARRAY')
  })

  it('pads month-grouped queries, comparing calendar DATE to a parsed first-of-month', () => {
    const sql = generateSQLCore({ ...baseConfig, groupByFields: ['created_at'], dateFormat: 'month' }, dayFilters, [])
    expect(sql).toContain("GENERATE_DATE_ARRAY(DATE_TRUNC(DATE(TIMESTAMP('2026-08-28 00:00:00')), MONTH)")
    expect(sql).toContain(
      "ON bucket_date = DATE(CONCAT(SPLIT(dato, '-')[OFFSET(0)], '-', SPLIT(dato, '-')[OFFSET(1)], '-01'))",
    )
    expect(sql).toContain("FORMAT_DATE('%Y-%m', bucket_date) AS dato")
  })

  it('pads every metric, not just the first', () => {
    const sql = generateSQLCore(
      {
        ...baseConfig,
        groupByFields: ['created_at'],
        metrics: [countMetric, { function: 'distinct', column: 'session_id', alias: 'besok' }],
      },
      dayFilters,
      [],
    )
    expect(sql).toContain('COALESCE(`antall`, 0) AS `antall`')
    expect(sql).toContain('COALESCE(`besok`, 0) AS `besok`')
  })

  it('does NOT pad when created_at is not a group-by field', () => {
    const sql = generateSQLCore({ ...baseConfig, groupByFields: ['url_path'] }, dayFilters, [])
    expect(sql).not.toContain('GENERATE_DATE_ARRAY')
  })

  it('does NOT pad year granularity (unparsable label + vanishingly rare gap)', () => {
    const sql = generateSQLCore({ ...baseConfig, groupByFields: ['created_at'], dateFormat: 'year' }, dayFilters, [])
    expect(sql).not.toContain('GENERATE_DATE_ARRAY')
  })

  it('does NOT pad when the lower bound is missing (open-ended range)', () => {
    const sql = generateSQLCore({ ...baseConfig, groupByFields: ['created_at'] }, [dayFilters[1]], [])
    expect(sql).not.toContain('GENERATE_DATE_ARRAY')
  })

  it('does NOT pad interactive (Metabase {{created_at}}) filters — bounds live outside the SQL', () => {
    const interactive: Filter[] = [
      { column: 'created_at', operator: '>=', value: '{{created_at}}', interactive: true, metabaseParam: true },
    ]
    const sql = generateSQLCore({ ...baseConfig, groupByFields: ['created_at'] }, interactive, [])
    expect(sql).not.toContain('GENERATE_DATE_ARRAY')
  })

  it('pads segment-broken-down series too (segment column flows through USING)', () => {
    const sql = generateSQLCore(
      {
        ...baseConfig,
        groupByFields: ['created_at'],
        segments: [{ id: 1, name: 'besøkt /minside', filters: [], performed: null }],
      },
      dayFilters,
      [],
    )
    expect(sql).toContain('GENERATE_DATE_ARRAY')
    expect(sql).toContain('COALESCE(`antall`, 0)')
  })
})
