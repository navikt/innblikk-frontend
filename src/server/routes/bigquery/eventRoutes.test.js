import { describe, it, expect, vi } from 'vitest'
import { createEventRouter } from './eventRoutes.js'

const getJourneyQuery = async () => {
  const createQueryJob = vi.fn(async () => [
    {
      metadata: { statistics: { totalBytesProcessed: '0' } },
      getQueryResults: async () => [[]],
    },
  ])
  const router = createEventRouter({
    bigquery: { createQueryJob },
    GCP_PROJECT_ID: 'test-project',
  })
  const handler = router.stack.find((layer) => layer.route?.path === '/api/bigquery/event-journeys').route.stack[0]
    .handle
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }

  await handler(
    {
      body: {
        websiteId: 'site-1',
        urlPath: '/',
        startDate: '2026-10-01T00:00:00Z',
        endDate: '2026-10-02T00:00:00Z',
      },
    },
    res,
  )

  expect(res.status).not.toHaveBeenCalled()
  expect(createQueryJob).toHaveBeenCalledTimes(3)
  const query = createQueryJob.mock.calls[1][0].query
  expect(createQueryJob.mock.calls[0][0].query).toContain(query.slice(query.indexOf('WITH EventProps AS')))
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ journeys: [], generatedSql: expect.any(String) }))
  return query
}

describe('event journey grouping', () => {
  it('excludes technical metadata from properties before deduplication and path counting', async () => {
    const query = await getJourneyQuery()
    const exclusion = query.match(/WHEN REGEXP_CONTAINS\(LOWER\(p\.data_key\), r'([^']+)'\) THEN NULL/)
    expect(exclusion).not.toBeNull()
    const excludedKey = new RegExp(exclusion[1])

    for (const key of [
      'deviceBrowser',
      'deviceBrowserVersion',
      'deviceConnection',
      'deviceDPR',
      'deviceMobile',
      'deviceOS',
      'deviceOSVersion',
      'deviceTouch',
      'deviceViewportHeight',
      'deviceViewportWidth',
      'deviceWebview',
      'DeviceViewportWidth',
      'originVersion',
      'scrollPos',
      'screen',
      'screenWidth',
      'screenHeight',
      'viewport',
      'timestamp',
      'time',
      'scrollDepth',
    ]) {
      expect(excludedKey.test(key.toLowerCase()), key).toBe(true)
    }

    for (const key of [
      'lenketekst',
      'destinasjon',
      'komponent',
      'component',
      'tittel',
      'innholdstype',
      'kategori',
      'målgruppe',
      'origin',
      'viaDekoratoren',
      'customParameter',
      'screenName',
      'timeSpent',
    ]) {
      expect(excludedKey.test(key.toLowerCase()), key).toBe(false)
    }

    expect(query).toMatch(/STRING_AGG\(\s*CASE\s*WHEN REGEXP_CONTAINS/)
    expect(query).toMatch(/ELSE CONCAT\(\s*p\.data_key/)
    expect(query).toContain(') as props_str')
    expect(query).toContain("OR IFNULL(props_str, '') != IFNULL(prev_props_str, '')")
    expect(query).toContain("IF(props_str IS NOT NULL, CONCAT(event_name, ': ', props_str), event_name)")
    expect(query).toContain('FROM SessionPaths\n                  GROUP BY path')
    expect(query.indexOf('REGEXP_CONTAINS')).toBeLessThan(query.indexOf('DedupedEvents AS'))
    expect(query.indexOf('DedupedEvents AS')).toBeLessThan(query.indexOf('LIMIT 100'))
  })
})
