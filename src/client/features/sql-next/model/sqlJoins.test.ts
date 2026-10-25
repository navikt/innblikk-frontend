import { Parser } from 'node-sql-parser/build/bigquery'
import { getSqlJoinOptions, getSqlJoinSuggestion } from './sqlJoins'

const projectId = 'test-project'
const eventTable = `\`${projectId}.umami_views.event\``

describe('JOIN suggestions for missing fields', () => {
  it.each(['data_key', 'string_value', 'number_value', 'date_value', 'data_type'])(
    'suggests event details and UNNEST for an unknown ep alias used as ep.%s',
    (column) => {
      const query = `SELECT ep.${column}, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende FROM ${eventTable} LEFT JOIN \`${projectId}.umami_views.session\` ON event.session_id = session.session_id WHERE event_name = 'navigere' GROUP BY event.event_name ORDER BY 2 DESC`
      const suggestion = getSqlJoinSuggestion(query, 'Unrecognized name: ep at [5:8]', projectId)
      expect(suggestion?.field).toBe(`ep.${column}`)
      expect(suggestion?.tableTitle).toBe('Detaljer på hendelser')
      expect(suggestion?.joinSql).toContain('umami_views.event_data')
      expect(suggestion?.joinSql).toContain('LEFT JOIN UNNEST')
      expect(suggestion?.joinSql).toContain('AS ep ON TRUE')
      expect(suggestion?.sql).toContain(`ep.${column}`)
      expect(suggestion?.sql).toContain('COUNT(DISTINCT NULLIF(')
      expect(suggestion?.sql).toContain("event_name = 'navigere'")
      expect(suggestion?.sql).toMatch(/GROUP BY\s+event\.event_name/)
      expect(suggestion?.sql).toMatch(/ORDER BY\s+2 DESC/)
      expect(suggestion?.sql!.match(/umami_views\.session/g)).toHaveLength(1)
      expect(() => new Parser().astify(suggestion!.sql)).not.toThrow()
    },
  )

  it('does not guess an event-details join for an unknown ep field', () => {
    expect(
      getSqlJoinSuggestion(`SELECT ep.unknown_field FROM ${eventTable}`, 'Unrecognized name: ep at [1:8]', projectId),
    ).toBeNull()
    expect(
      getSqlJoinSuggestion(`SELECT ep.data_key FROM ${eventTable} AS ep`, 'Unrecognized name: ep at [1:8]', projectId),
    ).toBeNull()
  })

  it.each([
    'Unrecognized name: distinct_id; Did you mean visit_id? at [5:42]',
    'Unrecognized name: `distinct_id`; Did you mean visit_id? at [5:42]',
    'Unrecognized name: distinct_id, Did you mean visit_id? at [5:42]',
  ])('suggests user details for the cookie count despite BigQuery spelling advice: %s', (error) => {
    const query = `SELECT event_name, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende FROM ${eventTable} GROUP BY 1 ORDER BY 2 DESC`
    const suggestion = getSqlJoinSuggestion(query, error, projectId)
    expect(suggestion?.field).toBe('distinct_id')
    expect(suggestion?.tableTitle).toBe('Brukerdetaljer')
    expect(suggestion?.sourceTitle).toBe('Hendelser')
    expect(suggestion?.sql).toContain("COUNT(DISTINCT NULLIF(distinct_id, ''))")
    expect(suggestion?.sql).toContain('AS unike_besokende')
    expect(suggestion?.sql).toMatch(/GROUP BY\s+1/)
    expect(suggestion?.sql).toMatch(/ORDER BY\s+2 DESC/)
    expect(suggestion?.sql).not.toContain('visit_id')
    expect(suggestion?.joinSql).toContain('session_id')
    expect(() => new Parser().astify(suggestion!.sql)).not.toThrow()
  })

  it('suggests events for a path filter on user details without changing the count or filters', () => {
    const query = `SELECT COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende FROM \`${projectId}.umami_views.session\` WHERE browser = 'chrome' AND url_path = '/pensjon'`
    const suggestion = getSqlJoinSuggestion(query, 'Unrecognized name: url_path at [5:348]', projectId)
    expect(suggestion?.field).toBe('url_path')
    expect(suggestion?.tableTitle).toBe('Hendelser')
    expect(suggestion?.sourceTitle).toBe('Brukerdetaljer')
    expect(suggestion?.warning).toBeTruthy()
    expect(suggestion?.sql).toContain('COUNT(DISTINCT NULLIF(')
    expect(suggestion?.sql).toContain('AS unike_besokende')
    expect(suggestion?.sql).toContain("browser = 'chrome'")
    expect(suggestion?.sql).toContain("url_path = '/pensjon'")
    expect(suggestion?.sql).toContain('LEFT JOIN')
    expect(suggestion?.joinSql).toContain('session_id')
    expect(() => new Parser().astify(suggestion!.sql)).not.toThrow()
  })

  it('suggests user details for a missing browser field in an event query', () => {
    const suggestion = getSqlJoinSuggestion(
      `SELECT url_path FROM ${eventTable} AS e WHERE browser = 'chrome'`,
      'Unrecognized name: browser at [1:70]',
      projectId,
    )
    expect(suggestion?.tableTitle).toBe('Brukerdetaljer')
    expect(suggestion?.joinSql).toMatch(/`?e`?\.session_id/)
    expect(suggestion?.warning).toBeNull()
  })

  it.each([
    [`SELECT browser FROM \`${projectId}.umami_views.session\``, 'Unrecognized name: browser at [1:8]'],
    [`SELECT url_path FROM ${eventTable}`, 'Unrecognized name: typo at [1:8]'],
    [`SELECT url_path FROM ${eventTable}`, 'Syntax error: url_path at [1:8]'],
    [
      `SELECT url_path FROM \`${projectId}.umami_views.session\` -- preserve comment`,
      'Unrecognized name: url_path at [1:8]',
    ],
    ['SELECT url_path FROM `unknown.dataset.table`', 'Unrecognized name: url_path at [1:8]'],
    ['SELECT', 'Unrecognized name: url_path at [1:8]'],
  ])('does not guess for unsupported queries or unrelated errors', (query, error) => {
    expect(getSqlJoinSuggestion(query, error, projectId)).toBeNull()
  })
})

describe('common event joins', () => {
  it.each(['FROM', 'from\n  ', 'FROM ;'])(
    'fills an empty %s before adding a JOIN without replacing the selected fields',
    (ending) => {
      const query = `SELECT event_name, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende\n${ending}`
      for (const option of getSqlJoinOptions(query, projectId)) {
        expect(option.sql).toContain('COUNT(DISTINCT NULLIF(')
        expect(option.sql).toContain('AS unike_besokende')
        expect(option.sql).toContain('event_name')
        expect(option.sql).toContain(eventTable)
        expect(option.sql).toContain('LEFT JOIN')
        expect(option.joinSql).toMatch(/^FROM/)
        expect(option.sql!.match(/\bFROM\b/g)).toHaveLength(1)
        expect(() => new Parser().astify(option.sql!)).not.toThrow()
      }
    },
  )

  it.each(['session', 'event_data', 'website'])('adds the %s join before WHERE and keeps the query parseable', (id) => {
    const query = `SELECT session_id, COUNT(*) AS antall FROM ${eventTable} WHERE event_type = 1 GROUP BY session_id ORDER BY antall DESC LIMIT 20`
    const sql = getSqlJoinOptions(query, projectId).find((option) => option.id === id)!.sql!
    expect(sql).toBeTruthy()
    expect(sql.indexOf('JOIN')).toBeLessThan(sql.indexOf('WHERE'))
    expect(sql).toContain('LIMIT')
    expect(() => new Parser().astify(sql)).not.toThrow()
  })

  it('uses an existing event alias and qualifies fields to avoid ambiguity', () => {
    const sql = getSqlJoinOptions(`SELECT session_id, created_at FROM ${eventTable} AS e`, projectId)[0].sql!
    expect(sql).toMatch(/e[`]?\.[`]?session_id/i)
    expect(sql).toMatch(/e[`]?\.[`]?created_at/i)
    expect(sql).toContain('LEFT JOIN')
    expect(sql).toContain('ON')
  })

  it('unnests event details as ep', () => {
    const sql = getSqlJoinOptions(`SELECT url_path FROM ${eventTable}`, projectId).find(
      (option) => option.id === 'event_data',
    )!.sql!
    expect(sql).toContain('UNNEST')
    expect(sql).toContain('event_parameters')
    expect(sql).toMatch(/AS\s+`?ep`?/i)
    expect(sql).toContain('website_event_id')
  })

  it('preserves events without details, including missing or empty detail lists', () => {
    const option = getSqlJoinOptions(`SELECT url_path FROM ${eventTable}`, projectId).find(
      (join) => join.id === 'event_data',
    )!
    expect(option.sql).toBeTruthy()
    const ast = new Parser().astify(option.sql!) as { from: Array<{ join?: string }> }
    expect(ast.from.slice(1).map((source) => source.join)).toEqual(['LEFT JOIN', 'LEFT JOIN'])
    expect(option.joinSql).toMatch(/ON TRUE/)
    expect(option.joinSql).not.toContain('CROSS JOIN')
  })

  it.each(['session', 'event_data', 'website'])('can keep only matching %s rows', (targetId) => {
    const option = getSqlJoinOptions(
      `SELECT url_path FROM ${eventTable} WHERE event_type = 2`,
      projectId,
      'event',
      true,
    ).find((join) => join.id === targetId)!
    expect(option.sql).toBeTruthy()
    const ast = new Parser().astify(option.sql!) as { from: Array<{ join?: string }> }
    expect(ast.from[1].join).toBe('INNER JOIN')
    expect(option.joinSql).toMatch(/^INNER JOIN/)
    expect(option.sql).toContain('event_type = 2')
    if (targetId === 'event_data') expect(ast.from[2].join).toBe('CROSS JOIN')
  })

  it('can keep only matches when joining from user details to events', () => {
    const option = getSqlJoinOptions('SELECT browser', projectId, 'session', true)[0]
    expect(option.sql).toBeTruthy()
    expect(option.sql).toContain('INNER JOIN')
    expect(option.sql).not.toContain('LEFT JOIN')
    expect(() => new Parser().astify(option.sql!)).not.toThrow()
  })

  it('disables a join already present', () => {
    const query = `SELECT e.url_path FROM ${eventTable} e LEFT JOIN \`${projectId}.umami_views.session\` s ON e.session_id = s.session_id`
    expect(getSqlJoinOptions(query, projectId).find((option) => option.id === 'session')!.sql).toBeNull()
    expect(getSqlJoinOptions(query, projectId).find((option) => option.id === 'website')!.sql).not.toBeNull()
  })

  it.each([
    ['session', 'umami_views.session', 'browser', 'session_id'],
    ['event_data', 'umami_views.event_data', 'website_event_id', 'event_id'],
    ['website', 'umami.public_website', 'name', 'website_id'],
  ] as const)('joins from %s back to events using its existing alias', (sourceId, datasetTable, field, joinField) => {
    const query = `SELECT ${field} FROM \`${projectId}.${datasetTable}\` AS base`
    const options = getSqlJoinOptions(query, projectId, sourceId)
    expect(options.map((option) => option.id)).toEqual(['event'])
    expect(options[0].sql).toBeTruthy()
    expect(options[0].sql).toContain('LEFT JOIN')
    expect(options[0].sql).toContain(joinField)
    expect(options[0].sql).toMatch(/base\./)
    expect(() => new Parser().astify(options[0].sql!)).not.toThrow()
  })

  it('does not offer self-joins or pairs without a diagram relationship', () => {
    const options = getSqlJoinOptions('SELECT', projectId, 'session')
    expect(options.map((option) => option.id)).toEqual(['event'])
    expect(options[0].relation).toBe('session.session_id = event.session_id')
  })

  it('preserves filter placeholders', () => {
    const query = `SELECT session_id FROM ${eventTable} WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]`
    const sql = getSqlJoinOptions(query, projectId)[0].sql!
    expect(sql).toContain('{{website_id}}')
    expect(sql).toContain('[[AND {{created_at}}]]')
  })

  it.each(['event', 'session'] as const)(
    'adds FROM and JOIN to an existing count using %s as the source',
    (sourceId) => {
      const query = "SELECT COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende\n"
      const option = getSqlJoinOptions(query, projectId, sourceId)[0]
      expect(option.sql).toBeTruthy()
      expect(option.sql).toContain('COUNT(DISTINCT NULLIF(')
      expect(option.sql).toContain('distinct_id')
      expect(option.sql).toContain('AS unike_besokende')
      expect(option.sql).toContain('LEFT JOIN')
      expect(option.sql).not.toMatch(/url_path|browser/)
      expect(option.joinSql).toMatch(/^FROM/)
      expect(option.joinSql).not.toContain('SELECT')
      expect(() => new Parser().astify(option.sql!)).not.toThrow()
    },
  )

  it('adds FROM before existing filters, grouping and sorting without dropping them', () => {
    const option = getSqlJoinOptions(
      'SELECT browser, COUNT(*) AS antall WHERE browser IS NOT NULL GROUP BY browser ORDER BY antall DESC LIMIT 10',
      projectId,
      'session',
    )[0]
    expect(option.sql).toContain('WHERE')
    expect(option.sql).toContain('GROUP BY')
    expect(option.sql).toContain('ORDER BY')
    expect(option.sql).toMatch(/LIMIT\s+10/)
    expect(option.sql!.indexOf('JOIN')).toBeLessThan(option.sql!.indexOf('WHERE'))
    expect(() => new Parser().astify(option.sql!)).not.toThrow()
  })

  it('does not mistake a string containing FROM for a source table', () => {
    const option = getSqlJoinOptions("SELECT 'FROM umami_views.event' AS label", projectId)[0]
    expect(option.sql).toContain("'FROM umami_views.event'")
    expect(option.sql).toContain('LEFT JOIN')
  })

  it.each([
    'SELECT',
    `SELECT * FROM ${eventTable} WHERE`,
    `SELECT * FROM ${eventTable}; SELECT 1`,
    `SELECT * FROM ${eventTable} -- keep comment`,
  ])('leaves unsupported or unfinished SQL unchanged: %s', (query) => {
    expect(getSqlJoinOptions(query, projectId).every((option) => option.sql === null)).toBe(true)
  })
})
