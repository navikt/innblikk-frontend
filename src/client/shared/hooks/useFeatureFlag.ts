import { useSyncExternalStore } from 'react'
import { getFeatureFlag, getFeatureFlags, type FeatureFlags } from '../lib/featureFlags.ts'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('featureFlagsChange', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener('featureFlagsChange', onChange)
    window.removeEventListener('storage', onChange)
  }
}

let snapshot: FeatureFlags | undefined

function getSnapshot(): FeatureFlags {
  const flags = getFeatureFlags()
  const previous = snapshot
  // React requires the same snapshot reference until the stored values change.
  if (previous && (Object.keys(flags) as (keyof FeatureFlags)[]).every((key) => flags[key] === previous[key])) {
    return previous
  }
  snapshot = flags
  return flags
}

export function useFeatureFlags(): FeatureFlags {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function useFeatureFlag<K extends keyof FeatureFlags>(flag: K): FeatureFlags[K] {
  return useSyncExternalStore(subscribe, () => getFeatureFlag(flag))
}
