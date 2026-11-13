import { describe, expect, it, vi } from 'vitest'
import { createUserProfileRoutes } from './userProfileRoutes.js'
import { MAX_BYTES_BILLED } from './helpers.js'

vi.mock('./helpers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDryRunStats: vi.fn().mockResolvedValue(null),
}))

describe('user profile activity', () => {
  it.each([0, 41])('returns %i activities counted across the selected users sessions', async (eventCount) => {
    const bigquery = {
      createQueryJob: vi
        .fn()
        .mockResolvedValueOnce([
          {
            getQueryResults: vi.fn().mockResolvedValue([
              [
                {
                  user_id: 'cookie-1',
                  id_type: 'cookie',
                  session_ids: ['session-1', 'session-2'],
                  primary_session_id: 'session-2',
                  first_seen: { value: '2026-10-01T10:00:00Z' },
                  last_seen: { value: '2026-10-01T11:00:00Z' },
                  event_count: String(eventCount),
                },
              ],
            ]),
          },
        ])
        .mockResolvedValueOnce([{ getQueryResults: vi.fn().mockResolvedValue([[{ total: 1 }]]) }]),
    }
    const router = createUserProfileRoutes({ bigquery, GCP_PROJECT_ID: 'test-project' })
    const handler = router.stack.find((layer) => layer.route?.path === '/api/bigquery/users').route.stack[0].handle
    const body = {
      websiteId: 'site-1',
      startDate: '2026-10-01T00:00:00Z',
      endDate: '2026-10-02T00:00:00Z',
      countBy: 'distinct_id',
    }
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }
    await handler({ body, user: { navIdent: 'Z123456' } }, res)
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [expect.objectContaining({ userId: 'cookie-1', eventCount, sessionIds: ['session-1', 'session-2'] })],
      }),
    )
    const config = bigquery.createQueryJob.mock.calls[0][0]
    expect(config.query).toContain('COUNT(DISTINCT event_id) AS event_count')
    expect(config.query).toContain('test-project.umami_views.event')
    expect(config.query).toContain('SELECT COALESCE(SUM(event_count), 0) FROM event_counts')
    expect(config.query).toContain('session_id IN UNNEST(selected_users.session_ids)')
    expect(config.query).toContain('created_at BETWEEN @startDate AND @endDate')
    expect(config.query).toContain('website_id = @websiteId')
    expect(config.query).not.toContain('COUNT(*) as event_count')
    expect(config.maximumBytesBilled).toBe(MAX_BYTES_BILLED)
  })

  it('returns event details and preserves activity without properties', async () => {
    const rows = [
      {
        event_id: 'event-1',
        created_at: { value: '2026-10-01T10:00:00Z' },
        event_type: 2,
        event_name: 'navigere',
        url_path: '/soknad',
        page_title: 'Soknad',
        properties: [{ key: 'knapp', value: 'Neste' }],
        property_count: '2',
      },
      { event_id: 'event-2', created_at: { value: '2026-10-01T09:00:00Z' }, event_type: 1 },
    ]
    const bigquery = {
      createQueryJob: vi.fn().mockResolvedValue([{ getQueryResults: vi.fn().mockResolvedValue([rows]) }]),
    }
    const router = createUserProfileRoutes({ bigquery, GCP_PROJECT_ID: 'test-project' })
    const handler = router.stack.find((layer) => layer.route?.path === '/api/bigquery/users/:sessionId/activity').route
      .stack[0].handle
    const body = { websiteId: 'site-1', startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-02T00:00:00Z' }
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }

    await handler({ params: { sessionId: 'session-1' }, body, user: { navIdent: 'Z123456' } }, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({
      activity: [
        expect.objectContaining({
          id: 'event-1',
          type: 'event',
          properties: [{ key: 'knapp', value: 'Neste' }],
          propertyCount: 2,
        }),
        expect.objectContaining({ id: 'event-2', type: 'pageview', properties: [], propertyCount: 0 }),
      ],
      queryStats: null,
    })
    const config = bigquery.createQueryJob.mock.calls[0][0]
    expect(config.params).toEqual({ ...body, sessionId: 'session-1' })
    expect(config.maximumBytesBilled).toBe(MAX_BYTES_BILLED)
    expect(config.query).toContain('test-project.umami_views.event_data')
    expect(config.query).toContain('d.website_id = @websiteId')
    expect(config.query).toContain('d.created_at BETWEEN @startDate AND @endDate')
    expect(config.query).toContain('LIMIT 50')
    expect(config.query).toContain('LIMIT 1000')
    expect(config.query).toContain('e.event_id = p.website_event_id AND e.created_at = p.created_at')
  })
})
