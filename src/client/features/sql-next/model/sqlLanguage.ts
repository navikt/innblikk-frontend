import type { OnMount } from '@monaco-editor/react'

type Monaco = Parameters<OnMount>[1]
type SqlGrammar = Parameters<Monaco['languages']['setMonarchTokensProvider']>[1]
type SqlConfiguration = Parameters<Monaco['languages']['setLanguageConfiguration']>[1]

interface SqlLanguageDefinition {
  id: string
  loader?: () => Promise<{ language: SqlGrammar; conf: SqlConfiguration }>
}

export const SQL_NEXT_LANGUAGE_ID = 'innblikk-sql'

export const withSqlPlaceholders = <Grammar extends { tokenizer: Record<string, unknown[]> }>(
  language: Grammar,
): Grammar => ({
  ...language,
  tokenizer: {
    ...language.tokenizer,
    root: [[/\[\[|\]\]/, 'delimiter.square'], [/\{\{\s*[a-zA-Z_]\w*\s*\}\}/, 'variable'], ...language.tokenizer.root],
  },
})

export const registerSqlNextLanguage = async (monaco: Monaco): Promise<boolean> => {
  if (monaco.languages.getLanguages().some((language: SqlLanguageDefinition) => language.id === SQL_NEXT_LANGUAGE_ID))
    return true
  const sql = monaco.languages.getLanguages().find((language: SqlLanguageDefinition) => language.id === 'sql') as
    SqlLanguageDefinition | undefined
  if (!sql?.loader) return false
  const { language, conf } = await sql.loader()
  if (
    monaco.languages.getLanguages().some((registered: SqlLanguageDefinition) => registered.id === SQL_NEXT_LANGUAGE_ID)
  )
    return true
  monaco.languages.register({ id: SQL_NEXT_LANGUAGE_ID })
  monaco.languages.setLanguageConfiguration(SQL_NEXT_LANGUAGE_ID, conf)
  monaco.languages.setMonarchTokensProvider(SQL_NEXT_LANGUAGE_ID, withSqlPlaceholders(language))
  return true
}
