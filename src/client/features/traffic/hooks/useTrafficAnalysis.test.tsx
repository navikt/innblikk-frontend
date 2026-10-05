import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
})

const { fetchTrafficSeriesMock, buildSeriesUrlMock } = vi.hoisted(() => ({
  fetchTrafficSeriesMock: vi.fn(() => Promise.resolve({ data: [] })),
  buildSeriesUrlMock: vi.fn(
    (
      _websiteId: string,
      _start: Date,
      _end: Date,
      _operator: string,
      _metric: string,
      _interval: string,
      _path: string,
      _countBy: unknown,
      sidegroup?: { id: string } | null,
    ) => `/test-series${sidegroup ? `?sidegroupId=${sidegroup.id}` : ''}`,
  ),
}))

vi.mock('../../../shared/hooks/useSiteimproveSupport.ts', () => ({
  useCookieSupport: () => false,
  useCookieStartDate: () => null,
}))

vi.mock('../../sidegroups/hooks/useSidegroupsForWebsite.ts', () => ({
  useSidegroupsForWebsite: (websiteId?: string) => ({
    sidegroups: websiteId ? [{ id: '42', name: 'Jobber', websiteId, include: ['/jobs'] }] : [],
    loading: false,
  }),
}))

vi.mock('../api/trafficApi', () => ({
  buildSeriesUrl: buildSeriesUrlMock,
  fetchTrafficSeries: fetchTrafficSeriesMock,
  fetchPreviousTrafficSeries: vi.fn(() => Promise.resolve({ data: [] })),
  fetchTrafficBreakdown: vi.fn(() => Promise.resolve({ data: [] })),
  fetchPageMetrics: vi.fn(() => Promise.resolve({ data: [] })),
  fetchExternalReferrers: vi.fn(() => Promise.resolve({ data: [] })),
}))

import { useTrafficAnalysis } from './useTrafficAnalysis.ts'

const website = { id: 'site-1', name: 'Nav', domain: 'nav.no', teamId: 'team-1', createdAt: '2023-01-01T00:00:00Z' }
const sidegroup = { id: '42', name: 'Jobber', websiteId: 'site-1', include: ['/jobs'] }

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/trafikkanalyse']}>{children}</MemoryRouter>
)

describe('useTrafficAnalysis sidegroup filter', () => {
  beforeEach(() => {
    fetchTrafficSeriesMock.mockClear()
    buildSeriesUrlMock.mockClear()
    window.history.replaceState({}, '', '/trafikkanalyse')
  })

  it('restores a sidegroup from the URL before the first traffic request', async () => {
    window.history.replaceState({}, '', '/trafikkanalyse?sidegroupId=42')
    const sidegroupWrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/trafikkanalyse?sidegroupId=42']}>{children}</MemoryRouter>
    )
    const { result } = renderHook(() => useTrafficAnalysis(), { wrapper: sidegroupWrapper })

    act(() => result.current.setSelectedWebsite(website))

    await waitFor(() => expect(fetchTrafficSeriesMock).toHaveBeenCalled())
    expect(buildSeriesUrlMock).toHaveBeenCalledWith(
      website.id,
      expect.any(Date),
      expect.any(Date),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.anything(),
      sidegroup,
    )
    expect(window.location.search).toContain('sidegroupId=42')
  })

  it('adds the selected sidegroup to the share URL and clears it on website change', async () => {
    const { result } = renderHook(() => useTrafficAnalysis(), { wrapper })

    act(() => result.current.setSelectedWebsite(website))
    await waitFor(() => expect(fetchTrafficSeriesMock).toHaveBeenCalled())

    act(() => result.current.setSidegroup(sidegroup))
    await act(async () => result.current.fetchSeriesData())

    expect(window.location.search).toContain('sidegroupId=42')

    act(() => result.current.setSelectedWebsite({ ...website, id: 'site-2' }))
    expect(result.current.sidegroup).toBeNull()
  })
})
