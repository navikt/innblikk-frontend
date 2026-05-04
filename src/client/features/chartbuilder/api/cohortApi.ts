import type { CohortDto, CohortDetailDto } from '../../../shared/types/cohort.ts'
import { requestJson } from '../../../shared/lib/apiClient.ts'

export async function fetchCohorts(websiteId: string): Promise<CohortDto[]> {
  return requestJson<CohortDto[]>(`/api/backend/cohort?websiteId=${encodeURIComponent(websiteId)}`)
}

export async function fetchCohortDetail(cohortId: string): Promise<CohortDetailDto> {
  return requestJson<CohortDetailDto>(`/api/backend/cohort/${encodeURIComponent(cohortId)}`)
}

export type { CohortDto, CohortDetailDto }
