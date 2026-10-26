import { addFiltersWithParser, getFilterEdit, getFilterTargets, hasSqlFilters, periodNeedsWebsite } from './sqlFilters'
import { applyUrlFiltersToSql } from '../../sql/utils/sqlProcessing'

const event = '`test-project.umami_views.event`'
const session = '`test-project.umami_views.session`'
const edit = (query: string, choice: Partial<Parameters<typeof getFilterEdit>[2]> = {}) =>
  getFilterEdit(query, 'test-project', { website: true, period: true, ...choice })

describe('getFilterEdit', () => {
  it.each(['', '  \n', 'SELECT', 'select\n'])('starts a filtered query from %j', (query) => {
    const { snippet, sql } = edit(query)
    expect(snippet).toBe(`FROM ${event}\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]`)
    expect(sql).toBe(`SELECT\n${snippet}`)
  })

  it('does not prefix the column when there is a single table', () => {
    const { sql } = edit(`SELECT browser\nFROM ${session}`)
    expect(sql).toBe(`SELECT browser\nFROM ${session}\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]`)
    expect(sql).not.toContain('session.website_id')
  })

  it('uses the chosen table reference only when one is given', () => {
    const { sql, snippet } = edit(`SELECT 1 FROM ${event} e LEFT JOIN ${session} s ON e.session_id = s.session_id`, {
      reference: 'e',
    })
    expect(snippet).toBe("WHERE e.website_id = '{{website_id}}'\n  [[AND {{created_at}}]]")
    expect(sql).toContain("WHERE e.website_id = '{{website_id}}'")
  })

  it('keeps existing conditions, wraps OR and preserves the following clauses', () => {
    expect(edit(`SELECT 1 FROM ${event} WHERE a = 1 OR b = 2\nGROUP BY 1\nLIMIT 5`).sql).toBe(
      `SELECT 1 FROM ${event}\nWHERE (a = 1 OR b = 2)\n  AND website_id = '{{website_id}}'\n  [[AND {{created_at}}]]\nGROUP BY 1\nLIMIT 5`,
    )
  })

  it('only adds what is chosen and keeps a trailing semicolon', () => {
    expect(edit(`SELECT 1 FROM ${session} WHERE browser = 'chrome';`, { website: false }).sql).toBe(
      `SELECT 1 FROM ${session}\nWHERE browser = 'chrome'\n  [[AND {{created_at}}]];`,
    )
    expect(edit(`SELECT 1 FROM ${session} WHERE [[AND {{created_at}}]]`, { period: false }).sql).toBe(
      `SELECT 1 FROM ${session}\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]`,
    )
    expect(edit(`SELECT 1 FROM ${event}`, { website: false, period: false })).toEqual({ snippet: '', sql: null })
  })

  it('adds the missing FROM when the query only has fields', () => {
    const { sql } = edit("SELECT COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende")
    expect(sql).toBe(
      `SELECT COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende\nFROM ${event}\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]`,
    )
  })

  it.each([
    ['a subquery', `SELECT * FROM (SELECT 1 FROM ${event}) t`],
    ['a UNION', `SELECT 1 FROM ${event} UNION ALL SELECT 1 FROM ${event}`],
    ['an unrelated table', 'SELECT 1 FROM `other.dataset.table`'],
  ])('only offers a snippet to copy for %s', (_name, query) => {
    const result = edit(query)
    expect(result.sql).toBeNull()
    expect(result.snippet).toContain('{{website_id}}')
  })

  it('produces SQL that the existing placeholder processing resolves to concrete filters', () => {
    const { sql } = edit(`SELECT 1 FROM ${event} WHERE event_name = 'x'`)
    const resolved = applyUrlFiltersToSql(sql!, {
      websiteIdState: 'site-1',
      websiteIds: ['site-1'],
      dateRange: { from: new Date('2026-09-01'), to: new Date('2026-09-02') },
      customVariables: [],
      customVariableValues: {},
    } as unknown as Parameters<typeof applyUrlFiltersToSql>[1])
    expect(resolved).toContain("website_id = 'site-1'")
    expect(resolved).toMatch(/AND [^\n]*created_at BETWEEN/)
    expect(resolved).not.toContain('{{')
  })
})

describe('period without a WHERE', () => {
  it('brings the website filter along instead of adding a dummy condition', () => {
    const { sql, snippet } = edit(`SELECT 1 FROM ${session}`, { website: false })
    expect(snippet).toBe("WHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]")
    expect(sql).not.toContain('1 = 1')
  })

  it('reports whether the period needs the website filter', () => {
    expect(periodNeedsWebsite(`SELECT 1 FROM ${session}`)).toBe(true)
    expect(periodNeedsWebsite('SELECT')).toBe(true)
    expect(periodNeedsWebsite(`SELECT 1 FROM ${session} WHERE browser = 'chrome'`)).toBe(false)
    expect(periodNeedsWebsite(`SELECT 1 FROM ${session} GROUP BY 1`)).toBe(true)
    expect(periodNeedsWebsite(`SELECT 'WHERE' FROM ${session}`)).toBe(true)
  })
})

describe('getFilterTargets', () => {
  it('lists each Innblikk table with its alias, or its name when it has none', () => {
    expect(
      getFilterTargets(
        `SELECT 1 FROM ${event} e LEFT JOIN ${session} ON e.session_id = session.session_id WHERE 1 = 1`,
      ),
    ).toEqual([
      { label: 'e', reference: 'e' },
      { label: 'session', reference: '`session`' },
    ])
    expect(getFilterTargets('SELECT 1 FROM `other.dataset.table`')).toEqual([])
  })
})

describe('hasSqlFilters', () => {
  it('reports which filters exist while ignoring strings and comments', () => {
    expect(hasSqlFilters(`SELECT 1 FROM ${event}`)).toEqual({ website: false, period: false })
    expect(hasSqlFilters("SELECT 1 WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]")).toEqual({
      website: true,
      period: true,
    })
    expect(hasSqlFilters("SELECT 'website_id =' -- created_at")).toEqual({ website: false, period: false })
  })
})

describe('addFiltersWithParser', () => {
  it('writes visible filters into the subquery tables', async () => {
    const sql = await addFiltersWithParser(`SELECT * FROM (SELECT session_id FROM ${event}) t`)
    expect(sql).toContain("website_id = '{{website_id}}'")
    expect(sql).toContain('[[AND {{created_at}}]]')
    expect(sql).toContain('\n')
  })

  it('leaves SQL that already has filters, or no Innblikk tables, unchanged', async () => {
    const filtered = `SELECT * FROM (SELECT 1 FROM ${event} WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]) t`
    expect(await addFiltersWithParser(filtered)).toBe(filtered)
    expect(await addFiltersWithParser('SELECT 1')).toBe('SELECT 1')
  })
})
