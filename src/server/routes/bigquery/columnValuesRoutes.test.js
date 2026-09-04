import { describe, it, expect } from 'vitest'
import { buildColumnValuesQuery, ALLOWED_COLUMNS } from './columnValuesRoutes.js'

const PROJECT = 'test-project'

describe('buildColumnValuesQuery', () => {
  it('queries an event-column directly on public_website_event', () => {
    const { query } = buildColumnValuesQuery({ projectId: PROJECT, column: 'url_path' })
    expect(query).toContain('FROM `test-project.umami.public_website_event` e')
    expect(query).toContain('SELECT e.url_path AS value')
    expect(query).toContain('e.website_id = @websiteId')
    expect(query).toContain('e.created_at BETWEEN @startDate AND @endDate')
    expect(query).toContain('LIMIT 500') // url_path gets the higher limit
    expect(query).not.toContain('JOIN')
  })

  it('joins public_session for session-level columns (browser/os/device/country)', () => {
    for (const column of ['browser', 'os', 'device', 'country']) {
      const { query } = buildColumnValuesQuery({ projectId: PROJECT, column })
      expect(query).toContain('JOIN `test-project.umami.public_session` s')
      expect(query).toContain(`SELECT s.${column} AS value`)
      expect(query).toContain('LIMIT 100')
    }
  })

  it('filters s.created_at on session joins (public_session has REQUIRE_PARTITION_FILTER)', () => {
    for (const column of ['browser', 'os', 'device', 'country']) {
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

  it('allowlist covers exactly the columns the cohort editor needs', () => {
    expect([...ALLOWED_COLUMNS].sort()).toEqual(
      [
        'browser',
        'country',
        'device',
        'event_data_key',
        'event_data_value',
        'event_name',
        'os',
        'referrer_domain',
        'url_path',
      ].sort(),
    )
  })
})
