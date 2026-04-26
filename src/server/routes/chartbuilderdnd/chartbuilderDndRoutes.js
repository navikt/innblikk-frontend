import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { getDryRunStats, getNavIdent, MAX_BYTES_BILLED, requireBigQuery } from '../bigquery/helpers.js'

const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/,
  /\bUPDATE\b/,
  /\bDELETE\b/,
  /\bDROP\b/,
  /\bTRUNCATE\b/,
  /\bALTER\b/,
  /\bCREATE\b/,
  /\bMERGE\b/,
  /\bGRANT\b/,
  /\bREVOKE\b/,
  /\bCALL\b/,
  /\bEXECUTE\b/,
  /\bEXEC\b/,
  /\bEXPORT\b/,
  /\bLOAD\b/,
]

function validateReadOnlyQuery(rawQuery) {
  const stripped = rawQuery
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()

  if (!stripped) {
    return { valid: false, error: 'Query is empty after removing comments' }
  }

  const upper = stripped.toUpperCase()
  const firstKeyword = upper.match(/^\s*(\w+)/)?.[1]
  if (firstKeyword !== 'SELECT' && firstKeyword !== 'WITH') {
    return {
      valid: false,
      error: `Only SELECT queries are allowed. Got: ${firstKeyword || '(unknown)'}`,
    }
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(upper)) {
      const keyword = upper.match(pattern)?.[0]
      return { valid: false, error: `Forbidden SQL keyword detected: ${keyword}` }
    }
  }

  return { valid: true }
}

export function createChartbuilderDndRouter({ bigquery }) {
  const router = express.Router()

  router.post('/api/bigquery/chartbuilder-dnd/query', async (req, res) => {
    try {
      const { query } = req.body

      if (!query) {
        return res.status(400).json({ error: 'Query is required' })
      }

      if (!requireBigQuery(bigquery, res)) return

      const validation = validateReadOnlyQuery(query)
      if (!validation.valid) {
        return res.status(403).json({ error: validation.error })
      }

      const navIdent = getNavIdent(req)
      const analysisType = 'GrafbyggerDndBeta'

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          analysisType,
        ),
      )

      const [rows] = await job.getQueryResults()

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          navIdent,
          analysisType,
        },
        addAuditLogging,
      )

      return res.json({
        success: true,
        data: rows,
        rowCount: rows.length,
        queryStats,
      })
    } catch (error) {
      console.error('[ChartbuilderDnd Query] Error:', error.message)
      return res.status(500).json({
        error: error.message || 'Failed to execute query',
        code: error.code,
      })
    }
  })

  router.post('/api/bigquery/chartbuilder-dnd/estimate', async (req, res) => {
    try {
      const { query } = req.body

      if (!query) {
        return res.status(400).json({ error: 'Query is required' })
      }

      if (!requireBigQuery(bigquery, res)) return

      const validation = validateReadOnlyQuery(query)
      if (!validation.valid) {
        return res.status(403).json({ error: validation.error })
      }

      const navIdent = getNavIdent(req)
      const analysisType = 'GrafbyggerDndBeta'

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            dryRun: true,
          },
          navIdent,
          analysisType,
        ),
      )

      const stats = job.metadata.statistics
      const totalBytesProcessed = parseInt(stats.totalBytesProcessed || 0)
      const totalBytesBilled = parseInt(stats.query?.totalBytesBilled || totalBytesProcessed)
      const estimatedCostUSD = (totalBytesBilled / 1024 ** 4) * 6.25

      return res.json({
        success: true,
        totalBytesProcessed,
        totalBytesBilled,
        totalBytesProcessedMB: (totalBytesProcessed / 1024 ** 2).toFixed(2),
        totalBytesProcessedGB: (totalBytesProcessed / 1024 ** 3).toFixed(1),
        estimatedCostUSD: estimatedCostUSD.toFixed(3),
        cacheHit: stats.query?.cacheHit || false,
        maximumBytesBilled: MAX_BYTES_BILLED,
      })
    } catch (error) {
      console.error('[ChartbuilderDnd Estimate] Error:', error.message)
      return res.status(500).json({
        error: error.message || 'Failed to estimate query',
      })
    }
  })

  return router
}
