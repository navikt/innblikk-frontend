import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getDryRunStats, MAX_BYTES_BILLED, prepareGeneratedSql } from './helpers.js'

export function createRetentionRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Get retention data from BigQuery
  router.post('/api/bigquery/retention', async (req, res) => {
    try {
      const {
        websiteId,
        startDate,
        endDate,
        urlPath,
        pathOperator,
        returnScope,
        businessDaysOnly,
        countBy,
        countBySwitchAt,
      } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId = countBy === 'distinct_id'
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const useSameUrlReturnScope = returnScope !== 'site'
      const col = useDistinctId ? 'e.' : ''
      const urlMatchCondition =
        pathOperator === 'starts-with' ? 'LOWER(url_path_clean) LIKE @urlPathPattern' : 'url_path_clean = @urlPath'
      const fromClause = useDistinctId
        ? `\`${GCP_PROJECT_ID}.umami.public_website_event\` e LEFT JOIN \`${GCP_PROJECT_ID}.umami_views.session\` s ON e.session_id = s.session_id`
        : `\`${GCP_PROJECT_ID}.umami.public_website_event\``
      const userIdExpression = useSwitch
        ? `IF(${col}created_at >= @countBySwitchAt, s.distinct_id, ${col}session_id)`
        : useDistinctId
          ? 's.distinct_id'
          : `${col}session_id`

      const start = new Date(startDate)
      const end = new Date(endDate)
      const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const maxDays = Math.max(daysDiff, 31)

      const query = `
          WITH base AS(
              SELECT
                  ${userIdExpression} as user_id,
                  DATE(${col}created_at, 'Europe/Oslo') AS event_date,
                  ${col}created_at,
                  IFNULL(
                    NULLIF(
                        RTRIM(
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(${col}url_path, r'[?#].*', ''),
                                r'//+', '/'),
                            '/'),
                        ''),
                    '/') AS url_path_clean
              FROM ${fromClause}
              WHERE ${col}website_id = @websiteId
                  AND ${col}created_at BETWEEN @startDate AND @endDate
          ),
          ${
            urlPath
              ? `
          filtered_sessions AS (
              SELECT
                  user_id,
                  MIN(created_at) AS first_seen_at,
                  DATE(MIN(created_at), 'Europe/Oslo') AS first_seen_date
              FROM base
              WHERE ${urlMatchCondition}
              GROUP BY user_id
          ),
          `
              : `
          filtered_sessions AS (
              SELECT
                  user_id,
                  MIN(created_at) AS first_seen_at,
                  DATE(MIN(created_at), 'Europe/Oslo') AS first_seen_date
              FROM base
              GROUP BY user_id
          ),
          `
          }
          user_activity AS (
              SELECT DISTINCT
                  user_id,
                  event_date AS activity_date
              FROM base
              ${
                urlPath && useSameUrlReturnScope
                  ? businessDaysOnly
                    ? `WHERE ${urlMatchCondition} AND EXTRACT(DAYOFWEEK FROM event_date) NOT IN (1, 7)`
                    : `WHERE ${urlMatchCondition}`
                  : businessDaysOnly
                    ? `WHERE EXTRACT(DAYOFWEEK FROM event_date) NOT IN (1, 7)`
                    : ''
              }
          ),
          retention_base AS (
              SELECT
                  f.user_id,
                  f.first_seen_date,
                  a.activity_date,
                  DATE_DIFF(a.activity_date, f.first_seen_date, DAY) AS day_diff
              FROM filtered_sessions f
              JOIN user_activity a
                  USING (user_id)
              WHERE DATE_DIFF(a.activity_date, f.first_seen_date, DAY) >= 0
          ),
          retention_counts AS (
              SELECT
                  day_diff,
                  COUNT(DISTINCT user_id) AS returning_users
              FROM retention_base
              WHERE day_diff <= @maxDays
              GROUP BY day_diff
          ),
          user_counts AS (
              SELECT COUNT(DISTINCT user_id) AS total_users
              FROM filtered_sessions
          ),
          returned_users AS (
              SELECT COUNT(DISTINCT user_id) AS returned_users
              FROM retention_base
              WHERE day_diff > 0
          ),
          non_returning AS (
              SELECT
                  GREATEST(u.total_users - IFNULL(r.returned_users, 0), 0) AS non_returning_users
              FROM user_counts u
              CROSS JOIN returned_users r
          ),
          same_day_returning AS (
              SELECT COUNT(DISTINCT f.user_id) AS same_day_returning_users
              FROM filtered_sessions f
              JOIN base b
                ON b.user_id = f.user_id
              WHERE DATE(b.created_at, 'Europe/Oslo') = f.first_seen_date
                AND b.created_at > f.first_seen_at
                ${urlPath && useSameUrlReturnScope ? `AND ${urlMatchCondition}` : ''}
          )
          SELECT
              rc.day_diff AS day,
              rc.returning_users,
              u.total_users,
              s.same_day_returning_users,
              n.non_returning_users
          FROM retention_counts rc
          CROSS JOIN user_counts u
          CROSS JOIN same_day_returning s
          CROSS JOIN non_returning n
          ORDER BY rc.day_diff
      `

      const params = { websiteId, startDate, endDate, maxDays }
      if (useSwitch) {
        params.countBySwitchAt = new Date(countBySwitchAtMs).toISOString()
      }
      if (urlPath) {
        if (pathOperator === 'starts-with') {
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          params.urlPath = urlPath
        }
      }

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          params,
          navIdent,
          analysisType: 'Brukerlojalitet',
        },
        addAuditLogging,
      )

      if (queryStats) {
        console.log(
          `[Retention] Dry run - Processing ${queryStats.totalBytesProcessedGB} GB, estimated cost: $${queryStats.estimatedCostUSD}`,
        )
      }

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Brukerlojalitet',
        ),
      )

      const [rows] = await job.getQueryResults()

      let day0Count = 0
      const day0Row = rows.find((r) => r.day === 0)
      if (day0Row) {
        day0Count = parseInt(day0Row.returning_users)
      }

      const data = rows.map((row) => {
        const count = parseInt(row.returning_users)
        const percentage = day0Count > 0 ? Number(((count / day0Count) * 100).toFixed(1)) : 0
        return { day: row.day, returning_users: count, percentage }
      })

      const sameDayReturningUsers =
        rows.length > 0 && rows[0].same_day_returning_users != null ? parseInt(rows[0].same_day_returning_users) : 0

      const nonReturningUsers =
        rows.length > 0 && rows[0].non_returning_users != null ? parseInt(rows[0].non_returning_users) : 0

      res.json({
        data,
        generatedSql: prepareGeneratedSql(query, params),
        queryStats,
        sameDayReturningUsers,
        nonReturningUsers,
      })
    } catch (error) {
      console.error('BigQuery retention error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch retention data',
      })
    }
  })

  return router
}
