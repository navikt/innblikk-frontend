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
  const positions: number[] = []
  let projectionEnd: number | null = null
  let canCheckProjection = /^select$/i.test(tokens[0]?.[0] ?? '')
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index][0]
    if (token === '(') depth += 1
    if (token === ')') {
      selectDepths.delete(depth)
      depth -= 1
    }
    if (depth === 0) {
      if (token === ';' && index < tokens.length - 1) return null
      if (/^(?:union|except|intersect)$/i.test(token) || (/^select$/i.test(token) && index !== 0))
        canCheckProjection = false
      const source = tokens[index + 1]?.[0] ?? ''
      if (
        projectionEnd === null &&
        /^from$/i.test(token) &&
        /^[a-z_`]/i.test(source) &&
        expression.test(source) &&
        !keywords.test(source)
      )
        projectionEnd = tokens[index].index
    }
    if (/^select$/i.test(token)) selectDepths.add(depth)
    if (/^(?:from|union|except|intersect)$/i.test(token)) selectDepths.delete(depth)
    if (!selectDepths.has(depth) || index === 0) continue
    const previous = tokens[index - 1]
    if (keywords.test(token) || keywords.test(previous[0])) continue
    if (!expression.test(token) || !(expression.test(previous[0]) || previous[0] === ')')) continue
    positions.push(previous.index + previous[0].length)
  }
  const projectionNeedsComma = canCheckProjection && projectionEnd !== null && !parses(query.slice(0, projectionEnd))
  let fix: string | null = null
  for (const position of positions) {
    const candidate = `${query.slice(0, position)},${query.slice(position)}`
    if (
      !parses(candidate) &&
      !(
        projectionNeedsComma &&
        projectionEnd !== null &&
        position < projectionEnd &&
        parses(candidate.slice(0, projectionEnd + 1))
      )
    )
      continue
    if (fix) return null
    fix = candidate
  }
  return fix
}
