import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'

const VALID_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_ID = '223e4567-e89b-42d3-a456-426614174000'
const OBO_TOKEN = 'obo-token-for-clean-to-enriched'

const { oasisMock, requireReopsTeamMemberMock } = vi.hoisted(() => ({
  oasisMock: {
    getToken: vi.fn(() => 'user-token'),
    validateToken: vi.fn(async () => ({ ok: true })),
    parseAzureUserToken: vi.fn(() => ({ ok: true, NAVident: 'Z123456' })),
    requestOboToken: vi.fn(async () => ({ ok: true, token: OBO_TOKEN })),
  },
  requireReopsTeamMemberMock: vi.fn((req, res, next) => {
    if (req.headers['x-test-reops'] === 'yes') return next()
    return res.status(403).json({ error: 'Denne funksjonen er kun tilgjengelig for Team ResearchOps' })
  }),
}))

vi.mock('../../middleware/authUtils.js', () => ({
  loadOasis: async () => ({ oasis: oasisMock }),
}))
vi.mock('../../middleware/requireReopsTeamMember.js', () => ({
  requireReopsTeamMember: (req, res, next) => requireReopsTeamMemberMock(req, res, next),
}))

import { createWebsiteManagementRouter } from './websiteManagementRoutes.js'

function buildApp({
  baseUrl = 'http://reops-clean-to-enriched:8080',
  scope = 'api://dev-gcp.team-researchops.reops-clean-to-enriched/.default',
} = {}) {
  const app = express()
  app.use(express.json())
  app.use(
    '/api/website-management',
    createWebsiteManagementRouter({
      WEBSITE_MANAGEMENT_BASE_URL: baseUrl,
      WEBSITE_MANAGEMENT_OBO_SCOPE: scope,
    }),
  )
  return app
}

/**
 * Performs a browser-side request against the real Express app. Uses the captured
 * real fetch — the global `fetch` is stubbed in tests to stand in for the upstream
 * reops-clean-to-enriched service, so it must not be used here.
 */
async function request(app, { method = 'GET', path, headers = {}, body, sameOrigin = false } = {}) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address()
  try {
    const response = await realFetch(`http://127.0.0.1:${port}/api/website-management${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(sameOrigin ? { origin: `http://127.0.0.1:${port}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: response.status, json, headers: response.headers }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const asReops = { 'x-test-reops': 'yes' }
const mutationHeaders = { 'x-requested-with': 'XMLHttpRequest' }

// Captured BEFORE vi.stubGlobal replaces it: the real fetch drives browser-side
// requests; the stub simulates the upstream reops-clean-to-enriched service.
const realFetch = globalThis.fetch.bind(globalThis)

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const upstreamCalls = () => vi.mocked(fetch).mock.calls

describe('authentication (fail closed)', () => {
  it('rejects with 401 when no token is present', async () => {
    oasisMock.getToken.mockReturnValueOnce(null)
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects with 401 when token validation fails', async () => {
    oasisMock.validateToken.mockResolvedValueOnce({ ok: false, error: new Error('expired') })
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects with 401 when the token does not parse to a NAV ident', async () => {
    oasisMock.parseAzureUserToken.mockReturnValueOnce({ ok: false })
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects with 401 when the parsed token has no NAVident claim', async () => {
    oasisMock.parseAzureUserToken.mockReturnValueOnce({ ok: true, NAVident: undefined })
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards only the exchanged OBO token, never the incoming authorization header', async () => {
    const res = await request(buildApp(), { path: '/', headers: { authorization: 'Bearer browser-token' } })
    expect(res.status).toBe(200)
    const [, options] = upstreamCalls()[0]
    expect(options.headers.authorization).toBe(`Bearer ${OBO_TOKEN}`)
  })
})

describe('CSRF / same-origin mutations', () => {
  it('rejects mutations without the x-requested-with header', async () => {
    const res = await request(buildApp(), { method: 'POST', path: '/', body: { name: 'x', domain: 'x.nav.no' } })
    expect(res.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects mutations with a cross-origin Origin header', async () => {
    const res = await request(buildApp(), {
      method: 'POST',
      path: '/',
      headers: { ...mutationHeaders, origin: 'https://evil.example.com' },
      body: { name: 'x', domain: 'x.nav.no' },
    })
    expect(res.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts mutations with the header and a matching Origin, forwarding a rewritten Location', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ websiteId: VALID_ID }), {
        status: 201,
        headers: {
          'content-type': 'application/json',
          location: `http://reops-clean-to-enriched:8080/api/manage/websites/${VALID_ID}`,
        },
      }),
    )
    const res = await request(buildApp(), {
      method: 'POST',
      path: '/',
      headers: mutationHeaders,
      body: { name: 'x', domain: 'x.nav.no', ownerTeamId: VALID_ID },
      sameOrigin: true,
    })
    expect(res.status).toBe(201)
    const [url, options] = upstreamCalls()[0]
    expect(url.toString()).toBe('http://reops-clean-to-enriched:8080/api/manage/websites')
    expect(JSON.parse(options.body)).toEqual({ name: 'x', domain: 'x.nav.no', ownerTeamId: VALID_ID })
    expect(res.headers.get('location')).toBe(`/api/website-management/${VALID_ID}`)
  })

  it('does not forward upstream headers other than Location', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-internal-trace': 'secret', server: 'internal' },
      }),
    )
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-internal-trace')).toBeNull()
    expect(res.headers.get('server')).not.toBe('internal')
  })

  it('allows GET without the custom header', async () => {
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(200)
  })
})

describe('routing and authorization', () => {
  it('forwards scope=mine by default, without a trailing slash (Spring base mapping)', async () => {
    await request(buildApp(), { path: '/' })
    expect(upstreamCalls()[0][0].toString()).toBe('http://reops-clean-to-enriched:8080/api/manage/websites')
  })

  it('forwards includeDeleted for own scope', async () => {
    await request(buildApp(), { path: '/?includeDeleted=true' })
    expect(upstreamCalls()[0][0].toString()).toBe(
      'http://reops-clean-to-enriched:8080/api/manage/websites?includeDeleted=true',
    )
  })

  it('rejects unknown scope values', async () => {
    const res = await request(buildApp(), { path: '/?scope=others' })
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('blocks scope=all for non-ReOps users (fail closed, never forwarded)', async () => {
    const res = await request(buildApp(), { path: '/?scope=all' })
    expect(res.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('allows scope=all for ReOps members and forwards it', async () => {
    const res = await request(buildApp(), { path: '/?scope=all', headers: asReops })
    expect(res.status).toBe(200)
    expect(upstreamCalls()[0][0].toString()).toBe('http://reops-clean-to-enriched:8080/api/manage/websites?scope=all')
  })

  it('rejects malformed website IDs', async () => {
    const res = await request(buildApp(), { path: '/not-a-uuid' })
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects array bodies on mutations', async () => {
    const res = await request(buildApp(), {
      method: 'POST',
      path: '/',
      headers: mutationHeaders,
      body: ['not', 'an', 'object'],
    })
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('hard delete (ReOps only)', () => {
  it('requires ReOps membership before anything is forwarded', async () => {
    const res = await request(buildApp(), {
      method: 'DELETE',
      path: `/${VALID_ID}/registration`,
      headers: { ...mutationHeaders, 'x-confirm-website-id': VALID_ID },
    })
    expect(res.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires the confirmation header to be a UUID', async () => {
    const res = await request(buildApp(), {
      method: 'DELETE',
      path: `/${VALID_ID}/registration`,
      headers: { ...asReops, ...mutationHeaders, 'x-confirm-website-id': 'not-a-uuid' },
    })
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a confirmation UUID that does not match the path ID', async () => {
    const res = await request(buildApp(), {
      method: 'DELETE',
      path: `/${VALID_ID}/registration`,
      headers: { ...asReops, ...mutationHeaders, 'x-confirm-website-id': OTHER_ID },
    })
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards the confirmation header for ReOps members when it matches exactly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const res = await request(buildApp(), {
      method: 'DELETE',
      path: `/${VALID_ID}/registration`,
      headers: { ...asReops, ...mutationHeaders, 'x-confirm-website-id': VALID_ID },
    })
    expect(res.status).toBe(204)
    const [url, options] = upstreamCalls()[0]
    expect(url.toString()).toBe(`http://reops-clean-to-enriched:8080/api/manage/websites/${VALID_ID}/registration`)
    expect(options.headers['x-confirm-website-id']).toBe(VALID_ID)
  })
})

describe('upstream failures and caching', () => {
  it('returns 503 when the target is not configured (no local fallback)', async () => {
    const res = await request(buildApp({ baseUrl: '', scope: '' }), { path: '/' })
    expect(res.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 503 when the OBO exchange fails', async () => {
    oasisMock.requestOboToken.mockResolvedValueOnce({ ok: false })
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 503 when the OBO exchange throws', async () => {
    oasisMock.requestOboToken.mockRejectedValueOnce(new Error('token endpoint exploded'))
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sanitizes upstream network errors to 502 without leaking internals', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:8080'))
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(502)
    expect(JSON.stringify(res.json)).not.toContain('ECONNREFUSED')
  })

  it('maps upstream timeouts to 504', async () => {
    const timeoutError = new Error('The operation timed out')
    timeoutError.name = 'TimeoutError'
    vi.mocked(fetch).mockRejectedValueOnce(timeoutError)
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(504)
  })

  it('sanitizes an unreadable upstream body to 502', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(200)
    expect(res.json).toBeNull()
  })

  it('sanitizes non-JSON upstream bodies to 502', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('<html>proxy error</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(502)
  })

  it('passes through only ProblemDetail fields on upstream errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 403, title: 'Forbidden', detail: 'Ikke ditt team', internal: 'stacktrace' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      ),
    )
    const res = await request(buildApp(), { path: '/' })
    expect(res.status).toBe(403)
    expect(res.json).toEqual({ type: 'about:blank', status: 403, title: 'Forbidden', detail: 'Ikke ditt team' })
    expect(res.headers.get('content-type')).toContain('application/problem+json')
  })

  it('sets no-store cache headers on every response', async () => {
    const res = await request(buildApp(), { path: '/' })
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})
