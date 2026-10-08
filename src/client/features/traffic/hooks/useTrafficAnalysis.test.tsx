import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
})

const { fetchTrafficSeriesMock, buildSeriesUrlMock, useSidegroupsMock } = vi.hoisted(() => ({
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
  useSidegroupsMock: vi.fn((websiteId?: string) => ({
    sidegroups: websiteId ? [{ id: '42', name: 'Jobber', websiteId, include: ['/jobs'] }] : [],
    loading: false,
    error: false,
  })),
}))

vi.mock('../../../shared/hooks/useSiteimproveSupport.ts', () => ({
  useCookieSupport: () => false,
  useCookieStartDate: () => null,
}))

vi.mock('../../sidegroups/hooks/useSidegroupsForWebsite.ts', () => ({
  useSidegroupsForWebsite: useSidegroupsMock,
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
    useSidegroupsMock.mockImplementation((websiteId?: string) => ({
      sidegroups: websiteId ? [{ id: '42', name: 'Jobber', websiteId, include: ['/jobs'] }] : [],
      loading: false,
      error: false,
    }))
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
    expect(result.current.pathOperator).toBe('sidegroup')
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
    expect(new URLSearchParams(window.location.search).get('pathOperator')).toBe('sidegroup')
  })

  it('does not fetch whole-site data when the shared sidegroup cannot be resolved', async () => {
    useSidegroupsMock.mockImplementation(() => ({ sidegroups: [], loading: false, error: true }))
    window.history.replaceState({}, '', '/trafikkanalyse?sidegroupId=42')
    const sidegroupWrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/trafikkanalyse?sidegroupId=42']}>{children}</MemoryRouter>
    )
    const { result } = renderHook(() => useTrafficAnalysis(), { wrapper: sidegroupWrapper })

    act(() => result.current.setSelectedWebsite(website))

    await waitFor(() => expect(result.current.error).toContain('Kunne ikke laste sidegruppen'))
    expect(fetchTrafficSeriesMock).not.toHaveBeenCalled()
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
