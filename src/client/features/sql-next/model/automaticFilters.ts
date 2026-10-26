import {
  getSqlDateBounds,
  sanitizePlaceholders,
  restorePlaceholders,
  type applyUrlFiltersToSql,
} from '../../sql/utils/sqlProcessing'

type FilterContext = Parameters<typeof applyUrlFiltersToSql>[1]
type SqlNode = Record<string, unknown>

export interface AutomaticFilterUsage {
  table: string
  website: 'automatic' | 'sql' | null
  period: 'automatic' | 'sql' | null
}

const isNode = (value: unknown): value is SqlNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const visit = (value: unknown, action: (node: SqlNode) => void, includeSubqueries = true) => {
  if (Array.isArray(value)) value.forEach((item) => visit(item, action, includeSubqueries))
  else if (isNode(value)) {
    if (!includeSubqueries && value.type === 'select') return
    Object.values(value).forEach((child) => visit(child, action, includeSubqueries))
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
  const containsTarget = (value: unknown) => {
    let matches = false
    visit(
      value,
      (node) => {
        const column = getColumn(node)
        if (
          column?.name.toLowerCase() === field &&
          (column.table ? references.includes(column.table.toLowerCase()) : unqualified)
        )
          matches = true
      },
      false,
    )
    return matches
  }
  const isValue = (value: unknown) => {
    let hasReference = false
    visit(value, (node) => {
      if (getColumn(node) || node.type === 'select') hasReference = true
    })
    return !hasReference
  }
  let found = false
  predicates.forEach((predicate) =>
    visit(
      predicate,
      (node) => {
        if (
          node.type === 'binary_expr' &&
          /^(?:=|!=|<>|[<>]=?|(?:NOT )?(?:BETWEEN|IN|LIKE)|IS(?: NOT)?)$/i.test(String(node.operator)) &&
          ((containsTarget(node.left) && isValue(node.right)) || (containsTarget(node.right) && isValue(node.left)))
        )
          found = true
      },
      false,
    ),
  )
  return found
}

const getDateCondition = (context: FilterContext) => {
  const { fromSql, toSql } = getSqlDateBounds(context.dateRange)
  return `created_at BETWEEN ${fromSql} AND ${toSql}`
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
  const { sanitized, placeholders } =
    mode === 'template'
      ? sanitizePlaceholders(sql, 'parse')
      : { sanitized: sql, placeholders: new Map<string, string>() }
  const periodTokens = new Set(
    [...placeholders].filter(([, text]) => /\{\{\s*created_at\s*\}\}/i.test(text)).map(([token]) => token),
  )
  const parsed = parser.astify(sanitized)
  if (Array.isArray(parsed) && parsed.length !== 1) throw new Error('Bruk én spørring om gangen.')
  const ast = Array.isArray(parsed) ? parsed[0] : parsed
  let changed = false

  visit(ast, (select) => {
    if (select.type !== 'select' || !Array.isArray(select.from)) return
    const sources = select.from.filter(isNode)
    const periodSource =
      sources.find((source) => typeof source.table === 'string' && /(?:^|\.)umami_views\.event$/i.test(source.table)) ??
      sources.find(
        (source) =>
          typeof source.table === 'string' && /(?:^|\.)umami_views\.(?:session|event_data)$/i.test(source.table),
      )
    for (const source of sources) {
      if (typeof source.table !== 'string') continue
      const match = /(?:^|\.)(umami_views\.(event_data|event|session)|umami\.public_website)$/i.exec(source.table)
      if (!match) continue
      const table = source.table
      const alias = typeof source.as === 'string' ? source.as : table.split('.').pop()!
      const references = [table, alias, table.split('.').pop()!].map((value) => value.toLowerCase())
      const conditions: string[] = []
      const predicates = [
        select.where,
        ...sources
          .filter((joined, joinedIndex) => {
            const join = String(joined.join ?? '').toUpperCase()
            if (join.startsWith('FULL')) return false
            if (join.startsWith('LEFT')) return joined === source
            if (join.startsWith('RIGHT')) return sources.indexOf(source) < joinedIndex
            return true
          })
          .map((joined) => joined.on),
      ]
      let hasDynamicPeriod = false
      predicates.forEach((predicate) =>
        visit(
          predicate,
          (node) => {
            const column = getColumn(node)
            if (column && periodTokens.has(column.name)) hasDynamicPeriod = true
          },
          false,
        ),
      )
      const unqualified = sources.every((candidate) => {
        if (candidate === source) return true
        if (candidate.type !== 'unnest' || candidate.with_offset || !isNode(candidate.expr)) return false
        const column = getColumn(candidate.expr)
        return Boolean(
          column &&
          ['event_parameters', 'session_parameters'].includes(column.name) &&
          (!column.table || references.includes(column.table.toLowerCase())),
        )
      })
      const hasWebsiteFilter = hasFilter(predicates, 'website_id', references, unqualified)
      const hasPeriodFilter =
        hasFilter(predicates, 'created_at', references, unqualified) || (source === periodSource && hasDynamicPeriod)
      if (!hasWebsiteFilter) {
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
        website: hasWebsiteFilter ? 'sql' : 'automatic',
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
    ? restorePlaceholders(processed, placeholders).replace(
        /\bAND\s+`?__INNBL_DYNAMIC_PERIOD__`?/g,
        '[[AND {{created_at}}]]',
      )
    : processed
}
