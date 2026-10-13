import { requestJson } from '../../../shared/lib/apiClient.ts'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts'
import { fetchCohortsDeep } from '../../chartbuilder-next/api/cohortApi.ts'
import { buildPreviewQuery, previewReferenceIds, type PreviewQueryInput } from '../utils/previewQuery.ts'
import type { VisitorIdCoverage } from '../../tablebuilder/utils/visitorIdCoverage.ts'
import type { CohortDetailDto } from '../../cohortmanager/model/types.ts'

export async function fetchPreviewCohorts(ids: string[]): Promise<Map<string, CohortDetailDto>> {
  const cohorts = await fetchCohortsDeep(ids)
  return new Map([...cohorts].map(([key, cohort]) => [key, { ...cohort, id: Number(cohort.id) }]))
}

export interface PreviewResult {
  users: number
  total: number
  coverage: VisitorIdCoverage
}

type PreviewRow = {
  kind: string
  users: number | string
  total: number | string | null
  coverage_total: number | string | null
  coverage_cookie: number | string | null
}

const count = (value: unknown) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') throw new Error('Ugyldig resultat')
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Ugyldig resultat')
  return result
}

export async function fetchCohortPreview(
  input: Omit<PreviewQueryInput, 'projectId' | 'cohorts'>,
  signal: AbortSignal,
): Promise<PreviewResult> {
  const cohorts = await fetchPreviewCohorts(previewReferenceIds(input.root))
  signal.throwIfAborted()
  const query = buildPreviewQuery({ ...input, projectId: getGcpProjectId(), cohorts })
  const response = await requestJson<{ data?: PreviewRow[]; error?: string }>('/api/bigquery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, analysisType: 'Forhåndsvisning av brukergruppe' }),
    signal,
  })
  const summary = response?.data?.find((row) => row.kind === 'summary')
  if (response?.error || !summary) throw new Error('Kunne ikke hente resultatet.')
  const users = count(summary.users)
  const total = count(summary.total)
  if (users > total) throw new Error('Ugyldig resultat')
  return {
    users,
    total,
    coverage: { total: count(summary.coverage_total), withDistinctId: count(summary.coverage_cookie) },
  }
}
