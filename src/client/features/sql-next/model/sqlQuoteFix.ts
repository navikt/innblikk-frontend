import { Parser } from 'node-sql-parser/build/bigquery'
import { getBigQueryTables } from './schemaAndSnippets'

const columnNames = new Set(
  getBigQueryTables('').flatMap((table) => table.columns.map((column) => column.name.split('.').pop()!.toLowerCase())),
)
const reservedValues =
  /^(?:true|false|null|unknown|default|current_date|current_time|current_timestamp|current_user|session_user|interval|case|not|exists|select|all|any|some)$/i
const boundary = /^(?:and|or|group|order|having|qualify|limit|offset|union|except|intersect|when|then|else|end|\)|;)$/i

export const getSqlQuoteFix = (query: string): { sql: string; values: string[] } | null => {
  const tokens = [
    ...query.matchAll(
      /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`[^`]*`|\/[a-z0-9_~%.-]+(?:\/[a-z0-9_~%.-]*)*|[a-z_][\w$]*(?:[.-][\w$]+)*|!=|<>|<=|>=|[^\s]/gi,
    ),
  ].filter((token) => !/^(?:--|#|\/\*)/.test(token[0]))
  const replacements: Array<{ start: number; end: number; value: string }> = []
  for (let index = 1; index < tokens.length - 1; index += 1) {
    const operator = tokens[index][0]
    if (!/^(?:=|!=|<>|<|>|<=|>=|like)$/i.test(operator)) continue
    const field = tokens[index - 1][0].replace(/`/g, '').split('.').pop()!.toLowerCase()
    if (!columnNames.has(field)) continue
    const value = tokens[index + 1][0]
    if (!/^(?:[a-z_][\w-]*|\/[a-z0-9_~%./-]+)$/i.test(value)) continue
    if (
      !value.startsWith('/') &&
      value.includes('-') &&
      !(field === 'language' && /^[a-z]{2,3}-[a-z]{2}$/i.test(value))
    )
      continue
    if (reservedValues.test(value) || columnNames.has(value.toLowerCase())) continue
    const next = tokens[index + 2]?.[0]
    if (next && !boundary.test(next)) continue
    const start = tokens[index + 1].index
    replacements.push({ start, end: start + value.length, value })
  }
  if (!replacements.length) return null
  let sql = query
  for (const { start, end, value } of [...replacements].reverse()) {
    sql = `${sql.slice(0, start)}'${value}'${sql.slice(end)}`
  }
  try {
    const ast = new Parser().astify(sql)
    if (Array.isArray(ast) && ast.length !== 1) return null
    return { sql, values: replacements.map((replacement) => replacement.value) }
  } catch {
    return null
  }
}
