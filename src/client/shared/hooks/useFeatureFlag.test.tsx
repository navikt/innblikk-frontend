import { act, renderHook, waitFor } from '@testing-library/react'
import { useFeatureFlag, useFeatureFlags } from './useFeatureFlag.ts'
import { loadFeatureFlagsFromBackend, setFeatureFlag, type FeatureFlags } from '../lib/featureFlags.ts'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useFeatureFlag', () => {
  it('reads defaults and persisted values', () => {
    localStorage.setItem('innblikk_feature_flags', JSON.stringify({ grafbygger_always_show_sql: true }))
    const { result } = renderHook(() => ({
      sql: useFeatureFlag('grafbygger_always_show_sql'),
      selector: useFeatureFlag('grafbygger_custom_filter_selector'),
    }))
    expect(result.current).toEqual({ sql: true, selector: false })
  })

  it('updates all subscribers when a flag is changed in this tab', () => {
    const first = renderHook(() => useFeatureFlag('grafbygger_always_show_sql'))
    const second = renderHook(() => useFeatureFlag('grafbygger_always_show_sql'))
    act(() => setFeatureFlag('grafbygger_always_show_sql', true))
    expect(first.result.current).toBe(true)
    expect(second.result.current).toBe(true)
    act(() => setFeatureFlag('grafbygger_always_show_sql', false))
    expect(first.result.current).toBe(false)
    expect(second.result.current).toBe(false)
  })

  it('reads the new flag immediately when the requested key changes', () => {
    localStorage.setItem('innblikk_feature_flags', JSON.stringify({ copilot_show_technical_details: true }))
    const { result, rerender } = renderHook(({ flag }: { flag: keyof FeatureFlags }) => useFeatureFlag(flag), {
      initialProps: { flag: 'grafbygger_always_show_sql' },
    })
    expect(result.current).toBe(false)
    rerender({ flag: 'copilot_show_technical_details' })
    expect(result.current).toBe(true)
    act(() => setFeatureFlag('grafbygger_always_show_sql', true))
    act(() => setFeatureFlag('copilot_show_technical_details', false))
    expect(result.current).toBe(false)
  })

  it('does not re-render when only an unrelated flag changes', () => {
    const render = vi.fn(() => useFeatureFlag('grafbygger_always_show_sql'))
    renderHook(render)
    const initialRenderCount = render.mock.calls.length
    act(() => setFeatureFlag('copilot_show_technical_details', true))
    expect(render).toHaveBeenCalledTimes(initialRenderCount)
  })
})

describe('useFeatureFlags', () => {
  it('returns a stable object until flag values change', () => {
    const { result, rerender } = renderHook(useFeatureFlags)
    const initial = result.current
    rerender()
    expect(result.current).toBe(initial)
    act(() => setFeatureFlag('grafbygger_always_show_sql', false))
    expect(result.current).toBe(initial)
    act(() => setFeatureFlag('grafbygger_always_show_sql', true))
    expect(result.current).not.toBe(initial)
    expect(result.current).toEqual({ ...initial, grafbygger_always_show_sql: true })
  })
})

describe('shared feature flag subscriptions', () => {
  it('updates both hooks after cross-tab changes and storage clearing', () => {
    const { result } = renderHook(() => ({
      flag: useFeatureFlag('grafbygger_always_show_sql'),
      flags: useFeatureFlags(),
    }))
    act(() => {
      localStorage.setItem('innblikk_feature_flags', JSON.stringify({ grafbygger_always_show_sql: true }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'innblikk_feature_flags' }))
    })
    expect(result.current.flag).toBe(true)
    expect(result.current.flags.grafbygger_always_show_sql).toBe(true)
    act(() => {
      localStorage.clear()
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })
    expect(result.current.flag).toBe(false)
    expect(result.current.flags.grafbygger_always_show_sql).toBe(false)
  })

  it('updates both hooks when settings load from the backend', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ settings: { grafbygger_always_show_sql: 'true' } }),
    } as Response)
    const { result } = renderHook(() => ({
      flag: useFeatureFlag('grafbygger_always_show_sql'),
      flags: useFeatureFlags(),
    }))
    loadFeatureFlagsFromBackend()
    await waitFor(() => {
      expect(result.current.flag).toBe(true)
      expect(result.current.flags.grafbygger_always_show_sql).toBe(true)
    })
  })

  it('removes both hooks’ event listeners when they unmount', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => {
      useFeatureFlag('grafbygger_always_show_sql')
      useFeatureFlags()
    })
    const subscriptions = add.mock.calls.filter(([event]) => event === 'featureFlagsChange' || event === 'storage')
    expect(subscriptions).toHaveLength(4)
    unmount()
    for (const [event, listener] of subscriptions) {
      expect(remove).toHaveBeenCalledWith(event, listener)
    }
  })
})
