import type { CohortDto, CohortDetailDto, CohortNode } from '../../../shared/types/cohort.ts'
import { requestJson } from '../../../shared/lib/apiClient.ts'

export async function fetchCohorts(websiteId: string): Promise<CohortDto[]> {
  return requestJson<CohortDto[]>(`/api/backend/cohort?websiteId=${encodeURIComponent(websiteId)}`)
}

export async function fetchCohortDetail(cohortId: string): Promise<CohortDetailDto> {
  return requestJson<CohortDetailDto>(`/api/backend/cohort/${encodeURIComponent(cohortId)}`)
}

function collectReferencedCohortIds(node: CohortNode | null): number[] {
  if (!node) return []
  switch (node.nodeType) {
    case 'GROUP':
      return node.children.flatMap(collectReferencedCohortIds)
    case 'COHORT_REF':
      return [node.referencedCohortId]
    case 'CONDITION':
    case 'SEQUENCE':
      // SEQUENCE anchor/target can't contain COHORT_REF per CohortTreeValidator's rules.
      return []
  }
}

/**
 * True when the cohort's criteria tree references event time — either an
 * explicit «Tidspunkt» (created_at BETWEEN) condition, or a SEQUENCE node
 * (which is inherently time-windowed even without a Tidspunkt step).
 * Used to show the "Tidspunkt only decides membership, not the chart's
 * period" hint only for cohorts it actually applies to.
 */
export function cohortUsesTimeCriterion(node: CohortNode | null): boolean {
  if (!node) return false
  switch (node.nodeType) {
    case 'GROUP':
      return node.children.some(cohortUsesTimeCriterion)
    case 'CONDITION':
      return node.field === 'created_at'
    case 'SEQUENCE':
      return true
    case 'COHORT_REF':
      return false
  }
}

/**
 * Fetches the given cohorts plus every cohort they (transitively) reference
 * via COHORT_REF nodes, so the SQL resolver can inline referenced cohorts'
 * criteria instead of falling back to "matches everyone" for unknown refs.
 * Returns a lookup map keyed by cohort id (as a string, matching JSON's id typing).
 */
export async function fetchCohortsDeep(ids: string[]): Promise<Map<string, CohortDetailDto>> {
  const cache = new Map<string, CohortDetailDto>()
  const inFlight = new Set<string>()

  async function resolve(id: string): Promise<void> {
    if (cache.has(id) || inFlight.has(id)) return
    inFlight.add(id)
    try {
      const detail = await fetchCohortDetail(id)
      cache.set(id, detail)
      const referencedIds = collectReferencedCohortIds(detail.root).map(String)
      await Promise.all(referencedIds.map(resolve))
    } finally {
      inFlight.delete(id)
    }
  }

  await Promise.all(ids.map(resolve))
  return cache
}

export type { CohortDto, CohortDetailDto }
