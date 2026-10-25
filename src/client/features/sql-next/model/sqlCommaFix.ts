import { Parser } from 'node-sql-parser/build/bigquery'
import { sanitizePlaceholders } from '../../sql/utils/sqlProcessing'

const keywords =
  /^(?:select|distinct|all|as|from|where|and|or|not|in|is|like|between|case|when|then|else|end|over|partition|by|order|group|having|qualify|limit|offset|union|except|intersect|join|on|with)$/i
const expression =
  /^(?:[a-z_][\w$]*(?:\.[a-z_][\w$]*)*|\d+(?:\.\d+)?|`[^`]+`|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*")$/i

export const getSqlCommaFix = (query: string): string | null => {
  const parser = new Parser()
  const parses = (sql: string) => {
    try {
      const { sanitized } = sanitizePlaceholders(sql, 'parse')
      const ast = parser.astify(sanitized)
      return !Array.isArray(ast) || ast.length === 1
    } catch {
      return false
    }
  }
  if (parses(query)) return null

  const tokens = [
    ...query.matchAll(
      /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`[^`]*`|[a-z_][\w$]*(?:\.[a-z_][\w$]*)*|\d+(?:\.\d+)?|[^\s]/gi,
    ),
  ].filter((token) => !/^(?:--|#|\/\*)/.test(token[0]))
  let depth = 0
  const selectDepths = new Set<number>()
  let fix: string | null = null
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index][0]
    if (token === '(') depth += 1
    if (token === ')') {
      selectDepths.delete(depth)
      depth -= 1
    }
    if (/^select$/i.test(token)) selectDepths.add(depth)
    if (/^(?:from|union|except|intersect)$/i.test(token)) selectDepths.delete(depth)
    if (!selectDepths.has(depth) || index === 0) continue
    const previous = tokens[index - 1]
    if (keywords.test(token) || keywords.test(previous[0])) continue
    if (!expression.test(token) || !(expression.test(previous[0]) || previous[0] === ')')) continue
    const position = previous.index + previous[0].length
    const candidate = `${query.slice(0, position)},${query.slice(position)}`
    if (!parses(candidate)) continue
    if (fix) return null
    fix = candidate
  }
  return fix
}
