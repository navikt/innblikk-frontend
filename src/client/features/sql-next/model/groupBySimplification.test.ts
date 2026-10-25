import { getGroupBySimplification } from './groupBySimplification'

const from =
  'FROM `test-project.umami_views.event` AS event LEFT JOIN `test-project.umami_views.session` AS session ON event.session_id = session.session_id LEFT JOIN `test-project.umami_views.event_data` AS event_data ON event.event_id = event_data.website_event_id LEFT JOIN UNNEST(event_data.event_parameters) AS ep ON TRUE'
const select = "SELECT ep.string_value, COUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende"
const where = "WHERE event.url_path = '/pensjon' AND event.event_name = 'søk' AND ep.data_key = 'søkeord'"

describe('GROUP BY simplification', () => {
  it('removes only unselected grouping fields fixed by WHERE', () => {
    const suggestion = getGroupBySimplification(
      `${select} ${from} ${where} GROUP BY event.event_name, ep.data_key, ep.string_value ORDER BY 2 DESC`,
    )
    expect(suggestion?.fields).toEqual(['event.event_name', 'ep.data_key'])
    expect(suggestion?.sql).toMatch(/GROUP BY\s+ep\.string_value\s+ORDER BY/)
    expect(suggestion?.sql).toContain('COUNT(DISTINCT NULLIF(session.distinct_id')
    expect(suggestion?.sql).toContain("event.event_name = 'søk'")
    expect(suggestion?.sql).toContain("ep.data_key = 'søkeord'")
    expect(suggestion?.sql).toContain('LEFT JOIN UNNEST')
    expect(suggestion?.sql).toMatch(/ORDER BY\s+2 DESC/)
  })

  it('preserves dynamic filters', () => {
    const suggestion = getGroupBySimplification(
      `${select} ${from} ${where} [[AND {{created_at}}]] GROUP BY event.event_name, ep.data_key, ep.string_value`,
    )
    expect(suggestion?.sql).toContain('[[AND {{created_at}}]]')
  })

  it('keeps an unselected field when WHERE does not fix its value', () => {
    const suggestion = getGroupBySimplification(
      `${select} ${from} ${where} GROUP BY event.event_name, session.browser, ep.string_value`,
    )
    expect(suggestion?.fields).toEqual(['event.event_name'])
    expect(suggestion?.sql).toMatch(/GROUP BY\s+session\.browser,\s+ep\.string_value/)
  })

  it.each([
    `${select} ${from} WHERE event.event_name = 'søk' OR ep.data_key = 'søkeord' GROUP BY event.event_name, ep.data_key, ep.string_value`,
    `${select} ${from} WHERE event.event_name LIKE 's%' GROUP BY event.event_name, ep.string_value`,
    `${select} ${from} WHERE event.event_name = session.browser GROUP BY event.event_name, ep.string_value`,
    `${select} ${from} ${where} GROUP BY event.event_name, ep.data_key`,
    `${select} ${from} ${where} GROUP BY 1, 2`,
    `${select} ${from} ${where} GROUP BY ep.string_value`,
    `SELECT event.event_name, COUNT(*) ${from} ${where} GROUP BY event.event_name`,
    `${select} ${from} ${where} GROUP BY event.event_name, ep.string_value HAVING event.event_name = 'søk'`,
    `${select} ${from} ${where} GROUP BY event.event_name, ep.string_value ORDER BY event.event_name`,
    `${select} ${from} ${where} GROUP BY event.event_name, ep.string_value -- keep this`,
    `${select} ${from} WHERE event.event_name = '{{event_name}}' GROUP BY event.event_name, ep.string_value`,
  ])('leaves ambiguous or meaningful grouping alone: %s', (query) => {
    expect(getGroupBySimplification(query)).toBeNull()
  })

  it('does not use constraints from a nested query', () => {
    expect(
      getGroupBySimplification(
        `${select} ${from} WHERE EXISTS (SELECT 1 FROM other WHERE event.event_name = 'søk') GROUP BY event.event_name, ep.string_value`,
      ),
    ).toBeNull()
  })
})
