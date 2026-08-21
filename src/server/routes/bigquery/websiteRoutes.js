import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { logger } from '../../logger.js'
import { requireBigQuery, getNavIdent, getWebsitesList } from './helpers.js'

/**
 * Under path A local dev (no GCP credentials → fixture BigQuery client), the synthetic
 * fixture website list is wrong for features that need REAL registered websites
 * (Sporingskoder tracking snippets, website pickers, copilot domain resolution) — a
 * fixture-id-01 tracking snippet can never be installed anywhere. So for this one
 * read-only reference-data lookup, the local server proxies to reops-proxy's guarded
 * BigQuery passthrough (no Azure sidecar there — gated solely by the shared dev-only
 * static token, same secret as innblikk-backend's DEV_LOCAL_AUTH_TOKEN), and returns
 * real dev data.
 *
 * Loop-safe: deployed instances of THIS app always have real BigQuery credentials, so
 * `__isFixtureClient` is false and they never take this proxy branch. The extra
 * `BACKEND_TOKEN` gate means even a credentialed local run without the token just
 * falls through to fixture data (previous behavior).
 */
async function fetchWebsitesViaProxy({ BIGQUERY_PROXY_BASE_URL, staticToken }) {
  const targetUrl = new URL('/bigquery/websites', BIGQUERY_PROXY_BASE_URL)
  const response = await fetch(targetUrl, {
    headers: {
      accept: 'application/json',
      authorization: staticToken.toLowerCase().startsWith('bearer ') ? staticToken : `Bearer ${staticToken}`,
    },
  })
  if (!response.ok) {
    throw new Error(`BigQuery proxy websites request failed (${response.status})`)
  }
  const payload = await response.json()
  return payload?.data
}

export function createWebsiteRoutes({ bigquery, GCP_PROJECT_ID, BIGQUERY_PROXY_BASE_URL }) {
  const router = express.Router()

  // Get websites from BigQuery
  router.get('/api/bigquery/websites', async (req, res) => {
    try {
      const navIdent = getNavIdent(req)
      if (!requireBigQuery(bigquery, res)) return

      if (bigquery.__isFixtureClient && BIGQUERY_PROXY_BASE_URL && process.env.BACKEND_TOKEN) {
        try {
          const data = await fetchWebsitesViaProxy({
            BIGQUERY_PROXY_BASE_URL,
            staticToken: process.env.BACKEND_TOKEN,
          })
          if (Array.isArray(data)) {
            res.json({ data })
            return
          }
          logger.warn('[Websites] BigQuery proxy returned unexpected payload, falling back to fixture data')
        } catch (proxyError) {
          // Fail soft to fixture data, not a 500 — e.g. reops-proxy not yet deployed with
          // the /bigquery routes, token rotated but local .env stale, or proxy down.
          logger.warn(
            { error: proxyError.message ?? proxyError },
            '[Websites] BigQuery proxy failed, falling back to fixture data',
          )
        }
      }

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
