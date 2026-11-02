import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFunnelData, type FetchFunnelParams } from './funnelApi'
import { parseStepsFromParams, serializeStep } from '../utils/stepUtils'
import type { FunnelStep } from '../model/types'

const steps: FunnelStep[] = [
  { type: 'url', value: '/stillinger', query: '' },
  {
    type: 'event',
    value: 'Stillingsvisning',
    eventScope: 'anywhere',
    params: [
      { key: 'hasSuperrask', operator: 'equals', value: '1' },
      { key: 'source|name=', operator: 'contains', value: 'a=b|c%20 & æ' },
    ],
  },
  { type: 'url', value: '/stillinger/stilling/*/superrask-soknad', query: '' },
  { type: 'event', value: 'Sent - Superrask søknad', eventScope: 'anywhere', params: [] },
]

const params: FetchFunnelParams = {
  websiteId: 'arbeidsplassen',
  steps,
  period: 'last_28_days',
  onlyDirectEntry: false,
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('funnel sharing', () => {
  it('round-trips the four-step funnel with property operators and delimiter characters intact', async () => {
    window.history.replaceState({}, '', '/trakt?websiteId=old-site')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: steps.map((step, index) => ({ step: index, url: step.value, count: 100 - index * 10 })),
        }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchFunnelData(params)
    expect(result.error).toBeNull()
    expect(result.shareParams?.get('websiteId')).toBe('arbeidsplassen')
    expect(result.shareParams?.get('strict')).toBe('false')
    expect(parseStepsFromParams(new URLSearchParams(result.shareParams?.toString()))).toEqual(steps)
    expect(result.data[1].params).toEqual(steps[1].params)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('round-trips event names and URLs containing encoded values or step delimiters', () => {
    const unusualSteps: FunnelStep[] = [
      { type: 'url', value: '/path%20with%20spaces', query: 'value=a|b%25' },
      { type: 'event', value: 'Sent | æ=%20', eventScope: 'current-path', params: [] },
    ]
    const search = new URLSearchParams()
    unusualSteps.forEach((step) => search.append('step', serializeStep(step)))
    expect(parseStepsFromParams(new URLSearchParams(search.toString()))).toEqual(unusualSteps)
  })

  it('still reads existing unencoded links and equals filters', () => {
    const search = new URLSearchParams()
    search.append('step', 'url:/stillinger')
    search.append('step', 'event:Stillingsvisning|anywhere|param:hasSuperrask=1')
    expect(parseStepsFromParams(search)[1]).toEqual({
      type: 'event',
      value: 'Stillingsvisning',
      eventScope: 'anywhere',
      params: [{ key: 'hasSuperrask', operator: 'equals', value: '1' }],
    })
  })
})

describe('funnel validation', () => {
  it.each([
    [{ type: 'url' as const, value: '' }, steps[1]],
    [steps[0], { ...steps[1], params: [{ key: '', value: '1', operator: 'equals' as const }] }],
    [steps[0], { ...steps[1], params: [{ key: 'hasSuperrask', value: '', operator: 'equals' as const }] }],
  ])('does not execute incomplete steps or filters', async (...incompleteSteps) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchFunnelData({ ...params, steps: incompleteSteps })
    expect(result.error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not execute reversed date ranges', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchFunnelData({
      ...params,
      period: 'custom',
      customStartDate: new Date('2026-10-04'),
      customEndDate: new Date('2026-10-03'),
    })
    expect(result.error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
