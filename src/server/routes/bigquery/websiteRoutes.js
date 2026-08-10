import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getWebsitesList } from './helpers.js'

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
      console.error('BigQuery websites error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch websites',
      })
    }
  })

  return router
}
