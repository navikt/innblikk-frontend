import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getDryRunStats, normalizeUrlSql, MAX_BYTES_BILLED } from './helpers.js'

export function createUserProfileRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Get user sessions (User Profiles)
  router.post('/api/bigquery/users', async (req, res) => {
    try {
      const {
        websiteId,
        startDate,
        endDate,
        query: searchQuery,
        limit = 50,
        offset = 0,
        maxUsers: maxUsersInput,
        urlPath,
        pathOperator,
        countBy,
        countBySwitchAt,
      } = req.body
      const DEFAULT_MAX_USERS = 5000
      const MIN_MAX_USERS = 50
      const MAX_MAX_USERS = 10000

      const navIdent = getNavIdent(req)
      if (!requireBigQuery(bigquery, res)) return

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId = countBy === 'distinct_id'
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const userKeyExpression = useSwitch
        ? `IF(session.created_at >= @countBySwitchAt, session.distinct_id, session.session_id)`
        : useDistinctId
          ? 'session.distinct_id'
          : 'session.session_id'
      const idTypeExpression = useSwitch
        ? `IF(session.created_at >= @countBySwitchAt AND session.distinct_id IS NOT NULL, 'cookie', 'session')`
        : useDistinctId
          ? `'cookie'`
          : `'session'`

      const parsedMaxUsers = parseInt(maxUsersInput, 10)
      const maxUsers = Number.isFinite(parsedMaxUsers)
        ? Math.min(Math.max(parsedMaxUsers, MIN_MAX_USERS), MAX_MAX_USERS)
        : DEFAULT_MAX_USERS

      const parsedLimit = parseInt(limit, 10)
      const parsedOffset = parseInt(offset, 10)
      const safeOffset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0
      const remaining = Math.max(maxUsers - safeOffset, 0)
      const safeLimit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 0), remaining)
        : Math.min(50, remaining)

      if (safeLimit === 0) {
        return res.json({ users: [], total: maxUsers, queryStats: null })
      }

      const params = {
        websiteId,
        startDate,
        endDate,
        limit: safeLimit,
        offset: safeOffset,
        maxUsers,
      }
      if (useSwitch) {
        params.countBySwitchAt = new Date(countBySwitchAtMs).toISOString()
      }

      let searchFilter = ''
      if (searchQuery) {
        searchFilter = `AND (session.session_id LIKE @searchQuery OR session.distinct_id LIKE @searchQuery)`
        params.searchQuery = `%${searchQuery}%`
      }

      console.log('[User Profiles] Request:', { websiteId, urlPath, searchQuery })

      let urlFilterCTE = ''
      let urlFilterJoin = ''
      if (urlPath) {
        let condition

        if (pathOperator === 'starts-with') {
          const urlNormSql = normalizeUrlSql()
          condition = `LOWER(${urlNormSql}) LIKE @urlPathPattern`
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'

          condition = `(
                  url_path = @urlPath
                  OR url_path = @urlPathSlash
                  OR url_path LIKE @urlPathQuery
              )`
        }

        urlFilterCTE = `
            matching_sessions AS (
                SELECT DISTINCT session_id
                FROM \`${GCP_PROJECT_ID}.umami.public_website_event\`
                WHERE website_id = @websiteId
                AND created_at BETWEEN @startDate AND @endDate
                AND ${condition}
            ),
        `
        urlFilterJoin = `INNER JOIN matching_sessions ms ON session.session_id = ms.session_id`

        console.log('[User Profiles] URL filter active:', { urlPath, pathOperator })
      }

      const query = `
          WITH ${urlFilterCTE}
          session_data AS (
              SELECT
                  ${userKeyExpression} as user_id,
                  ${idTypeExpression} as id_type,
                  MAX(session.created_at) as last_seen,
                  MIN(session.created_at) as first_seen,
                  ANY_VALUE(session.country) as country,
                  ANY_VALUE(session.device) as device,
                  ANY_VALUE(session.os) as os,
                  ANY_VALUE(session.browser) as browser,
                  ANY_VALUE(session.distinct_id) as distinct_id,
                  ARRAY_AGG(DISTINCT session.session_id) as session_ids,
                  ARRAY_AGG(session.session_id ORDER BY session.created_at DESC LIMIT 1)[OFFSET(0)] as primary_session_id,
                  COUNT(*) as event_count
              FROM \`${GCP_PROJECT_ID}.umami_views.session\` as session
              ${urlFilterJoin}
              WHERE session.website_id = @websiteId
              AND session.created_at BETWEEN @startDate AND @endDate
              ${searchFilter}
              GROUP BY user_id, id_type
          )
          SELECT * FROM session_data
          ORDER BY last_seen DESC
          LIMIT @limit OFFSET @offset
      `

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Brukerprofiler',
        ),
      )

      const [rows] = await job.getQueryResults()

      // Get total count for pagination
      const countQuery = `
          WITH ${urlFilterCTE}
          filtered_sessions AS (
              SELECT DISTINCT ${userKeyExpression} as user_id
              FROM \`${GCP_PROJECT_ID}.umami_views.session\` as session
              ${urlFilterJoin}
              WHERE session.website_id = @websiteId
              AND session.created_at BETWEEN @startDate AND @endDate
              ${searchFilter}
          )
          SELECT COUNT(*) as total FROM (
              SELECT 1 FROM filtered_sessions LIMIT @maxUsers
          )
      `

      const [countJob] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: countQuery,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Brukerprofiler',
        ),
      )

      const [countRows] = await countJob.getQueryResults()
      const total = countRows[0]?.total || 0

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          params,
          navIdent,
          analysisType: 'Brukerprofiler',
        },
        addAuditLogging,
      )

      const users = rows.map((row) => ({
        userId: row.user_id,
        idType: row.id_type,
        sessionIds: row.session_ids || [],
        primarySessionId: row.primary_session_id,
        distinctId: row.distinct_id,
        lastSeen: row.last_seen.value,
        firstSeen: row.first_seen.value,
        country: row.country,
        device: row.device,
        os: row.os,
        browser: row.browser,
        eventCount: parseInt(row.event_count),
      }))

      res.json({ users, total, queryStats })
    } catch (error) {
      console.error('BigQuery users error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // Get user activity (User Profile Details)
  router.post('/api/bigquery/users/:sessionId/activity', async (req, res) => {
    try {
      const { sessionId } = req.params
      const { websiteId, startDate, endDate } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return

      const params = { websiteId, sessionId, startDate, endDate }

      const query = `
          SELECT
              created_at,
              event_type,
              event_name,
              url_path,
              page_title
          FROM \`${GCP_PROJECT_ID}.umami_views.event\`
          WHERE website_id = @websiteId
          AND session_id = @sessionId
          AND created_at BETWEEN @startDate AND @endDate
          ORDER BY created_at DESC
          LIMIT 1000
      `

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Brukerprofiler',
        ),
      )

      const [rows] = await job.getQueryResults()

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          params,
          navIdent,
          analysisType: 'Brukerprofiler',
        },
        addAuditLogging,
      )

      const activity = rows.map((row) => ({
        createdAt: row.created_at.value,
        type: row.event_type === 1 ? 'pageview' : 'event',
        name: row.event_name,
        url: row.url_path,
        title: row.page_title,
      }))

      res.json({ activity, queryStats })
    } catch (error) {
      console.error('BigQuery user activity error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
