export type RuntimeConfig = {
  UMAMI_BASE_URL?: string;
  GCP_PROJECT_ID?: string;
};

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

const readWindowConfig = (): RuntimeConfig => {
  if (typeof window === 'undefined') return {};
  return window.__RUNTIME_CONFIG__ ?? {};
};

const readViteConfig = (): RuntimeConfig => {
  if (typeof import.meta === 'undefined' || !import.meta.env) return {};
  return {
    UMAMI_BASE_URL: import.meta.env.VITE_UMAMI_BASE_URL,
    GCP_PROJECT_ID: import.meta.env.VITE_GCP_PROJECT_ID,
  };
};

export const getRuntimeConfig = (): RuntimeConfig => ({
  ...readViteConfig(),
  ...readWindowConfig(),
});

const requireRuntimeValue = (key: keyof RuntimeConfig): string => {
  const value = getRuntimeConfig()[key];
  if (!value) {
    throw new Error(`Missing runtime config: ${key}`);
  }
  return value;
};

export const getGcpProjectId = (): string => requireRuntimeValue('GCP_PROJECT_ID');

export const getUmamiBaseUrl = (): string => requireRuntimeValue('UMAMI_BASE_URL');

export {};
