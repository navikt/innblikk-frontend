export type RuntimeConfig = {
  GCP_PROJECT_ID?: string
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
  ...readViteConfig(),
  ...readWindowConfig(),
})

const requireRuntimeValue = (key: keyof RuntimeConfig): string => {
  const value = getRuntimeConfig()[key]
  if (!value) {
    throw new Error(`Missing runtime config: ${key}`)
  }
  return value
}

export const getGcpProjectId = (): string => requireRuntimeValue('GCP_PROJECT_ID')

export {}
