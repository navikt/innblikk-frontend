import { getSqlCommaFix } from './sqlCommaFix'

describe('missing SELECT commas', () => {
  it('offers a comma even when WHERE follows GROUP BY', () => {
    const query =
      "SELECT\n  ep.string_value\n  COUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende\nFROM `test-project.umami_views.session`\nLEFT JOIN `test-project.umami_views.event` ON session.session_id = event.session_id\nLEFT JOIN `test-project.umami_views.event_data` ON event.event_id = event_data.website_event_id\nLEFT JOIN UNNEST(event_data.event_parameters) AS ep ON TRUE\nGROUP BY ep.data_key\nWHERE ep.data_key = 'aktivitet'"
    expect(getSqlCommaFix(query)).toBe(query.replace('ep.string_value\n', 'ep.string_value,\n'))
  })

  it.each(['WHERE', 'WHERE browser =', 'GROUP BY browser WHERE browser = chrome'])(
    'can isolate one missing SELECT comma from an unrelated error in %s',
    (tail) => {
      const query = `SELECT browser COUNT(*) AS antall FROM events ${tail}`
      expect(getSqlCommaFix(query)).toBe(query.replace('browser COUNT', 'browser, COUNT'))
    },
  )

  it.each([
    'SELECT browser device FROM events WHERE',
    'SELECT browser device country FROM events WHERE',
    'SELECT browser COUNT(*) FROM events UNION ALL SELECT device FROM',
    'SELECT browser COUNT(*) FROM events; SELECT device FROM events WHERE',
  ])('does not split valid aliases or guess for ambiguous projections: %s', (query) => {
    expect(getSqlCommaFix(query)).toBeNull()
  })

  it.each([
    [
      "ep.string_value\nCOUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende",
      "ep.string_value,\nCOUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende",
    ],
    ['browser COUNT(*) AS antall', 'browser, COUNT(*) AS antall'],
    ['COUNT(*) AS antall browser', 'COUNT(*) AS antall, browser'],
    ['COUNT(*) SUM(event_type)', 'COUNT(*), SUM(event_type)'],
    ['browser -- behold kommentaren\nCOUNT(*)', 'browser, -- behold kommentaren\nCOUNT(*)'],
    ['`ep`.`string_value` COUNT(*)', '`ep`.`string_value`, COUNT(*)'],
  ])('suggests one comma for %s', (fields, corrected) => {
    const from = ' FROM `test-project.umami_views.event`'
    expect(getSqlCommaFix(`SELECT ${fields}${from}`)).toBe(`SELECT ${corrected}${from}`)
  })

  it.each([
    'SELECT browser, COUNT(*) FROM events GROUP BY browser',
    'SELECT browser device FROM events',
    "SELECT 'browser COUNT(*)' FROM events",
    'SELECT browser FROM events WHERE browser = chrome',
    'SELECT SUM(event_type browser) FROM events',
    'SELECT browser device country FROM events',
    'SELECT browser COUNT(*) FROM',
    'SELECT browser COUNT(*) FROM events; SELECT device FROM events',
  ])('does not guess for valid, ambiguous or unrelated SQL: %s', (query) => {
    expect(getSqlCommaFix(query)).toBeNull()
  })

  it('preserves JOINs, filters, grouping, ordering and placeholders', () => {
    const query =
      "SELECT ep.string_value\nCOUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende\nFROM `test-project.umami_views.event` LEFT JOIN `test-project.umami_views.session` ON event.session_id = session.session_id LEFT JOIN `test-project.umami_views.event_data` ON event.event_id = event_data.website_event_id LEFT JOIN UNNEST(event_data.event_parameters) AS ep ON TRUE WHERE event.event_name = 'navigere' AND ep.data_key = 'innholdstype' [[AND {{created_at}}]] GROUP BY ep.string_value ORDER BY 2 DESC"
    expect(getSqlCommaFix(query)).toBe(query.replace('ep.string_value\n', 'ep.string_value,\n'))
  })
})
