import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { logger } from '../../logger.js'
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

const normalizeLegacyUrlStep = (value, operator) => {
  const parsed = splitUrlStepInput(value)
  if (operator === 'starts-with' && parsed.value && !parsed.value.includes('*')) {
    return { ...parsed, value: `${parsed.value}*` }
  }
  return parsed
}

const normalizeStep = (step) => {
  if (!step || typeof step !== 'object') {
    return { type: 'url', value: '', query: '' }
  }

  if (step.type === 'event') {
    const normalizedUrl = splitUrlStepInput(step.urlPath, step.urlQuery)
    return {
      type: 'event',
      value: (step.value ?? '').trim(),
      urlPath: normalizedUrl.value || '',
      urlQuery: normalizedUrl.query || '',
      params: Array.isArray(step.params)
        ? step.params
            .map((param) => ({
              key: (param?.key ?? '').trim(),
              value: (param?.value ?? '').trim(),
              operator: param?.operator === 'contains' ? 'contains' : 'equals',
            }))
            .filter((param) => param.key && param.value)
        : [],
    }
  }

  const normalized = splitUrlStepInput(step.value, step.query)
  return {
    type: 'url',
    value: normalized.value,
    query: normalized.query,
  }
}

const buildStepMatchClause = (step, prefix, alias = 'b') => {
  if (step.type === 'url') {
    const pathParam = `${prefix}Path`
    const queryParam = `${prefix}Query`
    const pathOperator = step.value.includes('*') ? 'LIKE' : '='
    const queryOperator = (step.query ?? '').includes('*') ? 'LIKE' : '='

    let clause = `${alias}.url_path_normalized ${pathOperator} @${pathParam}`
    if (step.query) {
      clause += ` AND ${alias}.url_query_normalized ${queryOperator} @${queryParam}`
    }

    return {
      clause,
      typeCheck: `${alias}.event_type = 1`,
    }
  }

  const eventParam = `${prefix}Event`
  const eventOperator = step.value.includes('*') ? 'LIKE' : '='
  const eventPathParam = `${prefix}EventPath`
  const eventQueryParam = `${prefix}EventQuery`
  const pathOperator = (step.urlPath ?? '').includes('*') ? 'LIKE' : '='
  const queryOperator = (step.urlQuery ?? '').includes('*') ? 'LIKE' : '='

  let clause = `${alias}.event_name ${eventOperator} @${eventParam}`
  if (step.urlPath) {
    clause += ` AND ${alias}.url_path_normalized ${pathOperator} @${eventPathParam}`
  }
  if (step.urlQuery) {
    clause += ` AND ${alias}.url_query_normalized ${queryOperator} @${eventQueryParam}`
  }

  return {
    clause,
    typeCheck: `${alias}.event_type = 2`,
  }
}

const buildEventParamFilters = (step, prefix, alias = 'b', projectId) => {
  if (step.type !== 'event' || !Array.isArray(step.params) || step.params.length === 0) return ''

  const conditions = step.params.map((_, index) => {
    const keyParam = `${prefix}ParamKey${index}`
    const valueParam = `${prefix}ParamValue${index}`
    const operator = step.params[index].operator === 'contains' ? 'LIKE' : '='

    return `EXISTS (
      SELECT 1
      FROM \`${projectId}.umami_views.event_data\` d_${prefix}_${index}
      CROSS JOIN UNNEST(d_${prefix}_${index}.event_parameters) p_${prefix}_${index}
      WHERE d_${prefix}_${index}.website_event_id = ${alias}.event_id
        AND d_${prefix}_${index}.website_id = ${alias}.website_id
        AND d_${prefix}_${index}.created_at = ${alias}.created_at
        AND p_${prefix}_${index}.data_key = @${keyParam}
        AND p_${prefix}_${index}.string_value ${operator} @${valueParam}
    )`
  })

  return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''
}

const assignStepParams = (params, step, prefix) => {
  if (step.type === 'url') {
    params[`${prefix}Path`] = step.value.includes('*') ? step.value.replace(/\*/g, '%') : step.value
    if (step.query) {
      params[`${prefix}Query`] = step.query.includes('*') ? step.query.replace(/\*/g, '%') : step.query
    }
    return
  }

  params[`${prefix}Event`] = step.value.includes('*') ? step.value.replace(/\*/g, '%') : step.value
  if (step.urlPath) {
    params[`${prefix}EventPath`] = step.urlPath.includes('*') ? step.urlPath.replace(/\*/g, '%') : step.urlPath
  }
  if (step.urlQuery) {
    params[`${prefix}EventQuery`] = step.urlQuery.includes('*') ? step.urlQuery.replace(/\*/g, '%') : step.urlQuery
  }

  if (Array.isArray(step.params)) {
    step.params.forEach((param, index) => {
      params[`${prefix}ParamKey${index}`] = param.key
      params[`${prefix}ParamValue${index}`] = param.operator === 'contains' ? `%${param.value}%` : param.value
    })
  }
}

export function createGoalCompletionRoutes({ bigquery, GCP_PROJECT_ID }) {
  const router = express.Router()

  router.post('/api/bigquery/goal-completion', async (req, res) => {
    try {
      const {
        websiteId,
        startDate,
        endDate,
        startStep: inputStartStep,
        goalStep: inputGoalStep,
        startUrl,
        startPathOperator,
        goalUrl,
        goalPathOperator,
        countBy,
        countBySwitchAt,
      } = req.body
      const navIdent = getNavIdent(req)

      if (!requireBigQuery(bigquery, res)) return

      const legacyStartStep = normalizeLegacyUrlStep(startUrl || '', startPathOperator)
      const legacyGoalStep = normalizeLegacyUrlStep(goalUrl || '', goalPathOperator)

      const startStep = normalizeStep(
        inputStartStep || { type: 'url', value: legacyStartStep.value, query: legacyStartStep.query },
      )
      const goalStep = normalizeStep(
        inputGoalStep || { type: 'url', value: legacyGoalStep.value, query: legacyGoalStep.query },
      )

      if (!startStep.value || !goalStep.value) {
        return res.status(400).json({ error: 'Både startsteg og målsteg må være satt.' })
      }

      const countBySwitchAtMs = countBySwitchAt ? parseInt(countBySwitchAt) : NaN
      const hasCountBySwitchAt = Number.isFinite(countBySwitchAtMs)
      const useDistinctId = countBy === 'distinct_id'
      const useSwitch = useDistinctId && hasCountBySwitchAt
      const fromClause = `\`${GCP_PROJECT_ID}.umami.public_website_event\` e ${
        useDistinctId ? `LEFT JOIN \`${GCP_PROJECT_ID}.umami_views.session\` s ON e.session_id = s.session_id` : ''
      }`
      const userIdExpression = useSwitch
        ? `IF(e.created_at >= @countBySwitchAt, s.distinct_id, e.session_id)`
        : useDistinctId
          ? 's.distinct_id'
          : 'e.session_id'

      const neededEventTypes = new Set()
      if (startStep.type === 'url' || goalStep.type === 'url') neededEventTypes.add(1)
      if (startStep.type === 'event' || goalStep.type === 'event') neededEventTypes.add(2)
      const eventTypesList = Array.from(neededEventTypes).join(', ')
      const urlNormSql = normalizeUrlSql()
      const urlQueryNormSql = normalizeUrlQuerySql()

      const startMatch = buildStepMatchClause(startStep, 'start')
      const goalMatch = buildStepMatchClause(goalStep, 'goal')
      const startParamFilters = buildEventParamFilters(startStep, 'start', 'b', GCP_PROJECT_ID)
      const goalParamFilters = buildEventParamFilters(goalStep, 'goal', 'b', GCP_PROJECT_ID)
      const start = new Date(startDate)
      const end = new Date(endDate)
      const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const maxDays = Math.max(daysDiff, 31)

      const query = `
        WITH base AS (
          SELECT
            ${userIdExpression} AS user_id,
            e.created_at,
            e.event_id,
            e.website_id,
            e.event_type,
            e.event_name,
            ${urlNormSql} AS url_path_normalized,
            ${urlQueryNormSql} AS url_query_normalized
          FROM ${fromClause}
          WHERE e.website_id = @websiteId
            AND e.created_at BETWEEN @startDate AND @endDate
            AND e.event_type IN (${eventTypesList})
        ),
        start_candidates AS (
          SELECT
            b.user_id,
            b.created_at
          FROM base b
          WHERE ${startMatch.clause}
            AND ${startMatch.typeCheck}
            ${startParamFilters}
        ),
        starter_first AS (
          SELECT
            user_id,
            MIN(created_at) AS first_start_at
          FROM start_candidates
          GROUP BY user_id
        ),
        starters AS (
          SELECT
            sf.user_id,
            sf.first_start_at,
            DATE(sf.first_start_at, 'Europe/Oslo') AS first_start_date
          FROM starter_first sf
        ),
        goal_candidates AS (
          SELECT
            s.user_id,
            s.first_start_date,
            b.created_at AS goal_created_at
          FROM starters s
          JOIN base b
            ON b.user_id = s.user_id
          WHERE b.created_at > s.first_start_at
            AND ${goalMatch.clause}
            AND ${goalMatch.typeCheck}
            ${goalParamFilters}
        ),
        first_completion AS (
          SELECT
            user_id,
            first_start_date,
            MIN(goal_created_at) AS first_completion_at
          FROM goal_candidates
          GROUP BY user_id, first_start_date
        ),
        completion_by_day AS (
          SELECT
            DATE_DIFF(DATE(first_completion_at, 'Europe/Oslo'), first_start_date, DAY) AS day_diff,
            COUNT(DISTINCT user_id) AS completed_users
          FROM first_completion
          WHERE DATE_DIFF(DATE(first_completion_at, 'Europe/Oslo'), first_start_date, DAY) BETWEEN 0 AND @maxDays
          GROUP BY day_diff
        ),
        starter_counts AS (
          SELECT COUNT(*) AS total_starters
          FROM starters
        ),
        completed_counts AS (
          SELECT COUNT(*) AS total_completed
          FROM first_completion
        ),
        same_day AS (
          SELECT COUNT(*) AS same_day_completed
          FROM first_completion
          WHERE DATE_DIFF(DATE(first_completion_at, 'Europe/Oslo'), first_start_date, DAY) = 0
        ),
        non_completed AS (
          SELECT
            GREATEST(s.total_starters - IFNULL(c.total_completed, 0), 0) AS non_completed_users
          FROM starter_counts s
          CROSS JOIN completed_counts c
        )
        SELECT
          cbd.day_diff AS day,
          IFNULL(cbd.completed_users, 0) AS completed_users,
          s.total_starters,
          c.total_completed,
          sd.same_day_completed,
          n.non_completed_users
        FROM starter_counts s
        CROSS JOIN completed_counts c
        CROSS JOIN same_day sd
        CROSS JOIN non_completed n
        LEFT JOIN completion_by_day cbd ON TRUE
        ORDER BY day
      `

      const params = { websiteId, startDate, endDate, maxDays }
      if (useSwitch) {
        params.countBySwitchAt = new Date(countBySwitchAtMs).toISOString()
      }
      assignStepParams(params, startStep, 'start')
      assignStepParams(params, goalStep, 'goal')

      const queryStats = await getDryRunStats(
        bigquery,
        {
          query,
          params,
          navIdent,
          analysisType: 'Måloppnåelse',
        },
        addAuditLogging,
      )

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Måloppnåelse',
        ),
      )

      const [rows] = await job.getQueryResults()

      const totalStarters = rows.length > 0 && rows[0].total_starters != null ? parseInt(rows[0].total_starters) : 0
      const totalCompleted = rows.length > 0 && rows[0].total_completed != null ? parseInt(rows[0].total_completed) : 0
      const sameDayCompleted =
        rows.length > 0 && rows[0].same_day_completed != null ? parseInt(rows[0].same_day_completed) : 0
      const nonCompleted =
        rows.length > 0 && rows[0].non_completed_users != null ? parseInt(rows[0].non_completed_users) : 0

      const data = rows
        .filter((row) => row.day != null)
        .map((row) => {
          const count = parseInt(row.completed_users)
          const percentage = totalStarters > 0 ? Number(((count / totalStarters) * 100).toFixed(1)) : 0
          return { day: row.day, completed_users: count, percentage }
        })

      res.json({
        data,
        summary: {
          totalStarters,
          totalCompleted,
          sameDayCompleted,
          nonCompleted,
        },
        queryStats,
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'BigQuery goal completion error')
      res.status(500).json({
        error: error.message || 'Failed to fetch goal completion data',
      })
    }
  })

  return router
}
