import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

// The express server loads .env via config/env.js, but this config file decides the
// header's data-source badge (DATA_MODE) and reads process.env directly — without loading
// .env first, a credential set only in .env (e.g. GOOGLE_APPLICATION_CREDENTIALS) is
// invisible here and the badge wrongly shows "Generert" on the vite dev server (:5173).
// dotenv does not override already-set process.env vars, so real env still wins.
dotenv.config()

const resolveGitSha = (): string => {
  const fromEnv = process.env.GIT_SHA || process.env.GITHUB_SHA
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

const gitSha = resolveGitSha()

// DATA_MODE for the header badge, mirroring server.js' decision. In dev, vite serves
// index.html (express only serves dist/), so without this the __RUNTIME_CONFIG__ injection
// never happens locally and the badge would silently never render during development.
// Same rule as bigquery/client.js: no local GCP credentials → generated-data client, which
// becomes a real-data passthrough when BACKEND_TOKEN is set (proxy mode).
const resolveDataMode = (): string => {
  const hasCreds =
    Boolean(process.env['bigquery-credentials']) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
    Boolean(process.env.UMAMI_BIGQUERY) ||
    existsSync(resolve(process.cwd(), 'service-account-key.json'))
  if (hasCreds) return 'real'
  return process.env.BACKEND_TOKEN ? 'proxy' : 'generated'
}

const dataMode = resolveDataMode()

// GCP_PROJECT_ID for the vite dev server, mirroring config/env.js's dev default so the
// injected __RUNTIME_CONFIG__ matches what the express server (port 8081) injects when
// serving dist/. The WebsitePicker's default-site logic reads this to decide dev vs prod —
// without it, vite only injected DATA_MODE and getGcpProjectId() silently fell back to the
// prod default, so on localhost the dev default website ID never matched anything.
const gcpProjectId = process.env.GCP_PROJECT_ID || 'team-researchops-dev-4396'

// Injects the same window.__RUNTIME_CONFIG__ script serveFrontend.js adds to the built app,
// so the header's data-source badge and any GCP_PROJECT_ID-dependent client logic work in
// `pnpm start` (vite dev) too, not just when serving dist/.
const runtimeConfigPlugin = () => ({
  name: 'inject-runtime-config',
  transformIndexHtml: () => [
    {
      tag: 'script',
      children: `window.__RUNTIME_CONFIG__ = ${JSON.stringify({ DATA_MODE: dataMode, GCP_PROJECT_ID: gcpProjectId })};`,
      injectTo: 'head' as const,
    },
  ],
})

// https://vite.dev/config/
export default defineConfig({
  // Redirect env file loading to a neutral dir during tests to avoid EPERM on .env
  ...(process.env.VITEST ? { envDir: '/tmp' } : {}),
  plugins: [react(), runtimeConfigPlugin()],
  define: {
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  server: {
    proxy: {
      '/api/canvas/ws': {
        target: 'ws://localhost:8081',
        changeOrigin: true,
        ws: true,
      },
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx,js}'],
    css: false,
    env: {},
  },
})
