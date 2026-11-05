import { describe, expect, it, vi } from 'vitest'
import { createNavigationPatternRoutes } from './navigationPatternRoutes.js'
import { MAX_BYTES_BILLED } from './helpers.js'
import { createGeneratedBigQueryClient } from '../../bigquery/generatedDataClient.js'

vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

const valid = { websiteId: 'site-1', startDate: '2026-10-01', endDate: '2026-10-03' }
const emptySummary = { totalSessions: 0, patternSessions: 0, repeatedCycleSessions: 0, ambiguousSessions: 0 }

function setup({ bigquery, row, rows, fail = false, dryRunFail = false, bytes = '1024' } = {}) {
  const getQueryResults = vi.fn(async () => [
    rows ?? [row ?? { summary: emptySummary, patterns: [], invalidPathSessions: 0, missingSessionEvents: 0 }],
  ])
  const createQueryJob = vi.fn(async (config) => {
    if (fail || (config.dryRun && dryRunFail)) throw new Error('query failed')
    return [
      {
        metadata: { statistics: { totalBytesProcessed: bytes } },
        getQueryResults,
      },
    ]
  })
  const router = createNavigationPatternRoutes({
    bigquery: bigquery === null ? null : (bigquery ?? { createQueryJob }),
    GCP_PROJECT_ID: 'test-project',
    BIGQUERY_TIMEZONE: 'Europe/Oslo',
  })
  const handler = router.stack.find((layer) => layer.route?.path === '/api/bigquery/navigation-patterns').route.stack[0]
    .handle
  const estimateHandler = router.stack.find(
    (layer) => layer.route?.path === '/api/bigquery/navigation-patterns/estimate',
  ).route.stack[0].handle
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
  const req = (body) => ({ body, user: { navIdent: 'Z123456' } })
  return {
    createQueryJob,
    getQueryResults,
    res,
    request: (body) => handler(req(body), res),
    estimate: (body) => estimateHandler(req(body), res),
  }
}

describe('POST /api/bigquery/navigation-patterns', () => {
  it.each([
    null,
    [],
    {},
    { ...valid, websiteId: "' OR 1=1" },
    { ...valid, websiteId: 123 },
    { ...valid, startDate: '2026-02-30' },
    { ...valid, endDate: '2026-10-03T24:00:00Z' },
    { ...valid, startDate: '2026-10-01T00:00:00' },
    { ...valid, startDate: 'not-a-date' },
    { ...valid, startDate: '2026-10-03' },
    { ...valid, startDate: '2026-10-04' },
    { ...valid, endDate: '2028-01-01' },
    { ...valid, urlPath: null },
    { ...valid, urlPath: '' },
    { ...valid, urlPath: 'https://example.com' },
    { ...valid, urlPath: ['/a'] },
    { ...valid, urlPath: '/a\nb' },
    { ...valid, urlPath: '/'.repeat(2049) },
    { ...valid, pathScope: 'starts-at' },
    { ...valid, pathScope: null },
    { ...valid, pathScope: ['anywhere'] },
    { ...valid, pathScope: 'from-first-visit' },
    { ...valid, pathScope: 'from-first-visit', urlPath: '' },
    { ...valid, confirmedBytes: '50' },
    { ...valid, confirmedBytes: -1 },
    { ...valid, confirmedBytes: Number(MAX_BYTES_BILLED) + 1 },
    { ...valid, confirmedBytes: 1.5 },
  ])('rejects invalid input without calling BigQuery: %j', async (body) => {
    const { request, createQueryJob, res } = setup()
    await request(body)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) })
    expect(createQueryJob).not.toHaveBeenCalled()
  })

  it('returns a complete empty result and audits both capped execution and dry run', async () => {
    const { request, createQueryJob, res } = setup()
    await request(valid)
    expect(res.status).not.toHaveBeenCalled()
    expect(createQueryJob).toHaveBeenCalledTimes(2)
    const [dryRun, execution] = createQueryJob.mock.calls.map(([config]) => config)
    expect(execution).toMatchObject({
      location: 'europe-north1',
      maximumBytesBilled: MAX_BYTES_BILLED,
      params: {
        websiteId: 'site-1',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-03T00:00:00.000Z',
        urlPath: '',
        pathScope: 'anywhere',
        timezone: 'Europe/Oslo',
      },
      labels: { nav_ident: 'z123456', job_mode: 'execution', analysis_type: 'navigasjonsmonstre' },
    })
    expect(dryRun).toMatchObject({ dryRun: true, labels: { job_mode: 'dry_run', nav_ident: 'z123456' } })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: emptySummary,
        patterns: [],
        generatedSql: expect.any(String),
        queryStats: expect.objectContaining({ totalBytesProcessed: 1024 }),
        metadata: expect.objectContaining({
          stage: 'alfa',
          endExclusive: true,
          sampled: false,
          categoriesMayOverlap: true,
          pathScope: 'anywhere',
        }),
      }),
    )
  })

  it.each(['anywhere', 'from-first-visit'])(
    'parameterizes pathScope=%s and discloses sequence scope',
    async (pathScope) => {
      const { request, createQueryJob, res } = setup()
      await request({ ...valid, urlPath: '/hello', pathScope })
      expect(res.status).not.toHaveBeenCalled()
      expect(createQueryJob.mock.calls[1][0].params).toMatchObject({ urlPath: '/hello', pathScope })
      const metadata = res.json.mock.calls[0][0].metadata
      expect(metadata).toMatchObject({
        pathScope,
        filterScope: 'session-inclusion',
        patternScope: 'selected-page',
      })
      expect(metadata.limitations.some((limitation) => limitation.includes('first matching pageview'))).toBe(
        pathScope === 'from-first-visit',
      )
    },
  )

  it('defaults to selected-page patterns when a path is supplied without a scope', async () => {
    const { request, createQueryJob, res } = setup()
    await request({ ...valid, urlPath: '/hello' })
    expect(res.status).not.toHaveBeenCalled()
    expect(createQueryJob.mock.calls.map(([config]) => config.params.pathScope)).toEqual([
      'from-first-visit',
      'from-first-visit',
    ])
    expect(res.json.mock.calls[0][0].metadata).toMatchObject({
      pathScope: 'from-first-visit',
      patternScope: 'selected-page',
    })
  })

  it('parameterizes quoted path input and preserves numeric fraction/median values', async () => {
    const pattern = {
      id: 'id',
      type: 'quick-return',
      pages: ['/a', '/b'],
      sessions: 1,
      share: 0.25,
      medianRepetitions: 2.5,
      trend: [],
      before: [],
      after: [],
    }
    const { request, createQueryJob, res } = setup({
      row: {
        summary: { ...emptySummary, totalSessions: 4, patternSessions: 1 },
        patterns: [pattern],
        invalidPathSessions: 0,
        missingSessionEvents: 0,
      },
    })
    await request({ ...valid, urlPath: "/x' OR TRUE --" })
    expect(createQueryJob.mock.calls[0][0].params.urlPath).toBe("/x' OR TRUE --")
    expect(createQueryJob.mock.calls[0][0].query).not.toContain("/x' OR TRUE --")
    expect(res.json.mock.calls[0][0].patterns).toEqual([pattern])
  })

  it('returns a configuration error without starting a query if BigQuery is missing', async () => {
    const { request, res } = setup({ bigquery: null })
    await request(valid)
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('fails closed when the dry run fails and never executes the query', async () => {
    const failed = setup({ fail: true })
    await failed.request(valid)
    expect(failed.res.status).toHaveBeenCalledWith(500)
    const dryRun = setup({ dryRunFail: true })
    await dryRun.request(valid)
    expect(dryRun.res.status).toHaveBeenCalledWith(500)
    expect(dryRun.createQueryJob).toHaveBeenCalledTimes(1)
    expect(dryRun.getQueryResults).not.toHaveBeenCalled()
  })

  it.each(
    [
      [],
      [{ session_id: 'generated-session_id-01', path: '/soknad' }],
      [{ summary: emptySummary, patterns: [], invalidPathSessions: 0 }],
      [
        {
          summary: { ...emptySummary, totalSessions: '0' },
          patterns: [],
          invalidPathSessions: 0,
          missingSessionEvents: 0,
        },
      ],
      [{ summary: emptySummary, patterns: [{}], invalidPathSessions: 0, missingSessionEvents: 0 }],
    ].map((rows) => [rows]),
  )('explicitly rejects unsupported result shapes rather than inventing zero sessions: %j', async (rows) => {
    const { request, createQueryJob, res } = setup({ rows })
    await request(valid)
    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining('Generated-data fallback is not supported'),
      code: 'NAVIGATION_PATTERN_UNSUPPORTED_RESULT',
    })
    expect(createQueryJob).toHaveBeenCalledTimes(2)
  })

  it('rejects the actual generated client output, including proxy-failure fallback', async () => {
    const generated = setup({ bigquery: createGeneratedBigQueryClient() })
    await generated.request(valid)
    expect(generated.res.status).toHaveBeenCalledWith(502)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('proxy unavailable')))
    try {
      const fallback = setup({
        bigquery: createGeneratedBigQueryClient({ proxyBaseUrl: 'https://proxy.invalid', staticToken: 'test-token' }),
      })
      await fallback.request(valid)
      expect(fallback.res.status).toHaveBeenCalledWith(502)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('forwards real SQL and params through the existing Path A client and accepts aggregate results', async () => {
    const fetch = vi.fn(async (_url, config) => {
      const body = JSON.parse(config.body)
      return {
        ok: true,
        json: async () =>
          body.dryRun
            ? { totalBytesProcessed: 123 }
            : { data: [{ summary: emptySummary, patterns: [], invalidPathSessions: 0, missingSessionEvents: 0 }] },
      }
    })

    vi.stubGlobal('fetch', fetch)
    try {
      const proxied = setup({
        bigquery: createGeneratedBigQueryClient({ proxyBaseUrl: 'https://proxy.invalid', staticToken: 'test-token' }),
      })
      await proxied.request(valid)
      expect(proxied.res.status).not.toHaveBeenCalled()
      expect(proxied.res.json.mock.calls[0][0].summary).toEqual(emptySummary)
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(fetch.mock.calls[0][0].pathname).toBe('/bigquery/query')
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
        query: expect.stringContaining('WITH raw_events AS'),
        params: { websiteId: valid.websiteId, urlPath: '', timezone: 'Europe/Oslo' },
        dryRun: true,
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects a missing proxy estimate without using generated costs or executing', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetch)
    try {
      const instance = setup({
        bigquery: createGeneratedBigQueryClient({ proxyBaseUrl: 'https://proxy.invalid', staticToken: 'test-token' }),
      })
      await instance.request(valid)
      expect(instance.res.status).toHaveBeenCalledWith(502)
      expect(instance.res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NAVIGATION_PATTERN_ESTIMATE_UNAVAILABLE' }),
      )
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(JSON.parse(fetch.mock.calls[0][1].body).dryRun).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('estimates the exact parameterized query without fetching any results', async () => {
    const { estimate, res, createQueryJob, getQueryResults } = setup()
    await estimate({ ...valid, urlPath: '/hello' })
    expect(createQueryJob).toHaveBeenCalledTimes(1)
    expect(createQueryJob.mock.calls[0][0]).toMatchObject({
      dryRun: true,
      params: { urlPath: '/hello', pathScope: 'from-first-visit' },
    })
    expect(getQueryResults).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requiresConfirmation: false, maximumBytesBilled: MAX_BYTES_BILLED }),
    )
  })

  it.each([undefined, null, '', 'not-a-number', '-1', NaN])(
    'blocks execution for an invalid byte estimate: %j',
    async (value) => {
      const instance = setup({ bytes: value === undefined ? undefined : value })
      if (value === undefined) instance.createQueryJob.mockResolvedValueOnce([{ metadata: { statistics: {} } }])
      await instance.request(valid)
      expect(instance.res.status).toHaveBeenCalledWith(500)
      expect(instance.createQueryJob).toHaveBeenCalledTimes(1)
      expect(instance.getQueryResults).not.toHaveBeenCalled()
    },
  )

  it('requires confirmation starting at exactly 50 GB, before any execution', async () => {
    const bytes = 50 * 1024 ** 3
    const below = setup({ bytes: String(bytes - 1) })
    await below.estimate(valid)
    expect(below.res.json.mock.calls[0][0].requiresConfirmation).toBe(false)
    const instance = setup({ bytes: String(bytes) })
    await instance.request(valid)
    expect(instance.res.status).toHaveBeenCalledWith(409)
    expect(instance.res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requiresConfirmation: true, code: 'NAVIGATION_PATTERN_CONFIRMATION_REQUIRED' }),
    )
    expect(instance.createQueryJob).toHaveBeenCalledTimes(1)
    expect(instance.getQueryResults).not.toHaveBeenCalled()
    const confirmed = setup({ bytes: String(bytes) })
    await confirmed.request({ ...valid, confirmedBytes: bytes })
    expect(confirmed.res.status).not.toHaveBeenCalled()
    expect(confirmed.createQueryJob.mock.calls[1][0].maximumBytesBilled).toBe(MAX_BYTES_BILLED)
  })

  it('requires renewed confirmation if cost increased after the first quote', async () => {
    const instance = setup({ bytes: String(60 * 1024 ** 3) })
    await instance.request({ ...valid, confirmedBytes: 50 * 1024 ** 3 })
    expect(instance.res.status).toHaveBeenCalledWith(409)
    expect(instance.getQueryResults).not.toHaveBeenCalled()
  })

  it('blocks estimates above the hard budget even when confirmation is supplied', async () => {
    const instance = setup({ bytes: String(Number(MAX_BYTES_BILLED) + 1) })
    await instance.request({ ...valid, confirmedBytes: Number(MAX_BYTES_BILLED) })
    expect(instance.res.status).toHaveBeenCalledWith(413)
    expect(instance.getQueryResults).not.toHaveBeenCalled()
    expect(instance.createQueryJob).toHaveBeenCalledTimes(1)
  })
})
