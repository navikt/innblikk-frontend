import express from 'express'
import { addAuditLogging, substituteQueryParameters } from '../../bigquery/audit.js'
import {
  requireBigQuery,
  getNavIdent,
  getDryRunStats,
  normalizeUrlSql,
  normalizeUrlQuerySql,
  MAX_BYTES_BILLED,
} from './helpers.js'

const normalizeStepQuery = (value) => (value ?? '').trim().replace(/^\?/, '').replace(/#.*$/, '')

const splitUrlStepInput = (value, query = '') => {
  const trimmedValue = (value ?? '').trim()
  if (!trimmedValue) return { value: '', query: normalizeStepQuery(query) }

  const queryIndex = trimmedValue.indexOf('?')
  const rawPath = queryIndex === -1 ? trimmedValue : trimmedValue.substring(0, queryIndex)
  const rawQuery = query.trim() ? query : queryIndex === -1 ? '' : trimmedValue.substring(queryIndex + 1)

  return {
    value: rawPath,
    query: normalizeStepQuery(rawQuery),
  }
}

const resolveUrlStep = (step) => splitUrlStepInput(step.value, step.query)

const buildUrlStepDisplay = (step) => {
  const { value: path, query } = resolveUrlStep(step)
  return query ? `${path}?${query}` : path
}

/**
 * Builds the BigQuery params object for a list of funnel steps.
 * Pure function — no side effects, safe to unit-test.
 */
export const buildStepQueryParams = (steps) => {
  const params = {}
  steps.forEach((step, index) => {
    const resolvedUrl = step.type === 'url' ? resolveUrlStep(step) : null
    const displayValue =
      step.type === 'url'
        ? buildUrlStepDisplay(step)
        : step.value.includes('*')
          ? step.value.replace(/\*/g, '%')
          : step.value
    params[`stepValue${index}`] = displayValue.includes('*') ? displayValue.replace(/\*/g, '%') : displayValue

    if (step.type === 'url') {
      params[`stepPath${index}`] = resolvedUrl.value.includes('*')
        ? resolvedUrl.value.replace(/\*/g, '%')
        : resolvedUrl.value
      params[`stepQuery${index}`] = resolvedUrl.query.includes('*')
        ? resolvedUrl.query.replace(/\*/g, '%')
        : resolvedUrl.query
    }

    if (step.type === 'event' && step.params && Array.isArray(step.params)) {
      step.params.forEach((p, pIdx) => {
        params[`step${index}_pKey${pIdx}`] = p.key
        params[`step${index}_pVal${pIdx}`] = p.operator === 'contains' ? `%${p.value}%` : p.value
      })
    }
  })
  return params
}

const buildUrlStepSqlClause = (step, index, alias = 'e') => {
  const { value: path, query } = resolveUrlStep(step)
  const pathParam = `stepPath${index}`
  const queryParam = `stepQuery${index}`
  const pathOperator = path.includes('*') ? 'LIKE' : '='
  const queryValue = query
  const queryOperator = queryValue.includes('*') ? 'LIKE' : '='

  let clause = `${alias}.url_path_normalized ${pathOperator} @${pathParam}`
  if (queryValue) {
    clause += `\n                AND ${alias}.url_query_normalized ${queryOperator} @${queryParam}`
  }

  return clause
}

export function createFunnelRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  // Get funnel data from BigQuery
  router.post('/api/bigquery/funnel', async (req, res) => {
    try {
      const { websiteId, urls, steps: inputSteps, startDate, endDate, onlyDirectEntry = true } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return

      // Backward compatibility: Convert legacy `urls` to `steps` if `steps` is missing
      let steps = inputSteps
      if (!steps && urls) {
        steps = urls.map((url) => ({ type: 'url', value: url }))
      }

      if (!steps || !Array.isArray(steps) || steps.length < 2) {
        return res.status(400).json({
          error: 'At least 2 steps are required for a funnel',
        })
      }

      // Determine which event types we need to query
      const neededEventTypes = new Set()
      steps.forEach((step) => {
        if (step.type === 'url') neededEventTypes.add(1)
        if (step.type === 'event') neededEventTypes.add(2)
      })
      const eventTypesList = Array.from(neededEventTypes).join(', ')

      const urlNormSql = normalizeUrlSql()
      const urlQueryNormSql = normalizeUrlQuerySql()

      // 1. Base events CTE with step_value calculation
      let query = `
          WITH events_raw AS (
              SELECT 
                  session_id,
                  event_id,
                  website_id,
                  event_type,
                  ${urlNormSql} as url_path_normalized,
                  ${urlQueryNormSql} as url_query_normalized,
                  CASE
                      WHEN event_type = 1 THEN CONCAT(
                          ${urlNormSql},
                          IF(${urlQueryNormSql} = '', '', CONCAT('?', ${urlQueryNormSql}))
                      )
                      WHEN event_type = 2 THEN event_name
                      ELSE NULL
                  END as step_value,
                  created_at
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\`
              WHERE website_id = @websiteId
                AND created_at BETWEEN @startDate AND @endDate
                AND event_type IN (${eventTypesList})
          ),
          events AS (
              SELECT
                  *,
                  LAG(step_value) OVER (PARTITION BY session_id ORDER BY created_at) as prev_step_value,
                  LAG(url_path_normalized) OVER (PARTITION BY session_id ORDER BY created_at) as prev_url_path
              FROM events_raw
          ),
      `

      // 2. Generate CTEs for each step
      const stepCtes = steps.map((step, index) => {
        const stepName = `step${index + 1}`
        const prevStepName = `step${index}`
        const paramName = `stepValue${index}`
        const typeCheck = step.type === 'url' ? 'AND event_type = 1' : 'AND event_type = 2'

        const eventScopeCheck =
          step.type === 'event' && step.eventScope === 'current-path' && index > 0
            ? `AND e.url_path_normalized = prev.url_path${index}`
            : ''

        // Check for event parameters (filters)
        let paramFilters = ''
        if (step.type === 'event' && step.params && Array.isArray(step.params) && step.params.length > 0) {
          const conditions = step.params.map((p, pIdx) => {
            const pKeyName = `step${index}_pKey${pIdx}`
            const pValName = `step${index}_pVal${pIdx}`
            const operator = p.operator === 'contains' ? 'LIKE' : '='

            return `EXISTS (
                SELECT 1
                FROM \`${GCP_PROJECT_ID}.umami_views.event_data\` d_${index}_${pIdx}
                CROSS JOIN UNNEST(d_${index}_${pIdx}.event_parameters) p_${index}_${pIdx}
                WHERE d_${index}_${pIdx}.website_event_id = e.event_id
                  AND d_${index}_${pIdx}.website_id = e.website_id
                  AND d_${index}_${pIdx}.created_at = e.created_at
                  AND p_${index}_${pIdx}.data_key = @${pKeyName}
                  AND p_${index}_${pIdx}.string_value ${operator} @${pValName}
            )`
          })

          if (conditions.length > 0) {
            paramFilters = 'AND ' + conditions.join(' AND ')
          }
        }

        const isWildcard = step.value.includes('*')
        const operator = isWildcard ? 'LIKE' : '='
        const stepMatchClause =
          step.type === 'url' ? buildUrlStepSqlClause(step, index, 'e') : `e.step_value ${operator} @${paramName}`

        if (index === 0) {
          return `
          ${stepName} AS (
              SELECT session_id, MIN(created_at) as time${index + 1},
                     MIN(url_path_normalized) as url_path${index + 1},
                     e.event_id as event_id${index + 1}
              FROM events e
              WHERE ${stepMatchClause}
                ${typeCheck}
                ${paramFilters}
              GROUP BY session_id, e.event_id
          )`
        } else {
          const prevParamName = `stepValue${index - 1}`
          const isPrevWildcard = steps[index - 1].value.includes('*')
          const prevOperator = isPrevWildcard ? 'LIKE' : '='

          if (onlyDirectEntry) {
            return `
          ${stepName} AS (
              SELECT e.session_id, MIN(e.created_at) as time${index + 1},
                     MIN(e.url_path_normalized) as url_path${index + 1},
                     e.event_id as event_id${index + 1}
              FROM events e
              JOIN ${prevStepName} prev ON e.session_id = prev.session_id
              WHERE ${stepMatchClause}
                ${typeCheck}
                AND e.created_at > prev.time${index}
                AND e.prev_step_value ${prevOperator} @${prevParamName}
                ${eventScopeCheck}
                ${paramFilters}
              GROUP BY e.session_id, e.event_id
          )`
          } else {
            return `
          ${stepName} AS (
              SELECT e.session_id, MIN(e.created_at) as time${index + 1},
                     MIN(e.url_path_normalized) as url_path${index + 1},
                     e.event_id as event_id${index + 1}
              FROM events e
              JOIN ${prevStepName} prev ON e.session_id = prev.session_id
              WHERE ${stepMatchClause}
                ${typeCheck}
                AND e.created_at > prev.time${index}
                ${eventScopeCheck}
                ${paramFilters}
              GROUP BY e.session_id, e.event_id
          )`
          }
        }
      })

      query +=
        stepCtes.join(',') +
        `
          SELECT ${steps
            .map(
              (_, i) => `
              ${i} as step, 
              @stepValue${i} as url, 
              (SELECT COUNT(DISTINCT session_id) FROM step${i + 1}) as count`,
            )
            .join('\n            UNION ALL SELECT ')}
          ORDER BY step
      `

      // Create params object
      const params = { websiteId, startDate, endDate, ...buildStepQueryParams(steps) }

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          params,
          navIdent,
          analysisType: 'Traktanalyse',
        },
        addAuditLogging,
      )

      if (queryStats) {
        console.log(
          `[Funnel] Dry run - Processing ${queryStats.totalBytesProcessedGB} GB, estimated cost: $${queryStats.estimatedCostUSD} (Types: ${eventTypesList})`,
        )
      }

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Traktanalyse',
        ),
      )

      const [rows] = await job.getQueryResults()

      if (rows.length === 0) {
        return res.json({ data: [] })
      }

      const data = rows.map((row, index) => ({
        step: index,
        url: buildUrlStepDisplay(steps[index]),
        type: steps[index].type,
        params: steps[index].params,
        count: parseInt(row.count || 0),
      }))

      res.json({ data, queryStats, sql: substituteQueryParameters(query, params) })
    } catch (error) {
      console.error('BigQuery funnel error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch funnel data',
      })
    }
  })

  // Get funnel timing data from BigQuery
  router.post('/api/bigquery/funnel-timing', async (req, res) => {
    try {
      const { websiteId, urls, steps: inputSteps, startDate, endDate, onlyDirectEntry = true } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return

      // Backward compatibility: Convert legacy `urls` to `steps` if `steps` is missing
      let steps = inputSteps
      if (!steps && urls) {
        steps = urls.map((url) => ({ type: 'url', value: url }))
      }

      if (!steps || !Array.isArray(steps) || steps.length < 2) {
        return res.status(400).json({
          error: 'At least 2 steps are required for a funnel',
        })
      }

      // Determine which event types we need to query
      const neededEventTypes = new Set()
      steps.forEach((step) => {
        if (step.type === 'url') neededEventTypes.add(1)
        if (step.type === 'event') neededEventTypes.add(2)
      })
      const eventTypesList = Array.from(neededEventTypes).join(', ')

      const urlNormSql = normalizeUrlSql()
      const urlQueryNormSql = normalizeUrlQuerySql()

      let query = `
          WITH events_raw AS (
              SELECT 
                  session_id,
                  event_type,
                  ${urlNormSql} as url_path_normalized,
                  ${urlQueryNormSql} as url_query_normalized,
                  event_id,
                  website_id,
                  CASE
                      WHEN event_type = 1 THEN CONCAT(
                          ${urlNormSql},
                          IF(${urlQueryNormSql} = '', '', CONCAT('?', ${urlQueryNormSql}))
                      )
                      WHEN event_type = 2 THEN event_name
                      ELSE NULL
                  END as step_value,
                  created_at
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\`
              WHERE website_id = @websiteId
                AND created_at BETWEEN @startDate AND @endDate
                AND event_type IN (${eventTypesList})
          ),
          events AS (
              SELECT
                  *,
                  LAG(step_value) OVER (PARTITION BY session_id ORDER BY created_at) as prev_step_value,
                  LAG(url_path_normalized) OVER (PARTITION BY session_id ORDER BY created_at) as prev_url_path
              FROM events_raw
          ),
      `

      // Generate CTEs for each step (one matched event per session and step)
      const stepCtes = steps.map((step, index) => {
        const stepName = `step${index + 1}`
        const prevStepName = `step${index}`
        const paramName = `stepValue${index}`
        const typeCheck = step.type === 'url' ? 'AND e.event_type = 1' : 'AND e.event_type = 2'

        const eventScopeCheck =
          step.type === 'event' && step.eventScope === 'current-path' && index > 0
            ? `AND e.url_path_normalized = prev.url_path${index}`
            : ''

        // Check for event parameters (filters)
        let paramFilters = ''
        if (step.type === 'event' && step.params && Array.isArray(step.params) && step.params.length > 0) {
          const conditions = step.params.map((p, pIdx) => {
            const pKeyName = `step${index}_pKey${pIdx}`
            const pValName = `step${index}_pVal${pIdx}`
            const operator = p.operator === 'contains' ? 'LIKE' : '='

            return `EXISTS (
                SELECT 1
                FROM \`${GCP_PROJECT_ID}.umami_views.event_data\` d_${index}_${pIdx}
                CROSS JOIN UNNEST(d_${index}_${pIdx}.event_parameters) p_${index}_${pIdx}
                WHERE d_${index}_${pIdx}.website_event_id = e.event_id
                  AND d_${index}_${pIdx}.website_id = e.website_id
                  AND d_${index}_${pIdx}.created_at = e.created_at
                  AND p_${index}_${pIdx}.data_key = @${pKeyName}
                  AND p_${index}_${pIdx}.string_value ${operator} @${pValName}
            )`
          })

          if (conditions.length > 0) {
            paramFilters = 'AND ' + conditions.join(' AND ')
          }
        }

        const isWildcard = step.value.includes('*')
        const operator = isWildcard ? 'LIKE' : '='
        const stepMatchClause =
          step.type === 'url' ? buildUrlStepSqlClause(step, index, 'e') : `e.step_value ${operator} @${paramName}`

        if (index === 0) {
          return `
          ${stepName} AS (
              SELECT
                  e.session_id,
                  e.created_at as time${index + 1},
                  e.url_path_normalized as url_path${index + 1}
              FROM events e
              WHERE ${stepMatchClause}
                ${typeCheck}
                ${paramFilters}
              QUALIFY ROW_NUMBER() OVER (PARTITION BY e.session_id ORDER BY e.created_at) = 1
          )`
        }

        const prevParamName = `stepValue${index - 1}`
        const isPrevWildcard = steps[index - 1].value.includes('*')
        const prevOperator = isPrevWildcard ? 'LIKE' : '='

        const strictCheck = onlyDirectEntry ? `AND e.prev_step_value ${prevOperator} @${prevParamName}` : ''

        return `
          ${stepName} AS (
              SELECT
                  e.session_id,
                  e.created_at as time${index + 1},
                  e.url_path_normalized as url_path${index + 1}
              FROM events e
              JOIN ${prevStepName} prev ON e.session_id = prev.session_id
              WHERE ${stepMatchClause}
                ${typeCheck}
                AND e.created_at > prev.time${index}
                ${strictCheck}
                ${eventScopeCheck}
                ${paramFilters}
              QUALIFY ROW_NUMBER() OVER (PARTITION BY e.session_id ORDER BY e.created_at) = 1
          )`
      })

      const transitionSelects = steps.slice(0, -1).map(
        (_, i) => `
              SELECT
                  ${i} as step,
                  @stepValue${i} as from_url,
                  @stepValue${i + 1} as to_url,
                  TIMESTAMP_DIFF(s${i + 2}.time${i + 2}, s${i + 1}.time${i + 1}, SECOND) as diff
              FROM step${i + 1} s${i + 1}
              JOIN step${i + 2} s${i + 2} ON s${i + 1}.session_id = s${i + 2}.session_id
      `,
      )

      const lastStepIndex = steps.length

      query +=
        stepCtes.join(',') +
        `,
          timings AS (
              ${transitionSelects.join('\n              UNION ALL\n')}
              UNION ALL
              SELECT
                  -1 as step,
                  'Total' as from_url,
                  'Total' as to_url,
                  TIMESTAMP_DIFF(last.time${lastStepIndex}, first.time1, SECOND) as diff
              FROM step1 first
              JOIN step${lastStepIndex} last ON first.session_id = last.session_id
          )
          SELECT
              step,
              from_url,
              to_url,
              AVG(diff) as avg_seconds,
              APPROX_QUANTILES(diff, 2)[OFFSET(1)] as median_seconds,
              COUNT(*) as count
          FROM timings
          GROUP BY 1, 2, 3
          ORDER BY step
      `

      // Create params object
      const params = { websiteId, startDate, endDate, ...buildStepQueryParams(steps) }

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          params,
          navIdent,
          analysisType: 'Traktanalyse',
        },
        addAuditLogging,
      )

      if (queryStats) {
        console.log(
          `[Funnel Timing] Dry run - Processing ${queryStats.totalBytesProcessedGB} GB, estimated cost: $${queryStats.estimatedCostUSD} (Types: ${eventTypesList})`,
        )
      }

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Traktanalyse',
        ),
      )

      const [rows] = await job.getQueryResults()

      if (rows.length === 0) {
        return res.json({ data: [], queryStats })
      }

      const timingData = rows.map((row) => ({
        fromStep: parseInt(row.step),
        toStep: parseInt(row.step) + 1,
        fromUrl: row.from_url,
        toUrl: row.to_url,
        avgSeconds: row.avg_seconds ? Math.round(parseFloat(row.avg_seconds)) : null,
        medianSeconds: row.median_seconds ? Math.round(parseFloat(row.median_seconds)) : null,
      }))

      res.json({ data: timingData, sql: substituteQueryParameters(query, params), queryStats })
    } catch (error) {
      console.error('BigQuery funnel timing error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch funnel timing data',
      })
    }
  })

  return router
}
