import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { createApp } from './app.js'
import { expect, it, vi } from 'vitest'

vi.mock('./logger.js', () => ({ logger: { fatal: vi.fn() } }))

it('only allows trusted framing on the dedicated chart import page', async () => {
  const exceptionListeners = process.listeners('uncaughtException')
  const rejectionListeners = process.listeners('unhandledRejection')
  const app = createApp({ buildPath: `${tmpdir()}/innblikk-test-missing-build` })
  app.get('/importer-graf', (_req, res) => res.send('<html>Import</html>'))
  const server = app.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}`
    const imported = await fetch(`${base}/importer-graf?origin=https://evil.test`)
    expect(imported.headers.get('x-frame-options')).toBeNull()
    const csp = imported.headers.get('content-security-policy')
    expect(csp).toContain('frame-ancestors')
    expect(csp).toContain('https://innblikk.ansatt.dev.nav.no')
    expect(csp).toContain('https://innblikk.ansatt.nav.no')
    expect(csp).not.toContain('evil.test')
    expect(csp).not.toContain('https://*.nav.no')
    for (const path of ['/dashboard', '/api/backend/projects', '/importer-graf/other']) {
      const response = await fetch(`${base}${path}`)
      expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    for (const listener of process.listeners('uncaughtException')) {
      if (!exceptionListeners.includes(listener)) process.removeListener('uncaughtException', listener)
    }
    for (const listener of process.listeners('unhandledRejection')) {
      if (!rejectionListeners.includes(listener)) process.removeListener('unhandledRejection', listener)
    }
  }
})
