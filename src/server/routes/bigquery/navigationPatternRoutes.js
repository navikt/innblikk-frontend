import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { logger } from '../../logger.js'
import { getNavIdent, MAX_BYTES_BILLED, prepareGeneratedSql, requireBigQuery } from './helpers.js'
import { buildNavigationPatternQuery } from './navigationPatternQuery.js'

const CONFIRM_BYTES = 50 * 1024 ** 3

function validateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be an object'
  if (typeof body.websiteId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.websiteId)) {
    return 'websiteId must be a non-empty identifier (letters, digits, hyphens or underscores; max 128)'
  }
  for (const key of ['startDate', 'endDate']) {
    const value = body[key]
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    ) {
      return `${key} must be a valid ISO date or timestamp with timezone`
    }
    // Date.parse normalizes impossible calendar dates such as February 30.
    const [year, month, day] = value.slice(0, 10).split('-').map(Number)
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
      return `${key} must be a valid calendar date`
    }
    if (
      value.length > 10 &&
      (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59)
    ) {
      return `${key} must be a valid time`
    }
  }
  const duration = Date.parse(body.endDate) - Date.parse(body.startDate)
  if (duration <= 0) return 'endDate must be later than startDate (exclusive end)'
  if (duration > 366 * 86400000) return 'Selected period must not exceed 366 days'
  if (
    body.urlPath !== undefined &&
    (typeof body.urlPath !== 'string' ||
      !body.urlPath.startsWith('/') ||
      body.urlPath.length > 2048 ||
      Array.from(body.urlPath).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
  ) {
    return 'urlPath must be a path starting with / (max 2048 characters)'
  }
  if (body.pathScope !== undefined && !['anywhere', 'from-first-visit'].includes(body.pathScope)) {
    return 'pathScope must be anywhere or from-first-visit'
  }
  if (body.pathScope === 'from-first-visit' && !body.urlPath) {
    return 'from-first-visit requires a non-empty urlPath'
  }
  if (
    body.confirmedBytes !== undefined &&
    (!Number.isSafeInteger(body.confirmedBytes) ||
      body.confirmedBytes < 0 ||
      body.confirmedBytes > Number(MAX_BYTES_BILLED))
  ) {
    return 'confirmedBytes must be a non-negative integer within the query budget'
  }
  return null
}

function validResultRows(rows) {
  const count = (value) => Number.isSafeInteger(value) && value >= 0
  const context = (values) =>
    Array.isArray(values) && values.every((value) => typeof value?.path === 'string' && count(value.sessions))
  if (!Array.isArray(rows) || rows.length !== 1) return false
  const row = rows[0]
  if (
    !row?.summary ||
    !['totalSessions', 'patternSessions', 'repeatedCycleSessions', 'ambiguousSessions'].every((key) =>
      count(row.summary[key]),
    ) ||
    !count(row.invalidPathSessions) ||
    !count(row.missingSessionEvents) ||
    !Array.isArray(row.patterns)
  ) {
    return false
  }
  return row.patterns.every(
    (pattern) =>
      typeof pattern?.id === 'string' &&
      ['alternation', 'cycle', 'quick-return'].includes(pattern.type) &&
      Array.isArray(pattern.pages) &&
      pattern.pages.length >= 2 &&
      pattern.pages.length <= 4 &&
      pattern.pages.every((page) => typeof page === 'string') &&
      count(pattern.sessions) &&
      Number.isFinite(pattern.share) &&
      pattern.share >= 0 &&
      pattern.share <= 1 &&
      Number.isFinite(pattern.medianRepetitions) &&
      pattern.medianRepetitions >= 1 &&
      Array.isArray(pattern.trend) &&
      pattern.trend.every(
        (point) => typeof point?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(point.date) && count(point.sessions),
      ) &&
      context(pattern.before) &&
      context(pattern.after),
  )
}

export function createNavigationPatternRoutes({ bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE = 'Europe/Oslo' }) {
  const router = express.Router()
  const handle = (estimateOnly) => async (req, res) => {
    const validationError = validateInput(req.body)
    if (validationError) return res.status(400).json({ error: validationError })
    if (!requireBigQuery(bigquery, res)) return

    try {
      const {
        websiteId,
        startDate,
        endDate,
        urlPath = '',
        pathScope = urlPath ? 'from-first-visit' : 'anywhere',
      } = req.body
      const params = {
        websiteId,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        urlPath,
        pathScope,
        timezone: BIGQUERY_TIMEZONE,
      }
      const query = buildNavigationPatternQuery(GCP_PROJECT_ID)
      const navIdent = getNavIdent(req)
      const [dryRunJob] = await bigquery.createQueryJob(
        addAuditLogging({ query, params, location: 'europe-north1', dryRun: true }, navIdent, 'Navigasjonsmonstre'),
      )
      if (dryRunJob.metadata?.isGeneratedData) {
        return res.status(502).json({
          error: 'Kunne ikke hente et reelt kostnadsestimat. Analysen er ikke kjørt.',
          code: 'NAVIGATION_PATTERN_ESTIMATE_UNAVAILABLE',
        })
      }
      const bytesValue = dryRunJob.metadata?.statistics?.totalBytesProcessed
      const bytes = typeof bytesValue === 'string' && /^\d+$/.test(bytesValue) ? Number(bytesValue) : bytesValue
      if (!Number.isSafeInteger(bytes) || bytes < 0) {
        throw new Error('Kostnadsestimatet mangler gyldig datamengde. Analysen er ikke kjørt.')
      }
      const queryStats = {
        totalBytesProcessed: bytes,
        totalBytesProcessedGB: (bytes / 1024 ** 3).toFixed(2),
        estimatedCostUSD: ((bytes / 1024 ** 4) * 6.25).toFixed(3),
      }
      const estimate = {
        queryStats,
        requiresConfirmation: bytes >= CONFIRM_BYTES,
        maximumBytesBilled: MAX_BYTES_BILLED,
      }
      if (bytes > Number(MAX_BYTES_BILLED)) {
        return res.status(413).json({
          ...estimate,
          error: 'Spørringen overskrider grensen på 500 GB. Velg en kortere periode.',
          code: 'NAVIGATION_PATTERN_BUDGET_EXCEEDED',
        })
      }
      if (estimateOnly) return res.json(estimate)
      if (estimate.requiresConfirmation && !(req.body.confirmedBytes >= bytes)) {
        return res.status(409).json({
          ...estimate,
          error: 'Bekreft kostnaden før analysen kjøres.',
          code: 'NAVIGATION_PATTERN_CONFIRMATION_REQUIRED',
        })
      }
      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          { query, params, location: 'europe-north1', maximumBytesBilled: MAX_BYTES_BILLED },
          navIdent,
          'Navigasjonsmonstre',
        ),
      )
      const [rows] = await job.getQueryResults()
      if (!validResultRows(rows)) {
        return res.status(502).json({
          error:
            'Navigation patterns requires a supported aggregate BigQuery result. Generated-data fallback is not supported.',
          code: 'NAVIGATION_PATTERN_UNSUPPORTED_RESULT',
        })
      }
      const [row] = rows
      res.json({
        summary: row.summary,
        patterns: row.patterns,
        generatedSql: prepareGeneratedSql(query, params),
        queryStats,
        metadata: {
          version: 1,
          stage: 'alfa',
          startDate: params.startDate,
          endDate: params.endDate,
          endExclusive: true,
          timezone: BIGQUERY_TIMEZONE,
          urlPath: urlPath || null,
          pathScope,
          filterScope: 'session-inclusion',
          patternScope: urlPath ? 'selected-page' : 'all',
          sampled: false,
          cycleLengths: [2, 3, 4],
          minimumCompleteRounds: 2,
          quickReturnMaxSeconds: 10,
          shareDenominator: 'totalSessions',
          repetitionMeasure: {
            repeatedCycles: 'maximum-consecutive-complete-rounds-per-session',
            quickReturn: 'return-occurrences-per-session',
          },
          trendAssignment: 'occurrence-start-date; distinct sessions per date; zero dates omitted',
          context: 'outside maximal run or quick return; distinct sessions per path; all contexts returned',
          categoriesMayOverlap: true,
          ambiguousSessionPolicy: 'exclude entire session if any pageviews share a timestamp',
          invalidPathSessions: Number(row.invalidPathSessions),
          missingSessionEvents: Number(row.missingSessionEvents),
          limitations: [
            'Only events inside [startDate, endDate) are observed; boundary-spanning patterns and context may be incomplete.',
            'Unknown paths exclude the entire session from detection; events without session IDs cannot be analysed.',
            'Quick returns describe observed page sequences, not browser back actions or user intent.',
            ...(urlPath ? ['Only patterns containing the selected page are included.'] : []),
            ...(pathScope === 'from-first-visit'
              ? [
                  'Analysis begins at the first matching pageview within the selected period, inclusive; earlier context is excluded, and later visits do not reset the sequence.',
                  'Only cycles involving the selected page are included and displayed from that page; quick returns must start and end on it.',
                ]
              : []),
          ],
        },
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery navigation patterns error')
      res.status(500).json({ error: error.message || 'Failed to fetch navigation patterns' })
    }
  }
  router.post('/api/bigquery/navigation-patterns/estimate', handle(true))
  router.post('/api/bigquery/navigation-patterns', handle(false))
  return router
}
