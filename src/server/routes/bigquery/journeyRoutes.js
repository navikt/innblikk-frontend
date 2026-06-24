import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import {
  requireBigQuery,
  getNavIdent,
  getDryRunStats,
  normalizeUrlSql,
  MAX_BYTES_BILLED,
  prepareGeneratedSql,
} from './helpers.js'

export function createJourneyRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Get user journeys from BigQuery
  router.post('/api/bigquery/journeys', async (req, res) => {
    try {
      const { websiteId, startUrl, startDate, endDate, steps = 3, limit = 30, direction = 'forward' } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return

      // Choose LAG (backward) or LEAD (forward) based on direction
      const windowFunction = direction === 'backward' ? 'LAG' : 'LEAD'
      const nextUrlColumn = direction === 'backward' ? 'prev_url' : 'next_url'
      const timeOperator = direction === 'backward' ? '<=' : '>='

      const query = `
          WITH session_events AS (
              SELECT
                  session_id,
                  ${normalizeUrlSql('url_path')} as url_path,
                  created_at,
              MIN(CASE 
                  WHEN (${normalizeUrlSql('url_path')}) = @startUrl 
                  THEN created_at 
              END) 
                      OVER (PARTITION BY session_id) AS start_time
              FROM \`${GCP_PROJECT_ID}.umami_views.event\`
              WHERE website_id = @websiteId
                  AND created_at BETWEEN @startDate AND @endDate
                  AND event_type = 1 -- Pageview
          ),
          journey_steps AS (
              SELECT
                  session_id,
                  url_path,
                  created_at,
                  ${windowFunction}(url_path) OVER (PARTITION BY session_id ORDER BY created_at) AS ${nextUrlColumn}
              FROM session_events
              WHERE start_time IS NOT NULL
                  AND created_at ${timeOperator} start_time
          ),
          renumbered_steps AS (
              SELECT
                  j.session_id,
                  j.url_path,
                  j.${nextUrlColumn},
                  ROW_NUMBER() OVER (PARTITION BY j.session_id ORDER BY j.created_at ${direction === 'backward' ? 'DESC' : 'ASC'}) - 1 AS step
              FROM journey_steps j
          ),
          raw_flows AS (
              SELECT
                  step,
                  url_path AS source,
                  ${nextUrlColumn} AS target,
                  COUNT(*) AS value
              FROM renumbered_steps
              WHERE step < @steps
                  AND ${nextUrlColumn} IS NOT NULL
                  -- Filter out self-loops (same page to same page)
                  AND url_path != ${nextUrlColumn}
                  -- Ensure step 0 ONLY has the start URL as source
                  AND (step > 0 OR url_path = @startUrl)
                  -- Prevent start URL from appearing as source at steps > 0
                  AND NOT (step > 0 AND url_path = @startUrl)
                  -- Prevent start URL from appearing as target at steps > 0 (no back-navigation to start)
                  AND NOT (step > 0 AND ${nextUrlColumn} = @startUrl)
              GROUP BY 1, 2, 3
          ),
          ranked AS (
              SELECT
                  *,
                  ROW_NUMBER() OVER (PARTITION BY step ORDER BY value DESC) AS rank_in_step
              FROM raw_flows
          ),
          top_flows AS (
              SELECT
                  step,
                  source,
                  target,
                  value
              FROM ranked
              WHERE rank_in_step <= @limit
          ),
          -- Collect all valid pages at each step (step 0 targets, step 1 targets, etc.)
          valid_pages_per_step AS (
              SELECT 0 as step, @startUrl as page
              UNION ALL
              SELECT step + 1 as step, target as page
              FROM top_flows
          )
          SELECT
              t.step,
              t.source,
              t.target,
              t.value
          FROM top_flows t
          INNER JOIN valid_pages_per_step v
              ON v.step = t.step
              AND v.page = t.source
          ORDER BY step, value DESC
      `

      const params = { websiteId, startUrl, startDate, endDate, steps, limit }

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Sideflyt',
        ),
      )

      const [rows] = await job.getQueryResults()

      // Transform to Sankey format
      const nodes = []
      const links = []
      const nodeMap = new Map()

      const getNodeIndex = (name, step) => {
        const id = `${step}:${name}`
        if (!nodeMap.has(id)) {
          nodeMap.set(id, nodes.length)
          nodes.push({ nodeId: id, name, color: '#0056b3' })
        }
        return nodeMap.get(id)
      }

      rows.forEach((row) => {
        const sourceIndex = getNodeIndex(row.source, row.step)
        const targetIndex = getNodeIndex(row.target, row.step + 1)
        links.push({
          source: sourceIndex,
          target: targetIndex,
          value: parseInt(row.value),
        })
      })

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          params,
          navIdent,
          analysisType: 'Sideflyt',
        },
        addAuditLogging,
      )

      res.json({ nodes, links, generatedSql: prepareGeneratedSql(query, params), queryStats })
    } catch (error) {
      console.error('BigQuery journeys error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch user journeys',
      })
    }
  })

  return router
}
