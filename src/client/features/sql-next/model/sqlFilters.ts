import { format } from 'sql-formatter'
import { restorePlaceholders, sanitizePlaceholders } from '../../sql/utils/sqlProcessing'
import { applyAutomaticFilters } from './automaticFilters'
import { addTemporaryField, getSqlCode, removeTemporaryField } from './sqlCode'

const NOT_AN_ALIAS =
  /^(?:LEFT|RIGHT|INNER|FULL|CROSS|JOIN|WHERE|GROUP|ORDER|LIMIT|HAVING|QUALIFY|WINDOW|ON|USING|UNION)$/i
const FILTERABLE_TABLE = /(?:^|\.)(?:umami_views\.(?:event|session|event_data)|umami\.public_website)$/i
const PERIOD_BLOCK = '[[AND {{created_at}}]]'

export interface FilterTarget {
  label: string
  reference: string
}

export interface FilterChoice {
  website: boolean
  period: boolean
  reference?: string | null
}

export interface FilterEdit {
  snippet: string
  sql: string | null
}

export const hasSqlFilters = (query: string) => {
  const code = getSqlCode(query)
  return {
    website: /\{\{\s*website_id\s*\}\}/i.test(query) || /\bwebsite_id\s*(?:=|IN\b)/i.test(code),
    period: /\{\{\s*created_at\s*\}\}/i.test(query) || /\bcreated_at\b/i.test(code),
  }
}

const getWhere = (query: string) => {
  const code = getSqlCode(query)
  const following = /\b(?:GROUP\s+BY|HAVING|QUALIFY|WINDOW|ORDER\s+BY|LIMIT)\b/i.exec(code)
  const end = code.trimEnd()
  const offset = following?.index ?? (end.endsWith(';') ? end.length - 1 : query.length)
  return { code, offset, where: /\bWHERE\b/i.exec(code.slice(0, offset)) }
}

// The period block must follow an existing condition, so without a WHERE the website filter has to come with it.
export const periodNeedsWebsite = (query: string) => !getWhere(query).where

export const getFilterTargets = (query: string): FilterTarget[] => {
  const targets: FilterTarget[] = []
  for (const match of getSqlCode(query).matchAll(/\b(?:FROM|JOIN)\s+(\S+)(?=(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?)/gi)) {
    const start = match.index + /^\w+\s+/.exec(match[0])![0].length
    const table = query
      .slice(start, start + match[1].length)
      .replace(/[,;)]+$/, '')
      .replace(/`/g, '')
    if (!FILTERABLE_TABLE.test(table)) continue
    const alias = match[2] && !NOT_AN_ALIAS.test(match[2]) ? match[2] : null
    const name = table.split('.').pop()!
    targets.push({ label: alias ?? name, reference: alias ?? `\`${table}\`` })
  }
  return targets
}

export const getFilterEdit = (query: string, projectId: string, choice: FilterChoice): FilterEdit => {
  if (!choice.website && !choice.period) return { snippet: '', sql: null }
  const withWebsite = choice.website || (choice.period && periodNeedsWebsite(query))
  const eventTable = `\`${projectId}.umami_views.event\``
  const website = `${choice.reference ? `${choice.reference}.` : ''}website_id = '{{website_id}}'`
  const newWhere = `WHERE ${website}${choice.period ? `\n  ${PERIOD_BLOCK}` : ''}`

  if (!query.trim() || /^\s*SELECT\s*$/i.test(query)) {
    const snippet = `FROM ${eventTable}\n${newWhere}`
    return { snippet, sql: `SELECT\n${snippet}` }
  }

  const { code, offset, where } = getWhere(query)
  const from = /\bFROM\s+(\S+)/i.exec(code)
  const addition = where
    ? [...(withWebsite ? [`AND ${website}`] : []), ...(choice.period ? [PERIOD_BLOCK] : [])].join('\n  ')
    : newWhere
  const snippet = `${from ? '' : `FROM ${eventTable}\n`}${addition}`

  const isSimpleSelect = /^\s*SELECT\b/i.test(code) && !/\b(?:WITH|UNION|INTERSECT|EXCEPT)\b|\(\s*SELECT\b/i.test(code)
  if (!isSimpleSelect || (from && getFilterTargets(query).length === 0)) return { snippet, sql: null }

  const head = `${query.slice(0, where?.index ?? offset).trimEnd()}${from ? '' : `\nFROM ${eventTable}`}`
  const after = query.slice(offset)
  const tail = after.trim() ? (after.startsWith(';') ? after : `\n${after.trimStart()}`) : ''
  let middle = newWhere
  if (where) {
    const restStart = where.index + where[0].length
    const rest = query.slice(restStart, offset).trim()
    if (/^\[\[/.test(rest)) middle = `WHERE ${website}\n  ${rest}`
    else if (rest) {
      const wrapped = /\bOR\b/i.test(code.slice(restStart, offset)) ? `(${rest})` : rest
      middle = `WHERE ${wrapped}\n  ${addition}`
    }
  }
  return { snippet, sql: `${head}\n${middle}${tail}` }
}

// Used by the group picker, which already rewrites the whole query; comments and layout are not kept.
export const addFiltersWithParser = async (sql: string): Promise<string> => {
  const filtered = await applyAutomaticFilters(
    addTemporaryField(sql),
    { websiteIdState: '{{website_id}}', websiteIds: ['{{website_id}}'], dateRange: {} } as Parameters<
      typeof applyAutomaticFilters
    >[1],
    undefined,
    'template',
  )
  if (filtered === addTemporaryField(sql)) return sql
  const { sanitized, placeholders } = sanitizePlaceholders(filtered)
  return removeTemporaryField(restorePlaceholders(format(sanitized, { language: 'bigquery' }), placeholders))
}
