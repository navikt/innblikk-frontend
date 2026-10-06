import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildHtmlSnapshot, fetchHtmlSnapshot } from './buildHtmlSnapshot.ts'

describe('buildHtmlSnapshot', () => {
  it('preserves click targets and resolves relative assets against the original page', () => {
    const snapshot = buildHtmlSnapshot(
      '<link rel="stylesheet" href="/styles.css"><a href="/next" data-testid="next">Neste</a><img src="image.png">',
      'https://nav.no/account/',
    )
    const document = new DOMParser().parseFromString(snapshot, 'text/html')
    expect(document.querySelector('base')?.href).toBe('https://nav.no/account/')
    expect(document.querySelector('a')?.getAttribute('href')).toBe('/next')
    expect(document.querySelector('a')?.getAttribute('data-testid')).toBe('next')
    expect(document.querySelector('link')?.getAttribute('href')).toBe('/styles.css')
    expect(document.querySelector('link')?.crossOrigin).toBe('anonymous')
    expect(document.querySelector('img')?.getAttribute('src')).toBe('image.png')
  })

  it('removes active content, navigation metadata and event handlers', () => {
    const snapshot = buildHtmlSnapshot(
      `<base href="https://evil.example"><meta http-equiv="refresh" content="0;url=https://evil.example">
       <script>alert(1)</script><iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">
       <link rel="prefetch" href="/api/private"><button onclick="alert(1)">Neste</button>
       <svg onload="alert(1)"></svg>`,
      'https://nav.no/account',
    )
    const document = new DOMParser().parseFromString(snapshot, 'text/html')
    expect(document.querySelector('script, iframe, object, embed, link, [onclick], [onload]')).toBeNull()
    expect(document.querySelectorAll('base')).toHaveLength(1)
    expect(document.querySelector('meta[http-equiv="refresh"]')).toBeNull()
    const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    expect(document.head.firstElementChild).toBe(policy)
    expect(policy?.getAttribute('content')).toContain("script-src 'none'")
    expect(policy?.getAttribute('content')).toContain("default-src 'none'")
    expect(policy?.getAttribute('content')).toContain("form-action 'none'")
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer')
  })
})

describe('fetchHtmlSnapshot', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches readable HTML with CORS and no credentials, then disables scripts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<a href="/next">Neste</a><script>alert(1)</script>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    const snapshot = await fetchHtmlSnapshot('https://nav.no/account', signal)
    expect(fetchMock).toHaveBeenCalledWith('https://nav.no/account', {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    })
    expect(snapshot).toContain('Neste')
    expect(snapshot).not.toContain('<script')
  })

  it('rejects blocked browser requests and non-HTML responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchHtmlSnapshot('https://nav.no/account', new AbortController().signal)).rejects.toThrow()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } })),
    )
    await expect(fetchHtmlSnapshot('https://nav.no/account', new AbortController().signal)).rejects.toThrow(
      'not readable HTML',
    )
  })
})
