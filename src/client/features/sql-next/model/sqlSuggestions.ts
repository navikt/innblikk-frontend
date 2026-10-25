import { getBigQueryTables, getFullTableName, getSqlBuildingBlocks } from './schemaAndSnippets'
import { getSqlJoinOptions } from './sqlJoins'

export interface SqlSuggestion {
  label: string
  labelDescription?: string
  filterText?: string
  insertText: string
  detail: string
  documentation?: string
  kind: 'table' | 'field' | 'value' | 'keyword'
  sortText?: string
  preselect?: boolean
  replaceBefore?: number
  command?: { id: string; title: string }
}

export const getSqlSuggestionPresentation = (suggestion: SqlSuggestion) => {
  const description = suggestion.labelDescription ?? suggestion.detail
  return {
    label: { label: suggestion.label, detail: description ? `  ${description}` : undefined },
    detail: undefined,
    documentation:
      suggestion.documentation ?? (suggestion.labelDescription ? suggestion.detail || undefined : undefined),
  }
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  url_path: 'Sidesti',
  event_name: 'Navn på hendelse',
  event_type: 'Hendelsestype',
  referrer_domain: 'Forrige domene',
  referrer_path: 'Forrige sidesti',
  referrer_query: 'Forrige URL-parametere',
  utm_source: 'Kampanjekilde',
  device: 'Enhet',
  browser: 'Nettleser',
  os: 'Operativsystem',
  distinct_id: 'Besøkende-ID (cookie)',
  session_id: 'Besøkende-ID (avtrykk)',
  session_parameters: 'Besøksdetaljer',
  event_parameters: 'Hendelsesdetaljer',
  'ep.string_value': 'Tekst (ofte brukt)',
  'sp.data_key': 'Navn på detalj',
  'sp.string_value': 'Verdi (tekst)',
  'sp.number_value': 'Verdi (tall)',
  'sp.date_value': 'Verdi (dato)',
  'sp.data_type': 'Verditype',
  website_event_id: 'Hendelse-ID',
  website_id: 'Nettside-ID',
  domain: 'Domene',
  reset_at: 'Nullstilt',
  created_by: 'Opprettet av',
}

const EVENT_DETAIL_SORT_ORDER: Record<string, string> = {
  'ep.data_key': 'ep.0',
  'ep.string_value': 'ep.1',
  'ep.number_value': 'ep.2',
  'ep.date_value': 'ep.3',
  'ep.data_type': 'ep.4',
}

const FILTER_VALUES: Record<string, string[]> = {
  browser: ['safari', 'chrome', 'firefox', 'edge', 'opera', 'samsung internet'],
  device: ['desktop', 'mobile', 'tablet'],
}

const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'GROUP BY',
  'ORDER BY',
  'LIMIT',
  'LEFT JOIN',
  'INNER JOIN',
  'JOIN',
  'ON',
  'AS',
  'DISTINCT',
  'WITH',
  'HAVING',
  'UNION ALL',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ASC',
  'DESC',
]

export const prepareSqlBlockInsertion = (sqlBeforeCursor: string, code: string) => {
  const currentLine = sqlBeforeCursor.slice(sqlBeforeCursor.lastIndexOf('\n') + 1)
  if (/^\r?\n/.test(code) && !currentLine.trim()) {
    return { text: code.replace(/^\r?\n[\t ]*/, ''), replaceBefore: currentLine.length }
  }
  return { text: code, replaceBefore: 0 }
}

export const getSqlSuggestionFragment = (sqlBeforeCursor: string, kind: SqlSuggestion['kind']): string => {
  const pattern = kind === 'table' ? /`?[\w.-]*$/ : kind === 'value' ? /'[^'\n]*$|[\w-]+(?:[\t ]+[\w-]+)*$/ : /[\w.]*$/
  return sqlBeforeCursor.match(pattern)?.[0] ?? ''
}

const getSelectedExpressions = (sql: string): string[] => {
  const select = /^\s*SELECT\s+(?:DISTINCT\s+)?/i.exec(sql)
  if (!select) return []
  const tokens = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|[^"])*"|`[^`]*`|\bFROM\b|[(),]/gi
  const expressions: string[] = []
  let depth = 0
  let start = select[0].length
  tokens.lastIndex = start
  for (const token of sql.matchAll(tokens)) {
    if (token[0] === '(') depth += 1
    else if (token[0] === ')') depth -= 1
    else if (depth === 0 && (token[0] === ',' || token[0].toUpperCase() === 'FROM')) {
      expressions.push(sql.slice(start, token.index).trim())
      start = token.index + token[0].length
      if (token[0].toUpperCase() === 'FROM') return expressions
    }
  }
  return []
}

export const getSqlSuggestions = (sqlBeforeCursor: string, projectId: string, sqlAfterCursor = ''): SqlSuggestion[] => {
  const tables = getBigQueryTables(projectId)
  const context = sqlBeforeCursor.replace(/\[\[[\s\S]*?\]\]/g, ' ')
  const selectExpression = String.raw`(?:\*|[\w.]+(?:\((?:[^()]|\([^()]*\))*\))?)(?:\s+AS\s+\w+)?`
  const completedSelect = new RegExp(
    String.raw`^\s*SELECT\s+(?:DISTINCT\s+)?${selectExpression}(?:\s*,\s*${selectExpression})*[\t ]*\r?\n[\t ]*$`,
    'i',
  )

  if (completedSelect.test(context) && !/^\s*FROM\b/i.test(sqlAfterCursor)) {
    return [
      {
        label: 'FROM',
        insertText: 'FROM ',
        detail: 'Velg tabell',
        kind: 'keyword',
        preselect: true,
        command: { id: 'editor.action.triggerSuggest', title: 'Velg tabell' },
      },
    ]
  }

  if (/\b(?:FROM|JOIN)\s+[`\w.-]*$/i.test(context)) {
    const code = context.replace(
      /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:''|\\[\s\S]|[^'\\])*(?:'|$)|"(?:""|[^"])*(?:"|$)/g,
      (token) => ' '.repeat(token.length),
    )
    const projection = /^\s*SELECT\s+([\s\S]*?)\bFROM\b/i.exec(code)?.[1]
    const knownFields = new Set(tables.flatMap((table) => table.columns.map((column) => column.name.toLowerCase())))
    const selectedFields =
      projection && !/\bSELECT\b/i.test(projection) && /\bFROM\s+[`\w.-]*$/i.test(code)
        ? [
            ...new Set(
              (
                projection
                  .replace(/\bAS\s+(?:`[^`]+`|[a-z_]\w*)/gi, ' ')
                  .match(/(?:`[^`]+`|[a-z_]\w*)(?:\.(?:`[^`]+`|[a-z_]\w*))*/gi) ?? []
              )
                .map((field) => field.replace(/`/g, '').toLowerCase())
                .map((field) => (knownFields.has(field) ? field : field.split('.').pop()!))
                .filter((field) => knownFields.has(field)),
            ),
          ]
        : []
    const matchingTables = selectedFields.length
      ? tables.filter((table) =>
          selectedFields.every((field) => table.columns.some((column) => column.name.toLowerCase() === field)),
        )
      : []
    const availableTables = matchingTables.length ? matchingTables : tables
    const eventTable = tables.find((table) => table.id === 'event')!
    const hasField = (table: (typeof tables)[number], field: string) =>
      table.columns.some((column) => column.name.toLowerCase() === field)
    const joinTargets =
      !matchingTables.length && selectedFields.length > 1 && !sqlAfterCursor.trim()
        ? tables.filter(
            (table) =>
              table.id !== 'event' &&
              selectedFields.every(
                (field) => Number(hasField(eventTable, field)) + Number(hasField(table, field)) === 1,
              ) &&
              selectedFields.some((field) => hasField(eventTable, field)) &&
              selectedFields.some((field) => hasField(table, field)),
          )
        : []
    const joinOptions = joinTargets.length
      ? getSqlJoinOptions(context.replace(/\bFROM\s+[`\w.-]*$/i, 'FROM '), projectId)
      : []
    const joinSuggestions: SqlSuggestion[] = joinTargets.flatMap((table) => {
      const option = joinOptions.find((candidate) => candidate.id === table.id)
      if (!option?.joinSql || !option.sql || option.alreadyJoined) return []
      return [
        {
          label: `${eventTable.title} + ${table.title}`,
          labelDescription: 'JOIN',
          filterText: `${getFullTableName(projectId, eventTable.datasetTable)} ${getFullTableName(projectId, table.datasetTable)} ${eventTable.title} ${table.title}`,
          insertText: option.joinSql.replace(/^FROM\s+/i, ''),
          detail: option.relation,
          kind: 'table',
          sortText: '0',
          preselect: true,
        },
      ]
    })

    if (joinSuggestions.length === 1) return joinSuggestions

    return availableTables.map<SqlSuggestion>((table) => {
      return {
        label: table.title,
        labelDescription: 'Tabell',
        filterText: `${getFullTableName(projectId, table.datasetTable)} ${table.title}`,
        insertText: getFullTableName(projectId, table.datasetTable),
        detail: table.title,
        documentation: `${getFullTableName(projectId, table.datasetTable)}\n\n${table.summary}`,
        kind: 'table',
        ...(matchingTables.length === 1 ? { preselect: true } : {}),
      }
    })
  }

  const directionPrefix = /\bORDER[\t ]+BY[\t ]+(?:[^\r\n]*,[\t ]*)?(?:\d+|`[^`]+`|[a-z_][\w.]*)[\t ]+([a-z]*)$/i.exec(
    context,
  )
  if (directionPrefix) {
    return [
      { label: 'DESC', labelDescription: 'Størst til minst', documentation: 'Synkende: størst til minst' },
      { label: 'ASC', labelDescription: 'Minst til størst', documentation: 'Stigende: minst til størst' },
    ]
      .filter((direction) => direction.label.startsWith(directionPrefix[1].toUpperCase()))
      .map((direction, index) => ({
        ...direction,
        insertText: direction.label,
        detail: '',
        kind: 'keyword',
        sortText: String(index),
      }))
  }

  const outputClause = /\b(ORDER|GROUP)\s+BY\s+(?:[^\n]*,[\t ]*)?[\w.]*$/i.exec(context)
  if (outputClause) {
    const isGrouping = outputClause[1].toUpperCase() === 'GROUP'
    const expressions = getSelectedExpressions(context)
    if (expressions.length && expressions.every((expression) => expression && !/^(?:[\w`]+\.)?\*$/.test(expression))) {
      return expressions.flatMap((expression, index) => {
        const code = expression.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ')
        if (
          isGrouping &&
          /\b(?:COUNT|COUNTIF|SUM|AVG|MIN|MAX|ANY_VALUE|ARRAY_AGG|ARRAY_CONCAT_AGG|STRING_AGG|APPROX_COUNT_DISTINCT|APPROX_QUANTILES|APPROX_TOP_COUNT|APPROX_TOP_SUM|LOGICAL_AND|LOGICAL_OR|BIT_AND|BIT_OR|BIT_XOR|STDDEV(?:_POP|_SAMP)?|VARIANCE|VAR_POP|VAR_SAMP)\s*\(/i.test(
            code,
          )
        )
          return []
        const alias = /\s+(?:AS\s+)?(`[^`]+`|[a-z_]\w*)$/i.exec(expression)?.[1]
        const name = alias ?? expression
        return {
          label: `${name.replace(/^`|`$/g, '')} (${index + 1})`,
          insertText: `${index + 1} `,
          detail: '',
          documentation: expression,
          kind: 'field',
          sortText: String(index + 1).padStart(4, '0'),
          ...(isGrouping ? {} : { command: { id: 'editor.action.triggerSuggest', title: 'Velg sorteringsretning' } }),
        }
      })
    }
  }

  const valueMatch = context.match(/\b(browser|device)\s*(?:=|!=|<>|LIKE)\s*'?[^'\n]*$/i)
  if (valueMatch) {
    return FILTER_VALUES[valueMatch[1].toLowerCase()].map((value) => ({
      label: value,
      insertText: `'${value}'`,
      detail: valueMatch[1],
      kind: 'value',
    }))
  }

  const operatorMatch =
    /\b(?:WHERE|AND|OR|ON|HAVING)\s+((?:`[^`]+`|[a-z_][\w$]*)(?:\.(?:`[^`]+`|[a-z_][\w$]*))*)([\t ]*)([!<>=]+|[a-z]+(?:[\t ]+[a-z]+)*)?([\t ]*)$/i.exec(
      context,
    )
  if (operatorMatch) {
    const field = operatorMatch[1].replace(/`/g, '').split('.').pop()!.toLowerCase()
    const knownField = tables.some((table) =>
      table.columns.some((column) => column.name.split('.').pop()!.toLowerCase() === field),
    )
    let cursorInNonSql = false
    context.replace(
      /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:''|\\[\s\S]|[^'\\])*(?:'|$)|"(?:""|[^"])*(?:"|$)|`[^`]*(?:`|$)/g,
      (token: string, offset: number) => {
        if (offset + token.length === context.length) {
          cursorInNonSql = /^(?:--|\/\*)/.test(token) || !token.endsWith(token[0])
        }
        return token
      },
    )
    if (knownField && !cursorInNonSql) {
      const prefix = (operatorMatch[3] ?? '').replace(/[\t ]+/g, ' ').toUpperCase()
      const replacement = operatorMatch[3] ? operatorMatch[3].length + operatorMatch[4].length : 0
      return [
        { label: '=', labelDescription: 'Er lik' },
        { label: '!=', labelDescription: 'Er ulik' },
        { label: '>', labelDescription: 'Større enn' },
        { label: '>=', labelDescription: 'Større eller lik', documentation: 'Større enn eller lik' },
        { label: '<', labelDescription: 'Mindre enn' },
        { label: '<=', labelDescription: 'Mindre eller lik', documentation: 'Mindre enn eller lik' },
        {
          label: 'LIKE',
          labelDescription: 'Tekst med jokertegn',
          documentation: 'Tekst med jokertegn: % er null eller flere tegn, _ er ett tegn.',
        },
        {
          label: 'NOT LIKE',
          labelDescription: 'Utelat tekstreff',
          documentation: 'Utelat tekst som passer med jokertegn: % er null eller flere tegn, _ er ett tegn.',
        },
        { label: 'IN', labelDescription: 'En av verdiene' },
        { label: 'NOT IN', labelDescription: 'Ingen av verdiene' },
        {
          label: 'BETWEEN',
          labelDescription: 'Mellom to verdier',
          documentation: 'Mellom to verdier, inkludert begge grensene.',
        },
        { label: 'IS NULL', labelDescription: 'Mangler verdi' },
        { label: 'IS NOT NULL', labelDescription: 'Har verdi' },
      ]
        .filter((operator) => operator.label.startsWith(prefix))
        .map((operator, index) => ({
          ...operator,
          insertText: `${operatorMatch[2] ? '' : ' '}${operator.label} `,
          detail: '',
          kind: 'keyword',
          replaceBefore: replacement,
          sortText: String(index).padStart(2, '0'),
          command: { id: 'editor.action.triggerSuggest', title: 'Velg verdi' },
        }))
    }
  }

  const additionalSelectField = new RegExp(
    String.raw`^\s*SELECT\s+(?:DISTINCT\s+)?${selectExpression}(?:\s*,\s*${selectExpression})*[\t ]+$`,
    'i',
  ).test(context)
  const additionalFieldInsertion = additionalSelectField ? { replaceBefore: context.match(/[\t ]+$/)![0].length } : {}
  const isSelectContext =
    additionalSelectField ||
    (/\bSELECT\s+(?:DISTINCT\s+)?(?:(?:[^'";]|'(?:''|[^'])*')*,\s*)?[\w.]*$/i.test(context) &&
      !/\b(?:FROM|WHERE|GROUP\s+BY|ORDER\s+BY|LIMIT)\b/i.test(context))

  if (!isSelectContext && !/\b(?:WHERE|AND|OR|ON|GROUP\s+BY|ORDER\s+BY)\s+[\w.]*$/i.test(context)) {
    let cursorInNonSql = false
    const keywordContext = context.replace(
      /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:''|\\[\s\S]|[^'\\])*(?:'|$)|"(?:""|[^"])*(?:"|$)|`[^`]*(?:`|$)/g,
      (token: string, offset: number) => {
        if (offset + token.length === context.length) {
          cursorInNonSql = /^(?:--|\/\*)/.test(token) || !token.endsWith(token[0])
        }
        return ' '.repeat(token.length)
      },
    )
    const prefix = keywordContext.match(/(?:^|\s)([a-z]+)$/i)?.[1].toUpperCase()
    const isBlankLine = /^[\t ]*$/.test(context.slice(context.lastIndexOf('\n') + 1))
    if (cursorInNonSql || (!prefix && !isBlankLine)) return []
    return SQL_KEYWORDS.filter((keyword) => !prefix || keyword.startsWith(prefix)).map((keyword) => ({
      label: keyword,
      insertText: keyword,
      detail: 'SQL-ord',
      kind: 'keyword',
    }))
  }

  const referencedTables = tables.filter((table) => context.includes(table.datasetTable))
  const columns = (referencedTables.length ? referencedTables : tables).flatMap((table) => table.columns)
  const uniqueColumns = [...new Map(columns.map((column) => [column.name, column])).values()]
  const isFilterField = /\b(?:WHERE|AND|OR|ON|HAVING)\s+[\w.]*$/i.test(context)
  const fieldSuggestions: SqlSuggestion[] = uniqueColumns.map((column) => ({
    label: column.name,
    labelDescription: FIELD_DESCRIPTIONS[column.name] ?? column.label,
    insertText: additionalSelectField ? `, ${column.name}` : column.name,
    ...additionalFieldInsertion,
    detail: column.label,
    kind: 'field',
    ...(EVENT_DETAIL_SORT_ORDER[column.name] ? { sortText: EVENT_DETAIL_SORT_ORDER[column.name] } : {}),
    ...(isFilterField ? { command: { id: 'editor.action.triggerSuggest', title: 'Velg operator' } } : {}),
  }))

  if (isSelectContext) {
    const commonBlocks = getSqlBuildingBlocks(projectId).filter((block) =>
      ['fld-date', 'fld-visitors', 'fld-visitors-cookie', 'fld-views', 'fld-visits'].includes(block.id),
    )
    const commonSuggestions: SqlSuggestion[] = commonBlocks.map((block, index) => ({
      label: block.label,
      insertText: additionalSelectField ? `, ${block.code}` : block.code,
      ...additionalFieldInsertion,
      detail: '',
      documentation: block.code,
      kind: 'field',
      sortText: String(index + 1).padStart(2, '0'),
    }))

    return [
      ...(!additionalSelectField
        ? [
            {
              label: '* (alle felter)',
              insertText: '*',
              detail: '',
              kind: 'field' as const,
              sortText: '0',
              preselect: true,
            },
          ]
        : []),
      ...commonSuggestions,
      ...fieldSuggestions,
    ]
  }

  return fieldSuggestions
}
