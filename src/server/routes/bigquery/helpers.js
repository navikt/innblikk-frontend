import { format as formatSql } from 'sql-formatter'
import { logger } from '../../logger.js'

/**
 * Maximum bytes a single query is allowed to scan (500 GB).
 * BigQuery will abort the job before executing if it would exceed this.
 * Must be passed as a string to the BigQuery client.
 */
export const MAX_BYTES_BILLED = String(500 * 1024 ** 3)

/**
 * Ensures the BigQuery client is initialized.
 * Sends a 500 response and returns false if not.
 */
export function requireBigQuery(bigquery, res) {
  if (!bigquery) {
    res.status(500).json({ error: 'BigQuery client not initialized' })
    return false
  }
  return true
}

/**
 * Extracts the authenticated user's NAV ident from the request.
 */
export function getNavIdent(req) {
  return req.user?.navIdent || 'UNKNOWN'
}

/**
 * Fetches the list of registered websites (id, name, domain, ...) from BigQuery.
 * Shared by `websiteRoutes.js` (`GET /api/bigquery/websites`) and the copilot chat
 * route, which needs the domain → website_id mapping to resolve questions like
 * "how many visitors did nav.no have yesterday" to the right `website_id`.
 */
export async function getWebsitesList(bigquery, GCP_PROJECT_ID, navIdent, addAuditLogging) {
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

  return rows.map((row) => {
    let createdAt = row.createdAt
    if (createdAt && typeof createdAt === 'object' && createdAt.value) {
      createdAt = createdAt.value
    }
    return { ...row, createdAt }
  })
}

/**
 * Runs a BigQuery dry-run to estimate query cost.
 * Returns a queryStats object, or null if the dry run fails.
 */
export async function getDryRunStats(
  bigquery,
  { query, location = 'europe-north1', params, navIdent, analysisType },
  addAuditLogging,
) {
  try {
    const jobConfig = {
      query,
      location,
      dryRun: true,
    }
    if (params) jobConfig.params = params

    const [dryRunJob] = await bigquery.createQueryJob(addAuditLogging(jobConfig, navIdent, analysisType))

    const stats = dryRunJob.metadata.statistics
    const bytesProcessed = parseInt(stats.totalBytesProcessed)
    const gbProcessed = (bytesProcessed / 1024 ** 3).toFixed(2)
    const estimatedCostUSD = ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3)

    return {
      totalBytesProcessed: bytesProcessed,
      totalBytesProcessedGB: gbProcessed,
      estimatedCostUSD,
    }
  } catch (err) {
    logger.info({ error: err.message, label: analysisType || 'DryRun' }, 'Dry run failed')
    return null
  }
}

/**
 * SQL snippet for normalizing URL paths (strips query/fragment, collapses slashes, trims trailing slash).
 * @param {string} [column='url_path'] — The column name to normalise.
 */
export function normalizeUrlSql(column = 'url_path') {
  return `
    CASE
      WHEN RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(${column}, r'[?#].*', ''), r'//+', '/'), '/') = ''
      THEN '/'
      ELSE RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(${column}, r'[?#].*', ''), r'//+', '/'), '/')
    END`
}

/**
 * SQL snippet for normalizing URL query strings.
 * @param {string} [column='url_query'] — The column name to normalise.
 */
export function normalizeUrlQuerySql(column = 'url_query') {
  return `
    COALESCE(REGEXP_REPLACE(REGEXP_REPLACE(${column}, r'^[?]', ''), r'#.*$', ''), '')`
}

/**
 * Builds timezone-safe bucket expressions for time-series queries
 * (event-series, traffic-series). Shared by eventRoutes.js and trafficRoutes.js
 * so the bucketing logic — and any fix to it — lives in exactly one place.
 *
 * DATE buckets are robust for day/week/month across DST transitions.
 *
 * Day/week/month buckets only ever have day precision, so they must stay as
 * BigQuery DATE and never be cast to TIMESTAMP. Casting DATE -> TIMESTAMP(tz)
 * fabricates a time-of-day that never existed upstream, and shifts the date
 * across the UTC boundary (e.g. Oslo midnight -> previous day 22:00/23:00 UTC).
 *
 * @param {string} interval — 'day' (default) | 'hour' | 'week' | 'month'
 * @param {string} timezone — IANA timezone, e.g. 'Europe/Oslo'
 * @param {string} [column='created_at'] — fully qualified column name, e.g. 'w.created_at'
 */
export function buildTimeSeriesBucketSql(interval, timezone, column = 'created_at') {
  let bucketSeriesSql = `
              SELECT bucket_time AS time
              FROM UNNEST(
                  GENERATE_DATE_ARRAY(
                      DATE(TIMESTAMP(@startDate), '${timezone}'),
                      DATE(TIMESTAMP(@endDate), '${timezone}'),
                      INTERVAL 1 DAY
                  )
              ) AS bucket_time
          `
  let eventBucketExpression = `DATE(${column}, '${timezone}')`
  let outputBucketAsTimestamp = `buckets.time`

  if (interval === 'hour') {
    bucketSeriesSql = `
              SELECT bucket_time AS time
              FROM UNNEST(
                  GENERATE_TIMESTAMP_ARRAY(
                      TIMESTAMP_TRUNC(TIMESTAMP(@startDate), HOUR, '${timezone}'),
                      TIMESTAMP_TRUNC(TIMESTAMP(@endDate), HOUR, '${timezone}'),
                      INTERVAL 1 HOUR
                  )
              ) AS bucket_time
          `
    eventBucketExpression = `TIMESTAMP_TRUNC(${column}, HOUR, '${timezone}')`
    outputBucketAsTimestamp = `buckets.time`
  } else if (interval === 'week') {
    bucketSeriesSql = `
              SELECT bucket_time AS time
              FROM UNNEST(
                  GENERATE_DATE_ARRAY(
                      DATE_TRUNC(DATE(TIMESTAMP(@startDate), '${timezone}'), WEEK(MONDAY)),
                      DATE_TRUNC(DATE(TIMESTAMP(@endDate), '${timezone}'), WEEK(MONDAY)),
                      INTERVAL 1 WEEK
                  )
              ) AS bucket_time
          `
    eventBucketExpression = `DATE_TRUNC(DATE(${column}, '${timezone}'), WEEK(MONDAY))`
  } else if (interval === 'month') {
    bucketSeriesSql = `
              SELECT bucket_time AS time
              FROM UNNEST(
                  GENERATE_DATE_ARRAY(
                      DATE_TRUNC(DATE(TIMESTAMP(@startDate), '${timezone}'), MONTH),
                      DATE_TRUNC(DATE(TIMESTAMP(@endDate), '${timezone}'), MONTH),
                      INTERVAL 1 MONTH
                  )
              ) AS bucket_time
          `
    eventBucketExpression = `DATE_TRUNC(DATE(${column}, '${timezone}'), MONTH)`
  }

  return { bucketSeriesSql, eventBucketExpression, outputBucketAsTimestamp }
}

export function prepareGeneratedSql(sql, params) {
  // Sort by descending key length so longer names are replaced before shorter
  // prefixes (e.g. @urlPathSlash before @urlPath).
  const sortedKeys = Object.keys(params).sort((a, b) => b.length - a.length)

  let substituted = sql
  for (const key of sortedKeys) {
    const value = params[key]
    const literal =
      typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : `'${String(value).replace(/'/g, "\\'")}'`
    substituted = substituted.replaceAll(`@${key}`, literal)
  }

  try {
    return formatSql(substituted, { language: 'bigquery', tabWidth: 2, keywordCase: 'upper' })
  } catch {
    return substituted
  }
}
