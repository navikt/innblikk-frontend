import { requestJson } from '../../../shared/lib/apiClient.ts'
import type {
  CohortDto,
  CohortDetailDto,
  CreateCohortRequest,
  UpdateCohortRequest,
  CreateCohortEntryRequest,
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

export async function createEntry(cohortId: number, data: CreateCohortEntryRequest): Promise<CohortDetailDto> {
  return requestJson<CohortDetailDto>(`${BASE}/${cohortId}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateEntry(
  cohortId: number,
  entryId: number,
  data: CreateCohortEntryRequest,
): Promise<CohortDetailDto> {
  return requestJson<CohortDetailDto>(`${BASE}/${cohortId}/entries/${entryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteEntry(cohortId: number, entryId: number): Promise<void> {
  await fetch(`${BASE}/${cohortId}/entries/${entryId}`, { method: 'DELETE' })
}
