import { useEffect, useMemo, useState } from 'react'
import { fetchCurrentUserProfile } from '../../user/api/profile.api.ts'
import {
  fetchCanvasPresenceParticipants,
  sendCanvasPresenceHeartbeat,
  type CanvasParticipant,
} from '../api/canvasPresenceApi.ts'
import type { CanvasWebSocketHandle } from './useCanvasWebSocket.ts'

const PRESENCE_HEARTBEAT_MS = 10000
const PRESENCE_POLL_MS = 10000

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
    let heartbeatId: number | null = null
    let pollId: number | null = null

    const sendHeartbeat = async () => {
      await sendCanvasPresenceHeartbeat({
        projectId,
        dashboardId,
        clientId,
        ownerId: ownerId || clientId,
        ownerLabel,
      })
    }

    const pollParticipants = async () => {
      const nextParticipants = await fetchCanvasPresenceParticipants(projectId, dashboardId)
      if (!isActive) return
      setParticipants(nextParticipants)
      setIsPresenceReady(true)
      ws?.broadcast('canvas:presence', nextParticipants)
    }

    const runTick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        await sendHeartbeat()
        if (!wsConnected) await pollParticipants()
      } catch {
        // Presence errors should not block canvas usage.
      }
    }

    void runTick()

    heartbeatId = window.setInterval(() => {
      void sendHeartbeat().catch(() => undefined)
    }, PRESENCE_HEARTBEAT_MS)

    if (!wsConnected) {
      pollId = window.setInterval(() => {
        void pollParticipants().catch(() => undefined)
      }, PRESENCE_POLL_MS)
    }

    return () => {
      isActive = false
      if (heartbeatId !== null) window.clearInterval(heartbeatId)
      if (pollId !== null) window.clearInterval(pollId)
    }
  }, [clientId, dashboardId, enabled, ownerId, ownerLabel, projectId, ws, wsConnected])

  const effectiveParticipants = useMemo(() => (enabled ? participants : []), [enabled, participants])

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

  const activeParticipantCount = uniqueParticipants.length
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
  const participantLabels = uniqueParticipants.map((participant) => participant.ownerLabel)

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
