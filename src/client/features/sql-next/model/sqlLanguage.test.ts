import { withSqlPlaceholders, registerSqlNextLanguage, SQL_NEXT_LANGUAGE_ID } from './sqlLanguage'

describe('SQL placeholder highlighting', () => {
  it('handles optional block delimiters before the standard bracketed-identifier rule', () => {
    const bracketRule = [/\[/, { token: 'identifier.quote', next: '@bracketedIdentifier' }]
    const sql = { tokenizer: { root: [bracketRule], string: [[/[^']+/, 'string']] }, keywords: ['GROUP', 'BY'] }
    const extended = withSqlPlaceholders(sql)
    expect(extended.tokenizer.root[0]).toEqual([/\[\[|\]\]/, 'delimiter.square'])
    expect(extended.tokenizer.root[2]).toBe(bracketRule)
    expect(extended.tokenizer.string).toBe(sql.tokenizer.string)
    expect(extended.keywords).toBe(sql.keywords)
    expect(sql.tokenizer.root).toEqual([bracketRule])
  })

  it('treats complete placeholders as a token without entering a string or identifier state', () => {
    const extended = withSqlPlaceholders({ tokenizer: { root: [] } })
    expect(extended.tokenizer.root[1]).toEqual([/\{\{\s*[a-zA-Z_]\w*\s*\}\}/, 'variable'])
  })

  it('registers the extended grammar under its own ID without replacing shared SQL highlighting', async () => {
    const language = { tokenizer: { root: [] } }
    const conf = { brackets: [['(', ')']] }
    const languages = {
      getLanguages: vi.fn(() => [{ id: 'sql', loader: vi.fn().mockResolvedValue({ language, conf }) }]),
      register: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
    }
    await registerSqlNextLanguage({ languages })
    expect(languages.register).toHaveBeenCalledWith({ id: SQL_NEXT_LANGUAGE_ID })
    expect(languages.setLanguageConfiguration).toHaveBeenCalledWith(SQL_NEXT_LANGUAGE_ID, conf)
    expect(languages.setMonarchTokensProvider).toHaveBeenCalledWith(SQL_NEXT_LANGUAGE_ID, withSqlPlaceholders(language))
  })
})
