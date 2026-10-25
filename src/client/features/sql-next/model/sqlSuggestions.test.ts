import { applyUrlFiltersToSql } from '../../sql/utils/sqlProcessing'
import { getSqlBuildingBlocks } from './schemaAndSnippets'
import { getSqlSuggestionFragment, getSqlSuggestions, prepareSqlBlockInsertion } from './sqlSuggestions'
import { Parser } from 'node-sql-parser/build/bigquery'

const projectId = 'team-researchops-prod-01d6'
const sessionQuery = `SELECT * FROM \`${projectId}.umami_views.session\`\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]`

describe('filter building blocks', () => {
  it('uses plain labels without exposing the selected website ID', () => {
    const filters = getSqlBuildingBlocks(projectId, '35abb2b7-test-website').filter(
      (block) => block.section === 'filters',
    )
    expect(filters.map((block) => block.label)).toEqual(['Bare sidevisninger', 'Bare hendelser', 'Sidesti starter med'])
    expect(filters.some((block) => block.code.includes('35abb2b7'))).toBe(false)
  })

  it('omits website, period and fixed limit building blocks', () => {
    const blocks = getSqlBuildingBlocks(projectId)
    expect(blocks.some((block) => ['flt-website-dynamic', 'flt-period-dynamic', 'kw-limit'].includes(block.id))).toBe(
      false,
    )
  })

  it('inserts website and period on separate lines and leaves a blank line ready for AND', () => {
    const prefix = `SELECT * FROM \`${projectId}.umami_views.session\`\nWHERE website_id = '{{website_id}}'\n`
    const insertion = prepareSqlBlockInsertion(prefix, '\n[[AND {{created_at}}]]\n')
    const sql = prefix.slice(0, prefix.length - insertion.replaceBefore) + insertion.text
    expect(sql).toBe(
      `SELECT * FROM \`${projectId}.umami_views.session\`\nWHERE website_id = '{{website_id}}'\n[[AND {{created_at}}]]\n`,
    )
  })
})

describe('SQL block insertion', () => {
  it.each(['SELECT\n  *\n', 'SELECT\n  *\n  ', 'SELECT\n  *\n\t'])(
    'reuses the blank line without indentation after %j',
    (prefix) => {
      const insertion = prepareSqlBlockInsertion(prefix, '\nFROM\n  ')
      const sql = prefix.slice(0, prefix.length - insertion.replaceBefore) + insertion.text
      expect(sql).toBe('SELECT\n  *\nFROM\n  ')
    },
  )

  it('still starts a new line when the cursor follows SQL text', () => {
    expect(prepareSqlBlockInsertion('SELECT *', '\nFROM\n  ')).toEqual({
      text: '\nFROM\n  ',
      replaceBefore: 0,
    })
  })

  it('preserves inline field insertion', () => {
    expect(prepareSqlBlockInsertion('SELECT\n  ', 'browser')).toEqual({ text: 'browser', replaceBefore: 0 })
  })
})

describe('SQL builder suggestions', () => {
  it('opens operator suggestions after accepting a filter field', () => {
    const prefix = `${sessionQuery}\nAND bro`
    const browser = getSqlSuggestions(prefix, projectId).find((suggestion) => suggestion.label === 'browser')!
    expect(browser.command).toEqual({ id: 'editor.action.triggerSuggest', title: 'Velg operator' })
    const completed = prefix.slice(0, -getSqlSuggestionFragment(prefix, browser.kind).length) + browser.insertText
    expect(getSqlSuggestions(completed, projectId)[0]).toEqual(
      expect.objectContaining({ label: '=', insertText: ' = ' }),
    )
    expect(
      getSqlSuggestions('SELECT bro', projectId).find((suggestion) => suggestion.label === 'browser')?.command,
    ).toBeUndefined()
  })

  it.each([
    'url_path',
    'browser',
    'event_type',
    'created_at',
    'event.event_name',
    'ep.data_key',
    'sp.string_value',
    '`event`.`url_path`',
  ])('offers described operators after %s without replacing the field', (field) => {
    const prefix = `${sessionQuery}\nAND ${field}`
    const suggestions = getSqlSuggestions(prefix, projectId)
    expect(suggestions.map((suggestion) => [suggestion.label, suggestion.labelDescription])).toEqual([
      ['=', 'Er lik'],
      ['!=', 'Er ulik'],
      ['>', 'Større enn'],
      ['>=', 'Større enn eller lik'],
      ['<', 'Mindre enn'],
      ['<=', 'Mindre enn eller lik'],
      ['LIKE', 'Tekst med jokertegn (% og _)'],
      ['NOT LIKE', 'Utelat tekst med jokertegn (% og _)'],
      ['IN', 'Er en av flere verdier'],
      ['NOT IN', 'Er ingen av verdiene'],
      ['BETWEEN', 'Er mellom to verdier'],
      ['IS NULL', 'Mangler verdi'],
      ['IS NOT NULL', 'Har verdi'],
    ])
    const equal = suggestions[0]
    const result =
      prefix.slice(0, prefix.length - (equal.replaceBefore ?? getSqlSuggestionFragment(prefix, equal.kind).length)) +
      equal.insertText
    expect(result).toBe(`${prefix} = `)
  })

  it.each(['WHERE', 'AND', 'OR', 'ON', 'HAVING'])('offers operators in %s expressions', (clause) => {
    expect(getSqlSuggestions(`${sessionQuery}\n${clause} event_type `, projectId)).toContainEqual(
      expect.objectContaining({ label: '=', insertText: '= ', replaceBefore: 0 }),
    )
  })

  it.each([
    ['event_type >', '>=', 'event_type >= '],
    ['url_path L', 'LIKE', 'url_path LIKE '],
    ['url_path NOT L', 'NOT LIKE', 'url_path NOT LIKE '],
    ['event_type IS N', 'IS NULL', 'event_type IS NULL '],
    ['event_type>=', '>=', 'event_type >= '],
    ['event_type > ', '>=', 'event_type >= '],
  ])('completes the operator in %s', (condition, label, corrected) => {
    const prefix = `${sessionQuery}\nAND ${condition}`
    const suggestion = getSqlSuggestions(prefix, projectId).find((item) => item.label === label)!
    expect(suggestion).toBeDefined()
    expect(prefix.slice(0, prefix.length - suggestion.replaceBefore!) + suggestion.insertText).toBe(
      `${sessionQuery}\nAND ${corrected}`,
    )
  })

  it.each([
    'SELECT url_path',
    `${sessionQuery}\nGROUP BY url_path`,
    `${sessionQuery}\nORDER BY url_path`,
    `${sessionQuery}\nAND bro`,
    `${sessionQuery}\n-- AND url_path`,
    `${sessionQuery}\n/* AND url_path`,
    `${sessionQuery}\nAND browser = 'AND url_path`,
  ])('does not offer operators outside a completed filter field: %s', (query) => {
    expect(getSqlSuggestions(query, projectId).some((suggestion) => suggestion.label === '=')).toBe(false)
  })

  it('offers both ways to count unique visitors in SELECT suggestions', () => {
    const suggestions = getSqlSuggestions('SELECT ', projectId)
    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Unike besøkende (fingeravtrykk)',
          insertText: 'COUNT(DISTINCT session_id) AS unike_besokende',
        }),
        expect.objectContaining({
          label: 'Unike besøkende (cookie)',
          insertText: "COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende",
          detail: '',
        }),
      ]),
    )
  })

  it('suggests the session table for cookie-based unique visitors', () => {
    const suggestions = getSqlSuggestions(
      "SELECT COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende FROM ",
      projectId,
    )
    expect(suggestions.map((suggestion) => suggestion.label)).toEqual(['Brukerdetaljer'])
  })

  it.each(['GROUP BY ', 'GROUP BY bro', 'GROUP BY browser\nGROUP BY '])(
    'offers only selected non-aggregate columns after %s',
    (clause) => {
      const sql = `SELECT browser, COUNT(DISTINCT session_id) AS besokende FROM \`${projectId}.umami_views.session\`\n${clause}`
      const suggestions = getSqlSuggestions(sql, projectId)
      expect(suggestions.map((suggestion) => [suggestion.label, suggestion.insertText])).toEqual([
        ['browser (1)', '1 '],
      ])
      expect(suggestions[0].command).toBeUndefined()
    },
  )

  it('preserves column positions while excluding aggregate expressions from grouping choices', () => {
    const sql = `SELECT COUNT(*) AS antall, browser, country, SUM(event_type) AS total FROM \`${projectId}.umami_views.session\` GROUP BY `
    expect(getSqlSuggestions(sql, projectId).map((suggestion) => [suggestion.label, suggestion.insertText])).toEqual([
      ['browser (2)', '2 '],
      ['country (3)', '3 '],
    ])
  })

  it('keeps selected date expressions as grouping choices and excludes counting', () => {
    const sql = `SELECT DATE(created_at, 'Europe/Oslo') AS dato, COUNT(*) AS antall FROM \`${projectId}.umami_views.session\` GROUP BY `
    expect(getSqlSuggestions(sql, projectId).map((suggestion) => suggestion.label)).toEqual(['dato (1)'])
  })

  it('does not fall back to unrelated table fields when all selected columns are aggregate expressions', () => {
    expect(
      getSqlSuggestions(`SELECT COUNT(*) AS antall FROM \`${projectId}.umami_views.session\` GROUP BY `, projectId),
    ).toEqual([])
  })

  it.each(['ORDER BY ', 'ORDER BY bes', 'ORDER BY 1 DESC, '])(
    'offers only selected output columns after %s',
    (clause) => {
      const query = `SELECT browser, COUNT(DISTINCT session_id) AS besokende\nFROM \`${projectId}.umami_views.session\`\nGROUP BY browser\n${clause}`
      const suggestions = getSqlSuggestions(query, projectId)
      expect(suggestions.map((suggestion) => [suggestion.label, suggestion.insertText])).toEqual([
        ['browser (1)', '1 '],
        ['besokende (2)', '2 '],
      ])
    },
  )

  it.each(['ORDER BY 2 ', 'ORDER BY browser ', 'ORDER BY 1 DESC, 2 '])(
    'offers sorting directions with visible plain-language descriptions after %s',
    (clause) => {
      const suggestions = getSqlSuggestions(`${sessionQuery}\n${clause}`, projectId)
      expect(suggestions.map((suggestion) => [suggestion.label, suggestion.labelDescription])).toEqual([
        ['DESC', 'Synkende: størst til minst'],
        ['ASC', 'Stigende: minst til størst'],
      ])
    },
  )

  it('opens the direction choices after accepting a sort column', () => {
    const sql = `SELECT browser, COUNT(*) AS besokende FROM \`${projectId}.umami_views.session\` GROUP BY browser ORDER BY `
    const column = getSqlSuggestions(sql, projectId)[1]
    expect(column.insertText).toBe('2 ')
    expect(column.command?.id).toBe('editor.action.triggerSuggest')
    expect(getSqlSuggestions(sql + column.insertText, projectId).map((suggestion) => suggestion.label)).toEqual([
      'DESC',
      'ASC',
    ])
  })

  it.each([
    ['D', 'DESC'],
    ['a', 'ASC'],
  ])('completes the typed sorting direction %s', (prefix, expected) => {
    const suggestions = getSqlSuggestions(`${sessionQuery}\nORDER BY 2 ${prefix}`, projectId)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].insertText).toBe(expected)
  })

  it.each([
    ["DATE(created_at, 'Europe/Oslo') AS dato, COUNT(*) AS antall", ['dato (1)', 'antall (2)']],
    ["COALESCE(browser, 'unknown') AS nettleser, COUNT(*) antall", ['nettleser (1)', 'antall (2)']],
    ["'value, FROM example' AS tekst, COUNT(*) AS antall", ['tekst (1)', 'antall (2)']],
    ['browser AS `Nettleser`, COUNT(*) AS antall', ['Nettleser (1)', 'antall (2)']],
  ])('preserves selected expression boundaries for %s', (projection, expectedLabels) => {
    const query = `SELECT ${projection} FROM \`${projectId}.umami_views.session\` ORDER BY `
    expect(getSqlSuggestions(query, projectId).map((suggestion) => suggestion.label)).toEqual(expectedLabels)
  })

  it('keeps table fields as a fallback when SELECT uses a wildcard', () => {
    const suggestions = getSqlSuggestions(`${sessionQuery}\nORDER BY `, projectId)
    expect(suggestions.some((suggestion) => suggestion.label === 'browser')).toBe(true)
  })

  it.each([
    `${sessionQuery}\nGROUP BY browser\n`,
    `${sessionQuery}\nGROUP BY browser\n  `,
    `${sessionQuery}\nORDER BY browser\n`,
  ])('offers SQL words as a fallback on the blank line after %j', (prefix) => {
    const suggestions = getSqlSuggestions(prefix, projectId)
    expect(suggestions.every((suggestion) => suggestion.kind === 'keyword')).toBe(true)
    expect(suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['ORDER BY', 'GROUP BY', 'LIMIT', 'AND', 'LEFT JOIN']),
    )
  })

  it.each(["SELECT 'unfinished\n", 'SELECT "unfinished\n', 'SELECT `unfinished\n', '/* comment\n'])(
    'does not fall back to SQL words inside non-SQL text: %j',
    (prefix) => {
      expect(getSqlSuggestions(prefix, projectId)).toEqual([])
    },
  )

  it.each([
    'SELECT *\n',
    'SELECT\n  *\n',
    'SELECT browser\n',
    'SELECT DISTINCT browser, device\n',
    'SELECT browser, COUNT(DISTINCT session_id) AS besokende\n',
    'SELECT COUNT(*) AS antall\n',
    "SELECT DATE(created_at, 'Europe/Oslo') AS dato, COUNT(*) AS antall\n",
    'SELECT SUM(COALESCE(event_type, 0)) AS antall\n',
    'SELECT\n  browser,\n  COUNT(DISTINCT session_id) AS besokende\n',
  ])('offers FROM on the blank line after %j and opens table choices when accepted', (prefix) => {
    const suggestions = getSqlSuggestions(prefix, projectId)
    expect(suggestions).toEqual([
      {
        label: 'FROM',
        insertText: 'FROM ',
        detail: 'Velg tabell',
        kind: 'keyword',
        preselect: true,
        command: { id: 'editor.action.triggerSuggest', title: 'Velg tabell' },
      },
    ])
    const tableSuggestions = getSqlSuggestions(prefix + suggestions[0].insertText, projectId)
    expect(tableSuggestions.length).toBeGreaterThan(0)
    expect(tableSuggestions.every((suggestion) => suggestion.kind === 'table')).toBe(true)
  })

  it.each([
    'SELECT\n  ',
    'SELECT browser,\n',
    'SELECT * FROM umami_views.session\n',
    "SELECT 'unfinished\n",
    'SELECT browser, COUNT(\n',
    'SELECT COUNT(*) AS\n',
    'SELECT COUNT(DISTINCT session_id) AS besokende,\n',
  ])('does not propose a new FROM after %j', (prefix) => {
    expect(getSqlSuggestions(prefix, projectId).some((suggestion) => suggestion.insertText === 'FROM ')).toBe(false)
  })

  it.each(['browser = ', 'browser = ch', "browser = 'ch", 'browser = chrome'])(
    'preserves spaces around the operator when completing %s',
    (prefix) => {
      const suggestion = getSqlSuggestions(prefix, projectId).find((item) => item.label === 'chrome')!
      const fragment = getSqlSuggestionFragment(prefix, suggestion.kind)
      const completed = prefix.slice(0, prefix.length - fragment.length) + suggestion.insertText
      expect(completed).toBe("browser = 'chrome'")
    },
  )

  it('replaces a multiword browser value without removing the space after the operator', () => {
    const prefix = 'browser = samsung in'
    const fragment = getSqlSuggestionFragment(prefix, 'value')
    expect(fragment).toBe('samsung in')
    expect(prefix.slice(0, prefix.length - fragment.length) + "'samsung internet'").toBe("browser = 'samsung internet'")
  })

  it.each([
    ['SEL', 'SELECT'],
    ['sel', 'SELECT'],
    ['SELECT *\nFR', 'FROM'],
    [`SELECT * FROM \`${projectId}.umami_views.session\`\nWH`, 'WHERE'],
    ["WHERE browser = 'Safari'\nAN", 'AND'],
    ['SELECT browser\nGRO', 'GROUP BY'],
    ['SELECT browser\nORD', 'ORDER BY'],
  ])('completes SQL words in %s', (query, keyword) => {
    expect(getSqlSuggestions(query, projectId)).toContainEqual({
      label: keyword,
      insertText: keyword,
      detail: 'SQL-ord',
      kind: 'keyword',
    })
  })

  it.each(["SELECT 'SEL", "SELECT 'SEL'", 'SELECT "SEL', 'SELECT `SEL', '-- SEL', '/* SEL'])(
    'does not complete SQL words inside strings, quoted names or comments: %s',
    (query) => {
      expect(getSqlSuggestions(query, projectId)).toEqual([])
    },
  )

  it('offers all fields first and preselected after SELECT', () => {
    const suggestions = getSqlSuggestions('SELECT\n  ', projectId)
    expect(suggestions[0]).toMatchObject({
      label: '* (alle felter)',
      insertText: '*',
      detail: '',
      sortText: '0',
      preselect: true,
    })
    const sorted = [...suggestions].sort((left, right) =>
      (left.sortText ?? left.label).localeCompare(right.sortText ?? right.label),
    )
    expect(sorted[0].insertText).toBe('*')
  })

  it('ranks common building blocks below all fields and above column names', () => {
    const suggestions = getSqlSuggestions('SELECT ', projectId)
    const sorted = [...suggestions].sort((left, right) =>
      (left.sortText ?? left.label).localeCompare(right.sortText ?? right.label),
    )
    expect(sorted.slice(0, 6).map((suggestion) => suggestion.label)).toEqual([
      '* (alle felter)',
      'Unike besøkende (cookie)',
      'Unike besøkende (fingeravtrykk)',
      'Tell rader / visninger',
      'Tell økter',
      'Dato (per dag)',
    ])
    expect(sorted.findIndex((suggestion) => suggestion.label === 'browser')).toBeGreaterThan(5)
  })

  it.each(['fld-date', 'fld-visitors', 'fld-visitors-cookie', 'fld-views', 'fld-visits'])(
    'inserts the existing %s snippet without moving to a new line',
    (blockId) => {
      const block = getSqlBuildingBlocks(projectId).find((candidate) => candidate.id === blockId)!
      const suggestion = getSqlSuggestions('SELECT ', projectId).find((candidate) => candidate.label === block.label)!
      expect(suggestion.insertText).toBe(block.code)
      expect(suggestion.command).toBeUndefined()
    },
  )

  it('does not suggest counting blocks inside filters', () => {
    expect(
      getSqlSuggestions(`${sessionQuery}\nAND `, projectId).some((suggestion) => suggestion.label.startsWith('Tell ')),
    ).toBe(false)
  })

  it('keeps a selected named field on the current line', () => {
    const suggestions = getSqlSuggestions('SELECT\n  bro', projectId)
    expect(suggestions.find((suggestion) => suggestion.label === 'browser')?.insertText).toBe('browser')
  })

  it('waits for an explicit newline before proposing FROM after all fields', () => {
    const prefix = 'SELECT '
    const allFields = getSqlSuggestions(prefix, projectId)[0]
    const completed = prefix + allFields.insertText
    expect(completed).toBe('SELECT *')
    expect(allFields.command).toBeUndefined()
    expect(getSqlSuggestions(`${completed}\n`, projectId)[0].label).toBe('FROM')
  })

  it.each(['SELECT browser, ', 'SELECT browser, cou', 'SELECT COUNT(*) AS antall, '])(
    'offers additional inline fields after %j',
    (prefix) => {
      const suggestions = getSqlSuggestions(prefix, projectId)
      const country = suggestions.find((suggestion) => suggestion.label === 'country')!
      expect(country.insertText).toBe('country')
      expect(country.command).toBeUndefined()
      const fragment = getSqlSuggestionFragment(prefix, country.kind)
      const completed = prefix.slice(0, prefix.length - fragment.length) + country.insertText
      expect(completed).not.toContain('\n')
      expect(completed).not.toContain('FROM')
    },
  )

  it.each([
    'SELECT browser ',
    'SELECT browser   ',
    'SELECT browser, device ',
    'SELECT\n  browser ',
    'SELECT DISTINCT browser ',
    'SELECT COUNT(*) AS antall ',
    "SELECT COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende ",
  ])('offers another SELECT field after a space and inserts the missing comma: %j', (prefix) => {
    const suggestions = getSqlSuggestions(prefix, projectId)
    const country = suggestions.find((suggestion) => suggestion.label === 'country')!
    expect(country).toBeDefined()
    expect(country.insertText).toBe(', country')
    const completed = prefix.slice(0, prefix.length - country.replaceBefore!) + country.insertText
    expect(completed).toBe(`${prefix.trimEnd()}, country`)
    expect(suggestions.some((suggestion) => suggestion.label === '* (alle felter)')).toBe(false)
    const count = suggestions.find((suggestion) => suggestion.label === 'Unike besøkende (cookie)')!
    expect(count.insertText).toBe(", COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende")
  })

  it.each(['SELECT ', 'SELECT browser, ', 'SELECT browser,  '])('does not add a redundant comma after %j', (prefix) => {
    const country = getSqlSuggestions(prefix, projectId).find((suggestion) => suggestion.label === 'country')!
    expect(country.insertText).toBe('country')
    expect(country.replaceBefore).toBeUndefined()
  })

  it('offers additional fields before an existing FROM clause', () => {
    const country = getSqlSuggestions('SELECT browser ', projectId, '\nFROM `test-project.umami_views.session`').find(
      (suggestion) => suggestion.label === 'country',
    )!
    expect(country.insertText).toBe(', country')
  })

  it('does not offer SELECT fields inside an unfinished quoted value after a comma', () => {
    expect(getSqlSuggestions("SELECT 'unfinished, ", projectId)).toEqual([])
  })

  it('does not insert another FROM when editing fields in an existing query', () => {
    const suffix = '\nFROM `test-project.umami_views.session`'
    const suggestions = getSqlSuggestions('SELECT bro', projectId, suffix)
    expect(suggestions[0].insertText).toBe('*')
    expect(suggestions.find((suggestion) => suggestion.label === 'browser')?.insertText).toBe('browser')
    expect(suggestions[0].command).toBeUndefined()
  })

  it('keeps filter fields on the current line for adding a comparison', () => {
    const suggestions = getSqlSuggestions(`${sessionQuery}\nAND bro`, projectId)
    expect(suggestions.find((suggestion) => suggestion.label === 'browser')?.insertText).toBe('browser')
  })

  it.each(['WHERE', 'AND', 'OR', 'ON', 'GROUP BY', 'ORDER BY'])('does not offer all fields after %s', (keyword) => {
    const suggestions = getSqlSuggestions(`${sessionQuery}\n${keyword} `, projectId)
    expect(suggestions.some((suggestion) => suggestion.insertText.trim() === '*')).toBe(false)
  })

  it('offers fully quoted table names after FROM and JOIN', () => {
    for (const keyword of ['FROM', 'LEFT JOIN']) {
      expect(getSqlSuggestions(`SELECT *\n${keyword}\n  `, projectId)).toContainEqual({
        label: 'Brukerdetaljer',
        labelDescription: 'Tabell',
        filterText: `\`${projectId}.umami_views.session\` Brukerdetaljer`,
        insertText: `\`${projectId}.umami_views.session\``,
        detail: 'Brukerdetaljer',
        kind: 'table',
      })
    }
  })

  it('provides an always-visible description for every table suggestion', () => {
    const suggestions = getSqlSuggestions('SELECT *\nFROM ', projectId)
    expect(suggestions.map((suggestion) => [suggestion.label, suggestion.labelDescription])).toEqual([
      ['Hendelser', 'Tabell'],
      ['Brukerdetaljer', 'Tabell'],
      ['Detaljer på hendelser', 'Tabell'],
      ['Nettsider', 'Tabell'],
    ])
  })

  it('offers fields from the selected table after an indented optional date filter and AND', () => {
    const suggestions = getSqlSuggestions(`${sessionQuery}\nAND\n  `, projectId)
    expect(suggestions.map((suggestion) => suggestion.label)).toContain('browser')
    expect(suggestions.map((suggestion) => suggestion.label)).not.toContain('url_path')
  })

  it.each([
    ['browser', 'Brukerdetaljer'],
    ['device', 'Brukerdetaljer'],
    ['url_path', 'Hendelser'],
    ['visit_id', 'Hendelser'],
    ['COUNT(DISTINCT visit_id) AS okter', 'Hendelser'],
    ['domain', 'Nettsider'],
    ['ep.data_key', 'Detaljer på hendelser'],
    ['`browser`', 'Brukerdetaljer'],
    ['browser AS domain', 'Brukerdetaljer'],
    ['BROWSER, DEVICE', 'Brukerdetaljer'],
  ])('shows only the table containing %s', (fields, expectedTable) => {
    const suggestions = getSqlSuggestions(`SELECT ${fields}\nFROM `, projectId)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].label).toBe(expectedTable)
    expect(suggestions[0].preselect).toBe(true)
    expect(suggestions[0].detail).not.toContain('Inneholder')
    const sorted = [...suggestions].sort((left, right) =>
      (left.sortText ?? left.label).localeCompare(right.sortText ?? right.label),
    )
    expect(sorted[0].label).toBe(expectedTable)
  })

  it('shows only compatible tables for a shared field without choosing one', () => {
    const suggestions = getSqlSuggestions('SELECT session_id FROM ', projectId)
    expect(suggestions.map((suggestion) => suggestion.label)).toEqual(['Hendelser', 'Brukerdetaljer'])
    expect(suggestions.some((suggestion) => suggestion.preselect)).toBe(false)
  })

  it.each(['*', 'COUNT(*) AS antall', "'browser' AS name", 'unknown_field'])(
    'does not invent a single matching table for %s',
    (fields) => {
      const suggestions = getSqlSuggestions(`SELECT ${fields} FROM `, projectId)
      expect(suggestions).toHaveLength(4)
      expect(suggestions.some((suggestion) => suggestion.preselect)).toBe(false)
      expect(suggestions.every((suggestion) => !suggestion.detail.includes('Inneholder'))).toBe(true)
    },
  )

  it('does not treat a field mentioned in a comment as selected', () => {
    const suggestions = getSqlSuggestions('SELECT browser /* url_path */ FROM ', projectId)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].label).toBe('Brukerdetaljer')
    expect(suggestions[0].detail).toBe('Brukerdetaljer')
  })

  it.each([
    ["event_name, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende", 'session', 'session_id'],
    ['browser, url_path', 'session', 'session_id'],
    ['event_name, ep.data_key', 'event_data', 'website_event_id'],
    ['event_name, domain', 'website', 'website_id'],
  ])('offers a complete JOIN for %s', (fields, targetId, joinField) => {
    const prefix = `SELECT\n  ${fields}\nFROM `
    const suggestions = getSqlSuggestions(prefix, projectId)
    expect(suggestions).toHaveLength(1)
    const joined = suggestions[0]
    expect(joined.label).toMatch(/^Hendelser \+ /)
    expect(joined.label).not.toContain('umami')
    expect(joined.labelDescription).toBe('JOIN')
    expect(joined.preselect).toBe(true)
    expect(joined.insertText).toContain(`\`${projectId}.umami_views.event\``)
    expect(joined.insertText).toContain('LEFT JOIN')
    expect(joined.insertText).toContain(joinField)
    const targetTable = targetId === 'website' ? 'umami.public_website' : `umami_views.${targetId}`
    expect(joined.insertText).toContain(`LEFT JOIN \`${projectId}.${targetTable}\``)
    expect(() => new Parser().astify(prefix + joined.insertText)).not.toThrow()
    expect(
      [...suggestions].sort((left, right) =>
        (left.sortText ?? left.label).localeCompare(right.sortText ?? right.label),
      )[0],
    ).toBe(joined)
    if (targetId === 'event_data') {
      expect(joined.insertText).toContain('LEFT JOIN UNNEST')
      expect(joined.insertText).toContain('AS ep ON TRUE')
    }
  })

  it('replaces a partial table name with the complete JOIN suggestion', () => {
    const prefix = `SELECT event_name, distinct_id FROM \`${projectId}.umami_v`
    const suggestion = getSqlSuggestions(prefix, projectId)[0]
    const fragment = getSqlSuggestionFragment(prefix, suggestion.kind)
    const sql = prefix.slice(0, -fragment.length) + suggestion.insertText
    expect(suggestion.label).toBe('Hendelser + Brukerdetaljer')
    expect(suggestion.labelDescription).toBe('JOIN')
    expect(suggestion.filterText).toContain(`${projectId}.umami_views.event`)
    expect(suggestion.filterText).toContain(`${projectId}.umami_views.session`)
    expect(() => new Parser().astify(sql)).not.toThrow()
    expect(sql).toContain(`LEFT JOIN \`${projectId}.umami_views.session\``)
    expect(sql.match(/\bFROM\b/g)).toHaveLength(1)
  })

  it.each([
    'event_name, distinct_id, created_at',
    'event_name, distinct_id, domain',
    'event_name, /* preserve */ distinct_id',
  ])('does not guess a JOIN for ambiguous or unsupported projections: %s', (fields) => {
    expect(
      getSqlSuggestions(`SELECT ${fields} FROM `, projectId).some(
        (suggestion) => suggestion.labelDescription === 'JOIN',
      ),
    ).toBe(false)
  })

  it('does not suggest another base table with JOINs when SQL already follows the cursor', () => {
    const suggestions = getSqlSuggestions(
      'SELECT event_name, distinct_id FROM ',
      projectId,
      `\`${projectId}.umami_views.event\` LEFT JOIN \`${projectId}.umami_views.session\` ON event.session_id = session.session_id`,
    )
    expect(suggestions.some((suggestion) => suggestion.labelDescription === 'JOIN')).toBe(false)
  })

  it('offers quoted browser values when starting or typing a value', () => {
    for (const suffix of ['browser = ', "browser = 'sa", 'browser = sa']) {
      expect(getSqlSuggestions(`${sessionQuery}\nAND ${suffix}`, projectId)).toContainEqual({
        label: 'safari',
        insertText: "'safari'",
        detail: 'browser',
        kind: 'value',
      })
    }
  })

  it('inserts lowercase browser values, including chrome', () => {
    const suggestions = getSqlSuggestions(`${sessionQuery}\nAND browser = `, projectId)
    expect(suggestions.find((suggestion) => suggestion.label === 'chrome')?.insertText).toBe("'chrome'")
    expect(suggestions.every((suggestion) => suggestion.insertText === suggestion.insertText.toLowerCase())).toBe(true)
  })

  it('does not offer tables or fields inside a completed string', () => {
    expect(getSqlSuggestions(`${sessionQuery}\nAND browser = 'Safari'`, projectId)).toEqual([])
  })

  it('preserves AND after substituting an indented date filter', () => {
    const processed = applyUrlFiltersToSql(`${sessionQuery}\nAND\n browser = 'Safari'`, {
      websiteIdState: 'test-website',
      selectedWebsite: null,
      urlPathFromUrl: null,
      urlPath: '',
      pathOperatorFromUrl: null,
      dateRange: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 2) },
      customVariables: [],
      customVariableValues: {},
    })
    expect(processed).not.toContain('{{')
    expect(processed).toContain('.created_at BETWEEN TIMESTAMP(')
    expect(processed).toContain("AND\n browser = 'Safari'")
  })
})
