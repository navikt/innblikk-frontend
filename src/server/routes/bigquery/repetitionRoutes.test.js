import { describe, expect, it, vi } from 'vitest'
import { createRepetitionRouter } from './repetitionRoutes.js'
import { createGeneratedBigQueryClient } from '../../bigquery/generatedDataClient.js'
import { MAX_BYTES_BILLED } from './helpers.js'

const body = {
  websiteId: 'site-1',
  startDate: '2026-10-01T00:00:00Z',
  endDate: '2026-10-02T00:00:00Z',
}

async function request(bigquery, overrides = {}, path = '/api/bigquery/repetition') {
  const router = createRepetitionRouter({ bigquery, GCP_PROJECT_ID: 'test-project' })
  const handler = router.stack.find((layer) => layer.route?.path === path).route.stack[0].handle
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
  await handler({ body: { ...body, ...overrides }, user: { navIdent: 'Z123456' } }, res)
  return res
}

describe('repetition endpoint', () => {
  it('returns labelled generated examples with the production response shape', async () => {
    const res = await request(createGeneratedBigQueryClient())
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        is_generated_data: true,
        summary: expect.objectContaining({ total_visitors: 120 }),
        findings: expect.arrayContaining([expect.objectContaining({ signal: 'duplicates' })]),
        generatedSql: expect.stringContaining('NumberedWindows'),
        queryStats: expect.objectContaining({ totalBytesProcessedGB: expect.any(String) }),
      }),
    )
    const examples = res.json.mock.calls[0][0].findings[0].examples
    expect(Date.parse(examples[0].ended_at.value)).toBeLessThanOrEqual(Date.parse(body.endDate))
  })

  it('parameterizes inputs and applies audit logging and the query cost cap', async () => {
    const bigquery = createGeneratedBigQueryClient()
    const createQueryJob = vi.spyOn(bigquery, 'createQueryJob')
    const res = await request(bigquery, { urlPath: "/foo%'/?test=x" })
    expect(res.status).not.toHaveBeenCalled()
    const config = createQueryJob.mock.calls[0][0]
    expect(config.maximumBytesBilled).toBe(MAX_BYTES_BILLED)
    expect(config.params.urlPath).toBe("/foo%'")
    expect(config.params).not.toHaveProperty('interactionEvent')
    expect(config.query).not.toContain('foo%')
    expect(config.query).toContain('Z123456')
    expect(config.query).toContain('Gjentatt aktivitet')
    expect(config.params).not.toHaveProperty('signal')
  })

  it('returns per-signal finding totals so the client can filter without a new query', async () => {
    const res = await request(createGeneratedBigQueryClient())
    expect(res.json.mock.calls[0][0].signal_findings).toEqual({ pageviews: 1, interactions: 1, duplicates: 1 })
  })

  it.each([
    { websiteId: '' },
    { startDate: 'bad' },
    { startDate: null },
    { endDate: '2026-09-01T00:00:00Z' },
    { endDate: '2026-11-02T00:00:00Z' },
    { pathOperator: 'invalid' },
    { urlPath: ['a'] },
  ])('rejects invalid input without issuing a query: %j', async (overrides) => {
    const createQueryJob = vi.fn()
    const res = await request({ createQueryJob }, overrides)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) })
    expect(createQueryJob).not.toHaveBeenCalled()
  })

  it('reports query failures and unavailable BigQuery explicitly', async () => {
    const res = await request({ createQueryJob: vi.fn().mockRejectedValue(new Error('Query failed')) })
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Query failed' })
    expect((await request(null)).status).toHaveBeenCalledWith(500)
  })

  it('rejects malformed or unsupported generated responses', async () => {
    const res = await request({ createQueryJob: vi.fn().mockResolvedValue([{ getQueryResults: async () => [[{}]] }]) })
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('passes cookie identity and rollout date without dropping fingerprint fallbacks', async () => {
    const bigquery = createGeneratedBigQueryClient()
    const createQueryJob = vi.spyOn(bigquery, 'createQueryJob')
    const res = await request(bigquery, { countBy: 'distinct_id', countBySwitchAt: Date.parse('2026-09-01T00:00:00Z') })
    expect(res.status).not.toHaveBeenCalled()
    expect(createQueryJob.mock.calls[0][0].params).toMatchObject({
      useCookies: true,
      cookieStartDate: '2026-09-01T00:00:00.000Z',
    })
    expect(res.json.mock.calls[0][0].summary.cookie_visitors).toBe(100)
  })

  it('returns bounded activity with before/during/after and metadata for the exact visit', async () => {
    const res = await request(
      createGeneratedBigQueryClient(),
      {
        sessionId: 'generated-interactions',
        visitId: 'generated-visit-interactions',
        startedAt: '2026-10-01T10:00:00Z',
        endedAt: '2026-10-01T10:00:02Z',
        highlightedEventIds: [
          'generated-activity-1',
          'generated-activity-2',
          'generated-activity-3',
          'generated-activity-4',
        ],
      },
      '/api/bigquery/repetition/activity',
    )
    expect(res.status).not.toHaveBeenCalled()
    const data = res.json.mock.calls[0][0]
    expect(data.activity).toHaveLength(6)
    expect(data.activity.map((event) => event.phase)).toEqual([
      'before',
      'during',
      'during',
      'during',
      'during',
      'after',
    ])
    expect(data.activity[1].properties).toContainEqual({ key: 'lenketekst', value: 'Send søknad' })
    expect(data.is_generated_data).toBe(true)
    expect(data.activity.map((event) => event.is_highlighted)).toEqual([false, true, true, true, true, false])
  })

  it.each([undefined, [], [null], [''], ['x'.repeat(101)], Array(101).fill('event')])(
    'rejects invalid evidence IDs before querying: %j',
    async (highlightedEventIds) => {
      const createQueryJob = vi.fn()
      const res = await request(
        { createQueryJob },
        {
          sessionId: 'fingerprint-1',
          visitId: 'visit-1',
          startedAt: '2026-10-01T10:00:00Z',
          endedAt: '2026-10-01T10:00:02Z',
          highlightedEventIds,
        },
        '/api/bigquery/repetition/activity',
      )
      expect(res.status).toHaveBeenCalledWith(400)
      expect(createQueryJob).not.toHaveBeenCalled()
    },
  )

  it('rejects invalid activity identity and timestamps before querying', async () => {
    const createQueryJob = vi.fn()
    const res = await request(
      { createQueryJob },
      { sessionId: '', visitId: '', startedAt: 'bad' },
      '/api/bigquery/repetition/activity',
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(createQueryJob).not.toHaveBeenCalled()
  })

  it('normalizes nine-digit BigQuery timestamp strings without losing microsecond boundaries', async () => {
    const bigquery = createGeneratedBigQueryClient()
    const createQueryJob = vi.spyOn(bigquery, 'createQueryJob')
    const res = await request(
      bigquery,
      {
        sessionId: 'generated-interactions',
        visitId: 'generated-visit-interactions',
        startedAt: '2026-11-03T13:43:11.440995000Z',
        endedAt: '2026-11-03T13:43:14.045668000Z',
        highlightedEventIds: ['generated-activity-1', 'generated-activity-2', 'generated-activity-3'],
      },
      '/api/bigquery/repetition/activity',
    )
    expect(res.status).not.toHaveBeenCalled()
    expect(createQueryJob.mock.calls[0][0].params).toMatchObject({
      episodeStart: '2026-11-03T13:43:11.440995Z',
      episodeEnd: '2026-11-03T13:43:14.045668Z',
      contextStart: '2026-11-03T13:42:11.440Z',
      contextEnd: '2026-11-03T13:44:14.045Z',
    })
  })
})
