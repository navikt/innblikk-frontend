import { Parser } from 'node-sql-parser/build/bigquery'
import { format } from 'sql-formatter'
import { restorePlaceholders, sanitizePlaceholders } from '../../sql/utils/sqlProcessing'

type SqlNode = Record<string, unknown>
const isNode = (value: unknown): value is SqlNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getColumn = (value: unknown): string | null => {
  if (!isNode(value) || value.type !== 'column_ref' || value.collate) return null
  if (typeof value.column === 'string') {
    return `${typeof value.table === 'string' ? `${value.table}.` : ''}${value.column}`.toLowerCase()
  }
  if (!isNode(value.column) || !isNode(value.column.expr)) return null
  const offsets = Array.isArray(value.column.offset) ? value.column.offset : []
  if (!offsets.length && typeof value.column.expr.value === 'string') return value.column.expr.value.toLowerCase()
  if (offsets.length === 1 && isNode(offsets[0]) && typeof offsets[0].value === 'string') {
    return `${String(value.column.expr.value)}.${offsets[0].value}`.toLowerCase()
  }
  return null
}

export const getGroupBySimplification = (query: string): { sql: string; fields: string[] } | null => {
  const code = query.replace(/'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|[^"])*"|`[^`]*`/g, ' ')
  if (/--|\/\*|#/.test(code)) return null
  try {
    const parser = new Parser()
    const { sanitized, placeholders } = sanitizePlaceholders(query, 'parse')
    const parsed = parser.astify(sanitized)
    if (Array.isArray(parsed) && parsed.length !== 1) return null
    const ast: unknown = Array.isArray(parsed) ? parsed[0] : parsed
    if (!isNode(ast) || ast.type !== 'select' || ast.with || ast._next) return null
    if (!isNode(ast.groupby) || Object.keys(ast.groupby).some((key) => key !== 'columns')) return null
    if (!Array.isArray(ast.groupby.columns) || !ast.groupby.columns.every((column) => getColumn(column))) return null
    if (
      !Array.isArray(ast.columns) ||
      ast.columns.some((column) => isNode(column) && getColumn(column.expr)?.endsWith('*'))
    )
      return null

    let nestedSelect = false
    const usedFields = new Set<string>()
    const visit = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(visit)
      else if (isNode(value)) {
        if (value.type === 'select') nestedSelect = true
        const column = getColumn(value)
        if (column) usedFields.add(column.split('.').pop()!)
        Object.values(value).forEach(visit)
      }
    }
    visit([ast.columns, ast.having, ast.orderby, ast.qualify, ast.window, ast.from])
    if (nestedSelect) return null

    const fixedFields = new Set<string>()
    const collectFixedFields = (value: unknown) => {
      if (!isNode(value) || value.type !== 'binary_expr') return
      if (value.operator === 'AND') {
        collectFixedFields(value.left)
        collectFixedFields(value.right)
      } else if (value.operator === '=') {
        for (const [field, literal] of [
          [value.left, value.right],
          [value.right, value.left],
        ]) {
          const column = getColumn(field)
          if (
            column &&
            isNode(literal) &&
            ['single_quote_string', 'double_quote_string', 'string', 'number', 'bool'].includes(String(literal.type)) &&
            !String(literal.value).includes('__METABASE_')
          ) {
            fixedFields.add(column)
          }
        }
      }
    }
    collectFixedFields(ast.where)
    const fields: string[] = []
    const remaining = ast.groupby.columns.filter((column) => {
      const field = getColumn(column)!
      if (!fixedFields.has(field) || usedFields.has(field.split('.').pop()!)) return true
      fields.push(field)
      return false
    })
    if (!fields.length || !remaining.length) return null
    ast.groupby.columns = remaining
    const sql = format(parser.sqlify(ast as unknown as Parameters<Parser['sqlify']>[0]), { language: 'bigquery' })
    return { sql: restorePlaceholders(sql, placeholders), fields }
  } catch {
    return null
  }
}
