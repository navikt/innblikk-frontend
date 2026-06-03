import { describe, it, expect } from 'vitest'
import { buildStepQueryParams } from './funnelRoutes.js'

describe('buildStepQueryParams', () => {
  it('builds mixed url and event steps without url params on event steps', () => {
    const steps = [
      { type: 'url', value: '/start' },
      { type: 'event', value: 'søknad_sendt', eventScope: 'anywhere' },
    ]

    const params = buildStepQueryParams(steps)

    expect(params.stepValue0).toBe('/start')
    expect(params.stepPath0).toBe('/start')
    expect(params.stepQuery0).toBe('')

    expect(params.stepValue1).toBe('søknad_sendt')
    expect(params.stepPath1).toBeUndefined()
    expect(params.stepQuery1).toBeUndefined()
  })

  it('sets display value, path, and query for url steps and normalizes wildcards', () => {
    const steps = [
      { type: 'url', value: '/soknad?foo=bar' },
      { type: 'url', value: '/soknad/*' },
    ]

    const params = buildStepQueryParams(steps)

    expect(params.stepValue0).toBe('/soknad?foo=bar')
    expect(params.stepPath0).toBe('/soknad')
    expect(params.stepQuery0).toBe('foo=bar')

    expect(params.stepValue1).toBe('/soknad/%')
    expect(params.stepPath1).toBe('/soknad/%')
    expect(params.stepQuery1).toBe('')
  })

  // The client pre-splits URLs before sending (funnelApi.ts line 34), so the server
  // regularly receives steps with an explicit query field separate from value.
  it('handles pre-split url steps where query is passed as a separate field', () => {
    const steps = [{ type: 'url', value: '/soknad', query: 'foo=bar' }]

    const params = buildStepQueryParams(steps)

    expect(params.stepValue0).toBe('/soknad?foo=bar')
    expect(params.stepPath0).toBe('/soknad')
    expect(params.stepQuery0).toBe('foo=bar')
  })

  it('replaces wildcard * with % for event step values', () => {
    const steps = [{ type: 'event', value: 'søknad_*', eventScope: 'anywhere' }]

    const params = buildStepQueryParams(steps)

    expect(params.stepValue0).toBe('søknad_%')
  })

  it('serializes event params for equals and contains operators', () => {
    const steps = [
      {
        type: 'event',
        value: 'søknad_sendt',
        eventScope: 'anywhere',
        params: [
          { key: 'skjemanummer', value: 'NAV 10', operator: 'equals' },
          { key: 'tema', value: 'NAV', operator: 'contains' },
        ],
      },
    ]

    const params = buildStepQueryParams(steps)

    expect(params.step0_pKey0).toBe('skjemanummer')
    expect(params.step0_pVal0).toBe('NAV 10')
    expect(params.step0_pKey1).toBe('tema')
    expect(params.step0_pVal1).toBe('%NAV%')
  })
})
