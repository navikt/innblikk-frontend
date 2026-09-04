import express from 'express'
import { addAuditLogging, getAnalysisTypeOverride } from '../../bigquery/audit.js'
import { MAX_BYTES_BILLED, normalizeUrlSql, buildTimeSeriesBucketSql } from './helpers.js'
import { logger } from '../../logger.js'

export function createTrafficRouter({ bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE }) {
  const router = express.Router()

  // Get traffic series data (visits over time)
  router.get('/api/bigquery/websites/:websiteId/traffic-series', async (req, res) => {
    try {
      const { websiteId } = req.params
      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const {
        startAt,
        endAt,
        urlPath,
        interval = 'day',
        metricType = 'visits',
        pathOperator,
        countBy,
        countBySwitchAt,
      } = req.query
      logger.info({ metricType, urlPath, pathOperator, countBy }, '[Traffic Series] Request')

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId = countBy === 'distinct_id' && (metricType === 'visitors' || metricType === 'proportion')
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const col = useDistinctId ? 'e.' : ''
      const fromClause = useDistinctId
        ? `\`${GCP_PROJECT_ID}.umami_views.event\` e LEFT JOIN \`${GCP_PROJECT_ID}.umami_views.session\` s ON e.session_id = s.session_id AND s.created_at BETWEEN @startDate AND @endDate`
        : `\`${GCP_PROJECT_ID}.umami_views.event\``
      const sessionIdAsString = `CAST(${col}session_id AS STRING)`
      const distinctIdWithFallback = `COALESCE(NULLIF(s.distinct_id, ''), ${sessionIdAsString})`
      const userIdExpression = useSwitch
        ? `IF(${col}created_at >= @countBySwitchAt, ${distinctIdWithFallback}, ${sessionIdAsString})`
        : useDistinctId
          ? distinctIdWithFallback
          : 'session_id'

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      const params = {
        websiteId: websiteId,
        startDate: startDate,
        endDate: endDate,
      }
      if (useSwitch) {
        params.countBySwitchAt = new Date(countBySwitchAtMs).toISOString()
      }

      let urlFilter = ''
      let urlFilterCondition = 'FALSE' // Default for proportion if no path (shouldn't happen if validated)

      if (urlPath) {
        if (pathOperator === 'starts-with') {
          const condition = `LOWER(${col}url_path) LIKE @urlPathPattern`
          urlFilter = `AND ${condition}`
          urlFilterCondition = condition
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          const condition = `(
                      ${col}url_path = @urlPath 
                      OR ${col}url_path = @urlPathSlash 
                      OR ${col}url_path LIKE @urlPathQuery
                  )`
          urlFilter = `AND ${condition}`
          urlFilterCondition = `
                      ${col}url_path = @urlPath 
                      OR ${col}url_path = @urlPathSlash 
                      OR ${col}url_path LIKE @urlPathQuery
                  `
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      const { bucketSeriesSql, eventBucketExpression, outputBucketAsTimestamp } = buildTimeSeriesBucketSql(
        interval,
        BIGQUERY_TIMEZONE,
        `${col}created_at`,
      )
      let query

      if (metricType === 'proportion') {
        // Proportion query (Andel)
        // Calculates: (Visitors to URL) / (Total Visitors) per time period
        query = `
                  WITH buckets AS (
                      ${bucketSeriesSql}
                  ),
                  base_query AS (
                      SELECT
                          ${eventBucketExpression} as time,
                          ${userIdExpression} as user_id,
                          CASE
                              WHEN (${urlFilterCondition}) THEN TRUE
                              ELSE FALSE
                          END AS has_visited
                      FROM ${fromClause}
                      WHERE ${col}website_id = @websiteId
                      AND ${col}created_at BETWEEN @startDate AND @endDate
                      AND ${col}event_type = 1 -- Pageview
                  ),
                  totals as (
                      SELECT 
                          time,
                          COUNT(DISTINCT user_id) AS total_visitors
                      FROM base_query
                      GROUP BY time
                  ),
                  specifics as (
                      SELECT 
                          time,
                          COUNT(DISTINCT user_id) AS specific_visitors
                      FROM base_query
                      WHERE has_visited = TRUE
                      GROUP BY time
                  ),
                  proportions AS (
                      SELECT
                          totals.time,
                          SAFE_DIVIDE(specifics.specific_visitors, totals.total_visitors) as count
                      FROM totals
                      LEFT JOIN specifics ON totals.time = specifics.time
                  )
                  SELECT
                      ${outputBucketAsTimestamp} as time,
                      COALESCE(proportions.count, 0) as count
                  FROM buckets
                  LEFT JOIN proportions ON buckets.time = proportions.time
                  ORDER BY buckets.time
              `
      } else {
        // Standard query (Visitors, Visits, or Pageviews)
        // Choose aggregation based on metric type
        let countExpression
        if (metricType === 'pageviews') {
          countExpression = 'COUNT(*)'
        } else if (metricType === 'visits') {
          countExpression = `APPROX_COUNT_DISTINCT(${col}visit_id)` // økter / besøk
        } else {
          countExpression = useDistinctId
            ? `APPROX_COUNT_DISTINCT(${userIdExpression})`
            : `APPROX_COUNT_DISTINCT(session_id)` // visitors (unike besøkende)
        }
        logger.info({ countExpression, useDistinctId }, '[Traffic Series] Count Expression')

        query = `
                  WITH buckets AS (
                      ${bucketSeriesSql}
                  ),
                  counts AS (
                      SELECT
                          ${eventBucketExpression} as time,
                          ${countExpression} as count
                      FROM ${fromClause}
                      WHERE ${col}website_id = @websiteId
                      AND ${col}created_at BETWEEN @startDate AND @endDate
                      AND ${col}event_type = 1 -- Pageview
                      ${urlFilter}
                      GROUP BY 1
                  )
                  SELECT
                      ${outputBucketAsTimestamp} as time,
                      COALESCE(counts.count, 0) as count
                  FROM buckets
                  LEFT JOIN counts ON buckets.time = counts.time
                  ORDER BY buckets.time
              `
      }

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Trafikkanalyse',
        ),
      )

      const [rows] = await job.getQueryResults()

      const data = rows.map((row) => ({
        time: row.time.value,
        count: Number(row.count),
      }))

      // Total across the whole period (not sum of buckets)
      let totalCount = null
      if (metricType !== 'proportion') {
        let totalCountExpression
        if (metricType === 'pageviews') {
          totalCountExpression = 'COUNT(*)'
        } else if (metricType === 'visits') {
          totalCountExpression = `APPROX_COUNT_DISTINCT(${col}visit_id)`
        } else {
          totalCountExpression = useDistinctId
            ? `APPROX_COUNT_DISTINCT(${userIdExpression})`
            : `APPROX_COUNT_DISTINCT(session_id)`
        }

        const totalQuery = `
                  SELECT
                      ${totalCountExpression} as total
                  FROM ${fromClause}
                  WHERE ${col}website_id = @websiteId
                  AND ${col}created_at BETWEEN @startDate AND @endDate
                  AND ${col}event_type = 1 -- Pageview
                  ${urlFilter}
              `

        const [totalJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: totalQuery,
              location: 'europe-north1',
              params: params,
              maximumBytesBilled: MAX_BYTES_BILLED,
            },
            navIdent,
            'Trafikkanalyse',
          ),
        )

        const [totalRows] = await totalJob.getQueryResults()
        if (totalRows && totalRows.length > 0) {
          totalCount = Number(totalRows[0].total)
        }
      }

      // Get dry run stats
      let queryStats = null
      try {
        // Get NAV ident from authenticated user for audit logging

        const [dryRunJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: query,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            'Trafikkanalyse',
          ),
        )

        const stats = dryRunJob.metadata.statistics
        const bytesProcessed = parseInt(stats.totalBytesProcessed)
        const gbProcessed = (bytesProcessed / 1024 ** 3).toFixed(1)
        const estimatedCostUSD = ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3)

        queryStats = {
          totalBytesProcessed: bytesProcessed,
          totalBytesProcessedGB: gbProcessed,
          estimatedCostUSD: estimatedCostUSD,
        }
      } catch (dryRunError) {
        logger.info({ dryRunError: dryRunError.message }, '[Traffic Series] Dry run failed')
      }

      res.json({
        data,
        totalCount,
        queryStats,
        meta: { usedDistinctId: useDistinctId },
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery traffic series error')
      res.status(500).json({
        error: error.message || 'Failed to fetch traffic series',
      })
    }
  })

  // Get traffic flow data (Source -> Landing -> Next)
  router.get('/api/bigquery/websites/:websiteId/traffic-flow', async (req, res) => {
    try {
      const { websiteId } = req.params
      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const { startAt, endAt, limit = '50', metricType = 'visits' } = req.query

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      let query
      const params = {
        websiteId: websiteId,
        startDate: startDate,
        endDate: endDate,
        limit: parseInt(limit),
      }

      // Choose aggregation based on metric type
      let countExpression = ''
      let proportionCTE = ''

      if (metricType === 'proportion') {
        proportionCTE = `
                  total_site_visitors AS (
                      SELECT COUNT(DISTINCT session_id) as total_count
                      FROM \`${GCP_PROJECT_ID}.umami_views.event\`
                      WHERE website_id = @websiteId
                        AND created_at BETWEEN @startDate AND @endDate
                        AND event_type = 1 -- Pageview
                  ),`
        // Will be set specifically per query branch due to alias differences
      } else if (metricType === 'pageviews') {
        countExpression = 'COUNT(*)'
      } else {
        countExpression = 'APPROX_COUNT_DISTINCT(session_id)' // visitors
      }

      if (req.query.urlPath) {
        // Page-centric flow: Source -> Specific Page -> Next

        // Check operator
        const pathOperator = req.query.pathOperator
        let condition = 'url_path = @urlPath'
        params.urlPath = req.query.urlPath // Set urlPath for both cases

        if (pathOperator === 'starts-with') {
          condition = 'LOWER(url_path) LIKE @urlPathPattern'
          params.urlPathPattern = req.query.urlPath.toLowerCase() + '%'
        } else {
          // params.urlPath is already set above to req.query.urlPath
        }

        const countExpr =
          metricType === 'proportion'
            ? 'SAFE_DIVIDE(APPROX_COUNT_DISTINCT(session_id), (SELECT total_count FROM total_site_visitors))'
            : countExpression

        query = `
                  WITH ${proportionCTE}
                  session_events AS (
                      SELECT
                          session_id,
                          referrer_domain,
                          ${normalizeUrlSql('url_path')} as url_path,
                          created_at
                      FROM \`${GCP_PROJECT_ID}.umami_views.event\`
                      WHERE website_id = @websiteId
                        AND created_at BETWEEN @startDate AND @endDate
                        AND event_type = 1 -- Pageview
                  ),
                  events_with_context AS (
                      SELECT
                          session_id,
                          url_path,
                          referrer_domain,
                          LAG(url_path) OVER (PARTITION BY session_id ORDER BY created_at) as prev_page,
                          LEAD(url_path) OVER (PARTITION BY session_id ORDER BY created_at) as next_page
                      FROM session_events
                  )
                  SELECT
                      CASE
                          WHEN prev_page IS NOT NULL THEN prev_page
                          ELSE COALESCE(referrer_domain, 'Direkte / Annet')
                      END as source,
                      url_path as landing_page, -- Using 'landing_page' alias to match frontend expectation (it's the center node)
                      COALESCE(next_page, 'Exit') as next_page,
                      ${countExpr} as count
                  FROM events_with_context
                  WHERE ${condition}
                  GROUP BY 1, 2, 3
                  ORDER BY 4 DESC
                  LIMIT @limit
              `
      } else {
        // Default: Landing Page Flow (Source -> Landing Page -> Next)

        const countExpr =
          metricType === 'proportion'
            ? 'SAFE_DIVIDE(APPROX_COUNT_DISTINCT(s.session_id), (SELECT total_count FROM total_site_visitors))'
            : metricType === 'pageviews'
              ? 'COUNT(*)'
              : 'APPROX_COUNT_DISTINCT(s.session_id)'

        query = `
                  WITH ${proportionCTE}
                  session_events AS (
                      SELECT
                          session_id,
                          referrer_domain,
                          ${normalizeUrlSql('url_path')} as url_path,
                          created_at,
                          ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as rn
                      FROM \`${GCP_PROJECT_ID}.umami_views.event\`
                      WHERE website_id = @websiteId
                        AND created_at BETWEEN @startDate AND @endDate
                        AND event_type = 1 -- Pageview
                  ),
                  session_starts AS (
                      SELECT
                          session_id,
                          referrer_domain,
                          url_path as landing_page,
                          created_at
                      FROM session_events
                      WHERE rn = 1
                  ),
                  second_pages AS (
                      SELECT
                          session_id,
                          url_path as second_page
                      FROM session_events
                      WHERE rn = 2
                  )
                  SELECT
                      COALESCE(s.referrer_domain, 'Direkte / Annet') as source,
                      s.landing_page,
                      COALESCE(sp.second_page, 'Exit') as next_page,
                      ${countExpr} as count
                  FROM session_starts s
                  LEFT JOIN second_pages sp ON s.session_id = sp.session_id
                  GROUP BY 1, 2, 3
                  ORDER BY 4 DESC
                  LIMIT @limit
              `
      }

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Trafikkanalyse',
        ),
      )

      const [rows] = await job.getQueryResults()

      const data = rows.map((row) => ({
        source: row.source,
        landingPage: row.landing_page,
        nextPage: row.next_page,
        count: Number(row.count),
      }))

      // Get dry run stats
      let queryStats = null
      try {
        // Get NAV ident from authenticated user for audit logging

        const [dryRunJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: query,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
          ),
        )

        const stats = dryRunJob.metadata.statistics
        const bytesProcessed = parseInt(stats.totalBytesProcessed)
        const gbProcessed = (bytesProcessed / 1024 ** 3).toFixed(1)
        const estimatedCostUSD = ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3)

        queryStats = {
          totalBytesProcessed: bytesProcessed,
          totalBytesProcessedGB: gbProcessed,
          estimatedCostUSD: estimatedCostUSD,
        }
      } catch (dryRunError) {
        logger.info({ dryRunError: dryRunError.message }, '[Traffic Flow] Dry run failed')
      }

      res.json({ data, queryStats })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery traffic flow error')
      res.status(500).json({
        error: error.message || 'Failed to fetch traffic flow',
      })
    }
  })

  // Get page metrics (accurate visitors/pageviews/proportion per page)
  router.get('/api/bigquery/websites/:websiteId/page-metrics', async (req, res) => {
    try {
      const { websiteId } = req.params
      const navIdent = req.user?.navIdent || 'UNKNOWN'
      const { startAt, endAt, urlPath, pathOperator, limit = '1000', countBy, countBySwitchAt } = req.query
      logger.info({ websiteId, urlPath, countBy }, '[Page Metrics] Request')

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId = countBy === 'distinct_id'
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const col = useDistinctId ? 'e.' : ''
      const fromClause = useDistinctId
        ? `\`${GCP_PROJECT_ID}.umami_views.event\` e LEFT JOIN \`${GCP_PROJECT_ID}.umami_views.session\` s ON e.session_id = s.session_id AND s.created_at BETWEEN @startDate AND @endDate`
        : `\`${GCP_PROJECT_ID}.umami_views.event\``
      const sessionIdAsString = `CAST(${col}session_id AS STRING)`
      const distinctIdWithFallback = `COALESCE(NULLIF(s.distinct_id, ''), ${sessionIdAsString})`
      const userIdExpression = useSwitch
        ? `IF(${col}created_at >= @countBySwitchAt, ${distinctIdWithFallback}, ${sessionIdAsString})`
        : useDistinctId
          ? distinctIdWithFallback
          : 'session_id'

      if (!bigquery) {
        return res.status(500).json({ error: 'BigQuery client not initialized' })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      const params = {
        websiteId,
        startDate,
        endDate,
        limit: parseInt(limit),
      }
      if (useSwitch) {
        params.countBySwitchAt = new Date(countBySwitchAtMs).toISOString()
      }

      let urlFilter = ''

      if (urlPath) {
        if (pathOperator === 'starts-with') {
          urlFilter = `AND LOWER(${col}url_path) LIKE @urlPathPattern`
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          urlFilter = `AND (
                      ${col}url_path = @urlPath 
                      OR ${col}url_path = @urlPathSlash 
                      OR ${col}url_path LIKE @urlPathQuery
                  )`
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      const query = `
              WITH total_stats AS (
                  SELECT APPROX_COUNT_DISTINCT(${userIdExpression}) as total_visitors
                  FROM ${fromClause}
                  WHERE ${col}website_id = @websiteId
                  AND ${col}created_at BETWEEN @startDate AND @endDate
                  AND ${col}event_type = 1
              ),
              page_stats AS (
                  SELECT
                      ${normalizeUrlSql(`${col}url_path`)} as url_path,
                      APPROX_COUNT_DISTINCT(${userIdExpression}) as visitors,
                      COUNT(*) as pageviews
                  FROM ${fromClause}
                  WHERE ${col}website_id = @websiteId
                  AND ${col}created_at BETWEEN @startDate AND @endDate
                  AND ${col}event_type = 1 -- Pageview
                  ${urlFilter}
                  GROUP BY 1
              )
              SELECT
                  p.url_path,
                  p.visitors,
                  p.pageviews,
                  SAFE_DIVIDE(p.visitors, t.total_visitors) as proportion
              FROM page_stats p
              CROSS JOIN total_stats t
              ORDER BY p.visitors DESC
              LIMIT @limit
          `

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'trafikkanalyse',
        ),
      )

      const [rows] = await job.getQueryResults()

      const data = rows.map((row) => ({
        urlPath: row.url_path,
        visitors: Number(row.visitors),
        pageviews: Number(row.pageviews),
        proportion: Number(row.proportion || 0),
      }))

      res.json({
        data,
        meta: { usedDistinctId: useDistinctId },
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery page metrics error')
      res.status(500).json({ error: error.message || 'Failed to fetch page metrics' })
    }
  })

  // Get traffic breakdown (accurate sources/exits)
  router.get('/api/bigquery/websites/:websiteId/traffic-breakdown', async (req, res) => {
    try {
      const { websiteId } = req.params
      const navIdent = req.user?.navIdent || 'UNKNOWN'
      const {
        startAt,
        endAt,
        urlPath,
        pathOperator,
        limit = '1000',
        metricType = 'visits',
        countBy,
        countBySwitchAt,
      } = req.query
      logger.info({ metricType, pathOperator, countBy }, '[Traffic Breakdown] Request')

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId = countBy === 'distinct_id' && (metricType === 'visitors' || metricType === 'proportion')
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const col = useDistinctId ? 'e.' : ''
      const fromClause = useDistinctId
        ? `\`${GCP_PROJECT_ID}.umami_views.event\` e LEFT JOIN \`${GCP_PROJECT_ID}.umami_views.session\` s ON e.session_id = s.session_id AND s.created_at BETWEEN @startDate AND @endDate`
        : `\`${GCP_PROJECT_ID}.umami_views.event\``
      const sessionIdAsString = `CAST(${col}session_id AS STRING)`
      const distinctIdWithFallback = `COALESCE(NULLIF(s.distinct_id, ''), ${sessionIdAsString})`
      const userIdExpression = useSwitch
        ? `IF(${col}created_at >= @countBySwitchAt, ${distinctIdWithFallback}, ${sessionIdAsString})`
        : useDistinctId
          ? distinctIdWithFallback
          : 'session_id'

      if (!bigquery) {
        return res.status(500).json({ error: 'BigQuery client not initialized' })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      const params = {
        websiteId,
        startDate,
        endDate,
        limit: parseInt(limit),
      }
      if (useSwitch) {
        params.countBySwitchAt = new Date(countBySwitchAtMs).toISOString()
      }

      let condition = 'url_path = @urlPath'
      params.urlPath = urlPath || '/' // Default to root if missing, though typically required

      if (urlPath) {
        if (pathOperator === 'starts-with') {
          condition = 'LOWER(url_path) LIKE @urlPathPattern'
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          params.urlPathQuery = urlPath + '?%'
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          condition = `(
                      url_path = @urlPath 
                      OR url_path = @urlPathSlash 
                      OR url_path LIKE @urlPathQuery
                  )`
        }
      } else {
        // If no URL path provided, flow breakdown is less meaningful or implies "Any page".
        // But for traffic analysis page, we usually have a context.
        // If "All pages", sources = referrers, exits = exit pages.
        condition = '1=1'
      }
      let sourceAndExitCountExpression
      if (metricType === 'pageviews') {
        sourceAndExitCountExpression = 'COUNT(*)'
      } else if (metricType === 'visits') {
        sourceAndExitCountExpression = 'APPROX_COUNT_DISTINCT(visit_id)' // økter / besøk
      } else if (metricType === 'proportion') {
        // Return fraction (0-1) to stay consistent with other proportion endpoints.
        sourceAndExitCountExpression =
          'SAFE_DIVIDE(APPROX_COUNT_DISTINCT(user_id), (SELECT total_users FROM total_filtered_users))'
      } else {
        sourceAndExitCountExpression = 'APPROX_COUNT_DISTINCT(user_id)' // visitors (unike besøkende)
      }
      logger.info({ sourceAndExitCountExpression, useDistinctId }, '[Traffic Breakdown] Count Expression')

      const totalFilteredUsersCTE =
        metricType === 'proportion'
          ? `,
              total_filtered_users AS (
                  SELECT APPROX_COUNT_DISTINCT(user_id) as total_users
                  FROM filtered_events
              )`
          : ''

      const query = `
              WITH session_events AS (
                  SELECT
                      ${userIdExpression} as user_id,
                      ${col}session_id,
                      ${col}visit_id,
                      ${col}referrer_domain,
                      ${normalizeUrlSql(`${col}url_path`)} as url_path,
                      ${col}created_at
                  FROM ${fromClause}
                  WHERE ${col}website_id = @websiteId
                  AND ${col}created_at BETWEEN @startDate AND @endDate
                  AND ${col}event_type = 1 -- Pageview
              ),
              events_with_context AS (
                  SELECT
                      user_id,
                      session_id,
                      visit_id,
                      url_path,
                      referrer_domain,
                      LAG(url_path) OVER (PARTITION BY session_id ORDER BY created_at) as prev_page,
                      LEAD(url_path) OVER (PARTITION BY session_id ORDER BY created_at) as next_page
                  FROM session_events
              ),
              filtered_events AS (
                  SELECT
                      CASE
                          WHEN prev_page IS NOT NULL THEN prev_page
                          ELSE COALESCE(referrer_domain, 'Direkte / Annet')
                      END as source,
                      url_path as landing_page,
                      COALESCE(next_page, 'Exit') as next_page,
                      session_id,
                      visit_id,
                      user_id
                  FROM events_with_context
                  WHERE ${condition}
              )${totalFilteredUsersCTE},
              sources_agg AS (
                  SELECT source as name, ${sourceAndExitCountExpression} as visitors
                  FROM filtered_events
                  GROUP BY 1
                  ORDER BY visitors DESC
                  LIMIT @limit
              ),
              exits_agg AS (
                  SELECT next_page as name, ${sourceAndExitCountExpression} as visitors
                  FROM filtered_events
                  GROUP BY 1
                  ORDER BY visitors DESC
                  LIMIT @limit
              )
              SELECT 'source' as type, name, visitors FROM sources_agg
              UNION ALL
              SELECT 'exit' as type, name, visitors FROM exits_agg
          `

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'trafikkanalyse',
        ),
      )

      const [rows] = await job.getQueryResults()

      const sources = []
      const exits = []

      rows.forEach((row) => {
        const item = { name: row.name, visitors: Number(row.visitors) }
        if (row.type === 'source') sources.push(item)
        else if (row.type === 'exit') exits.push(item)
      })

      res.json({
        sources,
        exits,
        meta: { usedDistinctId: useDistinctId },
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery traffic breakdown error')
      res.status(500).json({ error: error.message || 'Failed to fetch traffic breakdown' })
    }
  })

  // Get marketing stats (UTM parameters)
  router.get('/api/bigquery/websites/:websiteId/marketing-stats', async (req, res) => {
    try {
      const { websiteId } = req.params

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const {
        startAt,
        endAt,
        urlPath,
        limit = '100',
        metricType = 'visits',
        pathOperator,
        countBy,
        countBySwitchAt,
      } = req.query

      logger.info({ metricType, countBy }, '[Marketing Stats] Request')

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId =
        countBy === 'distinct_id' &&
        (metricType === 'visitors' || metricType === 'proportion' || metricType === 'users')
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const col = useDistinctId ? 'e.' : ''
      const fromClause = useDistinctId
        ? `\`${GCP_PROJECT_ID}.umami.public_website_event\` e LEFT JOIN \`${GCP_PROJECT_ID}.umami_views.session\` s ON e.session_id = s.session_id AND s.created_at BETWEEN @startDate AND @endDate`
        : `\`${GCP_PROJECT_ID}.umami.public_website_event\``
      const sessionIdAsString = `CAST(${col}session_id AS STRING)`
      const distinctIdWithFallback = `COALESCE(NULLIF(s.distinct_id, ''), ${sessionIdAsString})`
      const userIdExpression = useSwitch
        ? `IF(${col}created_at >= @countBySwitchAt, ${distinctIdWithFallback}, ${sessionIdAsString})`
        : useDistinctId
          ? distinctIdWithFallback
          : `${col}session_id`

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      const params = {
        websiteId: websiteId,
        startDate: startDate,
        endDate: endDate,
        limit: parseInt(limit),
      }
      if (useSwitch) {
        params.countBySwitchAt = new Date(countBySwitchAtMs).toISOString()
      }

      let urlFilter = ''
      if (urlPath) {
        if (pathOperator === 'starts-with') {
          urlFilter = `AND LOWER(url_path) LIKE @urlPathPattern`
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          urlFilter = `AND (
                      url_path = @urlPath 
                      OR url_path = @urlPathSlash 
                      OR url_path LIKE @urlPathQuery
                  )`
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      // Choose aggregation based on metric type
      let countExpression
      switch (metricType) {
        case 'pageviews':
          countExpression = 'COUNT(*)'
          break
        case 'visits':
          countExpression = 'APPROX_COUNT_DISTINCT(session_id)'
          break
        case 'proportion':
        default: // visitors
          countExpression = 'APPROX_COUNT_DISTINCT(user_id)'
      }

      const dimensions = [
        { key: 'utm_source', label: 'source' },
        { key: 'utm_medium', label: 'medium' },
        { key: 'utm_campaign', label: 'campaign' },
        { key: 'utm_content', label: 'content' },
        { key: 'utm_term', label: 'term' },
        { key: 'referrer_domain', label: 'referrer' },
        { key: 'url_query', label: 'query' },
      ]

      // Construct a single query using UNION ALL with a CTE to avoid multi-scanning the table
      // We select all necessary columns in the CTE
      // BigQuery aliases columns automatically (e.g. e.utm_source -> utm_source), so we can reference them directly in unionParts
      const cteColumns = dimensions.map((d) => `${col}${d.key}`).join(', ')

      const unionParts = dimensions
        .map(
          (dim) => `
              (
                  SELECT 
                      '${dim.label}' as dimension,
                      COALESCE(${dim.key}, '(none)') as name,
                      ${countExpression} as count
                  FROM base_data
                  GROUP BY 1, 2
                  ORDER BY count DESC
                  LIMIT @limit
              )
          `,
        )
        .join(' UNION ALL ')

      const query = `
              WITH base_data AS (
                  SELECT 
                      ${col}session_id as session_id,
                      ${userIdExpression} as user_id,
                      ${cteColumns}
                  FROM ${fromClause}
                  WHERE ${col}website_id = @websiteId
                  AND ${col}created_at BETWEEN @startDate AND @endDate
                  AND ${col}event_type = 1
                  ${urlFilter}
              )
              ${unionParts}
          `

      // Execute single query
      logger.info({ websiteId }, '[Marketing] Fetching stats for website (Single Query Optimization)')

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          getAnalysisTypeOverride(req, 'Markedsanalyse'),
        ),
      )

      const [rows] = await job.getQueryResults()
      logger.info({ count: rows.length }, '[Marketing] Query returned rows total')

      // Get dry run stats for the single query
      let queryStats = null
      try {
        const [dryRunJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: query,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            getAnalysisTypeOverride(req, 'Markedsanalyse'),
          ),
        )

        const meta = dryRunJob.metadata.statistics
        const bytesProcessed = parseInt(meta.totalBytesProcessed)
        queryStats = {
          totalBytesProcessedGB: (bytesProcessed / 1024 ** 3).toFixed(2),
          estimatedCostUSD: ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3),
        }
        logger.info({ gbProcessed: queryStats.totalBytesProcessedGB }, '[Marketing] Dry run - Processing')
      } catch (e) {
        logger.info({ error: e.message }, '[Marketing] Dry run failed')
      }

      // Aggregate results by dimension label
      const responseData = {}
      dimensions.forEach((dim) => (responseData[dim.label] = []))

      rows.forEach((row) => {
        if (responseData[row.dimension]) {
          responseData[row.dimension].push({
            name: row.name,
            count: parseInt(row.count),
          })
        }
      })

      // For proportion metric, calculate percentages based on total visitors per dimension
      if (metricType === 'proportion') {
        Object.keys(responseData).forEach((dimension) => {
          const items = responseData[dimension]
          const total = items.reduce((sum, item) => sum + item.count, 0)
          if (total > 0) {
            items.forEach((item) => {
              // Keep count as percentage (0-100)
              item.count = Math.round((item.count / total) * 1000) / 10 // Round to 1 decimal
            })
          }
        })
      }

      res.json({
        data: responseData,
        queryStats,
        meta: { usedDistinctId: useDistinctId },
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery marketing stats error')
      res.status(500).json({
        error: error.message || 'Failed to fetch marketing stats',
      })
    }
  })

  return router
}
