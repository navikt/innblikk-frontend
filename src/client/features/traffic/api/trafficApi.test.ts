import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPageMetrics } from './trafficApi'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchPageMetrics', () => {
  it('requests multiple URL paths and preserves visit metrics', async () => {
    const data = [{ urlPath: '/one', visitors: 1, visits: 2, pageviews: 3, proportion: 0.1 }]
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 }))

    const result = await fetchPageMetrics(
      'website-id',
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-02T23:59:59.999Z'),
      ['/one', '/two'],
      'equals',
      'visitors',
      { countByParams: '&countBy=distinct_id', countBySwitchAtParam: '' },
    )

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('urlPaths=%2Fone&urlPaths=%2Ftwo'))
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('countBy=distinct_id'))
    expect(result.data).toEqual(data)
  })

  it('omits the default row limit when unlimited results are requested', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))

    await fetchPageMetrics(
      'website-id',
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-02T23:59:59.999Z'),
      [],
      'equals',
      'visitors',
      { countByParams: '', countBySwitchAtParam: '' },
      { unlimited: true, eventNames: ['site search', 'signup'] },
    )

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('unlimited=true'))
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('eventName=site%20search&eventName=signup'))
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/^(?!.*limit=1000)/))
  })
})
