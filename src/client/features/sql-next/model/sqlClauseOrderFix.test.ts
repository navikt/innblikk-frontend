import { Parser } from 'node-sql-parser/build/bigquery'
import { getSqlClauseOrderFix } from './sqlClauseOrderFix'

describe('misplaced WHERE clauses', () => {
  it('moves the screenshot filter before grouping without changing either field', () => {
    const before =
      "SELECT ep.string_value, COUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende\nFROM `test-project.umami_views.session` LEFT JOIN `test-project.umami_views.event` ON session.session_id = event.session_id LEFT JOIN `test-project.umami_views.event_data` ON event.event_id = event_data.website_event_id LEFT JOIN UNNEST(event_data.event_parameters) AS ep ON TRUE"
    const query = `${before}\nGROUP BY ep.data_key\nWHERE ep.data_key = 'aktivitet'`
    const fixed = getSqlClauseOrderFix(query)
    expect(fixed).toBe(`${before}\nWHERE ep.data_key = 'aktivitet'\nGROUP BY ep.data_key`)
    expect(() => new Parser().astify(fixed!)).not.toThrow()
  })

  it('retains HAVING, ORDER BY, LIMIT, comments, literals and placeholders', () => {
    const before = 'SELECT browser, COUNT(*) AS antall FROM events -- GROUP BY WHERE\n'
    const fixed = getSqlClauseOrderFix(
      `${before}GROUP BY browser\nWHERE browser != 'GROUP BY WHERE' [[AND {{created_at}}]]\nHAVING antall > 1 ORDER BY antall DESC LIMIT 10;`,
    )
    expect(fixed).toBe(
      `${before}WHERE browser != 'GROUP BY WHERE' [[AND {{created_at}}]]\nGROUP BY browser\nHAVING antall > 1 ORDER BY antall DESC LIMIT 10;`,
    )
  })

  it('does not move a nested WHERE out of its SELECT', () => {
    const query =
      'SELECT browser, COUNT(*) FROM events GROUP BY browser WHERE browser IN (SELECT browser FROM other WHERE device = 1)'
    expect(getSqlClauseOrderFix(query)).toBe(
      'SELECT browser, COUNT(*) FROM events\nWHERE browser IN (SELECT browser FROM other WHERE device = 1)\nGROUP BY browser',
    )
  })

  it.each([
    'SELECT browser, COUNT(*) FROM events WHERE browser = 1 GROUP BY browser',
    'SELECT browser COUNT(*) FROM events GROUP BY browser WHERE browser = 1',
    'SELECT browser, COUNT(*) FROM events GROUP BY browser WHERE',
    'SELECT browser, COUNT(*) FROM events GROUP BY browser WHERE browser = 1 WHERE device = 2',
    'SELECT browser, COUNT(*) FROM events GROUP BY browser WHERE browser = 1; SELECT 2',
    'SELECT browser, COUNT(*) FROM events GROUP BY browser WHERE browser = 1 UNION ALL SELECT 2',
    'WITH source AS (SELECT * FROM events) SELECT browser, COUNT(*) FROM source GROUP BY browser WHERE browser = 1',
    'SELECT (SELECT COUNT(*) FROM events GROUP BY browser WHERE browser = 1)',
  ])('does not guess for valid or unsupported SQL: %s', (query) => {
    expect(getSqlClauseOrderFix(query)).toBeNull()
  })
})
