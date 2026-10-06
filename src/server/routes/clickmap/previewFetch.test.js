import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPreviewResponse } from './previewFetch.js'

describe('fetchPreviewResponse', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    'https://ansatt.dev.nav.no/oauth2/login?redirect=https://www.nav.no/pensjon',
    'https://tenant.eu.auth0.com/authorize?client_id=example',
    'https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize',
  ])('recognizes a login redirect without requesting %s', async (destination) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: destination } }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await fetchPreviewResponse('https://www.nav.no/pensjon')
    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://www.nav.no/pensjon', { redirect: 'manual' })
  })

  it('follows ordinary public redirects', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/public' } }))
      .mockResolvedValueOnce(new Response('<h1>Public page</h1>', { headers: { 'content-type': 'text/html' } }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await fetchPreviewResponse('https://www.nav.no/')
    expect(await response.text()).toContain('Public page')
    expect(fetchMock).toHaveBeenLastCalledWith('https://www.nav.no/public', { redirect: 'manual' })
  })
})
