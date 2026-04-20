import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getFeatureFlags, getFeatureFlag, setFeatureFlag } from './featureFlags.ts'

vi.mock('./analyticsId.ts', () => ({
  getOrCreateAnalyticsId: () => 'test-analytics-id',
}))

describe('featureFlags', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true })),
    )
    vi.stubGlobal('umami', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getFeatureFlags', () => {
    it('returns defaults when localStorage is empty', () => {
      const flags = getFeatureFlags()
      expect(flags.beta_opt_in).toBe(false)
      expect(flags.grafbygger_always_show_sql).toBe(false)
    })

    it('returns stored values merged with defaults', () => {
      localStorage.setItem('innblikk_feature_flags', JSON.stringify({ beta_opt_in: true }))
      const flags = getFeatureFlags()
      expect(flags.beta_opt_in).toBe(true)
      expect(flags.grafbygger_always_show_sql).toBe(false)
    })

    it('returns defaults when localStorage contains invalid JSON', () => {
      localStorage.setItem('innblikk_feature_flags', 'not-valid-json')
      const flags = getFeatureFlags()
      expect(flags.beta_opt_in).toBe(false)
      expect(flags.grafbygger_always_show_sql).toBe(false)
    })
  })

  describe('getFeatureFlag', () => {
    it('returns default value for an unset flag', () => {
      expect(getFeatureFlag('beta_opt_in')).toBe(false)
    })

    it('returns stored value for a set flag', () => {
      localStorage.setItem('innblikk_feature_flags', JSON.stringify({ grafbygger_always_show_sql: true }))
      expect(getFeatureFlag('grafbygger_always_show_sql')).toBe(true)
    })
  })

  describe('setFeatureFlag', () => {
    it('persists the updated flag to localStorage', () => {
      setFeatureFlag('beta_opt_in', true)
      const stored = JSON.parse(localStorage.getItem('innblikk_feature_flags')!)
      expect(stored.beta_opt_in).toBe(true)
    })

    it('preserves existing flags when updating one', () => {
      localStorage.setItem('innblikk_feature_flags', JSON.stringify({ grafbygger_always_show_sql: true }))
      setFeatureFlag('beta_opt_in', true)
      const stored = JSON.parse(localStorage.getItem('innblikk_feature_flags')!)
      expect(stored.grafbygger_always_show_sql).toBe(true)
      expect(stored.beta_opt_in).toBe(true)
    })

    it('calls fetch with the correct endpoint and method', () => {
      setFeatureFlag('beta_opt_in', true)
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/backend/user-settings',
        expect.objectContaining({ method: 'PUT' }),
      )
    })

    it('sends all flags and analyticsId in the request body', () => {
      setFeatureFlag('beta_opt_in', true)
      const [, options] = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse((options as RequestInit).body as string)
      expect(body.settings.beta_opt_in).toBe('true')
      expect(body.settings.grafbygger_always_show_sql).toBe('false')
      expect(body.analyticsId).toBe('test-analytics-id')
      expect(body.clientInfo).toBeUndefined()
    })

    it('dispatches featureFlagsChange event with updated flags', () => {
      const listener = vi.fn()
      window.addEventListener('featureFlagsChange', listener)
      setFeatureFlag('grafbygger_always_show_sql', true)
      expect(listener).toHaveBeenCalledOnce()
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail
      expect(detail.grafbygger_always_show_sql).toBe(true)
      window.removeEventListener('featureFlagsChange', listener)
    })

    it('calls umami.track with avkrysningsboks endret event', () => {
      const trackMock = vi.fn()
      vi.stubGlobal('umami', { track: trackMock })
      setFeatureFlag('beta_opt_in', true)
      expect(trackMock).toHaveBeenCalledWith('avkrysningsboks endret', {
        checked: true,
        komponentId: 'beta_opt_in',
        seksjon: 'innstillinger',
      })
    })

    it('does not throw when umami is not loaded', () => {
      vi.stubGlobal('umami', undefined)
      expect(() => setFeatureFlag('beta_opt_in', true)).not.toThrow()
    })

    it('does not throw when fetch fails', () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('network error'))),
      )
      expect(() => setFeatureFlag('beta_opt_in', true)).not.toThrow()
    })
  })
})
