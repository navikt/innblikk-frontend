import { format as formatSql } from 'sql-formatter'

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
    console.log(`[${analysisType || 'DryRun'}] Dry run failed:`, err.message)
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
