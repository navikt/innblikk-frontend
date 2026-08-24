import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { logger } from '../../logger.js'
import { requireBigQuery, getNavIdent, getWebsitesList } from './helpers.js'

// No generated-data special-casing here: when the generated-data BigQuery client is active it already
// proxies real queries to reops-proxy (see bigquery/generatedDataClient.js), so this route returns
// real registered websites under path A too — which Sporingskoder and every website picker
// depend on (a generated-id tracking snippet could never be installed anywhere).
export function createWebsiteRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Get websites from BigQuery
  router.get('/api/bigquery/websites', async (req, res) => {
    try {
      const navIdent = getNavIdent(req)
      if (!requireBigQuery(bigquery, res)) return

      const data = await getWebsitesList(bigquery, GCP_PROJECT_ID, navIdent, addAuditLogging)

      res.json({ data })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery websites error')
      res.status(500).json({
        error: error.message || 'Failed to fetch websites',
      })
    }
  })

  return router
}
