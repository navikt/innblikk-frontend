import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts'
import { normalizeGoalStep } from './goalStepUtils'
import type { GoalStep } from '../model/types'

const projectId = getGcpProjectId()
const eventTable = `\`${projectId}.umami_views.event\``
const eventDataTable = `\`${projectId}.umami_views.event_data\``

const escapeSqlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "''")

const toSqlString = (value: string) => `'${escapeSqlString(value)}'`

const toLikeValue = (value: string) => value.replace(/\*/g, '%')

const buildStepMatchClause = (step: GoalStep, prefix: 'start' | 'goal', alias = 'b') => {
  if (step.type === 'url') {
    const pathValue = toLikeValue(step.value)
    const queryValue = toLikeValue(step.query ?? '')
    const pathOperator = pathValue.includes('%') ? 'LIKE' : '='
    const queryOperator = queryValue.includes('%') ? 'LIKE' : '='

    let clause = `${alias}.url_path_normalized ${pathOperator} ${toSqlString(pathValue)}`
    if (step.query) {
      clause += ` AND ${alias}.url_query_normalized ${queryOperator} ${toSqlString(queryValue)}`
    }

    return {
      clause,
      typeCheck: `${alias}.event_type = 1`,
      paramFilters: '',
    }
  }

  const eventValue = toLikeValue(step.value)
  const eventOperator = eventValue.includes('%') ? 'LIKE' : '='
  const eventPathValue = toLikeValue(step.urlPath ?? '')
  const eventQueryValue = toLikeValue(step.urlQuery ?? '')
  const pathOperator = eventPathValue.includes('%') ? 'LIKE' : '='
  const queryOperator = eventQueryValue.includes('%') ? 'LIKE' : '='

  let clause = `${alias}.event_name ${eventOperator} ${toSqlString(eventValue)}`
  if (step.urlPath) {
    clause += ` AND ${alias}.url_path_normalized ${pathOperator} ${toSqlString(eventPathValue)}`
  }
  if (step.urlQuery) {
    clause += ` AND ${alias}.url_query_normalized ${queryOperator} ${toSqlString(eventQueryValue)}`
  }

  const paramFilters =
    step.params && step.params.length > 0
      ? step.params
          .map((param, index) => {
            const operator = param.operator === 'contains' ? 'LIKE' : '='

            return `EXISTS (
      SELECT 1
      FROM ${eventDataTable} d_${prefix}_${index}
      CROSS JOIN UNNEST(d_${prefix}_${index}.event_parameters) p_${prefix}_${index}
      WHERE d_${prefix}_${index}.website_event_id = ${alias}.event_id
        AND d_${prefix}_${index}.website_id = ${alias}.website_id
        AND d_${prefix}_${index}.created_at = ${alias}.created_at
        AND p_${prefix}_${index}.data_key = ${toSqlString(param.key)}
        AND p_${prefix}_${index}.string_value ${operator} ${toSqlString(param.operator === 'contains' ? `%${param.value}%` : param.value)}
    )`
          })
          .join(' AND ')
      : ''

  return {
    clause,
    typeCheck: `${alias}.event_type = 2`,
    paramFilters: paramFilters ? `AND ${paramFilters}` : '',
  }
}

export const getGoalCompletionSqlTemplate = (startStep: GoalStep, goalStep: GoalStep) => {
  const normalizedStartStep = normalizeGoalStep(startStep)
  const normalizedGoalStep = normalizeGoalStep(goalStep)

  if (!normalizedStartStep.value || !normalizedGoalStep.value) return ''

  const startMatch = buildStepMatchClause(normalizedStartStep, 'start')
  const goalMatch = buildStepMatchClause(normalizedGoalStep, 'goal')

  return `
WITH base AS (
  SELECT
    ${eventTable}.session_id,
    ${eventTable}.created_at,
    ${eventTable}.event_id,
    ${eventTable}.website_id,
    ${eventTable}.event_type,
    ${eventTable}.event_name,
    CASE
      WHEN RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(${eventTable}.url_path, r'[?#].*', ''), r'//+', '/'), '/') = ''
      THEN '/'
      ELSE RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(${eventTable}.url_path, r'[?#].*', ''), r'//+', '/'), '/')
    END AS url_path_normalized,
    COALESCE(REGEXP_REPLACE(REGEXP_REPLACE(${eventTable}.url_query, r'^[?]', ''), r'#.*$', ''), '') AS url_query_normalized
  FROM ${eventTable}
  WHERE ${eventTable}.website_id = '{{website_id}}'
    AND ${eventTable}.event_type IN (1, 2)
    [[AND {{created_at}} ]]
),
start_candidates AS (
  SELECT
    b.session_id,
    b.created_at
  FROM base b
  WHERE ${startMatch.clause}
    AND ${startMatch.typeCheck}
),
starter_first AS (
  SELECT
    session_id,
    MIN(created_at) AS first_start_at
  FROM start_candidates
  GROUP BY session_id
),
starters AS (
  SELECT
    sf.session_id,
    sf.first_start_at,
    DATE(sf.first_start_at, 'Europe/Oslo') AS first_start_date
  FROM starter_first sf
),
goal_candidates AS (
  SELECT
    s.session_id,
    s.first_start_date,
    b.created_at AS goal_created_at
  FROM starters s
  JOIN base b
    ON b.session_id = s.session_id
  WHERE b.created_at > s.first_start_at
    AND ${goalMatch.clause}
    AND ${goalMatch.typeCheck}
    ${goalMatch.paramFilters}
),
first_completion AS (
  SELECT
    session_id,
    first_start_date,
    MIN(goal_created_at) AS first_completion_at
  FROM goal_candidates
  GROUP BY session_id, first_start_date
),
completion_by_day AS (
  SELECT
    DATE_DIFF(DATE(first_completion_at, 'Europe/Oslo'), first_start_date, DAY) AS day,
    COUNT(DISTINCT session_id) AS completed_users
  FROM first_completion
  WHERE DATE_DIFF(DATE(first_completion_at, 'Europe/Oslo'), first_start_date, DAY) BETWEEN 0 AND 365
  GROUP BY day
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
  cbd.day,
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
LIMIT 365
`
}
