import { addGroupsToSql, type SqlGroup } from './sqlGroups'
import { applyAutomaticFilters, type AutomaticFilterUsage } from './automaticFilters'
import type { CohortConditionNode } from '../../cohortmanager/model/types'

const sidegroup: SqlGroup = {
  kind: 'sidegroup',
  group: { id: 'pages', name: 'Søknader', websiteId: 'site', startWith: ['/soknad'], exclude: ['/kvittering'] },
}
const cohort: SqlGroup = {
  kind: 'cohort',
  group: {
    id: 1,
    name: 'Mobil',
    websiteId: 'site',
    root: {
      nodeType: 'GROUP',
      combinator: 'AND',
      negated: false,
      children: [{ nodeType: 'CONDITION', field: 'device', conditionType: 'EQUALS', value: 'mobile' }],
    },
  },
}

describe('SQL groups', () => {
  it.each<CohortConditionNode>([
    { nodeType: 'CONDITION', field: 'browser', conditionType: 'EQUALS', value: 'chrome' },
    { nodeType: 'CONDITION', field: 'event_name', conditionType: 'EQUALS', value: 'sent' },
    { nodeType: 'CONDITION', paramKey: 'button', conditionType: 'EQUALS', value: 'submit' },
  ])('leaves cohort website and period scoping to global filters: %j', async (condition) => {
    const group: SqlGroup = {
      kind: 'cohort',
      group: {
        id: 2,
        name: 'Testgruppe',
        websiteId: 'original-site',
        root: { nodeType: 'GROUP', combinator: 'AND', negated: false, children: [condition] },
      },
    }
    const sql = addGroupsToSql(
      'SELECT event.url_path, COUNT(DISTINCT event.session_id) FROM `test.umami_views.event` LEFT JOIN `test.umami_views.session` ON event.session_id = session.session_id GROUP BY event.url_path',
      'test',
      [group],
      new Map(),
    )
    expect(sql).not.toContain('original-site')
    expect(sql).not.toMatch(/website_id\s*=\s*'/)
    expect(sql).toContain(condition.value)
    const usages: AutomaticFilterUsage[] = []
    const filtered = await applyAutomaticFilters(
      sql,
      { websiteIdState: 'selected-site', dateRange: {} } as Parameters<typeof applyAutomaticFilters>[1],
      (usage) => usages.push(usage),
    )
    expect(usages.length).toBeGreaterThanOrEqual(3)
    expect(usages.every((usage) => usage.website === 'automatic' && usage.period === 'automatic')).toBe(true)
    expect(filtered).toContain("website_id = 'selected-site'")
    expect(filtered).not.toContain('original-site')
    expect(filtered).toContain(condition.value)
  })

  it('inserts only sidegroup path rules and leaves website scoping to global filters', async () => {
    const sql = addGroupsToSql('SELECT', 'test', [sidegroup], new Map())
    expect(sql).not.toContain('website_id')
    expect(sql).toContain('STARTS_WITH')
    expect(sql).toContain('/soknad')
    expect(sql).toContain('/kvittering')
    const filtered = await applyAutomaticFilters(sql, {
      websiteIdState: 'selected-site',
      dateRange: {},
    } as Parameters<typeof applyAutomaticFilters>[1])
    expect(filtered).toContain("website_id = 'selected-site'")
    expect(filtered).not.toContain("website_id = 'site'")
    expect(filtered).toContain('created_at')
    expect(filtered).toContain('/kvittering')
  })

  it('preserves existing filters, aliases and result clauses', () => {
    const sql = addGroupsToSql(
      'SELECT e.url_path, COUNT(*) AS count FROM `test.umami_views.event` e WHERE e.event_type = 1 OR e.event_type = 2 GROUP BY e.url_path ORDER BY count DESC LIMIT 10',
      'test',
      [sidegroup],
      new Map(),
    )
    expect(sql).toMatch(/event_type = 1\s+OR.*event_type = 2/s)
    expect(sql).toContain('STARTS_WITH')
    expect(sql).toContain('/kvittering')
    expect(sql).toMatch(/GROUP BY\s+e.url_path/)
    expect(sql).toMatch(/LIMIT\s+10/)
  })

  it('can start a query and combine both types of group', async () => {
    const sql = addGroupsToSql('SELECT', 'test', [sidegroup, cohort], new Map())
    expect(sql).toContain('session_id IN')
    expect(sql).toContain('mobile')
    const filtered = await applyAutomaticFilters(sql, { websiteIdState: 'site', dateRange: {} } as Parameters<
      typeof applyAutomaticFilters
    >[1])
    expect(filtered).toContain('created_at')
    expect(filtered).toContain('mobile')
  })

  it('retains placeholders', () => {
    const sql = addGroupsToSql(
      'SELECT * FROM `test.umami_views.event` WHERE {{created_at}} AND website_id = {{website_id}}',
      'test',
      [sidegroup],
      new Map(),
    )
    expect(sql).toContain('{{created_at}}')
    expect(sql).toContain('{{website_id}}')
  })

  it('rejects unsupported queries and missing criteria without replacing SQL', () => {
    expect(() => addGroupsToSql('SELECT 1', 'test', [sidegroup], new Map())).toThrow(/Hendelser/)
    expect(() => addGroupsToSql('WITH x AS (SELECT 1) SELECT * FROM x', 'test', [sidegroup], new Map())).toThrow(/WITH/)
    expect(() =>
      addGroupsToSql('SELECT', 'test', [{ kind: 'cohort', group: { ...cohort.group, id: 2, root: null } }], new Map()),
    ).toThrow(/kriterier/)
  })
})
