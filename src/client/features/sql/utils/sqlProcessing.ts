import { subDays, format } from 'date-fns'
import { getGcpProjectId } from './formatters'
import type { Website } from '../model/types'

interface SqlFilterContext {
  websiteIdState: string
  websiteIds?: string[]
  selectedWebsite: Website | null
  urlPathFromUrl: string | null
  urlPath: string
  pathOperatorFromUrl: string | null
  dateRange: { from: Date | undefined; to: Date | undefined }
  customVariables: string[]
  customVariableValues: Record<string, string>
}

export const getSqlDateBounds = (dateRange: SqlFilterContext['dateRange']) => {
  const now = new Date()
  const fromDay = format(dateRange.from ?? subDays(now, 30), 'yyyy-MM-dd')
  const toDay = format(dateRange.to ?? now, 'yyyy-MM-dd')
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(now)
  return {
    fromSql: `TIMESTAMP('${fromDay}', 'Europe/Oslo')`,
    toSql: toDay === today ? `TIMESTAMP('${now.toISOString()}')` : `TIMESTAMP('${toDay}T23:59:59.999', 'Europe/Oslo')`,
  }
}

export const replaceDateFilterPlaceholders = (
  sql: string,
  fromSql: string,
  toSql: string,
  defaultColumn: string,
): string => {
  const datePattern = /\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/gi
  if (!datePattern.test(sql)) return sql
  type DateScope = { sources: Array<{ table: string; reference: string }> }
  const tokens = [
    ...sql.matchAll(
      /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`[^`]*`|\[\[[\s\S]*?\]\]|\{\{[^}]+\}\}|[a-z_][\w$]*|[().]/gi,
    ),
  ]
  const identifier = /^(?:`[^`]+`|[a-z_][\w$]*)$/i
  const reserved =
    /^(?:AS|SELECT|FROM|WHERE|AND|OR|JOIN|LEFT|RIGHT|FULL|INNER|OUTER|CROSS|ON|USING|GROUP|ORDER|HAVING|QUALIFY|LIMIT|OFFSET|UNION|EXCEPT|INTERSECT|WINDOW|FOR|TABLESAMPLE|PIVOT|UNPIVOT)$/i
  const aliasAt = (index: number) => {
    const candidate = tokens[index]?.[0].toUpperCase() === 'AS' ? tokens[index + 1]?.[0] : tokens[index]?.[0]
    return candidate && identifier.test(candidate) && !reserved.test(candidate) ? candidate : undefined
  }
  let scope: DateScope = { sources: [] }
  const parents: Array<{ scope: DateScope; derived: boolean }> = []
  const placeholders: Array<{ offset: number; scope: DateScope }> = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index][0]
    if (token === '(') {
      parents.push({ scope, derived: /^(?:FROM|JOIN)$/i.test(tokens[index - 1]?.[0] ?? '') })
    } else if (token === ')') {
      const parent = parents.pop()
      if (parent) {
        scope = parent.scope
        const alias = parent.derived ? aliasAt(index + 1) : undefined
        if (alias) scope.sources.push({ table: '', reference: alias })
      }
    } else if (/^SELECT$/i.test(token)) {
      scope = { sources: [] }
    } else if (/^(?:FROM|JOIN)$/i.test(token)) {
      let end = index + 1
      let table = tokens[end]?.[0]
      if (!table || !identifier.test(table)) continue
      while (tokens[end + 1]?.[0] === '.' && identifier.test(tokens[end + 2]?.[0] ?? '')) {
        table += `.${tokens[end + 2][0]}`
        end += 2
      }
      if (tokens[end + 1]?.[0] === '(') continue
      scope.sources.push({ table: table.replace(/`/g, ''), reference: aliasAt(end + 1) ?? table })
    } else if (/^\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]$/i.test(token)) {
      placeholders.push({ offset: tokens[index].index, scope })
    }
  }
  const columns = new Map(
    placeholders.map(({ offset, scope: owner }) => {
      const source =
        owner.sources.find(({ table }) => /(?:^|\.)umami_views\.event$/i.test(table)) ??
        owner.sources.find(({ table }) => /(?:^|\.)umami_views\.(?:session|event_data)$/i.test(table)) ??
        owner.sources[0]
      return [offset, source ? `${source.reference}.created_at` : defaultColumn]
    }),
  )
  return sql.replace(
    datePattern,
    (_match, offset: number) => `AND ${columns.get(offset) ?? defaultColumn} BETWEEN ${fromSql} AND ${toSql}`,
  )
}

export const applyUrlFiltersToSql = (sql: string, ctx: SqlFilterContext): string => {
  let processedSql = applyWebsiteIdOnly(sql, ctx.websiteIdState, ctx.websiteIds)
  let fromSql: string | null = null
  let toSql: string | null = null
  const escapeSqlString = (value: string) => value.replace(/'/g, "''")
  const buildEqualsPathCondition = (column: string, path: string) => {
    const safePath = escapeSqlString(path)
    const pathSlash = path.endsWith('/') ? path : `${path}/`
    const safePathSlash = escapeSqlString(pathSlash)
    const queryPattern = escapeSqlString(`${path}?%`)

    if (pathSlash === path) {
      return `(${column} = '${safePath}' OR ${column} LIKE '${queryPattern}')`
    }

    return `(${column} = '${safePath}' OR ${column} = '${safePathSlash}' OR ${column} LIKE '${queryPattern}')`
  }

  // Nettside substitution {{nettside}} -> website domain
  const hasNettsidePlaceholder = /\{\{\s*nettside\s*\}\}/i.test(processedSql)
  if (hasNettsidePlaceholder && ctx.selectedWebsite?.domain) {
    const sanitizedDomain = ctx.selectedWebsite.domain.replace(/'/g, "''")
    processedSql = processedSql.replace(
      /(['"])?(\s*)\{\{\s*nettside\s*\}\}(\s*)\1?/gi,
      (_match, _quote, leading = '', trailing = '') => `${leading}'${sanitizedDomain}'${trailing}`,
    )
  }

  // URL path substitution (Metabase style [[ {{url_sti}} --]] '/' or [[ {{url_path}} --]] '/')
  const pathSource = ctx.urlPathFromUrl || ctx.urlPath
  const directUrlVarPattern = /\{\{\s*url_(?:sti|path)\s*\}\}/gi
  if (pathSource) {
    const paths = pathSource.split(',').filter(Boolean)
    const operator = ctx.pathOperatorFromUrl === 'starts-with' ? 'starts-with' : 'equals'

    if (paths.length > 0) {
      if (operator === 'starts-with') {
        if (paths.length === 1) {
          const assignmentRegex = /(\S+)\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']*')/gi
          processedSql = processedSql.replace(
            assignmentRegex,
            (_m: string, column: string) => `${column} LIKE '${paths[0]}%'`,
          )
        } else {
          const multiLikeRegex = /(\S+)\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']*')/gi
          processedSql = processedSql.replace(multiLikeRegex, (_m: string, column: string) => {
            const likeConditions = paths.map((p) => `${column} LIKE '${p}%'`).join(' OR ')
            return `(${likeConditions})`
          })
        }
      } else {
        const assignmentRegex = /(\S+)\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*('[^']*')/gi
        processedSql =
          paths.length === 1
            ? processedSql.replace(assignmentRegex, (_m: string, column: string) =>
                buildEqualsPathCondition(column, paths[0]),
              )
            : processedSql.replace(assignmentRegex, (_m: string, column: string) => {
                const conditions = paths.map((p) => buildEqualsPathCondition(column, p)).join(' OR ')
                return `(${conditions})`
              })
      }
    }

    // Direct URL placeholder substitution: column = {{url_sti}} / {{url_path}}
    const directAssignmentRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi
    if (operator === 'starts-with') {
      if (paths.length === 1) {
        processedSql = processedSql.replace(directAssignmentRegex, `$1 LIKE '${paths[0]}%'`)
      } else {
        processedSql = processedSql.replace(directAssignmentRegex, (_m: string, column: string) => {
          const likeConditions = paths.map((p) => `${column} LIKE '${p}%'`).join(' OR ')
          return `(${likeConditions})`
        })
      }
    } else if (paths.length === 1) {
      processedSql = processedSql.replace(directAssignmentRegex, (_m: string, column: string) =>
        buildEqualsPathCondition(column, paths[0]),
      )
    } else {
      processedSql = processedSql.replace(directAssignmentRegex, (_m: string, column: string) => {
        const conditions = paths.map((p) => buildEqualsPathCondition(column, p)).join(' OR ')
        return `(${conditions})`
      })
    }

    // Fallback replacement if placeholder appears outside a direct assignment.
    processedSql = processedSql.replace(directUrlVarPattern, `'${paths[0]}'`)
  } else {
    // No external path provided: treat as whole website (remove URL filter clauses).
    const optionalClausePattern = /\s+AND\s+[\w`.-]*url_path\s*=\s*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]\s*'\/'/gi
    const directClausePattern =
      /\s+AND\s+[\w`.-]*url_path\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi
    const placeholderLinePattern = /^\s*AND\s+[^\n]*url_path[^\n]*\{\{\s*url_(?:sti|path)\s*\}\}[^\n]*$/gim
    const optionalPlaceholderLinePattern =
      /^\s*AND\s+[^\n]*url_path[^\n]*\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\][^\n]*$/gim
    const directAssignmentRegex = /(\S+)\s*=\s*(?:['"])?\s*\{\{\s*url_(?:sti|path)\s*\}\}\s*(?:['"])?/gi
    processedSql = processedSql.replace(optionalClausePattern, '')
    processedSql = processedSql.replace(directClausePattern, '')
    processedSql = processedSql.replace(placeholderLinePattern, '')
    processedSql = processedSql.replace(optionalPlaceholderLinePattern, '')
    // Fallback if placeholder assignment is inline (not line-based)
    processedSql = processedSql.replace(directAssignmentRegex, '1=1')
    processedSql = processedSql.replace(/\[\[\s*\{\{url_(?:sti|path)\}\}\s*--\s*\]\]/gi, '')
    // Do not force '/' when URL is blank; keep whole-site behavior.
    processedSql = processedSql.replace(directUrlVarPattern, '')
  }

  // Optional URL path substitution [[AND {{url_sti}} ]] or [[AND {{url_path}} ]]
  const andUrlStiPattern = /\[\[\s*AND\s*\{\{url_(?:sti|path)\}\}\s*\]\]/gi
  if (andUrlStiPattern.test(processedSql)) {
    if (pathSource) {
      const path = pathSource.split(',')[0]
      const operator = ctx.pathOperatorFromUrl === 'starts-with' ? 'starts-with' : 'equals'

      if (operator === 'starts-with') {
        processedSql = processedSql.replace(andUrlStiPattern, `AND url_path LIKE '${path}%'`)
      } else {
        processedSql = processedSql.replace(andUrlStiPattern, `AND ${buildEqualsPathCondition('url_path', path)}`)
      }
    } else {
      processedSql = processedSql.replace(andUrlStiPattern, '')
    }
  }

  // Date substitution [[AND {{created_at}} ]]
  const datePattern = /\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/gi
  if (datePattern.test(processedSql)) {
    const bounds = getSqlDateBounds(ctx.dateRange)
    fromSql = bounds.fromSql
    toSql = bounds.toSql

    const projectId = getGcpProjectId()
    let tablePrefix = `\`${projectId}.umami_views.event\``
    if (processedSql.includes('umami_views.event')) {
      tablePrefix = `\`${projectId}.umami_views.event\``
    } else if (processedSql.includes('umami_views.session')) {
      tablePrefix = `\`${projectId}.umami_views.session\``
    } else if (processedSql.includes('public_session') && !processedSql.includes('public_website_event')) {
      tablePrefix = `\`${projectId}.umami.public_session\``
    }

    processedSql = replaceDateFilterPlaceholders(processedSql, fromSql, toSql, `${tablePrefix}.created_at`)
  }

  // If query joins partitioned public_session, mirror the date filter
  if (
    fromSql &&
    toSql &&
    /public_session/gi.test(processedSql) &&
    !/public_session[^\n]*created_at/gi.test(processedSql)
  ) {
    const projectId = getGcpProjectId()
    const eventFilter = `\`${projectId}.umami_views.event\`.created_at BETWEEN ${fromSql} AND ${toSql}`
    const sessionPredicate = `\`${projectId}.umami_views.session\`.created_at BETWEEN ${fromSql} AND ${toSql}`

    if (processedSql.includes(eventFilter)) {
      processedSql = processedSql.replace(eventFilter, `${eventFilter} AND ${sessionPredicate}`)
    } else if (/WHERE/i.test(processedSql)) {
      processedSql = processedSql.replace(/WHERE/i, (match) => `${match} ${sessionPredicate} AND`)
    }
  }

  // Custom variable substitution {{variable_name}}
  for (const varName of ctx.customVariables) {
    const value = ctx.customVariableValues[varName]
    if (value !== undefined && value !== '') {
      const varRegex = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'gi')
      const isNumeric = /^-?\d+\.?\d*$/.test(value)
      const replacement = isNumeric ? value : `'${value.replace(/'/g, "''")}'`
      processedSql = processedSql.replace(varRegex, replacement)
    }
  }

  return processedSql
}

// Only substitute website_id placeholder for copy actions (keep other filters untouched)
export const applyWebsiteIdOnly = (sql: string, websiteIdState: string, websiteIds?: string[]): string => {
  let processedSql = sql
  if (websiteIds && websiteIds.length > 1) {
    const values = [...new Set(websiteIds)].map((id) => `'${id.replace(/'/g, "''")}'`).join(', ')
    processedSql = processedSql.replace(
      /((?:`[^`]+`|\w+)(?:\.(?:`[^`]+`|\w+))*)\s*=\s*(['"])?\s*\{\{\s*website_id\s*\}\}\s*\2?/gi,
      (_match, column: string) => `${column} IN (${values})`,
    )
  }
  const hasWebsitePlaceholderInline = /\{\{\s*website_id\s*\}\}/i.test(processedSql)
  if (hasWebsitePlaceholderInline && websiteIdState) {
    const sanitizedWebsiteId = websiteIdState.replace(/'/g, "''")
    processedSql = processedSql.replace(
      /(['"])?(\s*)\{\{\s*website_id\s*\}\}(\s*)\1?/gi,
      (_match, _quote, leading = '', trailing = '') => `${leading}'${sanitizedWebsiteId}'${trailing}`,
    )
  }
  return processedSql
}

export const ensureWebsitePlaceholder = (currentQuery: string): string => {
  // If any website-related placeholder or filter already exists, leave untouched
  if (
    /\{\{\s*website_id\s*\}\}/i.test(currentQuery) ||
    /\{\{\s*nettside\s*\}\}/i.test(currentQuery) ||
    /website_id\s*=\s*['"]/i.test(currentQuery) ||
    /website_domain\s*=\s*/i.test(currentQuery)
  ) {
    return currentQuery
  }

  const table = `\`${getGcpProjectId()}.umami_views.event\``

  if (/WHERE/i.test(currentQuery)) {
    return currentQuery.replace(/WHERE/i, (match) => `${match} ${table}.website_id = '{{website_id}}' AND`)
  }

  const trimmed = currentQuery.trimEnd()
  const suffix = trimmed.endsWith(';') ? ';' : ''
  const base = trimmed.replace(/;$/, '')
  return `${base} WHERE ${table}.website_id = '{{website_id}}'${suffix}`
}

// Extract websiteId from SQL query
export const extractWebsiteId = (sql: string): string | undefined => {
  const match = sql.match(/website_id\s*=\s*['"]([0-9a-f-]{36})['"]/i)
  return match?.[1]
}

// Replace hardcoded website_id with a new one
export const replaceHardcodedWebsiteId = (sql: string, newWebsiteId: string): string => {
  return sql.replace(/(website_id\s*=\s*)(['"])([0-9a-f-]{36})\2/gi, `$1$2${newWebsiteId}$2`)
}

// Temporarily replace Metabase placeholders with valid SQL for formatting/validation
export const sanitizePlaceholders = (
  sql: string,
  mode: 'format' | 'parse' = 'format',
): { sanitized: string; placeholders: Map<string, string> } => {
  const placeholders = new Map<string, string>()
  let sanitized = sql
  let counter = 0

  // Replace [[...]] optional blocks with a unique token
  const optionalPattern = mode === 'parse' ? /\[\[[\s\S]*?\]\](?:[ \t]*'(?:''|[^'])*')?/g : /\[\[[^\]]*\]\]/g
  sanitized = sanitized.replace(optionalPattern, (match) => {
    const token = `__METABASE_OPT_${counter++}__`
    placeholders.set(token, match)
    if (mode === 'parse') {
      const conjunction = /^\[\[\s*(AND|OR)\b/i.exec(match)?.[1]
      return conjunction ? `${conjunction} ${token}` : `'${token}'`
    }
    return `/* ${token} */`
  })

  // Replace {{...}} variable placeholders with a unique token
  sanitized = sanitized.replace(/'\{\{[^}]+\}\}'|"\{\{[^}]+\}\}"|\{\{[^}]+\}\}/g, (match) => {
    const token = `__METABASE_VAR_${counter++}__`
    placeholders.set(token, match)
    return `'${token}'`
  })

  return { sanitized, placeholders }
}

// Restore Metabase placeholders after formatting
export const restorePlaceholders = (sql: string, placeholders: Map<string, string>): string => {
  let restored = sql
  placeholders.forEach((original, token) => {
    const conjunction = /^\[\[\s*(AND|OR)\b/i.exec(original)?.[1]
    if (conjunction)
      restored = restored.replace(new RegExp(`\\b${conjunction}\\s+\u0060?${token}\u0060?`, 'gi'), () => original)
    restored = restored.replace(new RegExp(`/\\*\\s*${token}\\s*\\*/`, 'g'), () => original)
    restored = restored.replace(new RegExp(`'${token}'`, 'g'), () => original)
  })
  return restored
}

// Helper to update URL params without losing others
export const updateUrlParams = (updates: Record<string, string | null>) => {
  const params = new URLSearchParams(window.location.search)
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  })
  const newUrl = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState({}, '', newUrl)
}
