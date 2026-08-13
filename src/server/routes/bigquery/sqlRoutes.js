import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getDryRunStats, MAX_BYTES_BILLED } from './helpers.js'
import { logger } from '../../logger.js'

// SQL statements that are forbidden in user-submitted queries.
// Matched against the normalised (comment-free, uppercased) query text.
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

// Exported so consumers (e.g. the Copilot system prompt) can list the exact same forbidden
// keywords the validator below enforces, instead of hand-maintaining a second copy of this
// list that can silently drift out of sync.
export const FORBIDDEN_KEYWORDS = FORBIDDEN_PATTERNS.map((pattern) => pattern.source.replace(/\\b/g, ''))

/**
 * Validates that a SQL query is read-only.
 *
 * 1. Strips SQL comments (single-line `--` and multi-line).
 * 2. Requires the first keyword to be SELECT or WITH.
 * 3. Rejects any occurrence of DML / DDL keywords.
 *
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateQuery(rawQuery) {
  // Strip single-line comments (-- …) and multi-line comments (/* … */)
  const stripped = rawQuery
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()

  if (!stripped) {
    return { valid: false, error: 'Query is empty after removing comments' }
  }

  const upper = stripped.toUpperCase()

  // The first meaningful keyword must be SELECT or WITH
  const firstKeyword = upper.match(/^\s*(\w+)/)?.[1]
  if (firstKeyword !== 'SELECT' && firstKeyword !== 'WITH') {
    return {
      valid: false,
      error: `Only SELECT queries are allowed. Got: ${firstKeyword || '(unknown)'}`,
    }
  }

  // Scan for any forbidden DML / DDL keywords
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(upper)) {
      const keyword = upper.match(pattern)?.[0]
      return {
        valid: false,
        error: `Forbidden SQL keyword detected: ${keyword}`,
      }
    }
  }

  return { valid: true }
}

export function createSqlRouter({ bigquery }) {
  const router = express.Router()

  // BigQuery API endpoint — execute a read-only query
  router.post('/api/bigquery', async (req, res) => {
    try {
      const { query, analysisType } = req.body

      if (!query) {
        return res.status(400).json({ error: 'Query is required' })
      }

      if (!requireBigQuery(bigquery, res)) return

      // Validate: only SELECT / WITH queries are allowed
      const validation = validateQuery(query)
      if (!validation.valid) {
        return res.status(403).json({ error: validation.error })
      }

      const navIdent = getNavIdent(req)

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          analysisType || 'Sqlverktoy',
        ),
      )

      const [rows] = await job.getQueryResults()

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          navIdent,
          analysisType: analysisType || 'Sqlverktoy',
        },
        addAuditLogging,
      )

      res.json({
        success: true,
        data: rows,
        rowCount: rows.length,
        queryStats,
      })
    } catch (error) {
      logger.error({ error: error.message }, '[BigQuery API] Error')
      if (error.errors) {
        logger.error({ details: error.errors }, '[BigQuery API] Details')
      }

      res.status(500).json({
        error: error.message || 'Failed to execute query',
        code: error.code,
      })
    }
  })

  // BigQuery dry run endpoint — estimate query cost
  router.post('/api/bigquery/estimate', async (req, res) => {
    try {
      const { query, analysisType } = req.body

      if (!query) {
        return res.status(400).json({ error: 'Query is required' })
      }

      if (!requireBigQuery(bigquery, res)) return

      // Same validation — don't even dry-run forbidden queries
      const validation = validateQuery(query)
      if (!validation.valid) {
        return res.status(403).json({ error: validation.error })
      }

      const navIdent = getNavIdent(req)

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            dryRun: true,
          },
          navIdent,
          analysisType || 'Sqlverktoy',
        ),
      )

      const stats = job.metadata.statistics
      const totalBytesProcessed = parseInt(stats.totalBytesProcessed || 0)
      const totalBytesBilled = parseInt(stats.query?.totalBytesBilled || totalBytesProcessed)

      // BigQuery pricing: $6.25 per TB
      const estimatedCostUSD = (totalBytesBilled / 1024 ** 4) * 6.25

      res.json({
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
      logger.error({ error: error.message }, '[BigQuery Estimate] Error')
      res.status(500).json({
        error: error.message || 'Failed to estimate query',
      })
    }
  })

  return router
}
