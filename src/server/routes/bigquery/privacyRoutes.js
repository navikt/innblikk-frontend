import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getDryRunStats, MAX_BYTES_BILLED, prepareGeneratedSql } from './helpers.js'
import { logger } from '../../logger.js'

export function createPrivacyRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Privacy Check Endpoint
  router.post('/api/bigquery/privacy-check', async (req, res) => {
    try {
      const { websiteId, startDate, endDate, dryRun } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return

      const params = { startDate, endDate }
      if (websiteId) {
        params.websiteId = websiteId
      }

      // Regex patterns
      const patterns = {
        Fødselsnummer: '\\b\\d{11}\\b',
        UUID: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b',
        Navident: '\\b[a-zA-Z]\\d{6}\\b',
        'E-post': '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b',
        'IP-adresse': '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b',
        Telefonnummer: '\\b[2-9]\\d{7}\\b',
        Bankkort: '\\b\\d{4}[-\\s]\\d{4}[-\\s]\\d{4}[-\\s]\\d{4}\\b',
        'Mulig navn': '\\b[A-ZÆØÅ][a-zæøå]{1,20}\\s[A-ZÆØÅ][a-zæøå]{1,20}(?:\\s[A-ZÆØÅ][a-zæøå]{1,20})?\\b',
        'Mulig adresse': '\\b\\d{4}\\s[A-ZÆØÅ][A-ZÆØÅa-zæøå]+(?:\\s[A-ZÆØÅa-zæøå]+)*\\b',
        'Hemmelig adresse': '(?i)hemmelig(?:%20|\\s+)(?:20\\s*%(?:%20|\\s+))?adresse',
        Kontonummer: '\\b\\d{4}\\.?\\d{2}\\.\\d{5}\\b',
        Organisasjonsnummer: '\\b\\d{9}\\b',
        Bilnummer: '\\b[A-Z]{2}\\s?\\d{5}\\b',
        'Mulig søk': '[?&](?:q|query|search|k|ord)=[^&]+',
        Redacted: '\\[.*?\\]',
      }

      // Tables and columns to check
      const checks = [
        { table: 'public_website_event', column: 'url_path' },
        { table: 'public_website_event', column: 'url_query' },
        { table: 'public_website_event', column: 'referrer_path' },
        { table: 'public_website_event', column: 'referrer_query' },
        { table: 'public_website_event', column: 'referrer_domain' },
        { table: 'public_website_event', column: 'page_title' },
        { table: 'public_website_event', column: 'event_name' },
        { table: 'public_session', column: 'hostname' },
        { table: 'public_session', column: 'browser' },
        { table: 'public_session', column: 'os' },
        { table: 'public_session', column: 'device' },
      ]

      // If global search, fetch website names first
      let websiteMap = new Map()
      if (!websiteId) {
        try {
          const [siteRows] = await bigquery.query(
            addAuditLogging(
              {
                query: `SELECT website_id, name FROM \`${GCP_PROJECT_ID}.umami.public_website\``,
                maximumBytesBilled: MAX_BYTES_BILLED,
              },
              navIdent,
              'Personvernssjekk',
            ),
          )
          siteRows.forEach((r) => websiteMap.set(r.website_id, r.name))
        } catch (e) {
          logger.error({ error: e.message ?? e }, 'Error fetching websites for global search')
        }
      }

      let unionQueries = []

      for (const check of checks) {
        for (const [type, pattern] of Object.entries(patterns)) {
          const extraFilter = type === 'Telefonnummer' ? `AND NOT REGEXP_CONTAINS(${check.column}, r'/vis/[0-9]+')` : ''

          if (websiteId) {
            const relatedPathsExpression =
              check.table === 'public_website_event'
                ? 'ARRAY_AGG(DISTINCT url_path IGNORE NULLS LIMIT 5)'
                : 'CAST([] AS ARRAY<STRING>)'

            unionQueries.push(`
                SELECT 
                    '${check.table}' as table_name,
                    '${check.column}' as column_name,
                    '${type}' as match_type,
                    COUNT(*) as count,
                    ${type === 'E-post' ? `COUNTIF(REGEXP_CONTAINS(${check.column}, r'@nav'))` : '0'} as nav_count,
                    ${type === 'E-post' ? `COUNT(DISTINCT ${check.column})` : '0'} as unique_count,
                    ${type === 'E-post' ? `COUNT(DISTINCT CASE WHEN REGEXP_CONTAINS(${check.column}, r'@nav') THEN ${check.column} END)` : '0'} as unique_nav_count,
                    ${type === 'E-post' ? `COUNT(DISTINCT CASE WHEN NOT REGEXP_CONTAINS(${check.column}, r'@nav') THEN ${check.column} END)` : '0'} as unique_other_count,
                    ARRAY_AGG(DISTINCT ${check.column} LIMIT 5) as examples,
                    ${relatedPathsExpression} as related_paths
                FROM \`${GCP_PROJECT_ID}.umami.${check.table}\`
                WHERE website_id = @websiteId
                AND created_at BETWEEN @startDate AND @endDate
                AND REGEXP_CONTAINS(${check.column}, r'${pattern}')
                ${extraFilter}
            `)
          } else {
            const relatedPathsExpression =
              check.table === 'public_website_event'
                ? 'ARRAY_AGG(DISTINCT url_path IGNORE NULLS LIMIT 5)'
                : 'CAST([] AS ARRAY<STRING>)'

            unionQueries.push(`
                SELECT 
                    website_id,
                    '${check.table}' as table_name,
                    '${check.column}' as column_name,
                    '${type}' as match_type,
                    COUNT(*) as count,
                    ${type === 'E-post' ? `COUNTIF(REGEXP_CONTAINS(${check.column}, r'@nav'))` : '0'} as nav_count,
                    ${type === 'E-post' ? `COUNT(DISTINCT ${check.column})` : '0'} as unique_count,
                    ${type === 'E-post' ? `COUNT(DISTINCT CASE WHEN REGEXP_CONTAINS(${check.column}, r'@nav') THEN ${check.column} END)` : '0'} as unique_nav_count,
                    ${type === 'E-post' ? `COUNT(DISTINCT CASE WHEN NOT REGEXP_CONTAINS(${check.column}, r'@nav') THEN ${check.column} END)` : '0'} as unique_other_count,
                    ARRAY_AGG(DISTINCT ${check.column} LIMIT 5) as examples,
                    ${relatedPathsExpression} as related_paths
                FROM \`${GCP_PROJECT_ID}.umami.${check.table}\`
                WHERE created_at BETWEEN @startDate AND @endDate
                AND REGEXP_CONTAINS(${check.column}, r'${pattern}')
                ${extraFilter}
                GROUP BY website_id
            `)
          }
        }
      }

      // Special check for event_data (nested in views)
      for (const [type, pattern] of Object.entries(patterns)) {
        const extraFilter = type === 'Telefonnummer' ? `AND NOT REGEXP_CONTAINS(p.string_value, r'/vis/[0-9]+')` : ''

        if (websiteId) {
          unionQueries.push(`
              SELECT 
                  'event_data' as table_name,
                  'string_value' as column_name,
                  '${type}' as match_type,
                  COUNT(*) as count,
                  ${type === 'E-post' ? `COUNTIF(REGEXP_CONTAINS(p.string_value, r'@nav'))` : '0'} as nav_count,
                  ${type === 'E-post' ? `COUNT(DISTINCT p.string_value)` : '0'} as unique_count,
                  ${type === 'E-post' ? `COUNT(DISTINCT CASE WHEN REGEXP_CONTAINS(p.string_value, r'@nav') THEN p.string_value END)` : '0'} as unique_nav_count,
                  ${type === 'E-post' ? `COUNT(DISTINCT CASE WHEN NOT REGEXP_CONTAINS(p.string_value, r'@nav') THEN p.string_value END)` : '0'} as unique_other_count,
              ARRAY_AGG(DISTINCT p.string_value LIMIT 5) as examples,
              ARRAY_AGG(DISTINCT e.url_path IGNORE NULLS LIMIT 5) as related_paths
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
              JOIN \`${GCP_PROJECT_ID}.umami_views.event_data\` d
                  ON e.event_id = d.website_event_id
                  AND e.website_id = d.website_id
                  AND e.created_at = d.created_at
              CROSS JOIN UNNEST(d.event_parameters) AS p
              WHERE e.website_id = @websiteId
              AND e.created_at BETWEEN @startDate AND @endDate
              AND REGEXP_CONTAINS(p.string_value, r'${pattern}')
              ${extraFilter}
          `)
        } else {
          unionQueries.push(`
              SELECT 
                  e.website_id,
                  'event_data' as table_name,
                  'string_value' as column_name,
                  '${type}' as match_type,
                  COUNT(*) as count,
                  ${type === 'E-post' ? `COUNTIF(REGEXP_CONTAINS(p.string_value, r'@nav'))` : '0'} as nav_count,
                  ${type === 'E-post' ? `COUNT(DISTINCT p.string_value)` : '0'} as unique_count,
                  ${type === 'E-post' ? `COUNT(DISTINCT CASE WHEN REGEXP_CONTAINS(p.string_value, r'@nav') THEN p.string_value END)` : '0'} as unique_nav_count,
                  ${type === 'E-post' ? `COUNT(DISTINCT CASE WHEN NOT REGEXP_CONTAINS(p.string_value, r'@nav') THEN p.string_value END)` : '0'} as unique_other_count,
              ARRAY_AGG(DISTINCT p.string_value LIMIT 5) as examples,
              ARRAY_AGG(DISTINCT e.url_path IGNORE NULLS LIMIT 5) as related_paths
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
              JOIN \`${GCP_PROJECT_ID}.umami_views.event_data\` d
                  ON e.event_id = d.website_event_id
                  AND e.website_id = d.website_id
                  AND e.created_at = d.created_at
              CROSS JOIN UNNEST(d.event_parameters) AS p
              WHERE e.created_at BETWEEN @startDate AND @endDate
              AND REGEXP_CONTAINS(p.string_value, r'${pattern}')
              ${extraFilter}
              GROUP BY e.website_id
          `)
        }
      }

      const query = unionQueries.join(' UNION ALL ')

      const finalQuery = `
          SELECT * FROM (
              ${query}
          )
          ORDER BY count DESC
      `

      // Dry run check
      if (dryRun) {
        const stats = await getDryRunStats(
          bigquery,
          {
            query: finalQuery,
            params,
            navIdent,
            analysisType: 'Personvernssjekk',
          },
          addAuditLogging,
        )

        if (!stats) {
          return res.status(500).json({ error: 'Dry run failed' })
        }

        return res.json({
          dryRun: true,
          generatedSql: prepareGeneratedSql(finalQuery, params),
          queryStats: {
            totalBytesProcessedGB: stats.totalBytesProcessedGB,
            estimatedCostUSD: stats.estimatedCostUSD,
          },
        })
      }

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: finalQuery,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Personvernssjekk',
        ),
      )

      const [rows] = await job.getQueryResults()

      // Filter out false positives
      const uuidPattern = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/

      let processedRows = rows.filter((row) => {
        if (row.match_type === 'Bankkort' || row.match_type === 'Telefonnummer') {
          const hasUuid = row.examples?.some((ex) => uuidPattern.test(ex))
          return !hasUuid
        }
        return true
      })

      // Map website names if global search
      if (!websiteId) {
        processedRows = processedRows.map((row) => ({
          ...row,
          website_name: websiteMap.get(row.website_id) || row.website_id,
        }))
      }

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query: finalQuery,
          params,
          navIdent,
          analysisType: 'Personvernssjekk',
        },
        addAuditLogging,
      )

      res.json({ data: processedRows, generatedSql: prepareGeneratedSql(finalQuery, params), queryStats })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'Privacy check error')
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
