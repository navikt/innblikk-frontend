import { useEffect, useMemo, useState } from 'react'
import { fetchCurrentUserProfile } from '../../user/api/profile.api.ts'
import {
  fetchCanvasPresenceParticipants,
  sendCanvasPresenceHeartbeat,
  type CanvasParticipant,
} from '../api/canvasPresenceApi.ts'
import type { CanvasWebSocketHandle } from './useCanvasWebSocket.ts'

const PRESENCE_TICK_MS = 10000

const createCanvasClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `canvas-client-${crypto.randomUUID()}`
  }
  return `canvas-client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

type UseCanvasPresenceParams = {
  enabled: boolean
  projectId: number | null
  dashboardId: number | null
  ws?: CanvasWebSocketHandle
}

const useCanvasPresence = ({ enabled, projectId, dashboardId, ws }: UseCanvasPresenceParams) => {
  const [clientId] = useState<string>(() => createCanvasClientId())
  const [ownerId, setOwnerId] = useState<string>('')
  const [ownerLabel, setOwnerLabel] = useState<string>('En kollega')
  const [participants, setParticipants] = useState<CanvasParticipant[]>([])
  const [isPresenceReady, setIsPresenceReady] = useState(false)

  useEffect(() => {
    let isActive = true
    void (async () => {
      try {
        const me = await fetchCurrentUserProfile()
        if (!isActive) return
        setOwnerId(me?.navIdent?.trim() || '')
        const label = me?.name?.trim() || me?.navIdent?.trim() || ''
        setOwnerLabel(label || 'En kollega')
      } catch {
        if (!isActive) return
        setOwnerId('')
        setOwnerLabel('En kollega')
      }
    })()
    return () => {
      isActive = false
    }
  }, [])

  const wsConnected = ws?.isConnected ?? false

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return

    let isActive = true
    let tickId: number | null = null

    const runTick = async () => {
      if (!isActive) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

      try {
        if (wsConnected) {
          ws!.sendRaw({
            type: 'broadcast',
            projectId,
            dashboardId,
            event: 'canvas:presence:heartbeat',
            payload: {
              clientId,
              ownerId: ownerId || clientId,
              ownerLabel,
            },
          })
        } else {
          await sendCanvasPresenceHeartbeat({
            projectId,
            dashboardId,
            clientId,
            ownerId: ownerId || clientId,
            ownerLabel,
          })
          const nextParticipants = await fetchCanvasPresenceParticipants(projectId, dashboardId)
          if (!isActive) return
          setParticipants(nextParticipants)
          setIsPresenceReady(true)
          ws?.broadcast('canvas:presence', nextParticipants)
        }
      } catch {
        /* Presence errors should not block canvas usage. */
      }
    }

    void runTick()

    tickId = window.setInterval(() => {
      void runTick()
    }, PRESENCE_TICK_MS)

    return () => {
      isActive = false
      if (tickId !== null) window.clearInterval(tickId)
    }
  }, [clientId, dashboardId, enabled, ownerId, ownerLabel, projectId, ws, wsConnected])

  useEffect(() => {
    if (!ws) return
    const unsubscribe = ws.subscribe('canvas:presence', (payload) => {
      const next = payload as CanvasParticipant[]
      if (Array.isArray(next)) {
        setParticipants(next)
        setIsPresenceReady(true)
      }
    })
    return unsubscribe
  }, [ws])

  const effectiveParticipants = useMemo(() => (enabled ? participants : []), [enabled, participants])
  const effectivePresenceReady = enabled ? isPresenceReady : false

  const uniqueParticipants = useMemo(() => {
    const byOwnerKey = new Map<string, CanvasParticipant>()
    for (const participant of effectiveParticipants) {
      const ownerKey = participant.ownerId?.trim() || participant.clientId
      const existing = byOwnerKey.get(ownerKey)
      if (!existing || Date.parse(existing.updatedAt) < Date.parse(participant.updatedAt)) {
        byOwnerKey.set(ownerKey, participant)
      }
    }
    return [...byOwnerKey.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }, [effectiveParticipants])

  const activeParticipantCount = Math.max(1, uniqueParticipants.length)
  const currentOwnerKey = ownerId?.trim() || clientId
  const activeOtherParticipantCount = useMemo(
    () =>
      uniqueParticipants.filter((participant) => {
        const ownerKey = participant.ownerId?.trim() || participant.clientId
        return ownerKey !== currentOwnerKey
      }).length,
    [currentOwnerKey, uniqueParticipants],
  )
  const shouldEnableBackgroundSync = !effectivePresenceReady || activeOtherParticipantCount > 0
  const participantLabels =
    uniqueParticipants.length > 0 ? uniqueParticipants.map((participant) => participant.ownerLabel) : [ownerLabel]

  return {
    participants: uniqueParticipants,
    participantLabels,
    activeParticipantCount,
    activeOtherParticipantCount,
    isPresenceReady: effectivePresenceReady,
    shouldEnableBackgroundSync,
  }
}

export default useCanvasPresence
