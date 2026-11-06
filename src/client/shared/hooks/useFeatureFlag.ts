import { useEffect, useState } from 'react'
import { getFeatureFlag, type FeatureFlags } from '../lib/featureFlags.ts'

export function useFeatureFlag(flag: keyof FeatureFlags): boolean {
  const [enabled, setEnabled] = useState(() => getFeatureFlag(flag))

  useEffect(() => {
    const handleChange = () => setEnabled(getFeatureFlag(flag))
    window.addEventListener('featureFlagsChange', handleChange)
    window.addEventListener('storage', handleChange)
    return () => {
      window.removeEventListener('featureFlagsChange', handleChange)
      window.removeEventListener('storage', handleChange)
    }
  }, [flag])

  return enabled
}
