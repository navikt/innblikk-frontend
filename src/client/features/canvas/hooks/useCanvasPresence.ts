import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCurrentUserProfile } from '../../user/api/profile.api.ts'
import {
  fetchCanvasPresenceParticipants,
  sendCanvasPresenceHeartbeat,
  type CanvasParticipant,
} from '../api/canvasPresenceApi.ts'
import type { CanvasWebSocketHandle } from './useCanvasWebSocket.ts'

const PRESENCE_TICK_MS = 10000
const PRESENCE_STALE_MS = PRESENCE_TICK_MS * 3
const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

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
  const isLocalDebugMode =
    typeof window !== 'undefined' && LOCALHOST_HOSTNAMES.has(window.location.hostname.toLowerCase())

  const upsertParticipant = (
    current: CanvasParticipant[],
    incoming: Pick<CanvasParticipant, 'clientId' | 'ownerId' | 'ownerLabel'>,
  ): CanvasParticipant[] => {
    const now = Date.now()
    const nextParticipant: CanvasParticipant = {
      clientId: incoming.clientId,
      ownerId: incoming.ownerId,
      ownerLabel: incoming.ownerLabel,
      updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PRESENCE_STALE_MS).toISOString(),
    }
    const pruned = current.filter((participant) => Date.parse(participant.expiresAt) > now)
    const existingIndex = pruned.findIndex((participant) => participant.clientId === incoming.clientId)
    if (existingIndex === -1) return [...pruned, nextParticipant]
    const next = [...pruned]
    next[existingIndex] = nextParticipant
    return next
  }

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return

    let isActive = true
    let tickId: number | null = null
    const shouldUseHttpFallback = !ws

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
          setParticipants((current) => current.filter((participant) => Date.parse(participant.expiresAt) > Date.now()))
          setIsPresenceReady(true)
          return
        }

        if (!shouldUseHttpFallback) return
        if (!wsConnected) {
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

  useEffect(() => {
    if (!ws) return
    const unsubscribe = ws.subscribe('canvas:presence:heartbeat', (payload) => {
      if (!payload || typeof payload !== 'object') return
      const heartbeat = payload as Partial<CanvasParticipant>
      const clientId = typeof heartbeat.clientId === 'string' ? heartbeat.clientId.trim() : ''
      if (!clientId) return
      const nextOwnerId =
        typeof heartbeat.ownerId === 'string' && heartbeat.ownerId.trim() ? heartbeat.ownerId.trim() : clientId
      const nextOwnerLabel =
        typeof heartbeat.ownerLabel === 'string' && heartbeat.ownerLabel.trim()
          ? heartbeat.ownerLabel.trim()
          : 'En kollega'
      setParticipants((current) =>
        upsertParticipant(current, {
          clientId,
          ownerId: nextOwnerId,
          ownerLabel: nextOwnerLabel,
        }),
      )
      setIsPresenceReady(true)
    })
    return unsubscribe
  }, [ws])

  const effectiveParticipants = useMemo(() => (enabled ? participants : []), [enabled, participants])
  const effectivePresenceReady = enabled ? isPresenceReady : false

  const getParticipantIdentityKey = useCallback(
    (participant: CanvasParticipant): string => {
      if (isLocalDebugMode) return participant.clientId
      return participant.ownerId?.trim() || participant.clientId
    },
    [isLocalDebugMode],
  )

  const uniqueParticipants = useMemo(() => {
    const byIdentityKey = new Map<string, CanvasParticipant>()
    for (const participant of effectiveParticipants) {
      const identityKey = getParticipantIdentityKey(participant)
      const existing = byIdentityKey.get(identityKey)
      if (!existing || Date.parse(existing.updatedAt) < Date.parse(participant.updatedAt)) {
        byIdentityKey.set(identityKey, participant)
      }
    }
    return [...byIdentityKey.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }, [effectiveParticipants, getParticipantIdentityKey])

  const currentIdentityKey = isLocalDebugMode ? clientId : ownerId?.trim() || clientId
  const hasCurrentUserInParticipants = uniqueParticipants.some((participant) => {
    const identityKey = getParticipantIdentityKey(participant)
    return identityKey === currentIdentityKey
  })
  const activeParticipantCount = Math.max(1, uniqueParticipants.length + (hasCurrentUserInParticipants ? 0 : 1))
  const activeOtherParticipantCount = useMemo(
    () =>
      uniqueParticipants.filter((participant) => {
        const identityKey = getParticipantIdentityKey(participant)
        return identityKey !== currentIdentityKey
      }).length,
    [currentIdentityKey, getParticipantIdentityKey, uniqueParticipants],
  )
  const shouldEnableBackgroundSync = !effectivePresenceReady || activeOtherParticipantCount > 0
  const participantLabels = useMemo(() => {
    const labels = uniqueParticipants.map((participant) => participant.ownerLabel)
    if (hasCurrentUserInParticipants) return labels
    return [ownerLabel, ...labels]
  }, [hasCurrentUserInParticipants, ownerLabel, uniqueParticipants])

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
