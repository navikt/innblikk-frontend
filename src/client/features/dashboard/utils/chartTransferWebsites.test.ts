import { getMissingWebsiteIds, prepareChartWebsites } from './chartTransferWebsites'
import type { TransferChart } from './chartTransfer'
import type { Website } from '../../../shared/types/website'

const validId = '11111111-1111-1111-1111-111111111111'
const replacementId = '22222222-2222-2222-2222-222222222222'
const missingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const otherMissingId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const websites: Website[] = [validId, replacementId].map((id) => ({
  id,
  name: id,
  domain: '',
  teamId: '',
  createdAt: '',
}))
const makeChart = (sql: string): TransferChart => ({
  title: 'Besøk',
  graphType: 'TABLE',
  width: 50,
  queries: [{ name: 'Besøk', sql }],
})

it('requires a replacement for each distinct missing ID across equality filters, lists and variants', () => {
  const chart = {
    ...makeChart(`SELECT * FROM events WHERE e.website_id IN ('${validId}', '${missingId}', '${otherMissingId}')`),
    queries: [
      {
        name: 'Alle',
        sql: `SELECT * FROM events WHERE e.website_id IN ('${validId}', '${missingId}', '${otherMissingId}')`,
      },
      { name: 'En', sql: `SELECT * FROM events WHERE '${missingId}' = e.website_id` },
    ],
  }
  expect(getMissingWebsiteIds(chart, websites)).toEqual([missingId, otherMissingId])
  expect(() => prepareChartWebsites(chart, websites, { [missingId]: validId })).toThrow('hvert nettsted')
  const prepared = prepareChartWebsites(chart, websites, {
    [missingId]: validId,
    [otherMissingId]: replacementId,
  })
  expect(prepared.queries).toEqual([
    {
      name: 'Alle',
      sql: `SELECT * FROM events WHERE e.website_id IN ('${validId}', '${validId}', '${replacementId}')`,
    },
    { name: 'En', sql: `SELECT * FROM events WHERE '${validId}' = e.website_id` },
  ])
})

it('preserves existing IDs, unrelated literals, comments and other filter placeholders', () => {
  const sql = [
    `SELECT '${missingId}' AS label FROM events`,
    `WHERE \`website_id\` = "${missingId}" AND e.website_id = '${validId}'`,
    `AND event_name = '${missingId}' [[AND {{created_at}}]]`,
    `-- website_id = '${otherMissingId}'`,
    `/* website_id IN ('${otherMissingId}') */`,
  ].join('\n')
  const chart = makeChart(sql)
  expect(getMissingWebsiteIds(chart, websites)).toEqual([missingId])
  expect(prepareChartWebsites(chart, websites, { [missingId]: replacementId }).queries[0].sql).toBe(
    sql.replace(`\`website_id\` = "${missingId}"`, `\`website_id\` = '${replacementId}'`),
  )
})

it('uses the validated source website for placeholders, or requires a valid replacement if it is missing', () => {
  const chart = { ...makeChart("SELECT * FROM events WHERE website_id = '{{website_id}}'"), websiteId: validId }
  expect(getMissingWebsiteIds(chart, websites)).toEqual([])
  expect(prepareChartWebsites(chart, websites, {}).queries[0].sql).toBe(
    `SELECT * FROM events WHERE website_id = '${validId}'`,
  )
  const missingChart = { ...chart, websiteId: missingId }
  expect(getMissingWebsiteIds(missingChart, websites)).toEqual([missingId])
  expect(prepareChartWebsites(missingChart, websites, { [missingId]: replacementId }).queries[0].sql).toBe(
    `SELECT * FROM events WHERE website_id = '${replacementId}'`,
  )
  expect(() => prepareChartWebsites(missingChart, websites, { [missingId]: 'nonexistent' })).toThrow()
})

it('requires a website for unresolved placeholders even when the source ID was not supplied', () => {
  const chart = makeChart('SELECT * FROM events WHERE website_id = {{website_id}}')
  expect(getMissingWebsiteIds(chart, websites)).toEqual(['{{website_id}}'])
  expect(prepareChartWebsites(chart, websites, { '{{website_id}}': validId }).queries[0].sql).toBe(
    `SELECT * FROM events WHERE website_id = '${validId}'`,
  )
})

it('leaves multi-website charts unchanged when all referenced IDs exist in the destination', () => {
  const chart = makeChart(`SELECT * FROM events WHERE website_id IN ('${validId}', '${replacementId}')`)
  expect(getMissingWebsiteIds(chart, websites)).toEqual([])
  expect(prepareChartWebsites(chart, websites, {})).toEqual(chart)
})

it('requires a valid replacement even when the original website ID is malformed', () => {
  const chart = makeChart("SELECT * FROM events WHERE website_id = 'invalid-id'")
  expect(getMissingWebsiteIds(chart, websites)).toEqual(['invalid-id'])
  expect(() => prepareChartWebsites(chart, websites, {})).toThrow()
  expect(prepareChartWebsites(chart, websites, { 'invalid-id': validId }).queries[0].sql).toBe(
    `SELECT * FROM events WHERE website_id = '${validId}'`,
  )
})
