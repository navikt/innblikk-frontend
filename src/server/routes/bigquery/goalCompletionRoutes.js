import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getDryRunStats, MAX_BYTES_BILLED } from './helpers.js'

export function createGoalCompletionRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  router.post('/api/bigquery/goal-completion', async (req, res) => {
    try {
      const {
        websiteId,
        startDate,
        endDate,
        startUrl,
        startPathOperator,
        goalUrl,
        goalPathOperator,
        countBy,
        countBySwitchAt,
      } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return
      if (!startUrl || !goalUrl) {
        return res.status(400).json({ error: 'Både start-URL og mål-URL må være satt.' })
      }

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId = countBy === 'distinct_id'
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const col = useDistinctId ? 'e.' : ''
      const fromClause = useDistinctId
        ? `\`${GCP_PROJECT_ID}.umami.public_website_event\` e LEFT JOIN \`${GCP_PROJECT_ID}.umami_views.session\` s ON e.session_id = s.session_id`
        : `\`${GCP_PROJECT_ID}.umami.public_website_event\``
      const userIdExpression = useSwitch
        ? `IF(${col}created_at >= @countBySwitchAt, s.distinct_id, ${col}session_id)`
        : useDistinctId
          ? 's.distinct_id'
          : `${col}session_id`

      const startMatchCondition =
        startPathOperator === 'starts-with'
          ? 'LOWER(url_path_clean) LIKE @startUrlPattern'
          : 'url_path_clean = @startUrl'
      const goalMatchCondition =
        goalPathOperator === 'starts-with' ? 'LOWER(url_path_clean) LIKE @goalUrlPattern' : 'url_path_clean = @goalUrl'

      const start = new Date(startDate)
      const end = new Date(endDate)
      const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const maxDays = Math.max(daysDiff, 31)

      const query = `
        WITH base AS (
          SELECT
            ${userIdExpression} AS user_id,
            ${col}created_at,
            IFNULL(
              NULLIF(
                RTRIM(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(${col}url_path, r'[?#].*', ''),
                    r'//+', '/'
                  ),
                  '/'
                ),
                ''
              ),
              '/'
            ) AS url_path_clean
          FROM ${fromClause}
          WHERE ${col}website_id = @websiteId
            AND ${col}created_at BETWEEN @startDate AND @endDate
        ),
        starters AS (
          SELECT
            user_id,
            MIN(created_at) AS first_start_at,
            DATE(MIN(created_at), 'Europe/Oslo') AS first_start_date
          FROM base
          WHERE ${startMatchCondition}
          GROUP BY user_id
        ),
        goal_candidates AS (
          SELECT
            s.user_id,
            s.first_start_date,
            b.created_at AS goal_created_at
          FROM starters s
          JOIN base b
            ON b.user_id = s.user_id
          WHERE ${goalMatchCondition}
            AND b.created_at > s.first_start_at
        ),
        first_completion AS (
          SELECT
            user_id,
            first_start_date,
            MIN(goal_created_at) AS first_completion_at
          FROM goal_candidates
          GROUP BY user_id, first_start_date
        ),
        completion_by_day AS (
          SELECT
            DATE_DIFF(DATE(first_completion_at, 'Europe/Oslo'), first_start_date, DAY) AS day_diff,
            COUNT(DISTINCT user_id) AS completed_users
          FROM first_completion
          WHERE DATE_DIFF(DATE(first_completion_at, 'Europe/Oslo'), first_start_date, DAY) BETWEEN 0 AND @maxDays
          GROUP BY day_diff
        ),
        starter_counts AS (
          SELECT COUNT(*) AS total_starters
          FROM starters
        ),
        completed_counts AS (
          SELECT COUNT(*) AS total_completed
          FROM first_completion
        ),
        same_day AS (
          SELECT COUNT(*) AS same_day_completed
          FROM first_completion
          WHERE DATE_DIFF(DATE(first_completion_at, 'Europe/Oslo'), first_start_date, DAY) = 0
        ),
        non_completed AS (
          SELECT
            GREATEST(s.total_starters - IFNULL(c.total_completed, 0), 0) AS non_completed_users
          FROM starter_counts s
          CROSS JOIN completed_counts c
        )
        SELECT
          cbd.day_diff AS day,
          IFNULL(cbd.completed_users, 0) AS completed_users,
          s.total_starters,
          c.total_completed,
          sd.same_day_completed,
          n.non_completed_users
        FROM starter_counts s
        CROSS JOIN completed_counts c
        CROSS JOIN same_day sd
        CROSS JOIN non_completed n
        LEFT JOIN completion_by_day cbd ON TRUE
        ORDER BY day
      `

      const params = { websiteId, startDate, endDate, maxDays, startUrl, goalUrl }
      if (useSwitch) {
        params.countBySwitchAt = new Date(countBySwitchAtMs).toISOString()
      }

      if (startPathOperator === 'starts-with') {
        params.startUrlPattern = startUrl.toLowerCase() + '%'
      }
      if (goalPathOperator === 'starts-with') {
        params.goalUrlPattern = goalUrl.toLowerCase() + '%'
      }

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          params,
          navIdent,
          analysisType: 'Måloppnåelse',
        },
        addAuditLogging,
      )

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Måloppnåelse',
        ),
      )

      const [rows] = await job.getQueryResults()

      const totalStarters = rows.length > 0 && rows[0].total_starters != null ? parseInt(rows[0].total_starters) : 0
      const totalCompleted = rows.length > 0 && rows[0].total_completed != null ? parseInt(rows[0].total_completed) : 0
      const sameDayCompleted =
        rows.length > 0 && rows[0].same_day_completed != null ? parseInt(rows[0].same_day_completed) : 0
      const nonCompleted =
        rows.length > 0 && rows[0].non_completed_users != null ? parseInt(rows[0].non_completed_users) : 0

      const data = rows
        .filter((row) => row.day != null)
        .map((row) => {
          const count = parseInt(row.completed_users)
          const percentage = totalStarters > 0 ? Number(((count / totalStarters) * 100).toFixed(1)) : 0
          return { day: row.day, completed_users: count, percentage }
        })

      res.json({
        data,
        summary: {
          totalStarters,
          totalCompleted,
          sameDayCompleted,
          nonCompleted,
        },
        queryStats,
      })
    } catch (error) {
      console.error('BigQuery goal completion error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch goal completion data',
      })
    }
  })

  return router
}
