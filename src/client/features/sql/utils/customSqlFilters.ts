const SQL_TOKENS =
  /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`/g

export const withoutSqlComments = (sql: string): string =>
  sql.replace(SQL_TOKENS, (token) => (/^(?:--|#|\/\*)/.test(token) ? ' '.repeat(token.length) : token))

export const getCustomSqlVariableNames = (
  sql: string,
  knownVariables = ['website_id', 'nettside', 'created_at', 'url_sti', 'url_path'],
): string[] =>
  [...new Set([...withoutSqlComments(sql).matchAll(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g)].map((match) => match[1]))].filter(
    (name) => !knownVariables.includes(name.toLowerCase()),
  )

export interface CustomSqlFilter {
  name: string
  label: string
  optional: boolean
  options?: string[]
  source?: 'event_name'
  error?: string
}

export const getCustomSqlFilters = (sql: string, names = getCustomSqlVariableNames(sql)): CustomSqlFilter[] => {
  const code = withoutSqlComments(sql)
  const optionalBlocks = /\[\[[\s\S]*?\]\]/g
  const requiredCode = code.replace(optionalBlocks, '')
  const comments = [...sql.matchAll(SQL_TOKENS)].map((match) => match[0]).filter((token) => token.startsWith('--'))
  return names.map((name) => {
    const placeholder = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'i')
    const filter: CustomSqlFilter = {
      name,
      label: name.replace(/_/g, ' '),
      optional: !placeholder.test(requiredCode),
      source: new RegExp(`\\bevent_name\\s*=\\s*['"]?\\s*\\{\\{\\s*${name}\\s*\\}\\}`, 'i').test(code)
        ? 'event_name'
        : undefined,
    }
    const directive = comments
      .map((comment) => /^--\s*@filter\s+([a-zA-Z_]\w*)\s+(.+)$/.exec(comment))
      .find((match) => match?.[1] === name)
    if (!directive) return filter
    try {
      const config: unknown = JSON.parse(directive[2])
      if (
        !config ||
        typeof config !== 'object' ||
        Array.isArray(config) ||
        ('label' in config && (typeof config.label !== 'string' || !config.label.trim())) ||
        ('options' in config &&
          (!Array.isArray(config.options) ||
            !config.options.every((option) => typeof option === 'string' && option))) ||
        ('source' in config && config.source !== 'event_name') ||
        Object.keys(config).some((key) => !['label', 'options', 'source'].includes(key))
      ) {
        throw new Error('Bruk label (tekst), options (liste med tekst) og/eller source: "event_name".')
      }
      if ('label' in config && typeof config.label === 'string') filter.label = config.label
      if ('options' in config && Array.isArray(config.options)) {
        filter.options = config.options.filter((option): option is string => typeof option === 'string')
      }
      if ('source' in config && config.source === 'event_name') filter.source = config.source
    } catch (error) {
      filter.error = `Ugyldig @filter for ${name}: ${error instanceof Error ? error.message : 'Ugyldig JSON.'}`
    }
    return filter
  })
}

export const getCustomSqlFilterInputMessage = (
  filters: CustomSqlFilter[],
  values: Record<string, string>,
): string | null => {
  const missing = filters.filter((filter) => !filter.optional && !values[filter.name]?.trim())
  if (!missing.length) return null
  const labels = missing.map((filter) => `«${filter.label}»`).join(', ')
  return `Velg eller fyll ut ${labels} for å vise resultatene.`
}

export const parseCustomSqlFilterValues = (value: string | null): Record<string, string> => {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Object.values(parsed).every((item) => typeof item === 'string')
    ) {
      throw new Error('Ugyldige filterverdier')
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    console.warn('Ugyldige filterverdier i SQL-lenken. Fyll ut filtrene på nytt.')
    return {}
  }
}

export const replaceCustomSqlVariables = (sql: string, names: string[], values: Record<string, string>): string => {
  let processedSql = sql
  for (const name of names) {
    const value = values[name]
    if (value !== undefined && value.trim() !== '') {
      const replacement = /^-?\d+\.?\d*$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`
      processedSql = processedSql.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'gi'), () => replacement)
    }
  }
  return processedSql
}

export const applyOptionalCustomFilters = (sql: string, names: string[], values: Record<string, string>): string =>
  sql.replace(
    /--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`|\[\[[\s\S]*?\]\]/g,
    (token) => {
      if (!token.startsWith('[[')) return token
      const variables = [...withoutSqlComments(token).matchAll(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g)].map(
        (match) => match[1],
      )
      if (!variables.length || !variables.every((name) => names.includes(name))) return token
      return variables.some((name) => !values[name]?.trim()) ? '' : token.slice(2, -2)
    },
  )
