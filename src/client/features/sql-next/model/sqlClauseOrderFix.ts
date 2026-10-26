import { Parser } from 'node-sql-parser/build/bigquery'
import { sanitizePlaceholders } from '../../sql/utils/sqlProcessing'

export const getSqlClauseOrderFix = (query: string): string | null => {
  const code = query.replace(
    /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`[^`]*`/g,
    (token) => ' '.repeat(token.length),
  )
  if (!/^\s*SELECT\b/i.test(code)) return null
  const clauses: Array<{ name: string; start: number }> = []
  let depth = 0
  for (const token of code.matchAll(
    /\b(?:SELECT|GROUP\s+BY|WHERE|HAVING|QUALIFY|WINDOW|ORDER\s+BY|LIMIT|OFFSET|UNION|EXCEPT|INTERSECT)\b|[();]/gi,
  )) {
    if (token[0] === '(') depth += 1
    if (token[0] === ')') depth -= 1
    if (depth < 0) return null
    if (depth !== 0) continue
    const name = token[0].replace(/\s+/g, ' ').toUpperCase()
    if (/^(?:UNION|EXCEPT|INTERSECT)$/.test(name)) return null
    if (name === ';' && code.slice(token.index + 1).trim()) return null
    if (name !== '(' && name !== ')') clauses.push({ name, start: token.index })
  }
  if (depth !== 0 || clauses.filter((clause) => clause.name === 'SELECT').length !== 1) return null
  const groups = clauses.filter((clause) => clause.name === 'GROUP BY')
  const filters = clauses.filter((clause) => clause.name === 'WHERE')
  if (groups.length !== 1 || filters.length !== 1 || filters[0].start < groups[0].start) return null
  const groupStart = groups[0].start
  const whereStart = filters[0].start
  const whereEnd = clauses.find((clause) => clause.start > whereStart)?.start ?? query.length
  const before = query.slice(0, groupStart).trimEnd()
  const where = query.slice(whereStart, whereEnd).trimEnd()
  const grouping = query.slice(groupStart, whereStart).trimEnd()
  const after = query.slice(whereEnd)
  const candidate = `${before}\n${where}\n${grouping}${after ? `\n${after}` : ''}`
  try {
    const parser = new Parser()
    const { sanitized } = sanitizePlaceholders(candidate, 'parse')
    const ast = parser.astify(sanitized)
    if (Array.isArray(ast) && ast.length !== 1) return null
    return candidate
  } catch {
    return null
  }
}
