import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { estimateQueryCost, executeQueryApi } from '../../sql/api/sqlApi'
import { useSqlNextEditor } from './useSqlNextEditor'
import { INITIAL_SQL_QUERY } from '../model/schemaAndSnippets'

vi.mock('../../sql/api/sqlApi', () => ({
  fetchWebsites: vi.fn().mockResolvedValue([]),
  estimateQueryCost: vi.fn(),
  executeQueryApi: vi.fn(),
}))

describe('SQL editor actions', () => {
  it('exports dynamic dates after executing a join with concrete dates', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    const sql =
      "SELECT COUNT(DISTINCT NULLIF(s.distinct_id, '')) AS unike_besokende FROM `test-project.umami_views.session` s LEFT JOIN `test-project.umami_views.event` e ON s.session_id = e.session_id WHERE e.url_path = '/pensjon'"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.lastProcessedSql).toContain('TIMESTAMP(')
    const exported = await result.current.getExportQuery()
    expect(exported.match(/\[\[AND \{\{created_at\}\}\s*\]\]/g)).toHaveLength(2)
    expect(exported).not.toContain('TIMESTAMP(')
    expect(exported).toContain("website_id = 'chosen-website'")
    expect(exported).toContain("url_path = '/pensjon'")
    await act(async () => {
      await result.current.handleCopyMetabase()
    })
    expect(clipboard.writeText).toHaveBeenCalledWith(exported)
    expect(result.current.query).toBe(sql)
  })

  it('preserves existing dynamic placeholders in exports', async () => {
    const sql =
      "SELECT browser FROM `test-project.umami_views.session` WHERE website_id = '{{website_id}}' [[AND {{created_at}} ]]"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    const exported = await result.current.getExportQuery()
    expect(exported).toContain('[[AND {{created_at}} ]]')
    expect(exported).not.toContain('TIMESTAMP(')
  })

  it('previews the same filters and limit used for execution without sending a request', async () => {
    const sql = 'SELECT browser FROM `test-project.umami_views.session`'
    window.history.replaceState(
      {},
      '',
      `/sql?${new URLSearchParams({ sql, websiteIds: 'first,second', dateRange: 'custom', customStartDate: '2026-09-01', customEndDate: '2026-09-02' })}`,
    )
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    const preview = await result.current.getQueryPreview()
    expect(preview.sql).toContain("website_id IN ('first', 'second')")
    expect(preview.sql).toContain('created_at BETWEEN')
    expect(preview.sql).toContain('LIMIT 100')
    expect(preview.filterUsage).toEqual([
      { table: 'test-project.umami_views.session', website: 'automatic', period: 'automatic' },
    ])
    expect(result.current.query).toBe(sql)
    expect(estimateQueryCost).not.toHaveBeenCalled()
    expect(executeQueryApi).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenCalledWith(preview.sql)
  })

  it('previews explicit SQL filters and LIMIT without overriding them with top selections', async () => {
    const sql =
      "SELECT browser FROM `test-project.umami_views.session` WHERE website_id = 'manual' AND created_at >= TIMESTAMP('2026-09-01') LIMIT 20"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'ignored-website' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    const preview = await result.current.getQueryPreview()
    expect(preview.sql).toBe(sql)
    expect(preview.filterUsage).toEqual([{ table: 'test-project.umami_views.session', website: 'sql', period: 'sql' }])
    expect(preview.sql).not.toContain('ignored-website')
    expect(estimateQueryCost).not.toHaveBeenCalled()
  })

  it('refreshes the preview after website and row-limit changes without executing', async () => {
    const sql = 'SELECT browser FROM `test-project.umami_views.session`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      result.current.handleWebsiteIdsChange(['second'])
      await result.current.handleSafetyLimitChange(500)
    })
    const preview = await result.current.getQueryPreview()
    expect(preview.sql).toContain("website_id = 'second'")
    expect(preview.sql).toContain('LIMIT 500')
    expect(result.current.query).toBe(sql)
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('combines selected websites without changing editor SQL and shares every selection', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    const sql = 'SELECT browser, COUNT(*) AS antall FROM `test-project.umami_views.session` GROUP BY browser'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      result.current.handleWebsiteIdsChange(['first', 'second'])
      await Promise.resolve()
    })
    expect(result.current.query).toBe(sql)
    expect(new URLSearchParams(window.location.search).get('websiteIds')).toBe('first,second')
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith(expect.stringContaining("website_id IN ('first', 'second')"))
    await act(async () => {
      result.current.shareQuery()
      await Promise.resolve()
    })
    expect(new URL(clipboard.writeText.mock.calls[0][0] as string).searchParams.get('websiteIds')).toBe('first,second')
  })

  it('restores multiple selected websites from the URL for existing placeholder queries', async () => {
    const sql = "SELECT browser FROM `test-project.umami_views.session` WHERE website_id = '{{website_id}}'"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteIds: 'first,second' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.websiteIds).toEqual(['first', 'second'])
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(estimateQueryCost).toHaveBeenLastCalledWith(expect.stringContaining("website_id IN ('first', 'second')"))
  })

  it.each(['SELECT 1', 'SELECT 1 LIMIT 20;', 'SELECT 1 LIMIT 20 OFFSET 5; -- rows'])(
    'runs without a LIMIT only after unlimited is explicitly selected for %s',
    async (sql) => {
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
      const { result } = renderHook(() => useSqlNextEditor(), {
        wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
      })
      expect(result.current.activeLimit).not.toBeNull()
      await act(async () => {
        await result.current.handleSafetyLimitChange(null)
      })
      expect(result.current.activeLimit).toBeNull()
      expect(result.current.query).not.toMatch(/\bLIMIT\b/i)
      expect(result.current.isResultLimited).toBe(false)
      await act(async () => {
        await result.current.executeQuery()
      })
      expect(executeQueryApi).toHaveBeenCalledOnce()
      expect(vi.mocked(executeQueryApi).mock.calls[0][0]).not.toMatch(/\bLIMIT\b/i)
    },
  )

  it('restores a safety limit when switching back from unlimited', async () => {
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.handleSafetyLimitChange(null)
    })
    await act(async () => {
      await result.current.handleSafetyLimitChange(500)
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith('SELECT 1\nLIMIT 500')
  })

  it('retains explicit unlimited selection through the costly-query confirmation', async () => {
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    vi.mocked(estimateQueryCost).mockResolvedValueOnce({ totalBytesProcessedGB: '25' })
    await act(async () => {
      await result.current.handleSafetyLimitChange(null)
    })
    expect(result.current.showConfirmModal).toBe(true)
    expect(executeQueryApi).toHaveBeenCalledTimes(1)
    await act(async () => {
      await result.current.handleConfirmQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith('SELECT 1')
    expect(result.current.activeLimit).toBeNull()
  })

  it('does not enable unlimited from URL parameters or a query without LIMIT', async () => {
    window.history.replaceState({}, '', '/sql?sql=SELECT%201&limit=unlimited')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.activeLimit).toBe(100)
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith('SELECT 1\nLIMIT 100')
  })

  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.mocked(estimateQueryCost).mockReset().mockResolvedValue({ totalBytesProcessedGB: '0' })
    vi.mocked(executeQueryApi).mockReset().mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState({}, '', '/')
    vi.restoreAllMocks()
  })

  it('starts a new query with SELECT without estimating or running it', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/sql')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.query).toBe('SELECT')
    expect(result.current.incompleteQueryMessage).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(estimateQueryCost).not.toHaveBeenCalled()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('keeps only SELECT when a website is selected before building the query', async () => {
    window.history.replaceState({}, '', '/sql')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      result.current.handleWebsiteChange({
        id: 'test-website',
        name: 'Test website',
        domain: 'example.test',
        teamId: 'test-team',
        createdAt: '2026-10-01',
      })
      await Promise.resolve()
    })
    expect(result.current.websiteId).toBe('test-website')
    expect(result.current.query).toBe('SELECT')
  })

  it.each(['SELECT 42', 'WITH example AS (SELECT 1 AS value) SELECT * FROM example'])(
    'preserves the shared query %s',
    async (sql) => {
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
      const { result } = renderHook(() => useSqlNextEditor(), {
        wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
      })
      expect(result.current.query).toBe(sql)
      await act(async () => {
        await Promise.resolve()
      })
    },
  )

  it.each([
    ['SELECT 1', 'SELECT 1'],
    ['SELECT 1 LIMIT 20;', 'SELECT 1 LIMIT 500;'],
    ['SELECT 1 LIMIT 20 OFFSET 5; -- rows', 'SELECT 1 LIMIT 500 OFFSET 5; -- rows'],
  ])('changes the row limit before running %s without executing the query', async (query, expectedQuery) => {
    vi.mocked(executeQueryApi).mockClear()
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql: query })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.activeLimit).toBe(query.includes('LIMIT') ? 20 : 100)

    await act(async () => {
      await result.current.handleSafetyLimitChange(500)
    })

    expect(result.current.activeLimit).toBe(500)
    expect(result.current.query).toBe(expectedQuery)
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('formats SQL without executing or estimating it', () => {
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    act(() => {
      result.current.formatSQL()
    })
    expect(result.current.query).toBe('SELECT\n  1')
    expect(estimateQueryCost).not.toHaveBeenCalled()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('preserves placeholders when formatting SQL', () => {
    const sql =
      "SELECT browser FROM `test-project.umami_views.session` WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    act(() => {
      result.current.formatSQL()
    })
    expect(result.current.validateError).toBeNull()
    expect(result.current.query).toContain('\n')
    expect(result.current.query).toContain("'{{website_id}}'")
    expect(result.current.query).toContain('[[AND {{created_at}}]]')
  })

  it('keeps SQL unchanged and shows an error if formatting fails', () => {
    const sql = "SELECT 'unterminated"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    act(() => {
      result.current.formatSQL()
    })
    expect(result.current.query).toBe(sql)
    expect(result.current.validateError).toBe('Kunne ikke formatere SQL. Sjekk om den er gyldig.')
  })

  it('checks SQL only on request and adds LIMIT only when running', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(estimateQueryCost).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(estimateQueryCost).toHaveBeenLastCalledWith('SELECT 1')
    expect(executeQueryApi).not.toHaveBeenCalled()
    expect(result.current.query).toBe('SELECT 1')

    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith('SELECT 1\nLIMIT 100')
    expect(result.current.query).toBe('SELECT 1')
  })

  it('does not request an estimate for an unfinished WHERE clause', async () => {
    vi.useFakeTimers()
    const sql = 'SELECT * FROM `test-project.umami.public_website`\nWHERE\n  '
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.incompleteQueryMessage).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(estimateQueryCost).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.incompleteQueryMessage).toBe('Spørringen er ikke ferdig.')
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('checks a complete query ending in a quoted table name', async () => {
    vi.useFakeTimers()
    const sql = 'SELECT * FROM `test-project.umami.public_website`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.incompleteQueryMessage).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(estimateQueryCost).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(estimateQueryCost).toHaveBeenLastCalledWith(expect.stringContaining("website_id = 'chosen-website'"))
  })

  it('adds selected filters only to submitted SQL, not the editor text', async () => {
    const sql =
      'SELECT browser, COUNT(DISTINCT session_id) AS besokende FROM `test-project.umami_views.session` GROUP BY browser'
    window.history.replaceState(
      {},
      '',
      `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website', dateRange: 'last_7_days' })}`,
    )
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(estimateQueryCost).toHaveBeenLastCalledWith(expect.stringContaining("website_id = 'chosen-website'"))
    expect(result.current.lastProcessedSql).toContain('created_at BETWEEN')
    expect(result.current.query).toBe(sql)
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith(expect.stringContaining('created_at BETWEEN'))
    expect(result.current.lastProcessedSql).toContain('LIMIT 100')
    expect(result.current.query).toBe(sql)
  })

  it('does not insert visible filter code when changing the website on a completed query', async () => {
    const sql = 'SELECT browser FROM `test-project.umami_views.session`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      result.current.handleWebsiteChange({
        id: 'chosen-website',
        name: 'Example',
        domain: 'example.test',
        teamId: 'test-team',
        createdAt: '2026-10-01',
      })
      await Promise.resolve()
    })
    expect(result.current.query).toBe(sql)
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith(expect.stringContaining("website_id = 'chosen-website'"))
  })

  it('does not show errors for an unfinished comparison until the user checks', async () => {
    const sql = 'SELECT * FROM `test-project.umami.public_website`\nWHERE website_id = '
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.incompleteQueryMessage).toBeNull()
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(result.current.incompleteQueryMessage).toBe('Spørringen er ikke ferdig.')
    expect(estimateQueryCost).not.toHaveBeenCalled()
    await act(async () => {
      result.current.handleQueryChange('SELECT 1')
      await Promise.resolve()
    })
    expect(result.current.incompleteQueryMessage).toBeNull()
    expect(result.current.validateError).toBeNull()
  })

  it.each([
    'SELECT 1 LIMIT 20',
    'SELECT 1 LIMIT 20; -- rows',
    'SELECT 1 LIMIT 20 /* rows */',
    'SELECT 1 LIMIT 20 OFFSET 5;',
  ])('does not duplicate a user-specified limit in %s', async (sql) => {
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.activeLimit).toBe(20)
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith(sql)
  })

  it('adds the safety limit before a semicolon followed by a comment', async () => {
    const sql = "SELECT 'LIMIT 20' AS label; -- keep this comment"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.explicitLimit).toBeNull()
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith("SELECT 'LIMIT 20' AS label\nLIMIT 100; -- keep this comment")
  })

  it.each([
    'SELECT * FROM `test-project.umami_views.session`',
    "SELECT * FROM `test-project.umami_views.session`\nWHERE website_id = '{{website_id}}'",
  ])('adds an unindented date filter followed by a new line to %s', async (query) => {
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql: query })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })

    await act(async () => {
      result.current.handleAddDateFilter()
      await Promise.resolve()
    })

    expect(result.current.query).toBe(
      "SELECT * FROM `test-project.umami_views.session`\nWHERE website_id = '{{website_id}}'\n[[AND {{created_at}}]]\n",
    )
  })

  it.each(['', "\nWHERE website_id = '{{website_id}}'"])(
    'preserves following GROUP BY and ORDER BY formatting when adding filters after %j',
    async (where) => {
      const select = 'SELECT browser, COUNT(DISTINCT session_id) AS besokende\nFROM `test-project.umami_views.session`'
      const following = 'GROUP BY\n  browser\nORDER BY\n  besokende DESC;'
      const sql = `${select}${where}\n${following}`
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
      const { result } = renderHook(() => useSqlNextEditor(), {
        wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
      })
      await act(async () => {
        result.current.handleAddDateFilter()
        await Promise.resolve()
      })
      expect(result.current.query).toBe(
        `${select}\nWHERE website_id = '{{website_id}}'\n[[AND {{created_at}}]]\n${following}`,
      )
    },
  )

  it.each([
    ['', '\nGROUP BY language\n'],
    ['\nORDER BY besokende DESC LIMIT 100;', '\nGROUP BY language\nORDER BY besokende DESC LIMIT 100;'],
    ['\nGROUP BY browser\nORDER BY besokende DESC;', '\nGROUP BY browser, language\nORDER BY besokende DESC;'],
  ])('offers a concrete GROUP BY fix while preserving %j', async (suffix, expectedSuffix) => {
    const select =
      "SELECT language, COUNT(DISTINCT session_id) AS besokende\nFROM `test-project.umami_views.session`\nWHERE website_id = 'test-website'"
    const sql = `${select}${suffix}`
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    vi.mocked(estimateQueryCost).mockRejectedValueOnce(
      new Error('SELECT list expression references column language which is neither grouped nor aggregated at [5:8]'),
    )
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.groupByField).toBe('language')
    await act(async () => {
      result.current.handleAddGroupBy()
      await Promise.resolve()
    })
    expect(result.current.query).toBe(`${select}${expectedSuffix}`)
    expect(result.current.error).toBeNull()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it.each(['', '  \n', 'SELECT'])('removes query URL parameters when cleared to %j', async (emptyQuery) => {
    const params = new URLSearchParams({
      sql: 'SELECT 1',
      sqlStorageKey: 'old-sql-prefill',
      websiteId: 'test-website',
      dateRange: 'last_7_days',
    })
    window.history.replaceState({}, '', `/sql?${params}`)

    const { result, unmount } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.query).toBe('SELECT 1')

    await act(async () => {
      result.current.handleQueryChange(emptyQuery)
      await Promise.resolve()
    })

    const remainingParams = new URLSearchParams(window.location.search)
    expect(result.current.query).toBe(emptyQuery)
    expect(remainingParams.has('sql')).toBe(false)
    expect(remainingParams.has('sqlStorageKey')).toBe(false)
    expect(remainingParams.get('websiteId')).toBe('test-website')
    expect(remainingParams.get('dateRange')).toBe('last_7_days')

    unmount()
    const reloaded = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(reloaded.result.current.query).toBe(INITIAL_SQL_QUERY)
    await act(async () => {})
  })
})
