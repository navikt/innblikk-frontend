import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, MAX_BYTES_BILLED } from './helpers.js'

export function createWebsiteRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Get websites from BigQuery
  router.get('/api/bigquery/websites', async (req, res) => {
    try {
      const navIdent = getNavIdent(req)
      if (!requireBigQuery(bigquery, res)) return

      const query = `
        SELECT
            website_id as id,
            ANY_VALUE(name) as name,
            ANY_VALUE(domain) as domain,
            ANY_VALUE(share_id) as shareId,
            ANY_VALUE(team_id) as teamId,
            ANY_VALUE(created_at) as createdAt
        FROM \`${GCP_PROJECT_ID}.umami.public_website\`
        WHERE deleted_at IS NULL
          AND name IS NOT NULL
        GROUP BY website_id
        ORDER BY name
      `

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Nettsidevelger',
        ),
      )

      const [rows] = await job.getQueryResults()

      // Map rows to handle BigQuery timestamp objects
      const data = rows.map((row) => {
        let createdAt = row.createdAt
        if (createdAt && typeof createdAt === 'object' && createdAt.value) {
          createdAt = createdAt.value
        }
        return { ...row, createdAt }
      })

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
