export const getSqlCode = (sql: string): string =>
  sql.replace(
    /\[\[[\s\S]*?\]\]|\{\{[^}]+\}\}|--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`/g,
    (token) => token.replace(/[^\r\n]/g, /^(?:--|#|\/\*)/.test(token) ? ' ' : '_'),
  )

// SQL parsers reject a SELECT without fields, so give it a temporary field while parsing and remove it again afterwards.
const TEMPORARY_FIELD = '__innblikk_no_fields__'

export const addTemporaryField = (sql: string) => sql.replace(/^(\s*SELECT)(\s+FROM\b)/i, `$1 ${TEMPORARY_FIELD}$2`)

export const removeTemporaryField = (sql: string) =>
  sql.replace(new RegExp(`^(\\s*SELECT)\\s+\`?${TEMPORARY_FIELD}\`?\\s+FROM\\b`, 'i'), '$1\nFROM')
