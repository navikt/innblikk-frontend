import { describe, it, expect, vi } from 'vitest'
import { buildColumnValuesQuery, ALLOWED_COLUMNS, createColumnValuesRouter } from './columnValuesRoutes.js'
import { MAX_BYTES_BILLED } from './helpers.js'

const PROJECT = 'test-project'

describe('column-values cost limits', () => {
  it.each([
    { costs: [1], days: 30 },
    { costs: [1.01, 1], days: 14 },
    { costs: [2, 1.01, 1], days: 7 },
    { costs: [2, 2, 1.01], days: null },
  ])('uses only the first affordable window: $costs', async ({ costs, days }) => {
    const createQueryJob = vi.fn(async (config) =>
      config.dryRun
        ? [
            {
              metadata: {
                statistics: { totalBytesProcessed: String((costs.shift() / 6.25) * 1024 ** 4) },
              },
            },
          ]
        : [{ getQueryResults: async () => [[{ value: 'Chrome' }]] }],
    )
    const router = createColumnValuesRouter({
      bigquery: { createQueryJob },
      GCP_PROJECT_ID: PROJECT,
    })
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const handler = router.stack[0].route.stack[0].handle
    await handler({ params: { websiteId: 'site-1' }, query: { column: 'browser' } }, res)

    const configs = createQueryJob.mock.calls.map(([config]) => config)
    const dryRuns = configs.filter((config) => config.dryRun)
    expect(
      dryRuns.map((config) =>
        Math.round((Date.parse(config.params.endDate) - Date.parse(config.params.startDate)) / 86400000),
      ),
    ).toEqual(days === 30 ? [30] : days === 14 ? [30, 14] : [30, 14, 7])
    const executions = configs.filter((config) => !config.dryRun)
    if (days === null) {
      expect(executions).toHaveLength(0)
      expect(res.status).toHaveBeenCalledWith(422)
      expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('too expensive') })
    } else {
      expect(executions).toHaveLength(1)
      expect(executions[0].maximumBytesBilled).toBe(MAX_BYTES_BILLED)
      expect(res.json).toHaveBeenCalledWith({ values: ['Chrome'], scannedDays: days })
    }
  })
})

describe('buildColumnValuesQuery', () => {
  it('suggests nonempty URL parameters with the same website, partition and result limits', () => {
    const { query } = buildColumnValuesQuery({ projectId: PROJECT, column: 'url_query' })
    expect(query).toContain("SELECT NULLIF(TRIM(e.url_query), '') AS value")
    expect(query).toContain("NULLIF(TRIM(e.url_query), '') IS NOT NULL")
    expect(query).toContain('FROM `test-project.umami.public_website_event` e')
    expect(query).toContain('e.website_id = @websiteId')
    expect(query).toContain('e.created_at BETWEEN @startDate AND @endDate')
    expect(query).toContain('LIMIT 100')
    expect(query).not.toContain('JOIN')
  })
  it('queries an event-column directly on public_website_event', () => {
    const { query } = buildColumnValuesQuery({ projectId: PROJECT, column: 'url_path' })
    expect(query).toContain('FROM `test-project.umami.public_website_event` e')
    expect(query).toContain('SELECT e.url_path AS value')
    expect(query).toContain('e.website_id = @websiteId')
    expect(query).toContain('e.created_at BETWEEN @startDate AND @endDate')
    expect(query).toContain('LIMIT 500') // url_path gets the higher limit
    expect(query).not.toContain('JOIN')
  })

  it('joins public_session for session-level columns', () => {
    for (const column of ['browser', 'os', 'device', 'screen', 'language', 'country']) {
      const { query } = buildColumnValuesQuery({ projectId: PROJECT, column })
      expect(query).toContain('JOIN `test-project.umami.public_session` s')
      expect(query).toContain(`SELECT s.${column} AS value`)
      expect(query).toContain('LIMIT 100')
    }
  })

  it('keeps event-name suggestions case-sensitive', () => {
    const { query } = buildColumnValuesQuery({ projectId: PROJECT, column: 'event_name' })

    expect(query).toContain('SELECT ANY_VALUE(e.event_name) AS value')
    expect(query).toContain('GROUP BY TO_HEX(CAST(e.event_name AS BYTES))')
  })

  it('filters s.created_at on session joins (public_session has REQUIRE_PARTITION_FILTER)', () => {
    for (const column of ['browser', 'os', 'device', 'screen', 'language', 'country']) {
      const { query } = buildColumnValuesQuery({ projectId: PROJECT, column })
      expect(query).toContain('s.created_at BETWEEN @startDate AND @endDate')
    }
  })

  it('unnests event_parameters for event_data_key', () => {
    const { query } = buildColumnValuesQuery({ projectId: PROJECT, column: 'event_data_key' })
    expect(query).toContain('JOIN `test-project.umami_views.event_data` d')
    expect(query).toContain('CROSS JOIN UNNEST(d.event_parameters) AS p')
    expect(query).toContain('SELECT p.data_key AS value')
    expect(query).not.toContain('@key')
  })

  it('scopes event_data_value to one parameter key and coalesces non-string values', () => {
    const { query } = buildColumnValuesQuery({ projectId: PROJECT, column: 'event_data_value' })
    expect(query).toContain('p.data_key = @key')
    expect(query).toContain('COALESCE(NULLIF(TRIM(p.string_value)')
  })

  it('adds a contains-filter only for url_path when q is given', () => {
    const { query } = buildColumnValuesQuery({ projectId: PROJECT, column: 'url_path', q: 'tiltak' })
    expect(query).toContain('LOWER(e.url_path) LIKE @q')
    const { query: other } = buildColumnValuesQuery({ projectId: PROJECT, column: 'browser', q: 'chrome' })
    expect(other).not.toContain('@q')
  })

  it('throws for a non-allowlisted column (allowlist is enforced by the route)', () => {
    expect(() => buildColumnValuesQuery({ projectId: PROJECT, column: 'DROP TABLE x' })).toThrow(/Unsupported column/)
  })

  it('allowlist covers the supported cohort and chart filter suggestions', () => {
    expect([...ALLOWED_COLUMNS].sort()).toEqual(
      [
        'browser',
        'country',
        'device',
        'event_data_key',
        'event_data_value',
        'event_name',
        'language',
        'os',
        'referrer_domain',
        'screen',
        'url_path',
        'url_query',
      ].sort(),
    )
  })
})
