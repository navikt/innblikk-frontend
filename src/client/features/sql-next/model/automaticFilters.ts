import { format, subDays } from 'date-fns'
import type { applyUrlFiltersToSql } from '../../sql/utils/sqlProcessing'

type FilterContext = Parameters<typeof applyUrlFiltersToSql>[1]
type SqlNode = Record<string, unknown>

export interface AutomaticFilterUsage {
  table: string
  website: 'automatic' | 'sql' | null
  period: 'automatic' | 'sql' | null
}

const isNode = (value: unknown): value is SqlNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const visit = (value: unknown, action: (node: SqlNode) => void) => {
  if (Array.isArray(value)) value.forEach((item) => visit(item, action))
  else if (isNode(value)) {
    Object.values(value).forEach((child) => visit(child, action))
    action(value)
  }
}

const getColumn = (node: SqlNode): { name: string; table: string | null } | null => {
  if (node.type !== 'column_ref') return null
  if (typeof node.column === 'string')
    return { name: node.column, table: typeof node.table === 'string' ? node.table : null }
  if (!isNode(node.column) || !isNode(node.column.expr)) return null
  const offsets = Array.isArray(node.column.offset) ? node.column.offset : []
  const first = offsets[0]
  if (isNode(first) && typeof first.value === 'string') {
    return { name: first.value, table: String(node.column.expr.value) }
  }
  return typeof node.column.expr.value === 'string' ? { name: node.column.expr.value, table: null } : null
}

const hasFilter = (predicates: unknown[], field: string, references: string[], unqualified: boolean) => {
  let found = false
  predicates.forEach((predicate) =>
    visit(predicate, (node) => {
      const column = getColumn(node)
      if (
        column?.name.toLowerCase() === field &&
        (column.table ? references.includes(column.table.toLowerCase()) : unqualified)
      )
        found = true
    }),
  )
  return found
}

const getDateCondition = (context: FilterContext) => {
  const now = new Date()
  const from = new Date(context.dateRange.from ?? subDays(now, 30))
  const to = new Date(context.dateRange.to ?? now)
  from.setHours(0, 0, 0, 0)
  if (to.toDateString() === now.toDateString()) to.setTime(now.getTime())
  else to.setHours(23, 59, 59, 999)
  const timestamp = (date: Date) => `TIMESTAMP('${format(date, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")}')`
  return `created_at BETWEEN ${timestamp(from)} AND ${timestamp(to)}`
}

export const applyAutomaticFilters = async (
  sql: string,
  context: FilterContext,
  onFilterUsage?: (usage: AutomaticFilterUsage) => void,
  mode: 'execution' | 'template' = 'execution',
): Promise<string> => {
  if (!/\b(?:umami_views\.(?:event|session|event_data)|umami\.public_website)\b/i.test(sql)) return sql
  const { Parser } = await import('node-sql-parser/build/bigquery')
  const parser = new Parser()
  const parsed = parser.astify(sql)
  if (Array.isArray(parsed) && parsed.length !== 1) throw new Error('Bruk én spørring om gangen.')
  const ast = Array.isArray(parsed) ? parsed[0] : parsed
  let changed = false

  visit(ast, (select) => {
    if (select.type !== 'select' || !Array.isArray(select.from)) return
    const sources = select.from.filter(isNode)
    const predicates = [select.where, ...sources.map((source) => source.on)]
    for (const source of sources) {
      if (typeof source.table !== 'string') continue
      const match = /(?:^|\.)(umami_views\.(event_data|event|session)|umami\.public_website)$/i.exec(source.table)
      if (!match) continue
      const table = source.table
      const alias = typeof source.as === 'string' ? source.as : table.split('.').pop()!
      const references = [table, alias, table.split('.').pop()!].map((value) => value.toLowerCase())
      const conditions: string[] = []
      const hasWebsiteFilter = hasFilter(predicates, 'website_id', references, sources.length === 1)
      const hasPeriodFilter = hasFilter(predicates, 'created_at', references, sources.length === 1)
      if (match[2] !== 'event_data' && !hasWebsiteFilter) {
        const ids = [
          ...new Set(context.websiteIds?.length ? context.websiteIds : [context.websiteIdState].filter(Boolean)),
        ]
        if (!ids.length) throw new Error('Velg en nettside først.')
        const values = ids.map((id) => `'${id.replace(/'/g, "''")}'`)
        conditions.push(ids.length === 1 ? `website_id = ${values[0]}` : `website_id IN (${values.join(', ')})`)
      }
      if (match[2] && !hasPeriodFilter) {
        conditions.push(mode === 'template' ? '1 = 1 AND __INNBL_DYNAMIC_PERIOD__' : getDateCondition(context))
      }
      onFilterUsage?.({
        table,
        website: match[2] === 'event_data' ? null : hasWebsiteFilter ? 'sql' : 'automatic',
        period: match[2] ? (hasPeriodFilter ? 'sql' : 'automatic') : null,
      })
      if (!conditions.length) continue

      const filtered = parser.astify(`SELECT * FROM \`${table}\` WHERE ${conditions.join(' AND ')}`)
      visit(select, (node) => {
        const column = getColumn(node)
        if (column?.table && references.includes(column.table.toLowerCase())) {
          node.table = alias
          node.column = column.name
          node.subFields = []
        }
      })
      delete source.table
      delete source.db
      delete source.surround
      source.expr = { ast: filtered, parentheses: true }
      source.as = alias
      changed = true
    }
  })

  const processed = changed ? parser.sqlify(ast) : sql
  return mode === 'template'
    ? processed.replace(/\bAND\s+`?__INNBL_DYNAMIC_PERIOD__`?/g, '[[AND {{created_at}}]]')
    : processed
}
