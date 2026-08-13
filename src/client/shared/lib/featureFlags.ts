import { Events, type AvkrysningsboksEndretProperties } from '@navikt/analytics-types'

const FEATURE_FLAGS_KEY = 'innblikk_feature_flags'

function syncSettingsToBackend(flags: FeatureFlags): void {
  const settings: Record<string, string> = {}
  for (const [k, v] of Object.entries(flags)) {
    settings[k] = String(v)
  }
  fetch('/api/backend/user-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  }).catch(() => {
    // silent fail — localStorage is source of truth
  })
}

function trackFlagChange<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
  const properties: AvkrysningsboksEndretProperties = {
    checked: value,
    komponentId: key,
    seksjon: 'innstillinger',
  }
  window.umami?.track(Events.AVKRYSNINGSBOKS_ENDRET, properties)
}

export type FeatureFlags = {
  grafbygger_always_show_sql: boolean
  beta_opt_in: boolean
  copilot_show_technical_details: boolean
}

const DEFAULT_FLAGS: FeatureFlags = {
  grafbygger_always_show_sql: false,
  beta_opt_in: false,
  copilot_show_technical_details: false,
}

export const getFeatureFlags = (): FeatureFlags => {
  try {
    const stored = localStorage.getItem(FEATURE_FLAGS_KEY)
    if (!stored) return { ...DEFAULT_FLAGS }
    const parsed = JSON.parse(stored) as Partial<FeatureFlags>
    return { ...DEFAULT_FLAGS, ...parsed }
  } catch {
    return { ...DEFAULT_FLAGS }
  }
}

export const setFeatureFlag = <K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void => {
  try {
    const current = getFeatureFlags()
    const updated = { ...current, [key]: value }
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(updated))
    syncSettingsToBackend(updated)
    trackFlagChange(key, value)
    window.dispatchEvent(new CustomEvent('featureFlagsChange', { detail: updated }))
  } catch {
    // ignore
  }
}

export const getFeatureFlag = <K extends keyof FeatureFlags>(key: K): FeatureFlags[K] => {
  return getFeatureFlags()[key]
}

export function loadFeatureFlagsFromBackend(): void {
  fetch('/api/backend/user-settings')
    .then((res) => {
      if (!res.ok) return
      return res.json() as Promise<{ settings: Record<string, string> }>
    })
    .then((data) => {
      if (!data?.settings) return
      const current = getFeatureFlags()
      const merged: FeatureFlags = { ...current }
      for (const key of Object.keys(DEFAULT_FLAGS) as (keyof FeatureFlags)[]) {
        const raw = data.settings[key]
        if (raw !== undefined) {
          merged[key] = raw === 'true'
        }
      }
      localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(merged))
      window.dispatchEvent(new CustomEvent('featureFlagsChange', { detail: merged }))
    })
    .catch(() => {})
}
