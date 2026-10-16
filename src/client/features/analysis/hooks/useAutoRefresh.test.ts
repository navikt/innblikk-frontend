import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoRefresh } from './useAutoRefresh'

describe('useAutoRefresh', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces changes and does not repeat completed or failed requests', () => {
    const refresh = vi.fn()
    const { rerender } = renderHook(({ key, loading }) => useAutoRefresh(key, true, loading, refresh), {
      initialProps: { key: 'first', loading: false },
    })
    rerender({ key: 'latest', loading: false })
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(refresh).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    rerender({ key: 'latest', loading: true })
    rerender({ key: 'latest', loading: false })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('waits for valid filters and a running request, then uses the latest callback', () => {
    const refresh = vi.fn()
    const latest = vi.fn()
    const { rerender } = renderHook(
      ({ enabled, loading, callback }) => useAutoRefresh('filters', enabled, loading, callback),
      { initialProps: { enabled: false, loading: false, callback: refresh } },
    )
    act(() => {
      vi.advanceTimersByTime(300)
    })
    rerender({ enabled: true, loading: true, callback: refresh })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(refresh).not.toHaveBeenCalled()
    rerender({ enabled: true, loading: false, callback: latest })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(latest).toHaveBeenCalledTimes(1)
  })

  it('cancels pending refreshes on unmount', () => {
    const refresh = vi.fn()
    const { unmount } = renderHook(() => useAutoRefresh('filters', true, false, refresh))
    unmount()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})
