import { useEffect, useState } from 'react'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts'
import type { Row } from '../../sql/model/types.ts'

export type VisitorIdCoverage = { total: number; withDistinctId: number }

export type VisitorBasis = 'auto' | 'cookie' | 'session'

export const visitorIdExpression = (basis: VisitorBasis) => {
  const cookieId = "NULLIF(e.session_distinct_id, '')"
  const sessionId = 'CAST(e.session_id AS STRING)'
  if (basis === 'cookie') return cookieId
  if (basis === 'session') return sessionId
  return `COALESCE(${cookieId}, ${sessionId})`
}

export const useVisitorIdCoverage = (websiteId: string | undefined, startDate?: Date, endDate?: Date) => {
  const [result, setResult] = useState<{ key: string; value: VisitorIdCoverage } | null>(null)
  const startDay = startDate?.toISOString().slice(0, 10)
  const endDay = endDate?.toISOString().slice(0, 10)
  const key = `${websiteId}|${startDay}|${endDay}`

  useEffect(() => {
    if (!websiteId || !startDay || !endDay) return
    const controller = new AbortController()
    const query = `SELECT COUNT(*) AS total, COUNTIF(NULLIF(distinct_id, '') IS NOT NULL) AS with_id
FROM \`${getGcpProjectId()}.umami_views.session\`
WHERE website_id = '${websiteId.replace(/[^a-zA-Z0-9-]/g, '')}'
  AND created_at BETWEEN TIMESTAMP('${startDay}') AND TIMESTAMP_ADD(TIMESTAMP('${endDay}'), INTERVAL 1 DAY)`
    fetch('/api/bigquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, analysisType: 'Tabellbygger' }),
      signal: controller.signal,
    })
      .then((response) => response.json() as Promise<{ data?: Row[] }>)
      .then((body) => {
        const row = body.data?.[0]
        if (row) setResult({ key, value: { total: Number(row.total) || 0, withDistinctId: Number(row.with_id) || 0 } })
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [websiteId, startDay, endDay, key])

  return result?.key === key ? result.value : null
}

const COOKIE_DOMINANT_SHARE = 0.95

export const getVisitorBasisOptions = (
  coverage: VisitorIdCoverage | null,
): Array<{ value: VisitorBasis; label: string; description: string }> | null => {
  if (!coverage || coverage.withDistinctId === 0) return null
  if (coverage.withDistinctId / coverage.total >= COOKIE_DOMINANT_SHARE) {
    return [
      {
        value: 'auto',
        label: 'Cookie (anbefalt)',
        description: 'Mest presis. Samme person kjennes igjen i opptil 90 dager.',
      },
      {
        value: 'session',
        label: 'Fingeravtrykk (uten cookie)',
        description: 'Mindre presis. Samme person er unik innen en måned, og telles på nytt neste måned.',
      },
    ]
  }
  return [
    {
      value: 'auto',
      label: 'Cookie der den finnes, ellers fingeravtrykk (anbefalt)',
      description:
        'Cookie er mest presis (opptil 90 dager). Uten cookie brukes fingeravtrykk, som er unikt innen en måned.',
    },
    { value: 'cookie', label: 'Bare cookie', description: 'Mest presis, men besøk uten cookie utelates.' },
    {
      value: 'session',
      label: 'Bare fingeravtrykk',
      description: 'Mindre presis. Samme person er unik innen en måned, og telles på nytt neste måned.',
    },
  ]
}

export const resolveVisitorBasis = (basis: VisitorBasis, coverage: VisitorIdCoverage | null): VisitorBasis => {
  if (!coverage) return basis
  const options = getVisitorBasisOptions(coverage)
  if (!options) return 'session'
  return options.some((option) => option.value === basis) ? basis : 'auto'
}
