export type RuntimeConfig = {
  GCP_PROJECT_ID?: string
  BACKEND_WS_HOST?: string
}

// Non-sensitive defaults. GCP_PROJECT_ID is a BigQuery project identifier
// (not a credential). The default is the PROD project — it's the baked-in
// fallback for the deployed app if runtime injection ever goes missing
// (prod querying prod is always safe; prod querying dev would be a bug).
// Can be overridden via VITE_GCP_PROJECT_ID or window.__RUNTIME_CONFIG__ —
// the server always injects its own GCP_PROJECT_ID (dev locally, see env.js),
// so this default effectively never fires outside tests.
const DEFAULT_RUNTIME_CONFIG: Required<Pick<RuntimeConfig, 'GCP_PROJECT_ID'>> = {
  GCP_PROJECT_ID: 'team-researchops-prod-01d6',
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig
  }
}

const readWindowConfig = (): RuntimeConfig => {
  if (typeof window === 'undefined') return {}
  return window.__RUNTIME_CONFIG__ ?? {}
}

const readViteConfig = (): RuntimeConfig => {
  if (typeof import.meta === 'undefined' || !import.meta.env) return {}
  return {
    GCP_PROJECT_ID: import.meta.env.VITE_GCP_PROJECT_ID,
  }
}

export const getRuntimeConfig = (): RuntimeConfig => ({
  ...DEFAULT_RUNTIME_CONFIG,
  ...readViteConfig(),
  ...readWindowConfig(),
})

const getRuntimeValue = (key: keyof RuntimeConfig): string => {
  const value = getRuntimeConfig()[key]
  // Values are never empty in practice (default + overrides are non-empty),
  // but guard anyway rather than returning `undefined` as a string.
  return value || ''
}

export const getGcpProjectId = (): string => getRuntimeValue('GCP_PROJECT_ID')

export {}
