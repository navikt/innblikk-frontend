import { describe, it, expect } from 'vitest'
import { buildSidegroupClause, buildTimeSeriesBucketSql } from './helpers.js'

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
