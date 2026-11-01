import { describe, expect, it } from 'vitest'
import { getEventSelection, setEventSelection } from './eventSelection.ts'
import { generateSQLCore } from './sqlGenerator.ts'
import type { ChartConfig, Filter } from '../../../shared/types/chart.ts'
import { buildSidegroupSqlCondition } from '../../../shared/lib/sidegroupSql.ts'
import { isFilterArray } from './typeGuards.ts'

const config: ChartConfig = {
  website: { id: 'site-1', name: 'Test', domain: 'nav.no', teamId: '', createdAt: '' },
  filters: [],
  metrics: [{ function: 'count', alias: 'antall' }],
  groupByFields: [],
  orderBy: null,
  dateFormat: 'day',
  paramAggregation: 'unique',
  limit: 1000,
}

describe('experimental event selection SQL', () => {
  it('does not infer pageviews from a missing event selection', () => {
    expect(getEventSelection([])).toEqual({ pageviews: false, custom: false, names: undefined })
    expect(getEventSelection(setEventSelection([], false, false))).toEqual({
      pageviews: false,
      custom: false,
      names: undefined,
    })
  })

  it('combines pageviews OR selected custom events rather than filtering pageviews out', () => {
    const filters = setEventSelection([], true, true, {
      column: 'event_name',
      operator: 'IN',
      value: "it's sent",
      multipleValues: ["it's sent"],
    })
    const sql = generateSQLCore(config, filters, [])
    expect(sql).toContain("AND (event_type = 1 OR (event_type = 2 AND event_name IN ('it''s sent')))")
    expect(sql).not.toContain('AND e.event_name IN')
  })

  it('supports combined selections with interactive filters and session joins', () => {
    const filters = setEventSelection(
      [
        { column: 'url_path', value: '{{url_sti}}', operator: '=', interactive: true, metabaseParam: true },
        { column: 'browser', value: 'Firefox', operator: '=' },
      ],
      true,
      true,
      { column: 'event_name', operator: 'IN', value: 'sendt', multipleValues: ['sendt'] },
    )
    const sql = generateSQLCore(config, filters, [])
    expect(sql).toContain("(event_type = 1 OR (event_type = 2 AND event_name IN ('sendt')))")
    expect(sql).toContain('.url_path = {{url_sti}}')
    expect(sql).toContain(".browser = 'Firefox'")
  })

  it('removes the pageview union when selecting only custom events', () => {
    const initial = setEventSelection([], true, true, {
      column: 'event_name',
      operator: 'IN',
      value: 'sendt',
      multipleValues: ['sendt'],
    })
    const filters = setEventSelection(
      initial,
      false,
      true,
      initial.find((filter) => filter.column === 'event_name'),
    )
    const sql = generateSQLCore(config, filters, [])
    expect(sql).toContain("AND e.event_name IN ('sendt')")
    expect(sql).not.toContain('OR (event_type')
  })

  it('returns no matches, not all events, for an empty selection', () => {
    const filters = setEventSelection([], false, false)
    expect(isFilterArray(filters)).toBe(true)
    expect(generateSQLCore(config, filters, [])).toContain('AND FALSE')
  })

  it('applies saved sidegroup rules to the actual query', () => {
    const groupFilter: Filter = {
      column: 'url_path',
      rawExpression: buildSidegroupSqlCondition(
        { id: '1', name: 'Søknad', websiteId: 'site-1', include: ['/SOKNAD_%'], exclude: ['/privat'] },
        'url_path',
      ),
    }
    const sql = generateSQLCore(config, [groupFilter], [])
    expect(isFilterArray([groupFilter])).toBe(true)
    expect(sql).toContain("STRPOS(LOWER(url_path), LOWER('/SOKNAD_%')) > 0")
    expect(sql).toContain("STRPOS(LOWER(url_path), LOWER('/privat')) = 0")
    expect(sql).not.toContain('LIKE')
  })
})
