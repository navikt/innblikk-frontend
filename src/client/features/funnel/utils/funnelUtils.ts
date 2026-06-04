import type { FunnelStep, FunnelResultRow, TimingResultRow } from '../model/types'
import type { Website } from '../../../shared/types/chart'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig'
import { getStepUrlDisplay, normalizeStepQuery, splitUrlStepInput } from './stepUtils'
export { copyToClipboard } from '../../../shared/lib/clipboard'

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''")

const normalizeUrlStep = (step: FunnelStep) =>
  step.type === 'url' ? { ...step, ...splitUrlStepInput(step.value, step.query ?? '') } : step

const buildUrlStepFilterSql = (step: FunnelStep, alias: string): string => {
  if (step.type !== 'url') return ''

  const pathValue = step.value.includes('*') ? step.value.replace(/\*/g, '%') : step.value
  const pathOperator = step.value.includes('*') ? 'LIKE' : '='
  const queryValue = normalizeStepQuery(step.query ?? '')
  const queryOperator = queryValue.includes('*') ? 'LIKE' : '='
  const normalizedQueryValue = queryValue.includes('*') ? queryValue.replace(/\*/g, '%') : queryValue

  let sql = `${alias}.url_path_normalized ${pathOperator} '${escapeSqlLiteral(pathValue)}'`
  if (queryValue) {
    sql += `\n      AND ${alias}.url_query_normalized ${queryOperator} '${escapeSqlLiteral(normalizedQueryValue)}'`
  }

  return sql
}

const buildStepDisplayValue = (step: FunnelStep): string => {
  if (step.type !== 'url') return step.value
  return getStepUrlDisplay(step)
}

/**
 * Format a duration in seconds to a human-readable string.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || isNaN(seconds)) return '-'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}t ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

/**
 * Download funnel data as a CSV file.
 */
export function downloadCSV(funnelData: FunnelResultRow[], websiteName?: string): void {
  if (!funnelData || funnelData.length === 0) return

  const headers = ['Steg', 'URL', 'Antall', 'Gikk videre (%)', 'Falt fra (%)']
  const csvRows = [
    headers.join(','),
    ...funnelData.map((item, index) => {
      const nextItem = funnelData[index + 1]
      const percentageOfNext = nextItem && item.count > 0 ? Math.round((nextItem.count / item.count) * 100) : null
      const dropoffPercentage = percentageOfNext !== null ? 100 - percentageOfNext : null
      const escapeCSV = (val: string | number | null | undefined) => {
        const str = val !== null && val !== undefined ? `${val}` : ''
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }

      return [
        item.step + 1,
        escapeCSV(item.url),
        item.count,
        percentageOfNext !== null ? percentageOfNext : '-',
        dropoffPercentage !== null ? dropoffPercentage : '-',
      ].join(',')
    }),
  ]

  const csvContent = csvRows.join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `traktanalyse_${websiteName || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generate Metabase-compatible SQL for funnel visualization.
 */
export function generateMetabaseFunnelSql(
  funnelData: FunnelResultRow[],
  steps: FunnelStep[],
  selectedWebsite: Website,
  onlyDirectEntry: boolean,
): string {
  if (!funnelData || funnelData.length === 0) return ''

  const normalizedSteps = steps.map((s) => normalizeUrlStep(s)).filter((s) => s.value.trim() !== '')

  if (normalizedSteps.length < 2) return ''

  const neededEventTypes = new Set<number>()
  normalizedSteps.forEach((step) => {
    if (step.type === 'url') neededEventTypes.add(1)
    if (step.type === 'event') neededEventTypes.add(2)
  })
  const eventTypesList = Array.from(neededEventTypes).join(', ')

  const projectId = getGcpProjectId()

  let sql = `-- Traktanalyse for Metabase
-- Bruk denne SQL-en i Metabase for å lage en traktgraf
-- Velg "Funnel" som visualiseringstype etter at du har kjørt spørringen
--
-- OPPSETT I METABASE:
-- 1. Klikk på "created_at" variabelen i høyre panel
-- 2. Sett variabeltype til "Field Filter"
-- 3. Koble til: umami_views.event → created_at
-- 4. Velg ønsket periode og kjør spørringen

WITH events_raw AS (
    SELECT
        session_id,
        event_type,
        CASE
            WHEN event_type = 1 THEN COALESCE(NULLIF(RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(url_path, r'[?#].*', ''), r'//+', '/'), '/'), ''), '/')
            ELSE NULL
        END as url_path_normalized,
        CASE
            WHEN event_type = 1 THEN CONCAT(
                COALESCE(NULLIF(RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(url_path, r'[?#].*', ''), r'//+', '/'), '/'), ''), '/'),
                IF(
                    COALESCE(REGEXP_REPLACE(REGEXP_REPLACE(url_query, r'^[?]', ''), r'#.*$', ''), '') = '',
                    '',
                    CONCAT('?', COALESCE(REGEXP_REPLACE(REGEXP_REPLACE(url_query, r'^[?]', ''), r'#.*$', ''), ''))
                )
            )
            WHEN event_type = 2 THEN event_name
            ELSE NULL
        END as step_value,
        CASE
            WHEN url_query IS NULL THEN ''
            ELSE REGEXP_REPLACE(REGEXP_REPLACE(url_query, r'^[?]', ''), r'#.*$', '')
        END as url_query_normalized,
        event_id,
        created_at
    FROM \`${projectId}.umami_views.event\`
    WHERE website_id = '${selectedWebsite.id}'
      AND event_type IN (${eventTypesList})
      [[AND {{created_at}}]]
),
events AS (
    SELECT
        *,
        LAG(step_value) OVER (PARTITION BY session_id ORDER BY created_at) as prev_step_value
    FROM events_raw
),
`

  const stepCtes = normalizedSteps.map((step, index) => {
    const stepName = `step${index + 1}`
    const prevStepName = `step${index}`

    const stepValueOperator = step.value.includes('*') ? 'LIKE' : '='
    const stepValue = (step.value.includes('*') ? step.value.replace(/\*/g, '%') : step.value).replace(/'/g, "''")
    const stepMatchClause =
      step.type === 'url' ? buildUrlStepFilterSql(step, 'e') : `e.step_value ${stepValueOperator} '${stepValue}'`

    let paramFilters = ''
    if (step.type === 'event' && step.params && step.params.length > 0) {
      const conditions = step.params.map((p, pIdx) => {
        const op = p.operator === 'contains' ? 'LIKE' : '='
        const val = p.operator === 'contains' ? `%${p.value}%` : p.value
        const cleanVal = val.replace(/'/g, "''")

        return `EXISTS (
        SELECT 1
        FROM \`${projectId}.umami_views.event_data\` d_${index}_${pIdx}
        CROSS JOIN UNNEST(d_${index}_${pIdx}.event_parameters) p_${index}_${pIdx}
        WHERE d_${index}_${pIdx}.website_event_id = e.event_id
          AND d_${index}_${pIdx}.website_id = '${selectedWebsite.id}'
          AND d_${index}_${pIdx}.created_at = e.created_at
          AND p_${index}_${pIdx}.data_key = '${p.key}'
          AND p_${index}_${pIdx}.string_value ${op} '${cleanVal}'
    )`
      })

      if (conditions.length > 0) {
        paramFilters = '\n      AND ' + conditions.join('\n      AND ')
      }
    }

    if (index === 0) {
      return `${stepName} AS (
    SELECT session_id, MIN(created_at) as time${index + 1}
    FROM events e
    WHERE ${stepMatchClause}${paramFilters}
    GROUP BY session_id
)`
    } else {
      let prevOperator = '='
      let prevValue =
        normalizedSteps[index - 1].type === 'url'
          ? buildStepDisplayValue(normalizedSteps[index - 1])
          : normalizedSteps[index - 1].value
      if (prevValue.includes('*')) {
        prevOperator = 'LIKE'
        prevValue = prevValue.replace(/\*/g, '%')
      }
      const prevStepValue = prevValue.replace(/'/g, "''")

      if (onlyDirectEntry) {
        return `${stepName} AS (
    SELECT e.session_id, MIN(e.created_at) as time${index + 1}
    FROM events e
    JOIN ${prevStepName} prev ON e.session_id = prev.session_id
    WHERE ${stepMatchClause}
      AND e.created_at > prev.time${index}
      AND e.prev_step_value ${prevOperator} '${prevStepValue}'${paramFilters}
    GROUP BY e.session_id
)`
      } else {
        return `${stepName} AS (
    SELECT e.session_id, MIN(e.created_at) as time${index + 1}
    FROM events e
    JOIN ${prevStepName} prev ON e.session_id = prev.session_id
    WHERE ${stepMatchClause}
      AND e.created_at > prev.time${index}${paramFilters}
    GROUP BY e.session_id
)`
      }
    }
  })

  sql += stepCtes.join(',\n')

  const unionSelects = normalizedSteps.map((step, i) => {
    const stepLabel = `${i + 1}: ${buildStepDisplayValue(step)}`.replace(/'/g, "''")
    return `SELECT ${i + 1} as step_number, '${stepLabel}' as step, (SELECT COUNT(*) FROM step${i + 1}) as count`
  })

  sql += `\n${unionSelects.join('\nUNION ALL\n')}`
  sql += `\nORDER BY step_number ASC`

  return sql
}

/**
 * Generate Metabase-compatible SQL for timing funnel.
 */
export function generateMetabaseTimingSql(
  timingData: TimingResultRow[],
  steps: FunnelStep[],
  selectedWebsite: Website,
  onlyDirectEntry: boolean,
): string {
  if (!timingData || timingData.length === 0) return ''

  const normalizedSteps = steps.map((s) => normalizeUrlStep(s)).filter((s) => s.value.trim() !== '')

  const urlSteps = normalizedSteps.filter((s) => s.type === 'url')
  if (urlSteps.length < 2) return ''

  const projectId = getGcpProjectId()

  let sql = `-- Tidsbruk-analyse for Metabase
-- Viser median tid (i sekunder) mellom hvert steg i trakten
--
-- OPPSETT I METABASE:
-- 1. Klikk på "created_at" variabelen i høyre panel
-- 2. Sett variabeltype til "Field Filter"
-- 3. Koble til: umami_views.event → created_at
-- 4. Velg ønsket periode og kjør spørringen

WITH events_raw AS (
    SELECT 
        session_id,
        event_type,
        CASE
            WHEN event_type = 1 THEN COALESCE(NULLIF(RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(url_path, r'[?#].*', ''), r'//+', '/'), '/'), ''), '/')
            ELSE NULL
        END as url_path_normalized,
        CASE
            WHEN event_type = 1 THEN CONCAT(
                COALESCE(NULLIF(RTRIM(REGEXP_REPLACE(REGEXP_REPLACE(url_path, r'[?#].*', ''), r'//+', '/'), '/'), ''), '/'),
                IF(
                    COALESCE(REGEXP_REPLACE(REGEXP_REPLACE(url_query, r'^[?]', ''), r'#.*$', ''), '') = '',
                    '',
                    CONCAT('?', COALESCE(REGEXP_REPLACE(REGEXP_REPLACE(url_query, r'^[?]', ''), r'#.*$', ''), ''))
                )
            )
            ELSE NULL
        END as step_value,
        CASE
            WHEN url_query IS NULL THEN ''
            ELSE REGEXP_REPLACE(REGEXP_REPLACE(url_query, r'^[?]', ''), r'#.*$', '')
        END as url_query_normalized,
        created_at
    FROM \`${projectId}.umami_views.event\`
    WHERE website_id = '${selectedWebsite.id}'
      AND event_type = 1
      [[AND {{created_at}}]]
),
events AS (
    SELECT 
        *,
        LAG(step_value) OVER (PARTITION BY session_id ORDER BY created_at) as prev_step_value
    FROM events_raw
),
`

  const stepCtes = urlSteps.map((step, index) => {
    const stepName = `step${index + 1}`
    const prevStepName = `step${index}`

    const stepMatchClause = buildUrlStepFilterSql(step, 'e')
    const prevStepDisplayValue = index > 0 ? buildStepDisplayValue(urlSteps[index - 1]) : ''
    const prevOperator = prevStepDisplayValue.includes('*') ? 'LIKE' : '='
    const escapedPrevStepDisplayValue = (
      prevStepDisplayValue.includes('*') ? prevStepDisplayValue.replace(/\*/g, '%') : prevStepDisplayValue
    ).replace(/'/g, "''")

    if (index === 0) {
      return `${stepName} AS (
    SELECT session_id, MIN(created_at) as time${index + 1}
    FROM events
    WHERE ${stepMatchClause}
    GROUP BY session_id
)`
    } else {
      if (onlyDirectEntry) {
        return `${stepName} AS (
    SELECT e.session_id, MIN(e.created_at) as time${index + 1}
    FROM events e
    JOIN ${prevStepName} prev ON e.session_id = prev.session_id
    WHERE ${stepMatchClause}
      AND e.created_at > prev.time${index}
      AND e.prev_step_value ${prevOperator} '${escapedPrevStepDisplayValue}'
    GROUP BY e.session_id
)`
      } else {
        return `${stepName} AS (
    SELECT e.session_id, MIN(e.created_at) as time${index + 1}
    FROM events e
    JOIN ${prevStepName} prev ON e.session_id = prev.session_id
    WHERE ${stepMatchClause}
      AND e.created_at > prev.time${index}
    GROUP BY e.session_id
)`
      }
    }
  })

  sql += stepCtes.join(',\n')

  const joinClauses = urlSteps
    .map((_, i) => {
      if (i === 0) return 'step1'
      return `LEFT JOIN step${i + 1} ON step1.session_id = step${i + 1}.session_id`
    })
    .join('\n    ')

  const timeColumns = urlSteps.map((_, i) => `step${i + 1}.time${i + 1}`).join(', ')

  sql += `,
timing_data AS (
    SELECT 
        ${timeColumns}
    FROM ${joinClauses}
    WHERE step${urlSteps.length}.time${urlSteps.length} IS NOT NULL
)
`

  const timingSelects = urlSteps.slice(0, -1).map((_step, i) => {
    const fromStep = i + 1
    const toStep = i + 2
    const stepLabel = `Steg ${fromStep} → ${toStep}`
    return `SELECT ${fromStep} as step_number, '${stepLabel}' as step, 
       APPROX_QUANTILES(TIMESTAMP_DIFF(time${toStep}, time${fromStep}, SECOND), 100)[OFFSET(50)] as sekunder
FROM timing_data`
  })

  sql += timingSelects.join('\nUNION ALL\n')
  sql += '\nORDER BY step_number ASC'

  return sql
}
