import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { MAX_BYTES_BILLED, requireBigQuery, getNavIdent, getDryRunStats } from './helpers.js'
import { logger } from '../../logger.js'

/**
 * Distinct-value suggestions for cohort-editor (brukergrupper) comboboxes.
 * Designed as a shared, generic endpoint — other features (eventexplorer,
 * funnel, retention, …) should reuse this when they get autocomplete, per
 * docs/future-features.md ("brukergrupper everywhere").
 *
 * Cost policy lives server-side ONLY (client never sees bytes/dollars):
 * for each candidate lookback window (30d → 14d → 7d) a free dry-run
 * estimates bytes; the first window under the budget executes. If even 7d
 * exceeds the budget the request errors and the client degrades to free text.
 * Response carries `scannedDays` so the client can explain a narrow window
 * («Forslag fra siste N dager»).
 */

/** Max estimated cost a suggestion query may incur; ladder: 30d → 14d → 7d. */
const MAX_COST_USD = 1
const LOOKBACK_DAYS_LADDER = [30, 14, 7]

const LIMIT_DEFAULT = 100
/** url_path has far higher cardinality than the other columns. */
const LIMIT_BY_COLUMN = { url_path: 500 }

/**
 * Column allowlist — never interpolate `req.query.column` into SQL directly.
 * `source` decides the FROM clause:
 * - 'event': plain column on public_website_event
 * - 'session': column on public_session (browser/os/device/country live there,
 *   not on the events table), correlated by session_id
 * - 'param_key': distinct event-parameter keys (UNNEST of event_parameters)
 * - 'param_value': distinct values for ONE parameter key, requires `key`
 */
const COLUMN_SPECS = {
  url_path: { source: 'event', valueExpr: 'e.url_path' },
  referrer_domain: { source: 'event', valueExpr: 'e.referrer_domain' },
  event_name: { source: 'event', valueExpr: 'e.event_name' },
  browser: { source: 'session', valueExpr: 's.browser' },
  os: { source: 'session', valueExpr: 's.os' },
  device: { source: 'session', valueExpr: 's.device' },
  country: { source: 'session', valueExpr: 's.country' },
  event_data_key: { source: 'param_key', valueExpr: 'p.data_key' },
  // event_data rows: data_type 1=number, 2=string, 3=boolean, 4=date — mirror
  // the COALESCE fallback the clickmap query uses so non-string values still suggest.
  event_data_value: {
    source: 'param_value',
    valueExpr: `COALESCE(NULLIF(TRIM(p.string_value), ''), CAST(p.number_value AS STRING), CAST(p.date_value AS STRING))`,
    requiresKey: true,
  },
}

export const ALLOWED_COLUMNS = Object.keys(COLUMN_SPECS)

/**
 * Builds the suggestion query for a validated column over `days` days.
 * `q` (only honored for url_path) adds a contains-filter so typing narrows
 * the scan server-side instead of shipping 500 irrelevant paths.
 * `eventName` (only honored for event_data_key/event_data_value) scopes
 * event-parameter suggestions to one event — without it, a website that
 * fires many distinct custom events returns every key/value ever set on
 * ANY of them, and the handful relevant to the event the user actually
 * cares about drown in that firehose.
 */
export function buildColumnValuesQuery({ projectId, column, q, eventName }) {
  const spec = COLUMN_SPECS[column]
  if (!spec) throw new Error(`Unsupported column: ${column}`)

  const from = [`\`${projectId}.umami.public_website_event\` e`]
  const wheres = ['e.website_id = @websiteId', 'e.created_at BETWEEN @startDate AND @endDate']

  if (spec.source === 'session') {
    from.push(
      `JOIN \`${projectId}.umami.public_session\` s ON e.session_id = s.session_id AND e.website_id = s.website_id`,
    )
    // public_session has REQUIRE_PARTITION_FILTER — without an s.created_at
    // predicate BigQuery rejects the whole query (prod 500 on browser/os/
    // device/country suggestions). Same pattern as compositionRoutes.
    wheres.push('s.created_at BETWEEN @startDate AND @endDate')
  } else if (spec.source === 'param_key' || spec.source === 'param_value') {
    from.push(
      `JOIN \`${projectId}.umami_views.event_data\` d` +
        ' ON e.event_id = d.website_event_id AND e.website_id = d.website_id AND e.created_at = d.created_at',
      'CROSS JOIN UNNEST(d.event_parameters) AS p',
    )
    if (spec.source === 'param_value') wheres.push('p.data_key = @key')
    if (eventName) wheres.push('e.event_name = @eventName')
  }

  let valueFilter = `${spec.valueExpr} IS NOT NULL`
  if (column === 'url_path' && q) valueFilter += ' AND LOWER(e.url_path) LIKE @q'

  const limit = LIMIT_BY_COLUMN[column] ?? LIMIT_DEFAULT

  const query = `
      SELECT ${spec.valueExpr} AS value, COUNT(*) AS count
      FROM ${from.join('\n      ')}
      WHERE ${wheres.join('\n          AND ')}
        AND ${valueFilter}
      GROUP BY value
      ORDER BY count DESC
      LIMIT ${limit}
  `
  return { query }
}

export function createColumnValuesRouter({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  router.get('/api/bigquery/websites/:websiteId/column-values', async (req, res) => {
    try {
      const { websiteId } = req.params
      const { column, key, q, eventName } = req.query

      if (!COLUMN_SPECS[column]) {
        return res.status(400).json({ error: `Unsupported column. Allowed: ${ALLOWED_COLUMNS.join(', ')}` })
      }
      if (COLUMN_SPECS[column].requiresKey && !key) {
        return res.status(400).json({ error: `column=${column} requires a 'key' query param (event-data key)` })
      }
      if (!requireBigQuery(bigquery, res)) return

      const navIdent = getNavIdent(req)

      for (const days of LOOKBACK_DAYS_LADDER) {
        const endDate = new Date().toISOString()
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

        const { query } = buildColumnValuesQuery({ projectId: GCP_PROJECT_ID, column, q, eventName })
        const params = { websiteId, startDate, endDate }
        if (COLUMN_SPECS[column].source === 'param_value') params.key = key
        if (column === 'url_path' && q) params.q = `%${String(q).toLowerCase()}%`
        if (
          (COLUMN_SPECS[column].source === 'param_key' || COLUMN_SPECS[column].source === 'param_value') &&
          eventName
        ) {
          params.eventName = eventName
        }

        const stats = await getDryRunStats(
          bigquery,
          { query, params, navIdent, analysisType: 'Forslagsverdier' },
          addAuditLogging,
        )
        const costUSD = stats ? parseFloat(stats.estimatedCostUSD) : null
        if (costUSD !== null && costUSD > MAX_COST_USD) {
          logger.info({ column, days, costUSD, websiteId }, '[column-values] window too expensive, narrowing')
          continue
        }
        // stats === null means the dry run itself failed — execute anyway
        // (maximumBytesBilled still caps the blast radius), rather than
        // punishing the user for a transient dry-run hiccup.

        const [job] = await bigquery.createQueryJob(
          addAuditLogging(
            { query, location: 'europe-north1', params, maximumBytesBilled: MAX_BYTES_BILLED },
            navIdent,
            'Forslagsverdier',
          ),
        )
        const [rows] = await job.getQueryResults()
        // BigQuery TIMESTAMP params come back as {value} wrappers; unwrap so
        // the client always gets plain strings.
        const values = rows.map((r) => String(r.value && typeof r.value === 'object' ? r.value.value : r.value))
        return res.json({ values, scannedDays: days })
      }

      res.status(422).json({
        error: 'Value suggestions are too expensive to fetch for this website — type the value manually instead',
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery column-values error')
      res.status(500).json({ error: error.message || 'Failed to fetch column values' })
    }
  })

  return router
}
