import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { logger } from '../../logger.js'
import {
  requireBigQuery,
  getNavIdent,
  getDryRunStats,
  normalizeUrlSql,
  MAX_BYTES_BILLED,
  prepareGeneratedSql,
} from './helpers.js'

export function createCompositionRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Get user composition data from BigQuery
  router.post('/api/bigquery/composition', async (req, res) => {
    try {
      const { websiteId, startDate, endDate, urlPath, pathOperator, countBy, countBySwitchAt } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId = countBy === 'distinct_id'
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const table = useDistinctId
        ? `\`${GCP_PROJECT_ID}.umami_views.session\``
        : `\`${GCP_PROJECT_ID}.umami.public_session\``

      const userIdExpression = useSwitch
        ? `IF(s.created_at >= @countBySwitchAt, s.distinct_id, s.session_id)`
        : useDistinctId
          ? 's.distinct_id'
          : 's.session_id'
      const countExpression = useDistinctId ? 'COUNT(DISTINCT user_id)' : 'COUNT(*)'

      const query = `
          WITH relevant_sessions AS (
              SELECT
                  s.browser,
                  s.os,
                  s.device,
                  s.screen,
                  s.language,
                  s.country,
                  ${userIdExpression} as user_id
              FROM ${table} s
              WHERE s.website_id = @websiteId
                AND s.created_at BETWEEN @startDate AND @endDate
                ${
                  urlPath
                    ? `
                AND EXISTS (
                  SELECT 1 
                  FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e 
                  WHERE e.session_id = s.session_id 
                    AND e.website_id = @websiteId
                    AND e.created_at BETWEEN @startDate AND @endDate
                    ${
                      pathOperator === 'starts-with'
                        ? `AND LOWER(${normalizeUrlSql('e.url_path')}) LIKE @urlPathPattern`
                        : `AND ${normalizeUrlSql('e.url_path')} = @urlPath`
                    }
                )`
                    : ''
                }
          )
          SELECT 'browser' as category, browser as value, ${countExpression} as count FROM relevant_sessions GROUP BY 1, 2
          UNION ALL
          SELECT 'os' as category, os as value, ${countExpression} as count FROM relevant_sessions GROUP BY 1, 2
          UNION ALL
          SELECT 'device' as category, device as value, ${countExpression} as count FROM relevant_sessions GROUP BY 1, 2
          UNION ALL
          SELECT 'screen' as category, screen as value, ${countExpression} as count FROM relevant_sessions GROUP BY 1, 2
          UNION ALL
          SELECT 'language' as category, language as value, ${countExpression} as count FROM relevant_sessions GROUP BY 1, 2
          UNION ALL
          SELECT 'country' as category, country as value, ${countExpression} as count FROM relevant_sessions GROUP BY 1, 2
          ORDER BY category, count DESC
      `

      const params = { websiteId, startDate, endDate }
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
          analysisType: 'Brukersammensetning',
        },
        addAuditLogging,
      )

      if (queryStats) {
        logger.info(
          { gbProcessed: queryStats.totalBytesProcessedGB, estimatedCostUSD: queryStats.estimatedCostUSD },
          '[Composition] Dry run - Processing',
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
          'Brukersammensetning',
        ),
      )

      const [rows] = await job.getQueryResults()

      res.json({
        data: rows,
        queryStats,
        generatedSql: prepareGeneratedSql(query, params),
        meta: { usedDistinctId: useDistinctId },
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery composition error')
      if (error.code) logger.error({ code: error.code }, 'Error Code')
      if (error.errors) logger.error({ errors: error.errors }, 'Error Details')
      if (error.response) logger.error({ response: error.response }, 'Error Response')

      res.status(500).json({
        error: error.message || 'Failed to fetch composition data',
        details: error.errors || error.response,
      })
    }
  })

  return router
}
