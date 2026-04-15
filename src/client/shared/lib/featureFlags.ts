const FEATURE_FLAGS_KEY = 'innblikk_feature_flags'

export type FeatureFlags = {
  grafbygger_always_show_sql: boolean
}

const DEFAULT_FLAGS: FeatureFlags = {
  grafbygger_always_show_sql: false,
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
    window.dispatchEvent(new CustomEvent('featureFlagsChange', { detail: updated }))
  } catch {
    // ignore
  }
}

export const getFeatureFlag = <K extends keyof FeatureFlags>(key: K): FeatureFlags[K] => {
  return getFeatureFlags()[key]
}
