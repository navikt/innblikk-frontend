import { requestJson } from '../../../shared/lib/apiClient.ts'
import type {
  CohortDto,
  CohortDetailDto,
  CreateCohortRequest,
  UpdateCohortRequest,
  CohortNode,
} from '../model/types.ts'

const BASE = '/api/backend/cohort'

export async function listCohorts(websiteId: string): Promise<CohortDto[]> {
  return requestJson<CohortDto[]>(`${BASE}?websiteId=${encodeURIComponent(websiteId)}`)
}

export async function getCohort(id: number): Promise<CohortDetailDto> {
  return requestJson<CohortDetailDto>(`${BASE}/${id}`)
}

export async function createCohort(data: CreateCohortRequest): Promise<CohortDetailDto> {
  return requestJson<CohortDetailDto>(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateCohort(id: number, data: UpdateCohortRequest): Promise<CohortDetailDto> {
  return requestJson<CohortDetailDto>(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteCohort(id: number): Promise<void> {
  await fetch(`${BASE}/${id}`, { method: 'DELETE' })
}

export async function restoreCohort(id: number): Promise<CohortDto> {
  return requestJson<CohortDto>(`${BASE}/${id}/restore`, { method: 'POST' })
}

export async function permanentlyDeleteCohort(id: number): Promise<void> {
  await fetch(`${BASE}/${id}/permanent`, { method: 'DELETE' })
}

/** Lists soft-deleted cohorts (the "trash"/archive) for a website. */
export async function listTrashedCohorts(websiteId: string): Promise<CohortDto[]> {
  return requestJson<CohortDto[]>(`${BASE}/trash?websiteId=${encodeURIComponent(websiteId)}`)
}

/** Replaces a cohort's entire criteria tree in one call. See CohortCriteriaController on the backend. */
export async function replaceCriteria(cohortId: number, root: CohortNode): Promise<CohortNode> {
  return requestJson<CohortNode>(`${BASE}/${cohortId}/criteria`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(root),
  })
}
