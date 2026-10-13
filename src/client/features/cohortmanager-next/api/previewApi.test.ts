import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCohortPreview } from './previewApi.ts'
import { fetchCohortsDeep } from '../../chartbuilder-next/api/cohortApi.ts'

vi.mock('../../chartbuilder-next/api/cohortApi.ts', () => ({ fetchCohortsDeep: vi.fn() }))
const input: Parameters<typeof fetchCohortPreview>[0] = {
  websiteId: 'site-1',
  basis: 'auto',
  startDate: new Date('2026-10-01'),
  endDate: new Date('2026-10-08'),
  root: {
    nodeType: 'GROUP',
    combinator: 'AND',
    negated: false,
    children: [
      {
        nodeType: 'GROUP',
        combinator: 'AND',
        negated: false,
        children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/' }],
      },
    ],
  },
}
const summary = { kind: 'summary', name: '', users: '0', total: '100', coverage_total: '150', coverage_cookie: '120' }

describe('fetchCohortPreview', () => {
  beforeEach(() => {
    vi.mocked(fetchCohortsDeep).mockReset().mockResolvedValue(new Map())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts a genuine zero result and sends only a read-only query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [summary] })))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    expect(await fetchCohortPreview(input, signal)).toEqual({
      users: 0,
      total: 100,
      coverage: { total: 150, withDistinctId: 120 },
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/bigquery', expect.objectContaining({ method: 'POST', signal }))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as { query: string }
    expect(body.query).toMatch(/^WITH preview_sessions/)
    expect(body.query).not.toMatch(/preview_activity|preview_devices|preview_pages|UNION ALL/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    {},
    { data: [] },
    { error: 'failed', data: [summary] },
    { data: [{ ...summary, users: null }] },
    { data: [{ ...summary, users: -1 }] },
    { data: [{ ...summary, users: 200 }] },
  ])('rejects invalid results rather than treating them as zero: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))
    await expect(fetchCohortPreview(input, new AbortController().signal)).rejects.toThrow()
  })

  it('does not start a query when reference loading fails or the request was cancelled', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(fetchCohortsDeep).mockRejectedValueOnce(new Error('missing group'))
    await expect(fetchCohortPreview(input, new AbortController().signal)).rejects.toThrow('missing group')
    const controller = new AbortController()
    controller.abort()
    await expect(fetchCohortPreview(input, controller.signal)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
