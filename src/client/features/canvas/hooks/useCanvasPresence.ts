import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CanvasParticipant } from '../api/canvasPresenceApi.ts'
import { useCurrentUserProfile } from '../../user/hooks/useCurrentUserProfile.ts'
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
  const [participants, setParticipants] = useState<CanvasParticipant[]>([])
  const [isPresenceReady, setIsPresenceReady] = useState(false)
  const { profile } = useCurrentUserProfile()
  const ownerId = profile?.navIdent?.trim() || ''
  const ownerLabel = profile?.name?.trim() || profile?.navIdent?.trim() || 'En kollega'

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

    const runTick = () => {
      if (!isActive) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

      try {
        if (wsConnected && ws) {
          ws.sendRaw({
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
        }
      } catch {
        /* Presence errors should not block canvas usage. */
      }
    }

    runTick()

    tickId = window.setInterval(() => {
      runTick()
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
