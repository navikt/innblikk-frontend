import { requestJson } from '../../../shared/lib/apiClient.ts'

export type CanvasParticipant = {
  clientId: string
  ownerId: string
  ownerLabel: string
  updatedAt: string
  expiresAt: string
}

export const fetchCanvasPresenceParticipants = async (
  projectId: number,
  dashboardId: number,
): Promise<CanvasParticipant[]> => {
  const payload = await requestJson<{ participants?: CanvasParticipant[] }>(
    `/api/backend/canvas/presence?projectId=${projectId}&dashboardId=${dashboardId}`,
  )
  return Array.isArray(payload.participants) ? payload.participants : []
}

export const sendCanvasPresenceHeartbeat = async (params: {
  projectId: number
  dashboardId: number
  clientId: string
  ownerId: string
  ownerLabel: string
}): Promise<void> => {
  await requestJson<{ ok: boolean }>('/api/backend/canvas/presence/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}
