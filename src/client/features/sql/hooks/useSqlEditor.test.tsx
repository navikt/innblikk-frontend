import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils.ts'
import { useSqlEditor } from './useSqlEditor.ts'

vi.mock('../api/sqlApi', () => ({
  fetchWebsites: vi.fn(() => Promise.resolve([])),
  estimateQueryCost: vi.fn(),
  executeQueryApi: vi.fn(),
}))

const wrapper = ({ children }: { children: ReactNode }) => <BrowserRouter>{children}</BrowserRouter>
const draft = 'SELECT 123 AS unexecuted_edit'

describe('legacy SQL editor URL synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['', '?sql=SELECT+1', '?sqlStorageKey=sql-editor-filter-regression'])(
    'keeps edits when period and custom dates change after entry through %s',
    async (search) => {
      localStorage.setItem('sql-editor-filter-regression', 'SELECT 2')
      window.history.replaceState({}, '', `/sql-old${search}`)
      const { result } = renderHook(() => useSqlEditor(), { wrapper })
      await act(async () => {
        await Promise.resolve()
      })
      act(() => result.current.handleQueryChange(draft))
      act(() => result.current.handlePeriodChange('last_28_days'))
      expect(result.current.query).toBe(draft)
      expect(result.current.period).toBe('last_28_days')
      expect(new URLSearchParams(window.location.search).get('dateRange')).toBe('last_28_days')

      const start = new Date('2026-10-01T00:00:00.000Z')
      const end = new Date('2026-10-10T00:00:00.000Z')
      act(() => result.current.handleStartDateChange(start))
      expect(result.current.query).toBe(draft)
      act(() => result.current.handleEndDateChange(end))
      expect(result.current.query).toBe(draft)
      const expectedRange = getDateRangeFromPeriod('custom', start, end)!
      expect(result.current.dateRange).toEqual({ from: expectedRange.startDate, to: expectedRange.endDate })
      expect(new URLSearchParams(window.location.search).get('customEndDate')).toBe(end.toISOString())
    },
  )

  it('restores a different SQL document on same-route navigation without coupling it to filter changes', async () => {
    window.history.replaceState({}, '', '/sql-old?sql=SELECT+1')
    const { result } = renderHook(() => ({ editor: useSqlEditor(), navigate: useNavigate() }), { wrapper })
    act(() => result.current.editor.handleQueryChange(draft))
    await act(async () => {
      await result.current.navigate('/sql-old?sql=SELECT+1&urlPath=%2Fwork')
    })
    expect(result.current.editor.query).toBe(draft)
    expect(result.current.editor.urlPath).toBe('/work')
    await act(async () => {
      await result.current.navigate('/sql-old?sql=SELECT+999&urlPath=%2Fwork')
    })
    expect(result.current.editor.query).toBe('SELECT 999')
    await act(async () => {
      await result.current.navigate(-1)
    })
    await waitFor(() => expect(result.current.editor.query).toBe('SELECT 1'))
  })
})
