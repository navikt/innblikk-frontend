import { describe, it, expect, vi } from 'vitest'
import { buildSidegroupClause, buildTimeSeriesBucketSql, getWebsitesList } from './helpers.js'

/**
 * Captures the SQL that getWebsitesList sends to BigQuery. The mock chain mirrors the
 * @google-cloud/bigquery call shape: createQueryJob -> job.getQueryResults().
 */
function createBigQuerySpy(rows = []) {
  const createQueryJob = vi.fn(async () => [{ getQueryResults: async () => [rows] }])
  return { bigquery: { createQueryJob }, createQueryJob }
}

const identityAuditLogging = (options) => options

describe('getWebsitesList', () => {
  // public_website is append-only, and soft delete appends a tombstone row with
  // deleted_at set. Filtering deleted_at before deduplicating would resurrect the
  // pre-delete version of a deleted website, so the latest-version pick (QUALIFY)
  // must happen first and the tombstone filter must apply to that latest row only.
  it('deduplicates to the latest version BEFORE excluding deleted rows', async () => {
    const { bigquery, createQueryJob } = createBigQuerySpy()

    await getWebsitesList(bigquery, 'test-project', 'Z123456', identityAuditLogging)

    const query = createQueryJob.mock.calls[0][0].query
    const qualifyIndex = query.indexOf('QUALIFY')
    const whereIndex = query.indexOf('WHERE')
    expect(qualifyIndex).toBeGreaterThan(-1)
    expect(whereIndex).toBeGreaterThan(-1)
    expect(qualifyIndex).toBeGreaterThan(whereIndex)
    expect(query.slice(whereIndex, qualifyIndex)).not.toContain('deleted_at')
    expect(query.slice(qualifyIndex)).toContain('deleted_at IS NULL')
  })

  it('returns only rows BigQuery yields from the tombstone-filtered query', async () => {
    const rows = [{ id: 'a', name: 'Aktiv', domain: 'a.nav.no', createdAt: '2026-01-01', updatedAt: '2026-01-02' }]
    const { bigquery } = createBigQuerySpy(rows)

    const result = await getWebsitesList(bigquery, 'test-project', 'Z123456', identityAuditLogging)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('unwraps BigQuery timestamp objects ({value}) for created/updated dates', async () => {
    const rows = [
      {
        id: 'a',
        name: 'Aktiv',
        domain: 'a.nav.no',
        createdAt: { value: '2026-01-01T00:00:00Z' },
        updatedAt: { value: '2026-01-02T00:00:00Z' },
      },
    ]
    const { bigquery } = createBigQuerySpy(rows)

    const result = await getWebsitesList(bigquery, 'test-project', 'Z123456', identityAuditLogging)

    expect(result[0].createdAt).toBe('2026-01-01T00:00:00Z')
    expect(result[0].updatedAt).toBe('2026-01-02T00:00:00Z')
  })
})

describe('buildSidegroupClause', () => {
  it('uses literal, case-insensitive matching for every rule type', () => {
    const params = {}
    const clause = buildSidegroupClause(
      {
        include: ['/news_%'],
        exclude: ['/private_%'],
        exact: ['/EXACT'],
        startWith: ['/start_%'],
        endWith: ['/end_%'],
      },
      'e.url_path',
      params,
    )

    expect(clause).toContain('STRPOS(LOWER(e.url_path), LOWER(@sgInclude0)) > 0')
    expect(clause).toContain('STRPOS(LOWER(e.url_path), LOWER(@sgExclude0)) = 0')
    expect(clause).toContain('LOWER(e.url_path) = LOWER(@sgExact0)')
    expect(clause).toContain('STARTS_WITH(LOWER(e.url_path), LOWER(@sgStartWith0))')
    expect(clause).toContain('ENDS_WITH(LOWER(e.url_path), LOWER(@sgEndWith0))')
    expect(clause).not.toContain('LIKE')
    expect(params).toEqual({
      sgInclude0: '/news_%',
      sgStartWith0: '/start_%',
      sgEndWith0: '/end_%',
      sgExact0: '/EXACT',
      sgExclude0: '/private_%',
    })
  })
})

// day/week/month buckets are BigQuery DATE (day precision only). Casting them
// to TIMESTAMP(tz) fabricates a time-of-day that never existed upstream, and
// shifts the date across the UTC boundary (e.g. Oslo midnight -> previous day
// 22:00/23:00 UTC). The output expression must stay a plain DATE.
//
// Shared by eventRoutes.js (event-series) and trafficRoutes.js (traffic-series)
// so this fix — and any future one — only has to be made in one place.
describe('buildTimeSeriesBucketSql', () => {
  it.each(['day', 'week', 'month'])('does not cast %s buckets to TIMESTAMP', (interval) => {
    const { outputBucketAsTimestamp } = buildTimeSeriesBucketSql(interval, 'Europe/Oslo')

    expect(outputBucketAsTimestamp).toBe('buckets.time')
    expect(outputBucketAsTimestamp).not.toMatch(/TIMESTAMP\(/)
  })

  it('keeps hour buckets as real timestamps', () => {
    const { outputBucketAsTimestamp, eventBucketExpression } = buildTimeSeriesBucketSql('hour', 'Europe/Oslo')

    expect(outputBucketAsTimestamp).toBe('buckets.time')
    expect(eventBucketExpression).toContain('TIMESTAMP_TRUNC')
  })

  it('defaults the bucket column to created_at', () => {
    const { eventBucketExpression } = buildTimeSeriesBucketSql('day', 'Europe/Oslo')

    expect(eventBucketExpression).toContain('created_at')
  })

  it('accepts a qualified column name, e.g. for a joined table', () => {
    const { eventBucketExpression } = buildTimeSeriesBucketSql('day', 'Europe/Oslo', 'w.created_at')

    expect(eventBucketExpression).toContain('w.created_at')
  })
})
