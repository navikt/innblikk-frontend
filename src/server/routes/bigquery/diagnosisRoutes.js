import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { MAX_BYTES_BILLED } from './helpers.js'
import { logger } from '../../logger.js'

export function createDiagnosisRouter({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Get diagnosis data (global overview)
  router.post('/api/bigquery/diagnosis', async (req, res) => {
    try {
      const { startDate, endDate } = req.body

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const query = `
              SELECT
                  w.website_id,
                  w.name as website_name,
                  w.domain,
                  COUNTIF(e.event_type = 1) as pageviews,
                  COUNTIF(e.event_type = 2) as custom_events,
                  MAX(e.created_at) as last_event_at
              FROM \`${GCP_PROJECT_ID}.umami.public_website\` w
              LEFT JOIN \`${GCP_PROJECT_ID}.umami.public_website_event\` e
                  ON w.website_id = e.website_id
                  AND e.created_at BETWEEN @startDate AND @endDate
              GROUP BY 1, 2, 3
              ORDER BY last_event_at DESC NULLS LAST
          `

      const params = {
        startDate: startDate,
        endDate: endDate,
      }

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Diagnoseverktoy',
        ),
      )

      const [rows] = await job.getQueryResults()

      const data = rows.map((row) => ({
        website_id: row.website_id,
        website_name: row.website_name,
        domain: row.domain,
        pageviews: parseInt(row.pageviews),
        custom_events: parseInt(row.custom_events),
        last_event_at: row.last_event_at ? row.last_event_at.value : null,
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
            'Diagnoseverktoy',
          ),
        )

        const stats = dryRunJob.metadata.statistics
        const bytesProcessed = parseInt(stats.totalBytesProcessed)
        const gbProcessed = (bytesProcessed / 1024 ** 3).toFixed(2)
        const estimatedCostUSD = ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3)

        queryStats = {
          totalBytesProcessedGB: gbProcessed,
          estimatedCostUSD: estimatedCostUSD,
        }
      } catch (dryRunError) {
        logger.info({ dryRunError: dryRunError.message }, '[Diagnosis] Dry run failed')
      }

      res.json({ data, queryStats })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery diagnosis error')
      res.status(500).json({
        error: error.message || 'Failed to fetch diagnosis data',
      })
    }
  })

  router.post('/api/bigquery/diagnosis-history', async (req, res) => {
    try {
      const { websiteId } = req.body

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      if (!websiteId) {
        return res.status(400).json({ error: 'Missing websiteId' })
      }

      // Query 1: Monthly history for the last 6 months
      const historyQuery = `
              SELECT
                  FORMAT_TIMESTAMP('%Y-%m', created_at) as month,
                  COUNTIF(event_type = 1) as pageviews,
                  COUNTIF(event_type = 2) as custom_events
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\`
              WHERE website_id = @websiteId
                AND created_at >= TIMESTAMP(DATE_SUB(CURRENT_DATE('Europe/Oslo'), INTERVAL 6 MONTH))
              GROUP BY 1
              ORDER BY 1
          `

      // Query 2: Absolute last event timestamp
      const lastEventQuery = `
              SELECT MAX(created_at) as last_event_at
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\`
              WHERE website_id = @websiteId
          `

      const params = { websiteId }

      // Get NAV ident from authenticated user for audit logging

      const [historyJob] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: historyQuery,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Diagnoseverktoy',
        ),
      )

      // Get NAV ident from authenticated user for audit logging

      const [lastEventJob] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: lastEventQuery,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Diagnoseverktoy',
        ),
      )

      const [historyRows] = await historyJob.getQueryResults()
      const [lastEventRows] = await lastEventJob.getQueryResults()

      const history = historyRows.map((row) => ({
        month: row.month,
        pageviews: parseInt(row.pageviews),
        custom_events: parseInt(row.custom_events),
      }))

      const lastEventAt =
        lastEventRows.length > 0 && lastEventRows[0].last_event_at ? lastEventRows[0].last_event_at.value : null

      // Get dry run stats
      let queryStats = null
      try {
        // Get NAV ident from authenticated user for audit logging

        const [dryRunHistoryJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: historyQuery,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            'Diagnoseverktoy',
          ),
        )

        // Get NAV ident from authenticated user for audit logging

        const [dryRunLastEventJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: lastEventQuery,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            'Diagnoseverktoy',
          ),
        )

        const historyStats = dryRunHistoryJob.metadata.statistics
        const lastEventStats = dryRunLastEventJob.metadata.statistics

        const totalBytes = parseInt(historyStats.totalBytesProcessed) + parseInt(lastEventStats.totalBytesProcessed)
        const gbProcessed = (totalBytes / 1024 ** 3).toFixed(2)

        queryStats = {
          totalBytesProcessed: totalBytes,
          totalBytesProcessedGB: gbProcessed,
        }

        logger.info({ gbProcessed }, '[diagnosis-history] Dry run stats - Processing GB')
      } catch (dryRunError) {
        logger.info({ dryRunError: dryRunError.message }, '[diagnosis-history] Dry run failed')
      }

      res.json({
        history,
        lastEventAt,
        queryStats,
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery error')
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
