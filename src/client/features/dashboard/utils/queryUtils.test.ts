import { describe, expect, it } from 'vitest'
import { processDashboardSql, supportsMetricTypeSelection } from './queryUtils.ts'

const filters = {
  urlFilters: ['/aktuelt'],
  dateRange: 'last_7_days',
  pathOperator: 'equals',
  metricType: 'visitors' as const,
}

describe('processDashboardSql', () => {
  it('applies dashboard URL and period filters to aliased event queries', () => {
    const sql = `
      SELECT e.url_path
      FROM \`project.umami_views.event\` e
      WHERE e.website_id = '{{website_id}}'
        [[AND {{created_at}} ]]
        AND e.url_path = [[ {{url_sti}} --]] '/'
    `

    const result = processDashboardSql(sql, 'website-1', filters)

    expect(result).toContain("e.website_id = 'website-1'")
    expect(result).toContain('AND e.created_at BETWEEN')
    expect(result).toContain("AND e.url_path = '/aktuelt'")
    expect(result).not.toContain('{{created_at}}')
    expect(result).not.toContain('{{url_sti}}')
  })
})

describe('supportsMetricTypeSelection', () => {
  it('recognizes the metric alias supported by dashboard view switching', () => {
    expect(supportsMetricTypeSelection('SELECT COUNT(DISTINCT session_id) AS Unike_besokende FROM events')).toBe(true)
  })

  it('rejects table-builder queries with independently named metrics', () => {
    expect(
      supportsMetricTypeSelection(
        'SELECT COUNT(DISTINCT visit_id) AS `Besøk`, COUNT(DISTINCT user_id) AS `Unike besøkende`',
      ),
    ).toBe(false)
  })
})
