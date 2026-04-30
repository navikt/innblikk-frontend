import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adjustCanvasDotVoting,
  clearCanvasDotVoting,
  endCanvasDotVoting,
  fetchCanvasDotVoting,
  pauseCanvasDotVoting,
  resumeCanvasDotVoting,
  startCanvasDotVoting,
  upsertCanvasDotVotingBallot,
  type CanvasDotVotingBallotPayload,
  type CanvasDotVotingSessionPayload,
} from '../api/canvasDotVotingApi.ts'
import { useCurrentUserProfile } from '../../user/hooks/useCurrentUserProfile.ts'
import type { CanvasWebSocketHandle } from './useCanvasWebSocket.ts'

const DOT_VOTING_ACTIVE_SYNC_INTERVAL_MS = 2000
const DOT_VOTING_IDLE_SYNC_INTERVAL_MS = 10000

const formatRemainingTime = (remainingSeconds: number): string => {
  const total = Math.max(0, Math.floor(remainingSeconds))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const serializeSessionPayload = (payload: CanvasDotVotingSessionPayload): string => {
  const json = JSON.stringify(payload)
  const escaped = json.replace(/'/g, "''").replace(/;/g, '\\u003B')
  return `SELECT '${escaped}' AS canvas_dot_voting_session`
}

const serializeBallotPayload = (payload: CanvasDotVotingBallotPayload): string => {
  const json = JSON.stringify(payload)
  const escaped = json.replace(/'/g, "''").replace(/;/g, '\\u003B')
  return `SELECT '${escaped}' AS canvas_dot_voting_ballot`
}

const parseSessionFromQuery = (queryMap: Record<string, unknown> | null): CanvasDotVotingSessionPayload | null => {
  if (!queryMap) return null
  const sqlText = queryMap['sqlText'] as string | undefined
  if (!sqlText) return null
  const trimmed = sqlText.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_dot_voting_session\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed
  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasDotVotingSessionPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.sessionId !== 'string') return null
    return parsed as CanvasDotVotingSessionPayload
  } catch {
    return null
  }
}

const parseBallotFromQuery = (queryMap: Record<string, unknown> | null): CanvasDotVotingBallotPayload | null => {
  if (!queryMap) return null
  const sqlText = queryMap['sqlText'] as string | undefined
  if (!sqlText) return null
  const trimmed = sqlText.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_dot_voting_ballot\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed
  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasDotVotingBallotPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.sessionId !== 'string') return null
    if (typeof parsed.ownerId !== 'string') return null
    return parsed as CanvasDotVotingBallotPayload
  } catch {
    return null
  }
}

const getRunningRemainingSeconds = (payload: CanvasDotVotingSessionPayload, nowMs: number): number => {
  const endsAtMs = Date.parse(payload.endsAt)
  if (!Number.isFinite(endsAtMs)) return 0
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
}

const parseDotVotingWsPayload = (
  raw: unknown,
): { session: CanvasDotVotingSessionPayload | null; ballots: CanvasDotVotingBallotPayload[] } => {
  const data = raw as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return { session: null, ballots: [] }

  // If session is a query map (from backend join), parse it
  let session: CanvasDotVotingSessionPayload | null = null
  const rawSession = data.session as Record<string, unknown> | null
  if (rawSession && 'sqlText' in rawSession) {
    session = parseSessionFromQuery(rawSession)
  } else if (rawSession && 'sessionId' in rawSession) {
    session = rawSession as unknown as CanvasDotVotingSessionPayload
  }

  // Ballots from backend join are query maps; from broadcast they're payloads
  const rawBallots = Array.isArray(data.ballots) ? data.ballots : []
  const ballots: CanvasDotVotingBallotPayload[] = rawBallots
    .map((b: unknown) => {
      const ballot = b as Record<string, unknown>
      if ('sqlText' in ballot) return parseBallotFromQuery(ballot)
      if ('ownerId' in ballot) return ballot as unknown as CanvasDotVotingBallotPayload
      return null
    })
    .filter((b): b is CanvasDotVotingBallotPayload => b !== null)

  return { session, ballots }
}

type UseCanvasDotVotingSyncParams = {
  enabled: boolean
  enableIdlePolling?: boolean
  idleSyncIntervalMs?: number
  projectId: number | null
  dashboardId: number | null
  onSyncError?: (message: string) => void
  ws?: CanvasWebSocketHandle
}

const useCanvasDotVotingSync = ({
  enabled,
  enableIdlePolling = true,
  idleSyncIntervalMs = DOT_VOTING_IDLE_SYNC_INTERVAL_MS,
  projectId,
  dashboardId,
  onSyncError,
  ws,
}: UseCanvasDotVotingSyncParams) => {
  const [sessionPayload, setSessionPayload] = useState<CanvasDotVotingSessionPayload | null>(null)
  const [ballots, setBallots] = useState<CanvasDotVotingBallotPayload[]>([])
  const [ownerId, setOwnerId] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isSavingVoting, setIsSavingVoting] = useState(false)
  const onSyncErrorRef = useRef<typeof onSyncError>(onSyncError)
  const wsRef = useRef(ws)
  const { profile } = useCurrentUserProfile()

  useEffect(() => {
    onSyncErrorRef.current = onSyncError
  }, [onSyncError])

  useEffect(() => {
    wsRef.current = ws
  })

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!ws) return
    return ws.subscribe('canvas:dotvoting', (payload) => {
      const { session, ballots: parsedBallots } = parseDotVotingWsPayload(payload)
      setSessionPayload(session)
      setBallots(parsedBallots)
    })
  }, [ws])

  useEffect(() => {
    setOwnerId(profile?.navIdent?.trim() || '')
  }, [profile])

  const syncVoting = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) {
      setSessionPayload(null)
      setBallots([])
      return
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    try {
      const payload = await fetchCanvasDotVoting(projectId, dashboardId)
      setSessionPayload((current) => {
        const currentKey = current ? JSON.stringify(current) : null
        const nextKey = payload.session ? JSON.stringify(payload.session) : null
        return currentKey === nextKey ? current : payload.session
      })
      setBallots((current) => {
        const currentKey = JSON.stringify(current)
        const nextKey = JSON.stringify(payload.ballots)
        return currentKey === nextKey ? current : payload.ballots
      })
    } catch (error) {
      onSyncErrorRef.current?.(error instanceof Error ? error.message : 'Kunne ikke synkronisere prikkvotering')
    }
  }, [dashboardId, enabled, projectId])

  const refreshVoting = useCallback(async () => {
    await syncVoting()
  }, [syncVoting])

  // Initial load: only when WS is NOT connected
  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) {
      setSessionPayload(null)
      setBallots([])
      return
    }

    if (ws?.isConnected) return

    void syncVoting()
  }, [dashboardId, enabled, projectId, syncVoting, ws?.isConnected])

  // Polling: only when WS is NOT connected
  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return
    if (ws?.isConnected) return
    if (!sessionPayload && !enableIdlePolling) return

    const intervalId = window.setInterval(
      () => {
        void syncVoting()
      },
      sessionPayload ? DOT_VOTING_ACTIVE_SYNC_INTERVAL_MS : idleSyncIntervalMs,
    )

    return () => window.clearInterval(intervalId)
  }, [
    dashboardId,
    enableIdlePolling,
    enabled,
    idleSyncIntervalMs,
    projectId,
    sessionPayload,
    syncVoting,
    ws?.isConnected,
  ])

  const remainingSeconds = useMemo(() => {
    if (!sessionPayload) return 0
    if (sessionPayload.isPaused) {
      return Math.max(0, Math.floor(sessionPayload.pausedRemainingSeconds ?? 0))
    }
    const endsAtMs = Date.parse(sessionPayload.endsAt)
    if (!Number.isFinite(endsAtMs)) return 0
    return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
  }, [nowMs, sessionPayload])

  const isVotingRunning =
    Boolean(sessionPayload) && sessionPayload?.status !== 'ended' && !sessionPayload?.isPaused && remainingSeconds > 0
  const isVotingPaused = Boolean(sessionPayload?.isPaused) && remainingSeconds > 0
  const votingLabel = sessionPayload ? formatRemainingTime(remainingSeconds) : null

  const activeVotesByFrameGraphId = useMemo(() => {
    const votesByFrameGraphId: Record<string, number> = {}
    ballots.forEach((ballot) => {
      Object.entries(ballot.votesByFrameGraphId).forEach(([frameGraphId, voteCount]) => {
        votesByFrameGraphId[frameGraphId] = (votesByFrameGraphId[frameGraphId] || 0) + voteCount
      })
    })
    return votesByFrameGraphId
  }, [ballots])

  const myBallot = useMemo(
    () => (ownerId ? (ballots.find((ballot) => ballot.ownerId === ownerId) ?? null) : null),
    [ballots, ownerId],
  )
  const myVotesByFrameGraphId = useMemo(() => myBallot?.votesByFrameGraphId ?? {}, [myBallot])
  const myUsedVotes = Object.values(myVotesByFrameGraphId).reduce((total, count) => total + count, 0)
  const myVotesRemaining = Math.max(0, (sessionPayload?.votesPerParticipant ?? 0) - myUsedVotes)

  const saveSessionViaWs = useCallback((payload: CanvasDotVotingSessionPayload): boolean => {
    const currentWs = wsRef.current
    if (!currentWs?.isConnected) return false
    const sqlText = serializeSessionPayload(payload)
    currentWs.sendRaw({ type: 'dotvoting:save:session', sqlText })
    return true
  }, [])

  const startVoting = useCallback(
    async (params: { sectionGraphId: number; durationMinutes: number; votesPerParticipant: number }) => {
      if (!enabled || projectId === null || dashboardId === null) return
      const durationSeconds = Math.max(1, Math.floor(params.durationMinutes * 60))
      const normalizedVotesPerParticipant = Math.max(1, Math.floor(params.votesPerParticipant))
      const now = new Date()
      const sessionId = `dot-voting-${now.getTime()}`

      const payload: CanvasDotVotingSessionPayload = {
        sessionId,
        sectionGraphId: Math.max(1, Math.floor(params.sectionGraphId)),
        durationSeconds,
        votesPerParticipant: normalizedVotesPerParticipant,
        startedAt: now.toISOString(),
        endsAt: new Date(now.getTime() + durationSeconds * 1000).toISOString(),
        updatedAt: now.toISOString(),
        isPaused: false,
        status: 'active',
      }

      const currentWs = wsRef.current
      if (currentWs?.isConnected) {
        // Clear first, then save session
        currentWs.sendRaw({ type: 'dotvoting:clear' })
        const sqlText = serializeSessionPayload(payload)
        currentWs.sendRaw({ type: 'dotvoting:save:session', sqlText })
        setSessionPayload(payload)
        setBallots([])
        return
      }

      try {
        setIsSavingVoting(true)
        const nextSession = await startCanvasDotVoting({
          projectId,
          dashboardId,
          sectionGraphId: params.sectionGraphId,
          durationSeconds,
          votesPerParticipant: normalizedVotesPerParticipant,
        })
        setSessionPayload(nextSession)
        setBallots([])
        wsRef.current?.broadcast('canvas:dotvoting', { session: nextSession, ballots: [] })
      } catch (error) {
        onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke starte prikkvotering')
      } finally {
        setIsSavingVoting(false)
      }
    },
    [dashboardId, enabled, onSyncError, projectId],
  )

  const pauseVoting = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return

    if (sessionPayload && !sessionPayload.isPaused) {
      const now = Date.now()
      const remaining = getRunningRemainingSeconds(sessionPayload, now)
      const nextPayload: CanvasDotVotingSessionPayload = {
        ...sessionPayload,
        updatedAt: new Date(now).toISOString(),
        isPaused: true,
        pausedRemainingSeconds: remaining,
      }
      if (saveSessionViaWs(nextPayload)) {
        setSessionPayload(nextPayload)
        return
      }
    }

    try {
      setIsSavingVoting(true)
      const nextSession = await pauseCanvasDotVoting(projectId, dashboardId)
      setSessionPayload(nextSession)
      wsRef.current?.broadcast('canvas:dotvoting', { session: nextSession, ballots: [] })
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke pause prikkvotering')
    } finally {
      setIsSavingVoting(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId, saveSessionViaWs, sessionPayload])

  const resumeVoting = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return

    if (sessionPayload?.isPaused) {
      const now = Date.now()
      const remaining = Math.max(0, Math.floor(sessionPayload.pausedRemainingSeconds ?? 0))
      const nextPayload: CanvasDotVotingSessionPayload = {
        ...sessionPayload,
        endsAt: new Date(now + remaining * 1000).toISOString(),
        updatedAt: new Date(now).toISOString(),
        isPaused: false,
        pausedRemainingSeconds: undefined,
      }
      if (saveSessionViaWs(nextPayload)) {
        setSessionPayload(nextPayload)
        return
      }
    }

    try {
      setIsSavingVoting(true)
      const nextSession = await resumeCanvasDotVoting(projectId, dashboardId)
      setSessionPayload(nextSession)
      wsRef.current?.broadcast('canvas:dotvoting', { session: nextSession, ballots: [] })
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke fortsette prikkvotering')
    } finally {
      setIsSavingVoting(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId, saveSessionViaWs, sessionPayload])

  const adjustVotingMinutes = useCallback(
    async (deltaMinutes: number) => {
      if (!enabled || projectId === null || dashboardId === null) return
      const deltaSeconds = Math.floor(deltaMinutes * 60)
      if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return

      if (sessionPayload) {
        const now = Date.now()
        const runningRemaining = getRunningRemainingSeconds(sessionPayload, now)
        const pausedRemaining = Math.max(0, Math.floor(sessionPayload.pausedRemainingSeconds ?? 0))
        const baseRemaining = sessionPayload.isPaused ? pausedRemaining : runningRemaining
        const nextRemaining = Math.max(0, baseRemaining + deltaSeconds)

        const nextPayload: CanvasDotVotingSessionPayload = {
          ...sessionPayload,
          durationSeconds: Math.max(1, nextRemaining),
          updatedAt: new Date(now).toISOString(),
          isPaused: sessionPayload.isPaused,
          pausedRemainingSeconds: sessionPayload.isPaused ? nextRemaining : undefined,
          endsAt: sessionPayload.isPaused ? sessionPayload.endsAt : new Date(now + nextRemaining * 1000).toISOString(),
        }
        if (saveSessionViaWs(nextPayload)) {
          setSessionPayload(nextPayload)
          return
        }
      }

      try {
        setIsSavingVoting(true)
        const nextSession = await adjustCanvasDotVoting(projectId, dashboardId, deltaSeconds)
        setSessionPayload(nextSession)
        wsRef.current?.broadcast('canvas:dotvoting', { session: nextSession, ballots: [] })
      } catch (error) {
        onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke oppdatere prikkvotering')
      } finally {
        setIsSavingVoting(false)
      }
    },
    [dashboardId, enabled, onSyncError, projectId, saveSessionViaWs, sessionPayload],
  )

  const endVoting = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return

    if (sessionPayload) {
      const nowIso = new Date().toISOString()
      const nextPayload: CanvasDotVotingSessionPayload = {
        ...sessionPayload,
        updatedAt: nowIso,
        endsAt: nowIso,
        isPaused: true,
        pausedRemainingSeconds: 0,
        status: 'ended',
      }
      if (saveSessionViaWs(nextPayload)) {
        setSessionPayload(nextPayload)
        return
      }
    }

    try {
      setIsSavingVoting(true)
      const nextSession = await endCanvasDotVoting(projectId, dashboardId)
      setSessionPayload(nextSession)
      wsRef.current?.broadcast('canvas:dotvoting', { session: nextSession, ballots: [] })
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke avslutte prikkvotering')
    } finally {
      setIsSavingVoting(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId, saveSessionViaWs, sessionPayload])

  const clearVoting = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return

    const currentWs = wsRef.current
    if (currentWs?.isConnected) {
      currentWs.sendRaw({ type: 'dotvoting:clear' })
      setSessionPayload(null)
      setBallots([])
      return
    }

    try {
      setIsSavingVoting(true)
      await clearCanvasDotVoting(projectId, dashboardId)
      setSessionPayload(null)
      setBallots([])
      wsRef.current?.broadcast('canvas:dotvoting', { session: null, ballots: [] })
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke nullstille prikkvotering')
    } finally {
      setIsSavingVoting(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const saveMyVotes = useCallback(
    async (votesByFrameGraphId: Record<string, number>) => {
      if (!enabled || projectId === null || dashboardId === null) return
      if (!ownerId || !sessionPayload) return

      const normalizedVotesMap = Object.entries(votesByFrameGraphId).reduce<Record<string, number>>((map, entry) => {
        const frameGraphId = Number(entry[0])
        const voteCount = Number(entry[1])
        if (!Number.isFinite(frameGraphId) || frameGraphId <= 0) return map
        if (!Number.isFinite(voteCount) || voteCount <= 0) return map
        map[String(Math.floor(frameGraphId))] = Math.floor(voteCount)
        return map
      }, {})

      const ballotPayload: CanvasDotVotingBallotPayload = {
        ownerId: ownerId.trim(),
        sessionId: sessionPayload.sessionId,
        votesByFrameGraphId: normalizedVotesMap,
        updatedAt: new Date().toISOString(),
      }

      const currentWs = wsRef.current
      if (currentWs?.isConnected) {
        const sqlText = serializeBallotPayload(ballotPayload)
        currentWs.sendRaw({ type: 'dotvoting:save:ballot', ownerId, sqlText })
        // Optimistic update
        setBallots((current) => {
          const withoutMine = current.filter((ballot) => ballot.ownerId !== ownerId)
          return [ballotPayload, ...withoutMine]
        })
        return
      }

      try {
        setIsSavingVoting(true)
        const updatedBallot = await upsertCanvasDotVotingBallot({
          projectId,
          dashboardId,
          ownerId,
          sessionId: sessionPayload.sessionId,
          votesByFrameGraphId: normalizedVotesMap,
        })

        setBallots((current) => {
          const withoutMine = current.filter((ballot) => ballot.ownerId !== ownerId)
          return [updatedBallot, ...withoutMine]
        })
      } catch (error) {
        onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke lagre stemmer')
      } finally {
        setIsSavingVoting(false)
      }
    },
    [dashboardId, enabled, onSyncError, ownerId, projectId, sessionPayload],
  )

  const addVote = useCallback(
    async (frameGraphId: number) => {
      if (!sessionPayload || sessionPayload.status === 'ended') return
      const key = String(frameGraphId)
      const currentVotesForFrame = myVotesByFrameGraphId[key] ?? 0
      if (myVotesRemaining <= 0) return

      await saveMyVotes({
        ...myVotesByFrameGraphId,
        [key]: currentVotesForFrame + 1,
      })
    },
    [myVotesByFrameGraphId, myVotesRemaining, saveMyVotes, sessionPayload],
  )

  const removeVote = useCallback(
    async (frameGraphId: number) => {
      if (!sessionPayload) return
      const key = String(frameGraphId)
      const currentVotesForFrame = myVotesByFrameGraphId[key] ?? 0
      if (currentVotesForFrame <= 0) return

      const nextVotesByFrameGraphId = { ...myVotesByFrameGraphId }
      if (currentVotesForFrame === 1) {
        delete nextVotesByFrameGraphId[key]
      } else {
        nextVotesByFrameGraphId[key] = currentVotesForFrame - 1
      }

      await saveMyVotes(nextVotesByFrameGraphId)
    },
    [myVotesByFrameGraphId, saveMyVotes, sessionPayload],
  )

  return {
    sessionPayload,
    ballots,
    ownerId,
    votingLabel,
    remainingSeconds,
    isVotingRunning,
    isVotingPaused,
    isSavingVoting,
    activeVotesByFrameGraphId,
    myVotesByFrameGraphId,
    myUsedVotes,
    myVotesRemaining,
    startVoting,
    pauseVoting,
    resumeVoting,
    adjustVotingMinutes,
    endVoting,
    clearVoting,
    addVote,
    removeVote,
    refreshVoting,
  }
}

export default useCanvasDotVotingSync
