import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preserveSharedAnalysisParams } from '../../../shared/lib/analysisNavigation.ts'
import { fetchMarketingStats } from '../api/trafficApi'
import { useMarketingAnalysis } from './useMarketingAnalysis'

vi.mock('../../../shared/hooks/useSiteimproveSupport.ts', () => ({
  useCookieSupport: () => false,
  useCookieStartDate: () => null,
  useMarketingSupport: () => true,
}))
vi.mock('../../analysis/hooks/useAutoRefresh', () => ({ useAutoRefresh: () => {} }))
vi.mock('../api/trafficApi', () => ({ fetchMarketingStats: vi.fn(() => Promise.resolve({ data: {} })) }))

const wrapper = ({ children }: { children: ReactNode }) => <BrowserRouter>{children}</BrowserRouter>
const website = { id: 'site-1', name: 'Nav', domain: 'nav.no', teamId: 'team-1', createdAt: '2024-01-01' }

describe('campaign legacy path compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', '/markedsforing?websiteId=site-1&pagePath=%2Fa&other=keep#report')
  })

  it('reads legacy paths but removes both aliases when the filter is cleared', async () => {
    const { result, unmount } = renderHook(() => useMarketingAnalysis(), { wrapper })
    expect(result.current.urlPaths).toEqual(['/a'])
    act(() => {
      result.current.setSelectedWebsite(website)
      result.current.setUrlPaths([])
    })
    await act(async () => {
      await result.current.fetchData()
    })
    const params = new URLSearchParams(window.location.search)
    expect(params.has('pagePath')).toBe(false)
    expect(params.has('urlPath')).toBe(false)
    expect(params.has('pathOperator')).toBe(false)
    expect(params.get('other')).toBe('keep')
    expect(window.location.hash).toBe('#report')
    expect(preserveSharedAnalysisParams('/trafikkanalyse', window.location.search)).not.toContain('pagePath')
    expect(fetchMarketingStats).toHaveBeenCalledWith(
      website.id,
      expect.any(Date),
      expect.any(Date),
      '',
      'equals',
      expect.any(String),
      '',
      '',
    )
    unmount()
    const reloaded = renderHook(() => useMarketingAnalysis(), { wrapper })
    expect(reloaded.result.current.urlPaths).toEqual([])
  })

  it('publishes canonical paths without retaining the old selection', async () => {
    const { result } = renderHook(() => useMarketingAnalysis(), { wrapper })
    act(() => {
      result.current.setSelectedWebsite(website)
      result.current.setUrlPaths(['/b'])
    })
    await act(async () => {
      await result.current.fetchData()
    })
    const params = new URLSearchParams(window.location.search)
    expect(params.getAll('urlPath')).toEqual(['/b'])
    expect(params.has('pagePath')).toBe(false)
    expect(params.get('pathOperator')).toBe('equals')
  })
})
