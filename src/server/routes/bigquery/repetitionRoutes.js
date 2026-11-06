import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { logger } from '../../logger.js'
import { MAX_BYTES_BILLED, getNavIdent, prepareGeneratedSql, requireBigQuery } from './helpers.js'
import { buildRepetitionQuery, buildRepetitionActivityQuery } from './repetitionQuery.js'
import { getCompletedQueryStats } from './sqlRoutes.js'

function queryTimestamp(value) {
  const microseconds = (value.match(/\.(\d+)/)?.[1] || '').slice(3, 6).padEnd(3, '0')
  return new Date(value).toISOString().replace(/Z$/, `${microseconds}Z`)
}

export function createRepetitionRouter({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  router.post('/api/bigquery/repetition', async (req, res) => {
    const {
      websiteId,
      startDate,
      endDate,
      urlPath = '',
      pathOperator = 'equals',
      countBy,
      countBySwitchAt,
    } = req.body || {}
    const start = typeof startDate === 'string' ? Date.parse(startDate) : NaN
    const end = typeof endDate === 'string' ? Date.parse(endDate) : NaN
    if (
      typeof websiteId !== 'string' ||
      !websiteId.trim() ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      end - start > 31 * 86400000 ||
      typeof urlPath !== 'string' ||
      urlPath.length > 500 ||
      !['equals', 'starts-with'].includes(pathOperator) ||
      (countBy !== undefined && countBy !== 'distinct_id') ||
      (countBySwitchAt !== undefined &&
        (typeof countBySwitchAt !== 'number' || !Number.isFinite(new Date(countBySwitchAt).getTime())))
    ) {
      return res.status(400).json({ error: 'Velg et nettsted, gyldige filtre og en periode på maksimalt 31 dager.' })
    }
    if (!requireBigQuery(bigquery, res)) return

    try {
      const params = {
        websiteId,
        startDate: new Date(start).toISOString(),
        endDate: new Date(end).toISOString(),
        urlPath: urlPath.replace(/[?#].*$/, '').replace(/\/+$/, '') || (urlPath ? '/' : ''),
        pathOperator,
        useCookies: countBy === 'distinct_id',
        cookieStartDate:
          countBySwitchAt === undefined ? '1970-01-01T00:00:00.000Z' : new Date(countBySwitchAt).toISOString(),
      }
      const query = buildRepetitionQuery(GCP_PROJECT_ID)
      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          { query, params, location: 'europe-north1', maximumBytesBilled: MAX_BYTES_BILLED },
          getNavIdent(req),
          'Gjentatt aktivitet',
        ),
      )
      const [rows] = await job.getQueryResults()
      const result = rows[0]
      if (!result?.summary || !Array.isArray(result.findings)) {
        throw new Error('Analysen mottok et ugyldig datasvar. Genererte data støtter ikke denne analysen.')
      }
      const [metadata] = await job.getMetadata()
      res.json({
        ...result,
        generatedSql: prepareGeneratedSql(query, params),
        queryStats: getCompletedQueryStats(metadata),
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery repetition analysis failed')
      res.status(500).json({ error: error.message || 'Kunne ikke analysere gjentatt aktivitet.' })
    }
  })

  router.post('/api/bigquery/repetition/activity', async (req, res) => {
    const { websiteId, sessionId, visitId, startedAt, endedAt, highlightedEventIds } = req.body || {}
    const start = typeof startedAt === 'string' ? Date.parse(startedAt) : NaN
    const end = typeof endedAt === 'string' ? Date.parse(endedAt) : NaN
    if (
      typeof websiteId !== 'string' ||
      !websiteId.trim() ||
      typeof sessionId !== 'string' ||
      !sessionId.trim() ||
      sessionId.length > 100 ||
      typeof visitId !== 'string' ||
      visitId.length > 100 ||
      !Array.isArray(highlightedEventIds) ||
      highlightedEventIds.length < 1 ||
      highlightedEventIds.length > 100 ||
      highlightedEventIds.some((id) => typeof id !== 'string' || !id || id.length > 100) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      end - start > 31 * 86400000
    ) {
      return res.status(400).json({ error: 'Velg et gyldig eksempel for å hente aktivitetsloggen.' })
    }
    if (!requireBigQuery(bigquery, res)) return
    try {
      const query = buildRepetitionActivityQuery(GCP_PROJECT_ID)
      const params = {
        websiteId,
        sessionId,
        visitId,
        episodeStart: queryTimestamp(startedAt),
        episodeEnd: queryTimestamp(endedAt),
        highlightedEventIds,
        contextStart: new Date(start - 60000).toISOString(),
        contextEnd: new Date(end + 60000).toISOString(),
      }
      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          { query, params, location: 'europe-north1', maximumBytesBilled: MAX_BYTES_BILLED },
          getNavIdent(req),
          'Gjentatt aktivitet – aktivitetslogg',
        ),
      )
      const [rows] = await job.getQueryResults()
      if (!Array.isArray(rows[0]?.activity)) throw new Error('Aktivitetsloggen mottok et ugyldig datasvar.')
      res.json(rows[0])
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery repetition activity failed')
      res.status(500).json({ error: error.message || 'Kunne ikke hente aktivitetsloggen.' })
    }
  })

  return router
}
