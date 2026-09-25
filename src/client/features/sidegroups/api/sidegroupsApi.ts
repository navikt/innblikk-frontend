import { requestJson } from '../../../shared/lib/apiClient.ts'
import type { Sidegroup, SidegroupRequest } from '../model/types.ts'

const BASE = '/api/backend/sidegroup'

export function listSidegroups(): Promise<Sidegroup[]> {
  return requestJson<Sidegroup[]>(BASE)
}

export function createSidegroup(data: SidegroupRequest): Promise<Sidegroup> {
  return requestJson<Sidegroup>(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateSidegroup(id: string, data: SidegroupRequest): Promise<Sidegroup> {
  return requestJson<Sidegroup>(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteSidegroup(id: string): Promise<void> {
  await requestJson<void>(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
