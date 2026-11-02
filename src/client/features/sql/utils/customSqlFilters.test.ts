import {
  applyOptionalCustomFilters,
  getCustomSqlFilterInputMessage,
  getCustomSqlFilters,
  getCustomSqlVariableNames,
  parseCustomSqlFilterValues,
} from './customSqlFilters'
import { applyUrlFiltersToSql } from './sqlProcessing'

describe('custom SQL filters', () => {
  it('detects distinct custom fields, ignoring standard filters and SQL comments', () => {
    expect(
      getCustomSqlVariableNames(
        '-- {{ignored}}\n{{website_id}} {{nettside}} {{created_at}} {{url_sti}} {{url_path}} {{event}} {{event}} {{minimum}}',
      ),
    ).toEqual(['event', 'minimum'])
  })

  it('guides users using configured labels, without treating blank optional fields as missing', () => {
    const definitions = getCustomSqlFilters(
      '-- @filter event {"label":"Hendelse"}\nWHERE event_name = {{event}} [[AND count > {{minimum}}]]',
    )
    expect(getCustomSqlFilterInputMessage(definitions, {})).toBe(
      'Velg eller fyll ut «Hendelse» for å vise resultatene.',
    )
    expect(getCustomSqlFilterInputMessage(definitions, { event: 'paid' })).toBeNull()
    expect(getCustomSqlFilterInputMessage(definitions, { event: '   ' })).toContain('«Hendelse»')
  })

  it('restores serialized custom values and reports malformed links without accepting non-string values', () => {
    expect(parseCustomSqlFilterValues('{"event":"paid","minimum":"5"}')).toEqual({ event: 'paid', minimum: '5' })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const value of ['invalid', 'null', '[]', '{"event":5}']) {
      expect(parseCustomSqlFilterValues(value)).toEqual({})
    }
    expect(warning).toHaveBeenCalledTimes(4)
    warning.mockRestore()
  })

  it('uses SQL comment labels independently of placeholder names and infers event suggestions', () => {
    const sql = '-- @filter event {"label":"Hendelse"}\nWHERE 1=1 [[AND e.event_name = {{event}}]]'
    expect(getCustomSqlFilters(sql, ['event'])).toEqual([
      { name: 'event', label: 'Hendelse', optional: true, source: 'event_name' },
    ])
  })

  it('supports static suggestions for arbitrary custom filters', () => {
    expect(
      getCustomSqlFilters('-- @filter device {"label":"Enhet","options":["mobile","desktop"]}\n{{device}}', ['device']),
    ).toEqual([{ name: 'device', label: 'Enhet', optional: false, options: ['mobile', 'desktop'] }])
  })

  it.each(['not JSON', '{"label":42}', '{"options":[1]}', '{"source":"unknown"}', '{"unknown":true}'])(
    'reports invalid configuration: %s',
    (config) => {
      expect(getCustomSqlFilters(`-- @filter event ${config}\n{{event}}`, ['event'])[0].error).toContain(
        'Ugyldig @filter for event:',
      )
    },
  )

  it('does not interpret directives inside SQL strings', () => {
    expect(getCustomSqlFilters(`SELECT '-- @filter event {"label":"Wrong"}', {{event}}`, ['event'])[0].label).toBe(
      'event',
    )
  })

  it('retains the required status when a variable is also used outside an optional block', () => {
    expect(getCustomSqlFilters('WHERE x = {{x}} [[AND y = {{x}}]]', ['x'])[0].optional).toBe(false)
  })

  it.each(['', '   '])('omits a blank optional filter (%j), keeping website and period', (value) => {
    const sql = "WHERE website_id = '{{website_id}}' [[AND {{created_at}}]] [[AND event_name = {{event}}]]"
    expect(applyOptionalCustomFilters(sql, ['event'], { event: value })).toBe(
      "WHERE website_id = '{{website_id}}' [[AND {{created_at}}]] ",
    )
  })

  it('unwraps populated optional blocks, omits blocks missing any value, and preserves required fields', () => {
    expect(
      applyOptionalCustomFilters(
        'WHERE x = {{required}} [[AND x BETWEEN {{min}} AND {{max}}]] [[AND y = {{value}}]]',
        ['required', 'min', 'max', 'value'],
        { min: '1', value: 'yes' },
      ),
    ).toBe('WHERE x = {{required}}  AND y = {{value}}')
  })

  it('does not change optional syntax in comments or string literals', () => {
    const sql = "SELECT '[[{{event}}]]' -- [[AND x = {{event}}]]\n/* [[{{event}}]] */"
    expect(applyOptionalCustomFilters(sql, ['event'], {})).toBe(sql)
  })

  it('substitutes custom strings and numbers after resolving optional filters', () => {
    const context = {
      websiteIdState: 'site',
      selectedWebsite: null,
      urlPathFromUrl: null,
      urlPath: '',
      pathOperatorFromUrl: null,
      dateRange: { from: undefined, to: undefined },
      customVariables: ['event', 'minimum'],
      customVariableValues: { event: "it's paid", minimum: '5' },
    }
    expect(applyUrlFiltersToSql('WHERE 1=1 [[AND event_name = {{event}}]] [[AND count > {{minimum}}]]', context)).toBe(
      "WHERE 1=1 AND event_name = 'it''s paid' AND count > 5",
    )
    expect(
      applyUrlFiltersToSql('WHERE 1=1 [[AND event_name = {{event}}]]', {
        ...context,
        customVariableValues: {},
      }),
    ).toBe('WHERE 1=1 ')
  })
})
