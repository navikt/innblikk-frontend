import { describe, it, expect, vi } from 'vitest'
import { buildStepQueryParams, createFunnelRoutes } from './funnelRoutes.js'

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

  describe.each(['/api/bigquery/funnel', '/api/bigquery/funnel-timing'])('%s detail filters', (path) => {
    it.each([true, false])('matches numeric and string details with onlyDirectEntry=%s', async (onlyDirectEntry) => {
      const filters = [
        { key: 'step', value: '1', operator: 'equals' },
        { key: 'step', value: '2', operator: 'equals' },
        { key: 'step', value: '3', operator: 'equals' },
        { key: 'zero', value: '0', operator: 'equals' },
        { key: 'negative', value: '-1', operator: 'equals' },
        { key: 'decimal', value: '1.5', operator: 'equals' },
        { key: 'code', value: '001', operator: 'equals' },
        { key: 'text', value: 'NAV', operator: 'equals' },
        { key: 'part', value: '2', operator: 'contains' },
      ]
      const steps = [
        { type: 'event', value: 'start', params: [filters[0]] },
        { type: 'event', value: 'finish', params: filters },
      ]
      const createQueryJob = vi.fn(async () => [
        {
          metadata: { statistics: { totalBytesProcessed: '0' } },
          getQueryResults: async () => [[{ step: 0, count: '5' }]],
        },
      ])
      const router = createFunnelRoutes({ bigquery: { createQueryJob }, GCP_PROJECT_ID: 'test-project' })
      const handler = router.stack.find((layer) => layer.route?.path === path).route.stack[0].handle
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }

      await handler(
        {
          body: {
            websiteId: 'site-1',
            steps,
            startDate: '2026-10-01T00:00:00Z',
            endDate: '2026-10-02T00:00:00Z',
            onlyDirectEntry,
          },
        },
        res,
      )

      expect(res.status).not.toHaveBeenCalled()
      expect(createQueryJob).toHaveBeenCalledTimes(2)
      for (const [config] of createQueryJob.mock.calls) {
        expect(config.query).toContain(
          'COALESCE(p_0_0.string_value, CAST(p_0_0.number_value AS STRING)) = @step0_pVal0',
        )
        filters.forEach((filter, index) => {
          const operator = filter.operator === 'contains' ? 'LIKE' : '='
          expect(config.query).toContain(
            `COALESCE(p_1_${index}.string_value, CAST(p_1_${index}.number_value AS STRING)) ${operator} @step1_pVal${index}`,
          )
          expect(config.params[`step1_pVal${index}`]).toBe(
            filter.operator === 'contains' ? `%${filter.value}%` : filter.value,
          )
          expect(config.query).toContain(`p_1_${index}.data_key = @step1_pKey${index}`)
          expect(config.query).toContain(`d_1_${index}.website_event_id = e.event_id`)
          expect(config.query).toContain(`d_1_${index}.website_id = e.website_id`)
          expect(config.query).toContain(`d_1_${index}.created_at = e.created_at`)
        })
      }
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Array),
          sql: expect.stringContaining("COALESCE(p_1_0.string_value, CAST(p_1_0.number_value AS STRING)) = '1'"),
        }),
      )
    })
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
