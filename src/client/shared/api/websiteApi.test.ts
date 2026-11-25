import { fetchWebsites } from './websiteApi'

afterEach(() => vi.unstubAllGlobals())

it('returns the production website list', async () => {
  const websites = [{ id: 'one', name: 'Nav', domain: 'nav.no' }]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: websites }), { status: 200 })))
  await expect(fetchWebsites()).resolves.toEqual(websites)
})

it('reports HTTP failures instead of treating them as an empty website list', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Ingen tilgang' }), { status: 403 })),
  )
  await expect(fetchWebsites()).rejects.toThrow('Ingen tilgang')
})

it('reports malformed responses instead of returning an empty list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })))
  await expect(fetchWebsites()).rejects.toThrow('ugyldig svar')
})
