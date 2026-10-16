import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarketingAnalysis } from '../../traffic/hooks/useMarketingAnalysis'
import { fetchMarketingStats } from '../../traffic/api/trafficApi'
import { useFunnel } from '../../funnel/hooks/useFunnel'
import { fetchFunnelData } from '../../funnel/api/funnelApi'
import { useGoalCompletion } from '../../goalcompletion/hooks/useGoalCompletion'
import { fetchGoalCompletionData } from '../../goalcompletion/api/goalCompletionApi'

vi.mock('../../../shared/hooks/useSiteimproveSupport.ts', () => ({
  useCookieSupport: () => false,
  useCookieStartDate: () => null,
  useMarketingSupport: () => true,
}))
vi.mock('../../traffic/api/trafficApi', () => ({ fetchMarketingStats: vi.fn() }))
vi.mock('../../funnel/api/funnelApi', () => ({
  fetchFunnelData: vi.fn(),
  fetchTimingData: vi.fn(),
  fetchWebsiteEvents: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../../goalcompletion/api/goalCompletionApi', () => ({ fetchGoalCompletionData: vi.fn() }))

const website = { id: 'site-1', name: 'Nav', domain: 'nav.no', teamId: 'team-1', createdAt: '2023-01-01T00:00:00Z' }
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>
const flushRefresh = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
}

describe('automatic analysis reports', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(fetchMarketingStats).mockResolvedValue({ data: {} })
    vi.mocked(fetchFunnelData).mockResolvedValue({
      data: [],
      sql: null,
      queryStats: null,
      shareParams: null,
      error: null,
    })
    vi.mocked(fetchGoalCompletionData).mockResolvedValue({
      data: [],
      summary: { totalStarters: 0, totalCompleted: 0, sameDayCompleted: 0, nonCompleted: 0 },
      queryStats: null,
      error: null,
    })
  })
  afterEach(() => vi.useRealTimers())

  it('refreshes campaigns after grouped filter changes and website changes', async () => {
    const { result } = renderHook(useMarketingAnalysis, { wrapper })
    act(() => result.current.setSelectedWebsite(website))
    await flushRefresh()
    expect(fetchMarketingStats).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.setUrlPaths(['/arbeid'])
      result.current.setMetricType('pageviews')
      result.current.setPeriod('last_7_days')
    })
    await flushRefresh()
    expect(fetchMarketingStats).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetchMarketingStats).mock.lastCall?.[3]).toBe('/arbeid')
    act(() => result.current.setSelectedWebsite({ ...website, id: 'site-2' }))
    await flushRefresh()
    expect(vi.mocked(fetchMarketingStats).mock.lastCall?.[0]).toBe('site-2')
  })

  it('queues the latest campaign filters while an earlier request is running', async () => {
    let resolveRequest!: (value: Awaited<ReturnType<typeof fetchMarketingStats>>) => void
    const pending = new Promise<Awaited<ReturnType<typeof fetchMarketingStats>>>((resolve) => {
      resolveRequest = resolve
    })
    vi.mocked(fetchMarketingStats).mockReturnValueOnce(pending)
    const { result } = renderHook(useMarketingAnalysis, { wrapper })
    act(() => result.current.setSelectedWebsite(website))
    await flushRefresh()
    act(() => result.current.setUrlPaths(['/latest']))
    await flushRefresh()
    expect(fetchMarketingStats).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveRequest({ data: {} })
      await pending
    })
    await flushRefresh()
    expect(fetchMarketingStats).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetchMarketingStats).mock.lastCall?.[3]).toBe('/latest')
  })

  it('keeps completed campaign data while custom dates are invalid', async () => {
    const { result } = renderHook(useMarketingAnalysis, { wrapper })
    act(() => result.current.setSelectedWebsite(website))
    await flushRefresh()
    for (const [startDate, endDate] of [
      [undefined, undefined],
      [new Date('2026-10-02'), undefined],
      [new Date('invalid'), new Date('2026-10-03')],
      [new Date('2026-10-04'), new Date('2026-10-03')],
    ]) {
      act(() => {
        result.current.setPeriod('custom')
        result.current.setCustomStartDate(startDate)
        result.current.setCustomEndDate(endDate)
      })
      await flushRefresh()
      expect(fetchMarketingStats).toHaveBeenCalledTimes(1)
      expect(result.current.error).toBeNull()
    }
    act(() => result.current.setCustomStartDate(new Date('2026-10-02')))
    await flushRefresh()
    expect(fetchMarketingStats).toHaveBeenCalledTimes(2)
  })

  it('waits for every funnel step and event filter to be complete', async () => {
    const { result } = renderHook(useFunnel, { wrapper })
    act(() => {
      result.current.setSelectedWebsite(website)
      result.current.setSteps([
        { type: 'url', value: '/start' },
        { type: 'event', value: '' },
      ])
    })
    await flushRefresh()
    expect(fetchFunnelData).not.toHaveBeenCalled()
    act(() =>
      result.current.setSteps([
        { type: 'url', value: '/start' },
        { type: 'event', value: 'done' },
      ]),
    )
    await flushRefresh()
    expect(fetchFunnelData).toHaveBeenCalledTimes(1)
    act(() =>
      result.current.setSteps([
        { type: 'url', value: '/start' },
        { type: 'event', value: 'done', params: [{ key: 'type', operator: 'equals', value: '' }] },
      ]),
    )
    await flushRefresh()
    expect(fetchFunnelData).toHaveBeenCalledTimes(1)
  })

  it('updates goal completion as soon as start and goal are complete', async () => {
    const { result } = renderHook(useGoalCompletion, { wrapper })
    act(() => {
      result.current.setSelectedWebsite(website)
      result.current.setStartStep({ type: 'url', value: '/start' })
      result.current.setGoalStep({ type: 'url', value: '' })
    })
    await flushRefresh()
    expect(fetchGoalCompletionData).not.toHaveBeenCalled()
    act(() => result.current.setGoalStep({ type: 'url', value: '/done' }))
    await flushRefresh()
    expect(fetchGoalCompletionData).toHaveBeenCalledTimes(1)
    act(() => result.current.setPeriod('current_month'))
    await flushRefresh()
    expect(fetchGoalCompletionData).toHaveBeenCalledTimes(2)
  })
})
