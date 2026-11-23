import type { Website } from '../../../shared/types/website'
import type { TransferChart } from './chartTransfer'

type WebsiteReference = { start: number; end: number; id?: string }

const websiteReferences = (sql: string): WebsiteReference[] => {
  const tokens = [
    ...sql.matchAll(
      /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'''(?:\\[\s\S]|(?!''')[\s\S])*'''|"""(?:\\[\s\S]|(?!""")[\s\S])*"""|'(?:\\[\s\S]|''|[^'\\])*'|"(?:\\[\s\S]|""|[^"\\])*"|`[^`]*`|\{\{[^}]+\}\}|[a-z_][\w$]*|[^\s]/gi,
    ),
  ].filter((token) => !/^(?:--|#|\/\*)/.test(token[0]))
  const references = new Map<number, WebsiteReference>()
  const add = (token: RegExpMatchArray | undefined) => {
    if (!token || token.index === undefined) return
    const placeholder = /^(['"])?\s*\{\{\s*website_id\s*\}\}\s*\1?$/i.test(token[0])
    const literal = /^(["'])([\s\S]*)\1$/.exec(token[0])
    const id = placeholder
      ? undefined
      : literal?.[2]
          .replace(/''/g, "'")
          .replace(/""/g, '"')
          .replace(/\\(['"\\])/g, '$1')
    if (id !== undefined || placeholder)
      references.set(token.index, { start: token.index, end: token.index + token[0].length, id })
  }
  tokens.forEach((token, index) => {
    if (/^(['"])?\s*\{\{\s*website_id\s*\}\}\s*\1?$/i.test(token[0])) add(token)
    if (token[0].replace(/`/g, '').split('.').pop()?.toLowerCase() !== 'website_id') return
    if (tokens[index + 1]?.[0] === '=') add(tokens[index + 2])
    let columnStart = index
    while (columnStart >= 2 && tokens[columnStart - 1]?.[0] === '.') columnStart -= 2
    if (tokens[columnStart - 1]?.[0] === '=') add(tokens[columnStart - 2])
    if (/^IN$/i.test(tokens[index + 1]?.[0] ?? '') && tokens[index + 2]?.[0] === '(') {
      for (let cursor = index + 3; cursor < tokens.length; cursor += 2) {
        add(tokens[cursor])
        if (tokens[cursor + 1]?.[0] !== ',') break
      }
    }
  })
  return [...references.values()]
}

const PLACEHOLDER_WEBSITE = '{{website_id}}'

export const getChartWebsiteIds = (chart: TransferChart): string[] => [
  ...new Set(
    chart.queries.flatMap((query) =>
      websiteReferences(query.sql).map((reference) => reference.id ?? chart.websiteId ?? PLACEHOLDER_WEBSITE),
    ),
  ),
]

export const getMissingWebsiteIds = (chart: TransferChart, websites: Website[]): string[] => {
  const ids = new Set(websites.map((website) => website.id))
  return getChartWebsiteIds(chart).filter((id) => !ids.has(id))
}

export const prepareChartWebsites = (
  chart: TransferChart,
  websites: Website[],
  replacements: Record<string, string>,
): TransferChart => {
  const ids = new Set(websites.map((website) => website.id))
  if (getMissingWebsiteIds(chart, websites).some((id) => !ids.has(replacements[id]))) {
    throw new Error('Velg et gyldig nettsted for hvert nettsted som mangler.')
  }
  return {
    ...chart,
    queries: chart.queries.map((query) => {
      let sql = query.sql
      for (const reference of websiteReferences(sql).sort((a, b) => b.start - a.start)) {
        const sourceId = reference.id ?? chart.websiteId ?? PLACEHOLDER_WEBSITE
        if (reference.id && ids.has(reference.id)) continue
        const targetId = ids.has(sourceId) ? sourceId : replacements[sourceId]
        sql = `${sql.slice(0, reference.start)}'${targetId.replace(/'/g, "''")}'${sql.slice(reference.end)}`
      }
      return { ...query, sql }
    }),
  }
}
