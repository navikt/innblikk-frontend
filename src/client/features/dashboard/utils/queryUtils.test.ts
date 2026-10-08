import { afterEach, describe, expect, it, vi } from 'vitest'
import { processDashboardSql, supportsMetricTypeSelection } from './queryUtils.ts'

const filters = {
  urlFilters: ['/aktuelt'],
  dateRange: 'last_7_days',
  pathOperator: 'equals',
  metricType: 'visitors' as const,
}

describe('processDashboardSql', () => {
  afterEach(() => vi.useRealTimers())

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

  it('replaces optional standalone URL placeholders with a sidegroup condition', () => {
    const sql = `SELECT url_path FROM events WHERE website_id = '{{website_id}}' [[AND {{url_sti}} ]]`
    const result = processDashboardSql(sql, 'website-1', {
      ...filters,
      sidegroup: {
        id: 'sidegroup-1',
        name: 'Jobber',
        websiteId: 'website-1',
        include: ['/jobs'],
      },
    })

    expect(result).toContain("STRPOS(LOWER(url_path), LOWER('/jobs')) > 0")
    expect(result).not.toContain('{{url_sti}}')
  })

  it('preserves predicate parentheses around optional sidegroup assignments', () => {
    const result = processDashboardSql(
      "SELECT url_path FROM events WHERE (e.url_path = [[ {{url_sti}} --]] '/')",
      'website-1',
      {
        ...filters,
        sidegroup: { id: 'sidegroup-1', name: 'Exact', websiteId: 'website-1', exact: ['/jobs'] },
      },
    )

    expect(result).toContain("(LOWER(e.url_path) = LOWER('/jobs'))")
    expect(result).not.toContain('LOWER((e.url_path)')
  })

  it('preserves predicate parentheses around direct sidegroup assignments', () => {
    const result = processDashboardSql("SELECT url_path FROM events WHERE (e.url_path = '{{url_sti}}')", 'website-1', {
      ...filters,
      sidegroup: { id: 'sidegroup-1', name: 'Exact', websiteId: 'website-1', exact: ['/jobs'] },
    })

    expect(result).toContain("(LOWER(e.url_path) = LOWER('/jobs'))")
    expect(result).not.toContain('{{url_sti}}')
  })

  it('preserves dollar tokens in sidegroup rules during SQL replacement', () => {
    const result = processDashboardSql('SELECT url_path FROM events WHERE [[AND {{url_sti}} ]]', 'website-1', {
      ...filters,
      sidegroup: {
        id: 'sidegroup-1',
        name: 'Dollar',
        websiteId: 'website-1',
        include: ['$&'],
      },
    })

    expect(result).toContain("LOWER('$&')")
  })

  it('uses seven completed days and excludes today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0))
    const sql = `SELECT * FROM \`project.umami_views.event\` e WHERE 1 = 1 [[AND {{created_at}} ]]`

    const result = processDashboardSql(sql, 'website-1', filters)

    expect(result).toContain("TIMESTAMP('2026-09-21', 'Europe/Oslo')")
    expect(result).toContain("TIMESTAMP('2026-09-27T23:59:59', 'Europe/Oslo')")
    expect(result).not.toContain('2026-09-28')
  })

  it.each([
    ['visits', 'Antall økter'],
    ['pageviews', 'Sidevisninger'],
    ['proportion', 'Andel'],
  ] as const)('rewrites lowercase metric alias references when switching to %s', (metricType, expectedAlias) => {
    const sql = `
      SELECT
        dato,
        COALESCE(\`unike_besokende\`, 0) AS \`unike_besokende\`
      FROM (
      WITH metrics AS (
        SELECT COUNT(DISTINCT session_id) AS unike_besokende
        FROM \`project.umami_views.event\`
        WHERE website_id = '{{website_id}}'
      )
      SELECT unike_besokende
      FROM metrics
      ORDER BY unike_besokende DESC
      )
    `

    const result = processDashboardSql(sql, 'website-1', { ...filters, metricType })
    const quotedAlias = `\`${expectedAlias}\``

    expect(result).not.toMatch(/\bunike_besokende\b/i)
    expect(result).not.toContain('``')
    expect(result).toContain(`COALESCE(${quotedAlias}, 0) AS ${quotedAlias}`)
    if (metricType === 'proportion') expect(result).not.toContain('CONCAT(')
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
