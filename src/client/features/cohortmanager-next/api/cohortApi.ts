import { requestJson } from '../../../shared/lib/apiClient.ts'

const BASE = '/api/backend/cohort'

/** Unlike the shared helper, rejects on non-OK responses so callers can report a failed delete. */
export async function deleteCohortChecked(id: number): Promise<void> {
  await requestJson<unknown>(`${BASE}/${id}`, { method: 'DELETE' })
}

export async function permanentlyDeleteCohortChecked(id: number): Promise<void> {
  await requestJson<unknown>(`${BASE}/${id}/permanent`, { method: 'DELETE' })
}
