import { getSqlQuoteFix } from './sqlQuoteFix'

const from = 'SELECT COUNT(*) FROM `test-project.umami_views.event`'

describe('missing SQL quotes', () => {
  it.each([
    ['browser = chrome', "browser = 'chrome'"],
    ['url_path = /pensjon', "url_path = '/pensjon'"],
    ['device != mobile', "device != 'mobile'"],
    ['language = nb-NO', "language = 'nb-NO'"],
    ['s.browser = chrome', "s.browser = 'chrome'"],
    ['ep.data_key = innholdstype', "ep.data_key = 'innholdstype'"],
    ['ep.string_value = artikkel', "ep.string_value = 'artikkel'"],
    ['sp.data_key = brukergruppe', "sp.data_key = 'brukergruppe'"],
    ['sp.string_value = privatperson', "sp.string_value = 'privatperson'"],
    ['`ep`.`data_key` = innholdstype', "`ep`.`data_key` = 'innholdstype'"],
    ['browser LIKE chrome', "browser LIKE 'chrome'"],
    ['url_path = /pensjon/alderspensjon/', "url_path = '/pensjon/alderspensjon/'"],
  ])('quotes a clear text value in %s', (condition, corrected) => {
    const fix = getSqlQuoteFix(`${from} WHERE ${condition}`)
    expect(fix?.sql).toBe(`${from} WHERE ${corrected}`)
  })

  it('fixes multiple comparisons while preserving filters, comments and formatting', () => {
    const query = `${from}\nWHERE browser = chrome -- browser = safari\nAND url_path = /pensjon\nAND event_type = 1`
    const fix = getSqlQuoteFix(query)
    expect(fix?.values).toEqual(['chrome', '/pensjon'])
    expect(fix?.sql).toBe(
      `${from}\nWHERE browser = 'chrome' -- browser = safari\nAND url_path = '/pensjon'\nAND event_type = 1`,
    )
  })

  it.each([
    "browser = 'chrome'",
    'event_type = 1',
    'event_type = 10 / 2',
    'browser = device',
    'event.session_id = session.session_id',
    'ep.data_key = sp.data_key',
    'ep.data_key = data_key',
    "ep.data_key = 'innholdstype'",
    'browser = NULL',
    'browser = TRUE',
    'created_at = CURRENT_DATE()',
    'browser = LOWER(browser)',
    'browser = chrome + browser',
    'browser = chrome-browser',
    'browser = {{browser}}',
    "browser = 'url_path = /pensjon'",
  ])('leaves valid or ambiguous expressions alone: %s', (condition) => {
    expect(getSqlQuoteFix(`${from} WHERE ${condition}`)).toBeNull()
  })

  it('does not alter comments or incomplete queries', () => {
    expect(getSqlQuoteFix(`${from} -- browser = chrome`)).toBeNull()
    expect(getSqlQuoteFix(`${from} /* url_path = /pensjon */`)).toBeNull()
    expect(getSqlQuoteFix(`${from} WHERE browser = chrome AND`)).toBeNull()
  })
})
