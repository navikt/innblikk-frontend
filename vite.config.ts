import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { execSync } from 'node:child_process'

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

// https://vite.dev/config/
export default defineConfig({
  // Redirect env file loading to a neutral dir during tests to avoid EPERM on .env
  ...(process.env.VITEST ? { envDir: '/tmp' } : {}),
  plugins: [react()],
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
