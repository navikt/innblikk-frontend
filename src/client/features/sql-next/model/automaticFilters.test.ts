import { applyAutomaticFilters } from './automaticFilters'
import { applyUrlFiltersToSql, replaceDateFilterPlaceholders } from '../../sql/utils/sqlProcessing'
import { getGcpProjectId } from '../../sql/utils/formatters'
import { processDashboardSql } from '../../dashboard/utils/queryUtils'
import { Parser } from 'node-sql-parser/build/bigquery'

const context = {
  websiteIdState: 'chosen-website',
  selectedWebsite: null,
  urlPathFromUrl: null,
  urlPath: '',
  pathOperatorFromUrl: null,
  dateRange: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 2) },
  customVariables: [],
  customVariableValues: {},
}

describe('automatic website and period filters', () => {
  it('exports and reruns a JOIN with an existing outer date placeholder and missing source filters', async () => {
    const query =
      'SELECT e.event_id, s.browser FROM `test-project.umami_views.event` e LEFT JOIN `test-project.umami_views.session` s ON e.session_id = s.session_id WHERE 1 = 1 [[AND {{created_at}} ]]'
    const exported = await applyAutomaticFilters(query, context, undefined, 'template')
    expect(exported.match(/\[\[AND \{\{created_at\}\}\s*\]\]/g)).toHaveLength(2)
    expect(exported.match(/website_id = 'chosen-website'/g)).toHaveLength(2)
    const rerun = applyUrlFiltersToSql(exported, context)
    expect(rerun).toContain('AND e.created_at BETWEEN')
    expect(rerun).toContain('`test-project.umami_views.session`.created_at BETWEEN')
    expect(rerun).not.toContain('{{')
    expect(rerun).not.toContain('__METABASE_')
    expect(() => new Parser().astify(rerun)).not.toThrow()
    const dashboardSql = processDashboardSql(exported, 'chosen-website', {
      urlFilters: [],
      dateRange: 'last_7_days',
      pathOperator: 'equals',
      metricType: 'visitors',
    })
    expect(dashboardSql).toContain('AND e.created_at BETWEEN')
    expect(() => new Parser().astify(dashboardSql)).not.toThrow()
  })

  it('keeps inner and outer date placeholders in their own SELECT scopes', () => {
    const sql =
      'SELECT e.event_id FROM `test-project.umami_views.event` e WHERE e.session_id IN (SELECT s.session_id FROM `test-project.umami_views.session` s WHERE 1 = 1 [[AND {{created_at}}]]) [[AND {{created_at}}]]'
    const processed = replaceDateFilterPlaceholders(sql, 'START', 'END', 'fallback.created_at')
    expect(processed).toContain(
      'WHERE 1 = 1 AND s.created_at BETWEEN START AND END) AND e.created_at BETWEEN START AND END',
    )
    expect(processed).not.toContain('fallback')
  })

  it('resolves aliases around derived tables and ignores SQL-looking strings and comments', () => {
    const sql =
      "SELECT e.event_id, 'SELECT FROM )' AS text FROM (SELECT event_id FROM `test-project.umami_views.event` WHERE 1 = 1 [[AND {{created_at}}]]) AS e WHERE 1 = 1 /* SELECT FROM fake ) */ [[AND {{created_at}}]]"
    const processed = replaceDateFilterPlaceholders(sql, 'START', 'END', 'fallback.created_at')
    expect(processed).toContain('AND `test-project.umami_views.event`.created_at BETWEEN START AND END) AS e')
    expect(processed).toContain('/* SELECT FROM fake ) */ AND e.created_at BETWEEN START AND END')
    expect(processed).toContain("'SELECT FROM )'")
  })

  it.each([0, 6])(
    'uses Oslo calendar-day bounds for automatic and existing date filters in month %s',
    async (month) => {
      const datedContext = { ...context, dateRange: { from: new Date(2026, month, 1), to: new Date(2026, month, 2) } }
      const monthText = String(month + 1).padStart(2, '0')
      const bounds = `created_at BETWEEN TIMESTAMP('2026-${monthText}-01', 'Europe/Oslo') AND TIMESTAMP('2026-${monthText}-02T23:59:59.999', 'Europe/Oslo')`
      expect(
        await applyAutomaticFilters('SELECT event_id FROM `test-project.umami_views.event`', datedContext),
      ).toContain(bounds)
      expect(
        applyUrlFiltersToSql(
          'SELECT event_id FROM `test-project.umami_views.event` WHERE 1 = 1 [[AND {{created_at}}]]',
          datedContext,
        ),
      ).toContain(bounds)
    },
  )

  it('exports automatic date filters as dynamic placeholders on both sides of a join', async () => {
    const query =
      'SELECT s.browser, e.url_path FROM `test-project.umami_views.session` s LEFT JOIN `test-project.umami_views.event` e ON s.session_id = e.session_id'
    const sql = await applyAutomaticFilters(query, context, undefined, 'template')
    expect(sql.match(/\[\[AND \{\{created_at\}\}\]\]/g)).toHaveLength(2)
    expect(sql).toContain("website_id = 'chosen-website'")
    expect(sql).not.toContain('TIMESTAMP(')
    expect(sql).not.toContain('__INNBL_DYNAMIC_PERIOD__')
    const dashboardSql = processDashboardSql(sql, 'chosen-website', {
      urlFilters: [],
      dateRange: 'last_7_days',
      pathOperator: 'equals',
      metricType: 'visitors',
    })
    expect(dashboardSql).not.toContain('{{created_at}}')
    expect(dashboardSql).toContain('`test-project.umami_views.session`.created_at BETWEEN')
    expect(dashboardSql).toContain('`test-project.umami_views.event`.created_at BETWEEN')
    expect(() => new Parser().astify(dashboardSql)).not.toThrow()
    const rerunSql = applyUrlFiltersToSql(sql, context)
    expect(rerunSql).not.toContain('{{created_at}}')
    expect(rerunSql).toContain('`test-project.umami_views.session`.created_at BETWEEN')
    expect(rerunSql).toContain('`test-project.umami_views.event`.created_at BETWEEN')
    expect(() => new Parser().astify(rerunSql)).not.toThrow()
  })

  it('does not replace deliberate fixed date filters when exporting', async () => {
    const query =
      "SELECT browser FROM `test-project.umami_views.session` WHERE website_id = 'manual' AND created_at >= TIMESTAMP('2026-09-01')"
    expect(await applyAutomaticFilters(query, context, undefined, 'template')).toBe(query)
  })

  it('reports when selected filters are added and when SQL already controls them', async () => {
    const automatic = vi.fn()
    await applyAutomaticFilters('SELECT browser FROM `test-project.umami_views.session`', context, automatic)
    expect(automatic).toHaveBeenCalledWith({
      table: 'test-project.umami_views.session',
      website: 'automatic',
      period: 'automatic',
    })
    const manual = vi.fn()
    await applyAutomaticFilters(
      "SELECT browser FROM `test-project.umami_views.session` WHERE website_id = 'manual' AND created_at >= TIMESTAMP('2026-09-01')",
      context,
      manual,
    )
    expect(manual).toHaveBeenCalledWith({ table: 'test-project.umami_views.session', website: 'sql', period: 'sql' })
  })

  it('combines all selected websites with an IN filter and the selected date range', async () => {
    const processed = await applyAutomaticFilters('SELECT browser FROM `test-project.umami_views.session`', {
      ...context,
      websiteIds: ['chosen-website', "other'website", 'chosen-website'],
    })
    expect(processed).toContain("website_id IN ('chosen-website', 'other''website')")
    expect(processed).toContain('created_at BETWEEN')
  })

  it('expands the existing website placeholder to an IN predicate without adding a second website filter', async () => {
    const multiContext = { ...context, websiteIds: ['first', 'second'] }
    const sql = applyUrlFiltersToSql(
      `SELECT * FROM \`${getGcpProjectId()}.umami_views.session\` WHERE website_id = '{{website_id}}'\n[[AND {{created_at}}]]`,
      multiContext,
    )
    expect(sql).toContain("website_id IN ('first', 'second')")
    expect(await applyAutomaticFilters(sql, multiContext)).toBe(sql)
  })

  it('accepts a single query ending in a semicolon', async () => {
    const processed = await applyAutomaticFilters(
      'SELECT browser FROM `test-project.umami_views.session` ORDER BY browser LIMIT 100;',
      context,
    )
    expect(processed).toContain("website_id = 'chosen-website'")
    expect(processed).toMatch(/ORDER BY browser(?: ASC)? LIMIT 100/)
  })

  it('filters a source table before grouping, ordering and limiting', async () => {
    const sql =
      'SELECT browser, COUNT(DISTINCT session_id) AS besokende FROM `test-project.umami_views.session` GROUP BY browser ORDER BY besokende DESC LIMIT 100'
    const processed = await applyAutomaticFilters(sql, context)
    expect(processed).toContain("website_id = 'chosen-website'")
    expect(processed).toContain('created_at BETWEEN TIMESTAMP(')
    expect(processed.indexOf('created_at BETWEEN')).toBeLessThan(processed.indexOf('GROUP BY'))
    expect(processed).toContain('GROUP BY browser ORDER BY besokende DESC LIMIT 100')
    expect(sql).not.toContain('WHERE')
  })

  it('keeps explicit website and period filters without duplication', async () => {
    const sql =
      "SELECT * FROM `test-project.umami_views.session` WHERE website_id = 'manual' AND created_at >= TIMESTAMP('2026-09-01')"
    expect(await applyAutomaticFilters(sql, context)).toBe(sql)
  })

  it.each([
    ['event_data', 'event_parameters'],
    ['session', 'session_parameters'],
  ])('preserves unqualified filters owned by %s alongside UNNEST(%s)', async (table, parameters) => {
    const sql = `SELECT details.data_key FROM \`test-project.umami_views.${table}\` base, UNNEST(base.${parameters}) details WHERE website_id = 'manual' AND created_at >= TIMESTAMP('2026-09-01')`
    const usage = vi.fn()
    expect(await applyAutomaticFilters(sql, context, usage)).toBe(sql)
    expect(usage).toHaveBeenCalledWith({ table: `test-project.umami_views.${table}`, website: 'sql', period: 'sql' })
  })

  it('does not assign ambiguous unqualified filters to both joined base tables', async () => {
    const sql =
      "SELECT e.event_id FROM `test-project.umami_views.event` e JOIN `test-project.umami_views.session` s ON e.session_id = s.session_id WHERE website_id = 'manual' AND created_at >= TIMESTAMP('2026-09-01')"
    const usage = vi.fn()
    await applyAutomaticFilters(sql, context, usage)
    expect(usage).toHaveBeenCalledWith({
      table: 'test-project.umami_views.event',
      website: 'automatic',
      period: 'automatic',
    })
    expect(usage).toHaveBeenCalledWith({
      table: 'test-project.umami_views.session',
      website: 'automatic',
      period: 'automatic',
    })
  })

  it('adds only the missing date filter when website is already specified', async () => {
    const processed = await applyAutomaticFilters(
      "SELECT * FROM `test-project.umami_views.session` WHERE website_id = 'manual'",
      context,
    )
    expect(processed).not.toContain('chosen-website')
    expect(processed.match(/created_at BETWEEN/g)).toHaveLength(1)
    expect(processed).toContain("website_id = 'manual'")
  })

  it('filters both sides of a LEFT JOIN without changing its join condition', async () => {
    const sql =
      'SELECT e.url_path, s.browser FROM `test-project.umami_views.event` e LEFT JOIN `test-project.umami_views.session` s ON s.session_id = e.session_id'
    const processed = await applyAutomaticFilters(sql, context)
    expect(processed).toContain('LEFT JOIN (SELECT')
    expect(processed).toContain('ON s.session_id = e.session_id')
    expect(processed.match(/created_at BETWEEN/g)).toHaveLength(2)
    expect(processed.match(/website_id = 'chosen-website'/g)).toHaveLength(2)
  })

  it.each([
    ['LEFT JOIN', 'e', 'automatic'],
    ['LEFT JOIN', 's', 'sql'],
    ['RIGHT JOIN', 'e', 'sql'],
    ['RIGHT JOIN', 's', 'automatic'],
    ['FULL JOIN', 'e', 'automatic'],
    ['FULL JOIN', 's', 'automatic'],
    ['INNER JOIN', 'e', 'sql'],
  ])('respects the preserved side of %s for filters on %s', async (join, alias, expected) => {
    const usage = vi.fn()
    const sql = `SELECT e.event_id FROM \`test-project.umami_views.event\` e ${join} \`test-project.umami_views.session\` s ON e.session_id = s.session_id AND ${alias}.website_id = 'manual' AND ${alias}.created_at >= TIMESTAMP('2026-09-01')`
    const processed = await applyAutomaticFilters(sql, context, usage)
    expect(usage).toHaveBeenCalledWith({
      table: alias === 'e' ? 'test-project.umami_views.event' : 'test-project.umami_views.session',
      website: expected,
      period: expected,
    })
    expect(processed).toContain(`${alias}.website_id = 'manual'`)
    expect(() => new Parser().astify(processed)).not.toThrow()
  })

  it('filters tables in CTEs and leaves outer grouping intact', async () => {
    const processed = await applyAutomaticFilters(
      'WITH visits AS (SELECT browser FROM `test-project.umami_views.session`) SELECT browser, COUNT(*) AS total FROM visits GROUP BY browser',
      context,
    )
    expect(processed).toContain("website_id = 'chosen-website'")
    expect(processed).toContain('FROM visits GROUP BY browser')
  })

  it('applies website and date filters to event_data', async () => {
    const processed = await applyAutomaticFilters('SELECT * FROM `test-project.umami_views.event_data`', context)
    expect(processed).toContain('created_at BETWEEN')
    expect(processed).toContain("website_id = 'chosen-website'")
  })

  it('does not mistake website JOIN keys for selected website filters', async () => {
    const sql =
      'SELECT e.event_id FROM `test-project.umami_views.event` e LEFT JOIN `test-project.umami.public_website` w ON e.website_id = w.website_id'
    const processed = await applyAutomaticFilters(sql, context)
    expect(processed.match(/website_id = 'chosen-website'/g)).toHaveLength(2)
    expect(processed).toContain('ON e.website_id = w.website_id')
  })

  it('does not mistake column-to-column date comparisons for date bounds', async () => {
    const sql =
      'SELECT e.event_id FROM `test-project.umami_views.event` e JOIN `test-project.umami_views.session` s ON e.session_id = s.session_id AND e.created_at >= s.created_at'
    expect((await applyAutomaticFilters(sql, context)).match(/created_at BETWEEN/g)).toHaveLength(2)
  })

  it('requires a website for event_data too', async () => {
    await expect(
      applyAutomaticFilters('SELECT * FROM `test-project.umami_views.event_data`', { ...context, websiteIdState: '' }),
    ).rejects.toThrow('Velg en nettside først.')
  })

  it('does not add dates to the website directory', async () => {
    const processed = await applyAutomaticFilters('SELECT name FROM `test-project.umami.public_website`', context)
    expect(processed).toContain("website_id = 'chosen-website'")
    expect(processed).not.toContain('created_at')
  })

  it('preserves already-substituted dynamic filters', async () => {
    const sql = applyUrlFiltersToSql(
      `SELECT * FROM \`${getGcpProjectId()}.umami_views.session\` WHERE website_id = '{{website_id}}'\n[[AND {{created_at}}]]`,
      context,
    )
    expect(await applyAutomaticFilters(sql, context)).toBe(sql)
  })

  it('requires a selected website instead of silently querying all websites', async () => {
    await expect(
      applyAutomaticFilters('SELECT * FROM `test-project.umami_views.session`', { ...context, websiteIdState: '' }),
    ).rejects.toThrow('Velg en nettside først.')
  })

  it('leaves queries without recognized tables unchanged', async () => {
    expect(await applyAutomaticFilters('SELECT 1', context)).toBe('SELECT 1')
  })
})
