import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChartConfig } from './useChartConfig.ts'

describe('builder edition draft isolation', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/grafbygger')
  })

  it('does not read or overwrite the EOL builder draft', async () => {
    const savedFilters = JSON.stringify([{ column: 'browser', operator: '=', value: 'Firefox' }])
    localStorage.setItem('grafbygger:filters:v2', savedFilters)
    const { result } = renderHook(() => useChartConfig('next'), { wrapper: MemoryRouter })
    expect(result.current.filters).toEqual([])
    act(() => result.current.setFilters([{ column: 'device', operator: '=', value: 'mobile' }]))
    await waitFor(() => expect(localStorage.getItem('grafbygger-next:filters:v2')).toContain('mobile'))
    expect(localStorage.getItem('grafbygger:filters:v2')).toBe(savedFilters)
  })

  it('restores the beta draft independently', () => {
    localStorage.setItem(
      'grafbygger-next:filters:v2',
      JSON.stringify([{ column: 'device', value: 'mobile', operator: '=' }]),
    )
    const { result } = renderHook(() => useChartConfig('next'), { wrapper: MemoryRouter })
    expect(result.current.filters).toEqual([{ column: 'device', value: 'mobile', operator: '=' }])
  })

  it('keeps alfa config, filters and period separate from the beta draft, including resets', async () => {
    const betaDraft = {
      config: JSON.stringify({ website: null, metrics: [], groupByFields: [], limit: 42 }),
      filters: JSON.stringify([{ column: 'browser', operator: '=', value: 'Firefox' }]),
      dateRangeInDays: '30',
    }
    for (const [field, value] of Object.entries(betaDraft)) {
      localStorage.setItem(`grafbygger-next:${field}:v2`, value)
    }
    const { result, unmount } = renderHook(() => useChartConfig('next', 'grafbygger-alfa'), {
      wrapper: MemoryRouter,
    })
    expect(result.current.filters).toEqual([])
    expect(result.current.config.limit).toBe(1000)
    expect(result.current.dateRangeInDays).toBe(7)
    act(() => {
      result.current.setFilters([{ column: 'device', operator: '=', value: 'mobile' }])
      result.current.setConfig((config) => ({ ...config, limit: 123 }))
      result.current.setDateRangeInDays(14)
    })
    await waitFor(() => {
      expect(localStorage.getItem('grafbygger-alfa:filters:v2')).toContain('mobile')
      expect(localStorage.getItem('grafbygger-alfa:config:v2')).toContain('"limit":123')
      expect(localStorage.getItem('grafbygger-alfa:dateRangeInDays:v2')).toBe('14')
    })
    unmount()
    const restored = renderHook(() => useChartConfig('next', 'grafbygger-alfa'), { wrapper: MemoryRouter })
    expect(restored.result.current.filters[0].value).toBe('mobile')
    expect(restored.result.current.config.limit).toBe(123)
    expect(restored.result.current.dateRangeInDays).toBe(14)
    act(() => restored.result.current.resetAll())
    expect(localStorage.getItem('grafbygger-alfa:filters:v2')).toBeNull()
    expect(localStorage.getItem('grafbygger-alfa:dateRangeInDays:v2')).toBeNull()
    for (const [field, value] of Object.entries(betaDraft)) {
      expect(localStorage.getItem(`grafbygger-next:${field}:v2`)).toBe(value)
    }
  })

  it.each(['current', 'next'] as const)('handles saved ratio mode in the %s edition', async (edition) => {
    const key = edition === 'next' ? 'grafbygger-next:config:v2' : 'grafbygger:config:v2'
    localStorage.setItem(
      key,
      JSON.stringify({
        website: null,
        metrics: [],
        groupByFields: [],
        cohortIds: ['1', '2'],
        segmentRatioMode: true,
      }),
    )
    const { result } = renderHook(() => useChartConfig(edition), { wrapper: MemoryRouter })
    expect(result.current.config.segmentRatioMode).toBe(edition === 'current')
    expect(result.current.config.cohortIds).toEqual(['1', '2'])
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!).segmentRatioMode).toBe(edition === 'current'))
  })

  it('disables ratio mode from a beta preload link', () => {
    const config = encodeURIComponent(JSON.stringify({ segmentRatioMode: true, cohortIds: ['1', '2'] }))
    const { result } = renderHook(() => useChartConfig('next'), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={[`/grafbygger?config=${config}`]}>{children}</MemoryRouter>
      ),
    })
    expect(result.current.config.segmentRatioMode).toBe(false)
    expect(result.current.config.cohortIds).toEqual(['1', '2'])
  })
})
