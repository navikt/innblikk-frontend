import { Parser } from 'node-sql-parser/build/bigquery'
import { format } from 'sql-formatter'
import { getBigQueryTables, getFullTableName } from './schemaAndSnippets'
import type { BigQueryTableDoc } from './types'

type SqlNode = Record<string, unknown>

export interface SqlJoinOption {
  id: BigQueryTableDoc['id']
  label: string
  alreadyJoined: boolean
  relation: string
  joinSql: string | null
  sql: string | null
}

const JOIN_KEYS = {
  session: { eventField: 'session_id', otherField: 'session_id' },
  event_data: { eventField: 'event_id', otherField: 'website_event_id' },
  website: { eventField: 'website_id', otherField: 'website_id' },
} as const

export interface SqlJoinSuggestion {
  field: string
  sourceTitle: string
  tableTitle: string
  sql: string
  joinSql: string
  warning: string | null
}

export const getSqlJoinSuggestion = (query: string, error: string, projectId: string): SqlJoinSuggestion | null => {
  const missingName = /\bUnrecognized name:\s*`?([a-z_]\w*)`?(?=\s|[;,]|$)/i.exec(error)?.[1]
  if (!missingName) return null
  let field = missingName
  try {
    const parsed = new Parser().astify(query)
    if (Array.isArray(parsed) && parsed.length !== 1) return null
    const ast: unknown = Array.isArray(parsed) ? parsed[0] : parsed
    if (!isNode(ast) || ast.type !== 'select' || ast.with || ast._next || !Array.isArray(ast.from)) return null
    const tables = getBigQueryTables(projectId)
    const sources = ast.from.filter(isNode)
    const source = tables.find((table) => sources[0]?.table === `${projectId}.${table.datasetTable}`)
    if (!source) return null
    if (field.toLowerCase() === 'ep') {
      if (sources.some((entry) => typeof entry.as === 'string' && entry.as.toLowerCase() === 'ep')) return null
      const details = tables.find((table) => table.id === 'event_data')!
      const findDetailField = (value: unknown): string | null => {
        if (Array.isArray(value)) {
          for (const child of value) {
            const found = findDetailField(child)
            if (found) return found
          }
        } else if (isNode(value)) {
          if (value.type === 'select' && value !== ast) return null
          if (value.type === 'column_ref') {
            let reference: string | null = null
            if (typeof value.table === 'string' && typeof value.column === 'string')
              reference = `${value.table}.${value.column}`
            else if (isNode(value.column) && isNode(value.column.expr) && Array.isArray(value.column.offset)) {
              const offset = value.column.offset[0]
              if (isNode(offset) && typeof offset.value === 'string')
                reference = `${String(value.column.expr.value)}.${offset.value}`
            }
            const column = details.columns.find(
              (candidate) =>
                candidate.name.toLowerCase() === reference?.toLowerCase() && candidate.name.startsWith('ep.'),
            )
            if (column) return column.name
          }
          return findDetailField(Object.values(value))
        }
        return null
      }
      const detailField = findDetailField(ast)
      if (!detailField) return null
      field = detailField
    }
    const hasField = (table: BigQueryTableDoc) =>
      table.columns.some((column) => column.name.toLowerCase() === field.toLowerCase())
    const present = tables.filter((table) =>
      sources.some((entry) => entry.table === `${projectId}.${table.datasetTable}`),
    )
    if (present.some(hasField)) return null
    const targets = tables.filter(hasField)
    if (targets.length !== 1) return null
    const target = targets[0]
    const option = getSqlJoinOptions(query, projectId, source.id).find((join) => join.id === target.id)
    if (!option?.sql || !option.joinSql) return null
    return {
      field,
      sourceTitle: source.id === 'event' ? 'Hendelser' : source.title,
      tableTitle: target.id === 'event' ? 'Hendelser' : target.title,
      sql: option.sql,
      joinSql: option.joinSql,
      warning:
        source.id !== 'event' || target.id === 'event_data'
          ? 'Koblingen kan gi flere rader. Vær oppmerksom på dette når du teller rader.'
          : null,
    }
  } catch {
    return null
  }
}

const isNode = (value: unknown): value is SqlNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const qualifyColumns = (value: unknown, columns: Set<string>, reference: string) => {
  if (Array.isArray(value)) value.forEach((child) => qualifyColumns(child, columns, reference))
  else if (isNode(value)) {
    if (value.type === 'select') return
    if (value.type === 'column_ref' && !value.table) {
      const column =
        typeof value.column === 'string'
          ? value.column
          : isNode(value.column) &&
              isNode(value.column.expr) &&
              (!Array.isArray(value.column.offset) || value.column.offset.length === 0)
            ? value.column.expr.value
            : null
      if (typeof column === 'string' && columns.has(column.toLowerCase())) {
        value.table = reference
        value.column = column
      }
    }
    Object.values(value).forEach((child) => qualifyColumns(child, columns, reference))
  }
}

export const replaceSqlJoinSource = (query: string, sourceSql: string): string | null => {
  const code = query.replace(
    /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:''|\\[\s\S]|[^'\\])*(?:'|$)|"(?:""|[^"])*(?:"|$)|`[^`]*(?:`|$)/g,
    (token) => ' '.repeat(token.length),
  )
  if (!/^\s*SELECT\b/i.test(code)) return null
  let depth = 0
  let fromIndex: number | null = null
  let tailIndex: number | null = null
  let endIndex = query.trimEnd().length
  let selectCount = 0
  for (const token of code.matchAll(/\[\[[\s\S]*?\]\]|\b[a-z_]\w*\b|[();]/gi)) {
    const word = token[0].toUpperCase()
    if (word === '(') depth += 1
    else if (word === ')') depth -= 1
    if (depth < 0) return null
    if (depth !== 0) continue
    if (word === 'SELECT') selectCount += 1
    if (selectCount > 1 || /^(?:UNION|EXCEPT|INTERSECT)$/.test(word)) return null
    if (word === ';') {
      if (code.slice(token.index + 1).trim()) return null
      endIndex = token.index
    }
    if (word === 'FROM' && fromIndex === null && tailIndex === null) fromIndex = token.index
    if (
      (/^(?:WHERE|GROUP|HAVING|QUALIFY|WINDOW|ORDER|LIMIT|OFFSET)$/.test(word) ||
        /^\[\[\s*(?:WHERE|AND|OR)\b/.test(word)) &&
      tailIndex === null
    )
      tailIndex = token.index
  }
  if (depth !== 0 || selectCount !== 1) return null
  const start = fromIndex ?? tailIndex ?? endIndex
  const end = tailIndex ?? endIndex
  const before = query.slice(0, start).trimEnd()
  const after = query.slice(end)
  return `${before}\n${sourceSql.trim()}${after ? `\n${after}` : ''}`
}

export const getSqlJoinOptions = (
  query: string,
  projectId: string,
  sourceId: BigQueryTableDoc['id'] = 'event',
  onlyMatches = false,
): SqlJoinOption[] => {
  const tables = getBigQueryTables(projectId)
  const sourceTable = tables.find((table) => table.id === sourceId)!
  const joinType = onlyMatches ? 'INNER JOIN' : 'LEFT JOIN'
  const options = tables
    .filter((table) => (sourceId === 'event' ? table.joinSnippet : table.id === 'event'))
    .map((table) => {
      const otherId = sourceId === 'event' ? (table.id as keyof typeof JOIN_KEYS) : sourceId
      const keys = JOIN_KEYS[otherId]
      const sourceField = sourceId === 'event' ? keys.eventField : keys.otherField
      const targetField = sourceId === 'event' ? keys.otherField : keys.eventField
      return {
        id: table.id,
        label: `${joinType} ${table.title}`,
        alreadyJoined: false,
        relation: `${sourceTable.datasetTable.split('.').pop()}.${sourceField} = ${table.datasetTable.split('.').pop()}.${targetField}`,
        joinSql: null as string | null,
        sql: null as string | null,
      }
    })
  try {
    const code = query.replace(/'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|[^"])*"|`[^`]*`/g, ' ')
    if (/--|\/\*|#/.test(code)) return options
    const optionalBlocks: Array<{ token: string; text: string; conjunction: string }> = []
    const variables = new Map<string, string>()
    const sanitized = query
      .replace(/\[\[[\s\S]*?\]\]/g, (text) => {
        const token = `__JOIN_OPTIONAL_${optionalBlocks.length}__`
        const conjunction = /^\[\[\s*(AND|OR)\b/i.exec(text)?.[1] ?? ''
        optionalBlocks.push({ token, text, conjunction })
        return `${conjunction} ${token}`
      })
      .replace(/'\{\{[^}]+\}\}'|"\{\{[^}]+\}\}"|\{\{[^}]+\}\}/g, (text) => {
        const token = `__JOIN_VARIABLE_${variables.size}__`
        variables.set(token, text)
        return `'${token}'`
      })
    const parser = new Parser()
    const unfinishedFrom = /\bFROM\s*;?\s*$/i.test(code)
    const parsed = parser.astify(unfinishedFrom ? sanitized.replace(/\bFROM(?=\s*;?\s*$)/i, '') : sanitized)
    if (Array.isArray(parsed) && parsed.length !== 1) return options
    const ast: unknown = Array.isArray(parsed) ? parsed[0] : parsed
    if (!isNode(ast) || ast.type !== 'select' || ast.with || ast._next) return options
    const needsFrom = ast.from == null
    if (needsFrom) {
      const parsedSource = parser.astify(`SELECT * FROM ${getFullTableName(projectId, sourceTable.datasetTable)}`)
      const sourceAst: unknown = Array.isArray(parsedSource) ? parsedSource[0] : parsedSource
      if (!isNode(sourceAst) || !Array.isArray(sourceAst.from)) return options
      ast.from = sourceAst.from
    }
    if (!Array.isArray(ast.from)) return options
    const sources = ast.from.filter(isNode)
    const base = sources[0]
    if (base?.table !== `${projectId}.${sourceTable.datasetTable}`) return options
    const sourceReference = typeof base.as === 'string' ? base.as : sourceTable.datasetTable.split('.').pop()!

    return options.map((option) => {
      const target = tables.find((table) => table.id === option.id)!
      if (sources.some((source) => source.table === `${projectId}.${target.datasetTable}`))
        return { ...option, alreadyJoined: true }
      const targetReference = target.datasetTable.split('.').pop()!
      const keys = JOIN_KEYS[(sourceId === 'event' ? target.id : sourceId) as keyof typeof JOIN_KEYS]
      const sourceField = sourceId === 'event' ? keys.eventField : keys.otherField
      const targetField = sourceId === 'event' ? keys.otherField : keys.eventField
      let snippet = `${joinType} ${getFullTableName(projectId, target.datasetTable)} ON \`${sourceReference}\`.${sourceField} = \`${targetReference}\`.${targetField}`
      if (target.id === 'event_data') {
        snippet += onlyMatches
          ? `\nCROSS JOIN UNNEST(\`${targetReference}\`.event_parameters) AS ep`
          : `\nLEFT JOIN UNNEST(\`${targetReference}\`.event_parameters) AS ep ON TRUE`
      }
      const joined = parser.astify(`SELECT * FROM ${getFullTableName(projectId, sourceTable.datasetTable)} ${snippet}`)
      const joinAst: unknown = Array.isArray(joined) ? joined[0] : joined
      if (!isNode(joinAst) || !Array.isArray(joinAst.from)) return option
      const next = structuredClone(ast)
      for (const source of sources) {
        const table = tables.find((candidate) => source.table === `${projectId}.${candidate.datasetTable}`)
        if (!table || typeof source.table !== 'string') continue
        const uniqueColumns = new Set(
          table.columns
            .map((column) => column.name.toLowerCase())
            .filter(
              (name) =>
                !name.includes('.') &&
                sources.filter((other) => {
                  const otherTable = tables.find(
                    (candidate) => other.table === `${projectId}.${candidate.datasetTable}`,
                  )
                  return otherTable?.columns.some((column) => column.name.toLowerCase() === name)
                }).length === 1,
            ),
        )
        for (const [key, value] of Object.entries(next)) {
          if (key !== 'from')
            qualifyColumns(
              value,
              uniqueColumns,
              typeof source.as === 'string' ? source.as : source.table.split('.').pop()!,
            )
        }
      }
      next.from = [...sources, ...joinAst.from.slice(1)]
      let sql = format(parser.sqlify(next as unknown as Parameters<Parser['sqlify']>[0]), { language: 'bigquery' })
      for (const [token, text] of variables) sql = sql.split(`'${token}'`).join(text)
      for (const { token, text, conjunction } of optionalBlocks) {
        sql = sql.replace(new RegExp(`${conjunction ? `\\b${conjunction}\\s+` : ''}\u0060?${token}\u0060?`, 'i'), text)
      }
      const addedSql = needsFrom ? `FROM ${getFullTableName(projectId, sourceTable.datasetTable)}\n${snippet}` : snippet
      return { ...option, sql, joinSql: format(addedSql, { language: 'bigquery' }) }
    })
  } catch {
    return options
  }
}
