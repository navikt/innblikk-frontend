import { act, renderHook, waitFor } from '@testing-library/react'
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom'
import { estimateQueryCost, executeQueryApi, fetchWebsites } from '../../sql/api/sqlApi'
import { MORE_ROWS, PREVIEW_ROWS, useSqlNextEditor } from './useSqlNextEditor'
import { getInitialSqlQuery } from '../model/schemaAndSnippets'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig'
import { getFromLocalStorage, saveToLocalStorage, SELECTED_WEBSITE_CACHE_KEY } from '../../../shared/lib/localStorage'

vi.mock('../../sql/api/sqlApi', () => ({
  fetchWebsites: vi.fn().mockResolvedValue([]),
  estimateQueryCost: vi.fn(),
  executeQueryApi: vi.fn(),
}))

const TEMPLATED_EVENT_SQL =
  "SELECT event_name FROM `test-project.umami_views.event` WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]"

describe('SQL editor actions', () => {
  it('asks for a website before a template query runs, without sending SQL', async () => {
    const sql = "SELECT browser FROM `test-project.umami_views.session` WHERE website_id = '{{website_id}}'"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(result.current.dryRunError).toBe('Velg en nettside først.')
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.error).toBe('Velg en nettside først.')
    expect(estimateQueryCost).not.toHaveBeenCalled()
    expect(executeQueryApi).not.toHaveBeenCalled()
    expect(result.current.query).toBe(sql)
    act(() => result.current.handleWebsiteIdsChange(['first']))
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(estimateQueryCost).toHaveBeenCalledOnce()
    expect(vi.mocked(estimateQueryCost).mock.calls[0][0]).not.toMatch(/\{\{|\[\[/)
    expect(result.current.dryRunError).toBeNull()
  })

  it('does not treat template fields in SQL comments as missing values', async () => {
    const sql = "SELECT '-- not a comment' AS label -- [[AND {{created_at}}]]\n/* {{website_id}} */"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.error).toBeNull()
    expect(executeQueryApi).toHaveBeenCalledOnce()
    expect(vi.mocked(executeQueryApi).mock.calls[0][0]).toContain("'-- not a comment'")
  })

  it.each(['SELECT browser FROM `test-project.umami_views.session`', 'SELECT 1 LIMIT 20'])(
    'runs SQL without template fields exactly as written: %s',
    async (sql) => {
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
      const { result } = renderHook(() => useSqlNextEditor(), {
        wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
      })
      expect(result.current.hasTemplateFields).toBe(false)
      expect(result.current.explicitLimit).toBe(sql.includes('LIMIT') ? 20 : null)
      expect(await result.current.getExportQuery()).toBe(sql)
      await act(async () => {
        await result.current.validateSQL()
      })
      expect(estimateQueryCost).toHaveBeenLastCalledWith(sql)
      await act(async () => {
        await result.current.executeQuery()
      })
      expect(executeQueryApi).toHaveBeenLastCalledWith(sql, { maxRows: PREVIEW_ROWS })
      expect(result.current.query).toBe(sql)
    },
  )

  it('does not rerun when filters change and the SQL has no template fields', async () => {
    vi.useFakeTimers()
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    const sql = 'SELECT browser FROM `test-project.umami_views.session`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <BrowserRouter>{children}</BrowserRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    act(() => {
      result.current.handleWebsiteIdsChange(['second'])
      result.current.handlePeriodChange('last_28_days')
      result.current.shareQuery()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(executeQueryApi).toHaveBeenCalledExactlyOnceWith(sql, { maxRows: PREVIEW_ROWS })
    expect(new URL(clipboard.writeText.mock.calls[0][0] as string).searchParams.has('automaticFilters')).toBe(false)
  })

  const recentWebsite = {
    id: 'recent-website',
    name: 'Recently added',
    domain: 'a11y-statement-ny.ansatt.nav.no',
    teamId: 'team',
    createdAt: '2026-10-25',
  }

  it('restores the same recent website as traffic analysis without URL parameters', async () => {
    saveToLocalStorage(SELECTED_WEBSITE_CACHE_KEY, recentWebsite)
    vi.mocked(fetchWebsites).mockResolvedValueOnce([recentWebsite])
    window.history.replaceState({}, '', '/sql')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <BrowserRouter>{children}</BrowserRouter>,
    })
    expect(result.current.websiteIds).toEqual([recentWebsite.id])
    expect(result.current.selectedWebsite).toEqual(recentWebsite)
    await waitFor(() => expect(result.current.availableWebsites).toEqual([recentWebsite]))
    expect(estimateQueryCost).not.toHaveBeenCalled()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it.each([
    ['websiteId=explicit-website', ['explicit-website']],
    ['websiteIds=first,second', ['first', 'second']],
    [
      new URLSearchParams({
        sql: "SELECT browser FROM `test-project.umami_views.session` WHERE website_id = '11111111-1111-4111-8111-111111111111'",
      }).toString(),
      ['11111111-1111-4111-8111-111111111111'],
    ],
  ])('prefers explicit website selection over the recent website for %s', async (search, expected) => {
    saveToLocalStorage(SELECTED_WEBSITE_CACHE_KEY, recentWebsite)
    window.history.replaceState({}, '', `/sql?${search}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <BrowserRouter>{children}</BrowserRouter>,
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.websiteIds).toEqual(expected)
  })

  it('restores a website from a domain link and allows clearing it', async () => {
    saveToLocalStorage(SELECTED_WEBSITE_CACHE_KEY, { ...recentWebsite, id: 'old-website', domain: 'other.nav.no' })
    vi.mocked(fetchWebsites).mockResolvedValueOnce([recentWebsite])
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ domain: recentWebsite.domain })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <BrowserRouter>{children}</BrowserRouter>,
    })
    await waitFor(() => expect(result.current.websiteIds).toEqual([recentWebsite.id]))
    expect(result.current.selectedWebsite).toEqual(recentWebsite)
    act(() => result.current.handleWebsiteIdsChange([]))
    expect(result.current.websiteIds).toEqual([])
    expect(new URLSearchParams(window.location.search).has('domain')).toBe(false)
    expect(estimateQueryCost).not.toHaveBeenCalled()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('saves website selection for other pages and removes it when cleared', async () => {
    vi.mocked(fetchWebsites).mockResolvedValueOnce([recentWebsite])
    window.history.replaceState({}, '', '/sql')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <BrowserRouter>{children}</BrowserRouter>,
    })
    await waitFor(() => expect(result.current.availableWebsites).toEqual([recentWebsite]))
    act(() => result.current.handleWebsiteIdsChange([recentWebsite.id]))
    expect(getFromLocalStorage(SELECTED_WEBSITE_CACHE_KEY)).toEqual(recentWebsite)
    act(() => result.current.handleWebsiteIdsChange([]))
    expect(getFromLocalStorage(SELECTED_WEBSITE_CACHE_KEY)).toBeNull()
    expect(result.current.websiteIds).toEqual([])
  })

  it.each([['new-website'], ['new-website', 'second-website'], []])(
    'keeps the router and restored website selection in sync for %j',
    (...ids) => {
      const sql = 'SELECT browser FROM `test-project.umami_views.session`'
      const params = new URLSearchParams({ sql, websiteId: 'old-website', dateRange: 'last_28_days' })
      window.history.replaceState({}, '', `/sql?${params}`)
      const wrapper = ({ children }: { children: React.ReactNode }) => <BrowserRouter>{children}</BrowserRouter>
      const { result, unmount } = renderHook(() => ({ editor: useSqlNextEditor(), location: useLocation() }), {
        wrapper,
      })
      act(() => result.current.editor.handleWebsiteIdsChange(ids))
      const routerParams = new URLSearchParams(result.current.location.search)
      expect(result.current.location.search).toBe(window.location.search)
      expect(routerParams.get('websiteId')).toBe(ids.length === 1 ? ids[0] : null)
      expect(routerParams.get('websiteIds')).toBe(ids.length > 1 ? ids.join(',') : null)
      expect(routerParams.get('sql')).toBe(sql)
      expect(routerParams.get('dateRange')).toBe('last_28_days')
      unmount()
      const restored = renderHook(() => useSqlNextEditor(), { wrapper })
      expect(restored.result.current.websiteIds).toEqual(ids)
      expect(restored.result.current.query).toBe(sql)
      expect(estimateQueryCost).not.toHaveBeenCalled()
      expect(executeQueryApi).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['event_name', '21.5', false],
    ['event_name', '49.99', false],
    ['event_name', '50', true],
    ['*', '4.99', false],
    ['*', '5', false],
    ['*', '5.1', false],
    ['*', '49.99', false],
    ['*', '50', true],
    ['*', '100', true],
  ])('requires confirmation for SELECT %s reading %s GB: %s', async (projection, gb, confirm) => {
    const sql = `SELECT ${projection} FROM \`test-project.umami_views.event\``
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
    vi.mocked(estimateQueryCost).mockResolvedValueOnce({ totalBytesProcessedGB: gb })
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.showConfirmModal).toBe(confirm)
    expect(executeQueryApi).toHaveBeenCalledTimes(confirm ? 0 : 1)
  })

  it('does not repeat a manual run started during the filter debounce', async () => {
    vi.useFakeTimers()
    try {
      const sql = TEMPLATED_EVENT_SQL
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
      const { result } = renderHook(() => useSqlNextEditor(), {
        wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
      })
      await act(async () => {
        await result.current.executeQuery()
      })
      act(() => result.current.handlePeriodChange('last_28_days'))
      await act(async () => {
        await result.current.executeQuery()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(executeQueryApi).toHaveBeenCalledTimes(2)
      expect(estimateQueryCost).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([false, true])(
    'does not run unvalidated SQL on filter changes, with previous results: %s',
    async (previousResults) => {
      vi.useFakeTimers()
      try {
        const sql = TEMPLATED_EVENT_SQL
        window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
        const { result } = renderHook(() => useSqlNextEditor(), {
          wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
        })
        if (previousResults) {
          await act(async () => {
            await result.current.executeQuery()
          })
          act(() => result.current.handleQueryChange('SELECT browser FROM `test-project.umami_views.session`'))
        }
        act(() => result.current.handlePeriodChange('last_28_days'))
        await act(async () => {
          await vi.advanceTimersByTimeAsync(400)
        })
        expect(executeQueryApi).toHaveBeenCalledTimes(previousResults ? 1 : 0)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('combines rapid filter changes and still confirms an expensive refresh', async () => {
    vi.useFakeTimers()
    try {
      const sql = TEMPLATED_EVENT_SQL
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
      const { result } = renderHook(() => useSqlNextEditor(), {
        wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
      })
      await act(async () => {
        await result.current.executeQuery()
      })
      vi.mocked(estimateQueryCost).mockResolvedValueOnce({ totalBytesProcessedGB: '50' })
      act(() => result.current.handlePeriodChange('last_28_days'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      act(() => result.current.handleWebsiteIdsChange(['second']))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(estimateQueryCost).toHaveBeenCalledTimes(2)
      expect(executeQueryApi).toHaveBeenCalledOnce()
      expect(result.current.showConfirmModal).toBe(true)
      const estimatedSql = vi.mocked(estimateQueryCost).mock.calls[1][0]
      expect(estimatedSql).toContain("website_id = 'second'")
      await act(async () => {
        await result.current.handleConfirmQuery()
      })
      expect(executeQueryApi).toHaveBeenLastCalledWith(estimatedSql, { maxRows: PREVIEW_ROWS })
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for a running refresh and then runs the latest filter selection', async () => {
    const sql = TEMPLATED_EVENT_SQL
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    let completeRefresh!: (data: { data: [] }) => void
    vi.mocked(executeQueryApi).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeRefresh = resolve
        }),
    )
    act(() => result.current.handlePeriodChange('last_28_days'))
    await waitFor(() => expect(executeQueryApi).toHaveBeenCalledTimes(2))
    act(() => result.current.handleWebsiteIdsChange(['latest']))
    expect(executeQueryApi).toHaveBeenCalledTimes(2)
    act(() => {
      completeRefresh({ data: [] })
    })
    await waitFor(() => expect(executeQueryApi).toHaveBeenCalledTimes(3))
    expect(vi.mocked(executeQueryApi).mock.calls[2][0]).toContain("website_id = 'latest'")
  })

  it.each(['period', 'websites'])('reruns a successful query with the updated %s filter', async (filter) => {
    const sql =
      "SELECT event_name, COUNT(DISTINCT session_id) AS antall FROM `test-project.umami_views.event` WHERE website_id = '{{website_id}}' [[AND {{created_at}}]] GROUP BY event_name"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    const originalSql = vi.mocked(executeQueryApi).mock.calls[0][0]
    act(() => {
      if (filter === 'period') result.current.handlePeriodChange('last_28_days')
      else result.current.handleWebsiteIdsChange(['second', 'third'])
    })
    await waitFor(() => expect(executeQueryApi).toHaveBeenCalledTimes(2))
    const updatedSql = vi.mocked(executeQueryApi).mock.calls[1][0]
    expect(updatedSql).not.toBe(originalSql)
    if (filter === 'websites') expect(updatedSql).toContain("website_id IN ('second', 'third')")
    expect(estimateQueryCost).toHaveBeenCalledTimes(2)
    expect(result.current.query).toBe(sql)
  })

  it('runs a successfully validated query when its period changes', async () => {
    const sql = TEMPLATED_EVENT_SQL
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(executeQueryApi).not.toHaveBeenCalled()
    act(() => result.current.handlePeriodChange('last_28_days'))
    await waitFor(() => expect(executeQueryApi).toHaveBeenCalledOnce())
    expect(estimateQueryCost).toHaveBeenCalledTimes(2)
  })

  it('restores edits to a query initially loaded through a storage key', () => {
    const key = 'sql-draft-prefill-test'
    window.sessionStorage.setItem(key, 'SELECT 1')
    window.history.replaceState({}, '', `/sql?sqlStorageKey=${key}`)
    const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>
    const first = renderHook(() => useSqlNextEditor(), { wrapper })
    expect(first.result.current.query).toBe('SELECT 1')
    act(() => first.result.current.handleQueryChange('SELECT 42'))
    first.unmount()
    const restored = renderHook(() => useSqlNextEditor(), { wrapper })
    expect(restored.result.current.query).toBe('SELECT 42')
  })

  it('keeps editing functional when draft storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.query).toBe('SELECT 1')
    act(() => result.current.handleQueryChange('SELECT 42'))
    expect(result.current.query).toBe('SELECT 42')
  })

  it.each([false, true])('restores unexecuted edits after remount, with previous URL SQL: %s', (withUrlQuery) => {
    window.history.replaceState({}, '', withUrlQuery ? '/sql?sql=SELECT%201' : '/sql')
    const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>
    const first = renderHook(() => useSqlNextEditor(), { wrapper })
    act(() => first.result.current.handleQueryChange('SELECT browser FROM `test-project.umami_views.session`'))
    first.unmount()
    const restored = renderHook(() => useSqlNextEditor(), { wrapper })
    expect(restored.result.current.query).toBe('SELECT browser FROM `test-project.umami_views.session`')
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('restores the draft when returning to the editor without query parameters', () => {
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>
    const first = renderHook(() => useSqlNextEditor(), { wrapper })
    act(() => first.result.current.handleQueryChange('SELECT 42'))
    first.unmount()
    window.history.replaceState({}, '', '/sql')
    const restored = renderHook(() => useSqlNextEditor(), { wrapper })
    expect(restored.result.current.query).toBe('SELECT 42')
  })

  it('opens a different shared query instead of the previous draft', () => {
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>
    const first = renderHook(() => useSqlNextEditor(), { wrapper })
    act(() => first.result.current.handleQueryChange('SELECT 42'))
    first.unmount()
    window.history.replaceState({}, '', '/sql?sql=SELECT%202')
    const shared = renderHook(() => useSqlNextEditor(), { wrapper })
    expect(shared.result.current.query).toBe('SELECT 2')
  })

  it('exports every selected website while retaining existing dynamic dates', async () => {
    const sql =
      "SELECT event_id FROM `test-project.umami_views.event` WHERE website_id = '{{website_id}}' [[AND {{created_at}} ]]"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteIds: 'first,second' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    const exported = await result.current.getExportQuery()
    expect(exported).toContain("website_id IN ('first', 'second')")
    expect(exported).toContain('[[AND {{created_at}} ]]')
    expect(exported).not.toContain('TIMESTAMP(')
  })

  it.each([
    'SELECT browser FROM `test-project.umami_views.session` WHERE 1 = 1 [[AND {{created_at}} ]]',
    'SELECT browser FROM `test-project.umami_views.session` WHERE browser = {{browser}}',
    "SELECT browser FROM `test-project.umami_views.session` WHERE url_path = [[ {{url_sti}} --]] '/'",
  ])('exports the SQL as written without adding filters: %s', async (sql) => {
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(await result.current.getExportQuery()).toBe(sql)
  })

  it('clears a previous validation error when execution succeeds', async () => {
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    vi.mocked(estimateQueryCost).mockRejectedValueOnce(new Error('Temporary validation failure'))
    await act(async () => {
      await result.current.validateSQL()
    })
    expect(result.current.dryRunError).toBe('Temporary validation failure')
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.dryRunError).toBeNull()
    expect(result.current.result).toEqual({ data: [] })
  })

  it('confirms exactly the estimated SQL despite edits while the estimate is pending', async () => {
    const sql =
      "SELECT event_id FROM `test-project.umami_views.event` WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'first' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    let resolveEstimate!: (value: { totalBytesProcessedGB: string }) => void
    vi.mocked(estimateQueryCost).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveEstimate = resolve
        }),
    )
    let executing!: Promise<void>
    act(() => {
      executing = result.current.executeQuery()
    })
    await waitFor(() => expect(estimateQueryCost).toHaveBeenCalledOnce())
    const estimatedSql = vi.mocked(estimateQueryCost).mock.calls[0][0]
    act(() => {
      result.current.handleQueryChange('SELECT COUNT(*) FROM `test-project.umami_views.event`')
    })
    act(() => {
      result.current.handleWebsiteIdsChange(['second'])
      result.current.handlePeriodChange('last_28_days')
    })
    expect(result.current.query).toBe('SELECT COUNT(*) FROM `test-project.umami_views.event`')
    await act(async () => {
      resolveEstimate({ totalBytesProcessedGB: '50' })
      await executing
    })
    expect(result.current.showConfirmModal).toBe(true)
    expect(executeQueryApi).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.handleConfirmQuery()
    })
    expect(executeQueryApi).toHaveBeenCalledExactlyOnceWith(estimatedSql, { maxRows: PREVIEW_ROWS })
    expect(estimatedSql).toContain("website_id = 'first'")
    expect(estimatedSql).not.toContain('LIMIT')
  })

  it('ignores a late validation failure after a newer successful execution', async () => {
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    let rejectValidation!: (reason: Error) => void
    vi.mocked(estimateQueryCost).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectValidation = reject
        }),
    )
    let validating!: Promise<void>
    act(() => {
      validating = result.current.validateSQL()
    })
    await waitFor(() => expect(estimateQueryCost).toHaveBeenCalledOnce())
    await act(async () => {
      await result.current.executeQuery()
    })
    await act(async () => {
      rejectValidation(new Error('Late validation failure'))
      await validating
    })
    expect(result.current.dryRunError).toBeNull()
    expect(result.current.result).toEqual({ data: [] })
  })

  it('exports dynamic dates after executing a join with concrete dates', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    const sql =
      "SELECT COUNT(DISTINCT NULLIF(s.distinct_id, '')) AS unike_besokende FROM `test-project.umami_views.session` s LEFT JOIN `test-project.umami_views.event` e ON s.session_id = e.session_id WHERE s.website_id = '{{website_id}}' [[AND {{created_at}}]] AND e.url_path = '/pensjon'"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.lastProcessedSql).toContain('TIMESTAMP(')
    const exported = await result.current.getExportQuery()
    expect(exported.match(/\[\[AND \{\{created_at\}\}\s*\]\]/g)).toHaveLength(1)
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

  it('combines selected websites without changing editor SQL and shares every selection', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    const sql =
      "SELECT browser, COUNT(*) AS antall FROM `test-project.umami_views.session` WHERE website_id = '{{website_id}}' GROUP BY browser"
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <BrowserRouter>{children}</BrowserRouter>,
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
    expect(executeQueryApi).toHaveBeenLastCalledWith(expect.stringContaining("website_id IN ('first', 'second')"), {
      maxRows: PREVIEW_ROWS,
    })
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

  beforeEach(() => {
    localStorage.removeItem(SELECTED_WEBSITE_CACHE_KEY)
    window.sessionStorage.removeItem('innblikk-sql-editor-draft')
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.mocked(estimateQueryCost).mockReset().mockResolvedValue({ totalBytesProcessedGB: '0' })
    vi.mocked(executeQueryApi).mockReset().mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    localStorage.removeItem(SELECTED_WEBSITE_CACHE_KEY)
    window.sessionStorage.removeItem('innblikk-sql-editor-draft')
    vi.useRealTimers()
    window.history.replaceState({}, '', '/')
    vi.restoreAllMocks()
  })

  it('starts a new query with website and period already in place, without estimating or running it', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/sql')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(result.current.query).toBe(getInitialSqlQuery(getGcpProjectId()))
    expect(result.current.query).toContain("website_id = '{{website_id}}'")
    expect(result.current.query).toContain('[[AND {{created_at}}]]')
    expect(result.current.hasWebsiteIdPlaceholder).toBe(true)
    expect(result.current.hasPeriodPlaceholder).toBe(true)
    expect(result.current.incompleteQueryMessage).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(estimateQueryCost).not.toHaveBeenCalled()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('does not run the starting query until fields are chosen and says what is missing', async () => {
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ websiteId: 'first' })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.isSelectEmpty).toBe(true)
    expect(result.current.incompleteQueryMessage).toBe('Velg hvilke felt du vil hente.')
    expect(executeQueryApi).not.toHaveBeenCalled()
    act(() => result.current.handleQueryChange(result.current.query.replace('SELECT', 'SELECT browser')))
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenCalledOnce()
    expect(vi.mocked(executeQueryApi).mock.calls[0][0]).toContain("website_id = 'first'")
  })

  it('asks the server for a preview of the rows and never changes the SQL', async () => {
    const sql = 'SELECT browser FROM `test-project.umami_views.session`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenCalledExactlyOnceWith(sql, { maxRows: PREVIEW_ROWS })
    expect(await result.current.getExportQuery()).toBe(sql)
    expect(vi.mocked(executeQueryApi).mock.calls[0][0]).not.toMatch(/\bLIMIT\b/i)
  })

  it('offers more rows only when the result was cut, and reruns the same SQL once without a new estimate', async () => {
    const sql = 'SELECT browser FROM `test-project.umami_views.session`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    vi.mocked(executeQueryApi).mockResolvedValueOnce({ data: [{ browser: 'a' }], totalRows: 25000, truncated: true })
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.canLoadMoreRows).toBe(true)
    expect(estimateQueryCost).toHaveBeenCalledOnce()
    vi.mocked(executeQueryApi).mockResolvedValueOnce({ data: [{ browser: 'a' }], totalRows: 25000, truncated: true })
    await act(async () => {
      await result.current.loadMoreRows()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith(sql, { maxRows: MORE_ROWS })
    expect(estimateQueryCost).toHaveBeenCalledOnce()
    expect(result.current.canLoadMoreRows).toBe(false)
    expect(result.current.query).toBe(sql)
  })

  it('does not offer more rows when the whole result was returned', async () => {
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql: 'SELECT 1' })}`)
    vi.mocked(executeQueryApi).mockResolvedValueOnce({ data: [{ n: 1 }], totalRows: 1, truncated: false })
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(result.current.canLoadMoreRows).toBe(false)
  })

  it('starts the next run from the preview size again after loading more', async () => {
    const sql = 'SELECT browser FROM `test-project.umami_views.session`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    vi.mocked(executeQueryApi).mockResolvedValue({ data: [{ browser: 'a' }], totalRows: 25000, truncated: true })
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
      await result.current.loadMoreRows()
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith(sql, { maxRows: PREVIEW_ROWS })
    expect(result.current.canLoadMoreRows).toBe(true)
  })

  it('keeps the starting query when a website is selected before building the query', async () => {
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
    expect(result.current.query).toBe(getInitialSqlQuery(getGcpProjectId()))
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

  it('starts with a query that Formater would leave exactly as it is', () => {
    window.history.replaceState({}, '', '/sql')
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    const start = result.current.query
    act(() => {
      result.current.formatSQL()
    })
    expect(result.current.query).toBe(start)
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

  it('checks SQL only on request and runs it exactly as written', async () => {
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
    expect(executeQueryApi).toHaveBeenLastCalledWith('SELECT 1', { maxRows: PREVIEW_ROWS })
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
    expect(estimateQueryCost).toHaveBeenLastCalledWith(sql)
  })

  it('fills template fields only in submitted SQL, not the editor text', async () => {
    const sql =
      "SELECT browser, COUNT(DISTINCT session_id) AS besokende FROM `test-project.umami_views.session` WHERE website_id = '{{website_id}}' [[AND {{created_at}}]] GROUP BY browser"
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
    expect(executeQueryApi).toHaveBeenLastCalledWith(expect.stringContaining('created_at BETWEEN'), {
      maxRows: PREVIEW_ROWS,
    })
    expect(result.current.lastProcessedSql).not.toMatch(/\bLIMIT\b/)
    expect(result.current.query).toBe(sql)
  })

  it('does not add website filters to SQL without template fields when the website changes', async () => {
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
    expect(executeQueryApi).toHaveBeenLastCalledWith(sql, { maxRows: PREVIEW_ROWS })
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
    ['SELECT 1', null],
    ['SELECT 1 LIMIT 20', 20],
    ['SELECT 1 LIMIT 20; -- rows', 20],
    ['SELECT 1 LIMIT 20 /* rows */', 20],
    ['SELECT 1 LIMIT 20 OFFSET 5;', 20],
    ["SELECT 'LIMIT 20' AS label; -- keep this comment", null],
  ])('never adds a row limit of its own to %s', async (sql, expectedLimit) => {
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql })}`)
    const { result } = renderHook(() => useSqlNextEditor(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    await act(async () => {
      await result.current.executeQuery()
    })
    expect(executeQueryApi).toHaveBeenLastCalledWith(sql, { maxRows: PREVIEW_ROWS })
    expect(result.current.explicitLimit).toBe(expectedLimit)
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
    expect(reloaded.result.current.query).toBe(getInitialSqlQuery(getGcpProjectId()))
    await act(async () => {})
  })
})
