import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCurrentUserProfile } from '../../user/api/profile.api.ts'
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

const DOT_VOTING_ACTIVE_SYNC_INTERVAL_MS = 2000
const DOT_VOTING_IDLE_SYNC_INTERVAL_MS = 10000

const formatRemainingTime = (remainingSeconds: number): string => {
  const total = Math.max(0, Math.floor(remainingSeconds))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

type UseCanvasDotVotingSyncParams = {
  enabled: boolean
  enableIdlePolling?: boolean
  projectId: number | null
  dashboardId: number | null
  onSyncError?: (message: string) => void
}

const useCanvasDotVotingSync = ({
  enabled,
  enableIdlePolling = true,
  projectId,
  dashboardId,
  onSyncError,
}: UseCanvasDotVotingSyncParams) => {
  const [sessionPayload, setSessionPayload] = useState<CanvasDotVotingSessionPayload | null>(null)
  const [ballots, setBallots] = useState<CanvasDotVotingBallotPayload[]>([])
  const [ownerId, setOwnerId] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isSavingVoting, setIsSavingVoting] = useState(false)
  const onSyncErrorRef = useRef<typeof onSyncError>(onSyncError)

  useEffect(() => {
    onSyncErrorRef.current = onSyncError
  }, [onSyncError])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    let isActive = true

    void (async () => {
      try {
        const profile = await fetchCurrentUserProfile()
        if (!isActive) return
        setOwnerId(profile?.navIdent?.trim() || '')
      } catch {
        if (!isActive) return
        setOwnerId('')
      }
    })()

    return () => {
      isActive = false
    }
  }, [])

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

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) {
      setSessionPayload(null)
      setBallots([])
      return
    }

    void syncVoting()
  }, [dashboardId, enabled, projectId, syncVoting])

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return
    if (!sessionPayload && !enableIdlePolling) return

    const intervalId = window.setInterval(
      () => {
        void syncVoting()
      },
      sessionPayload ? DOT_VOTING_ACTIVE_SYNC_INTERVAL_MS : DOT_VOTING_IDLE_SYNC_INTERVAL_MS,
    )

    return () => window.clearInterval(intervalId)
  }, [dashboardId, enableIdlePolling, enabled, projectId, sessionPayload, syncVoting])

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

  const startVoting = useCallback(
    async (params: { sectionGraphId: number; durationMinutes: number; votesPerParticipant: number }) => {
      if (!enabled || projectId === null || dashboardId === null) return
      const durationSeconds = Math.max(1, Math.floor(params.durationMinutes * 60))
      const normalizedVotesPerParticipant = Math.max(1, Math.floor(params.votesPerParticipant))

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
    try {
      setIsSavingVoting(true)
      const nextSession = await pauseCanvasDotVoting(projectId, dashboardId)
      setSessionPayload(nextSession)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke pause prikkvotering')
    } finally {
      setIsSavingVoting(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const resumeVoting = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return
    try {
      setIsSavingVoting(true)
      const nextSession = await resumeCanvasDotVoting(projectId, dashboardId)
      setSessionPayload(nextSession)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke fortsette prikkvotering')
    } finally {
      setIsSavingVoting(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const adjustVotingMinutes = useCallback(
    async (deltaMinutes: number) => {
      if (!enabled || projectId === null || dashboardId === null) return
      const deltaSeconds = Math.floor(deltaMinutes * 60)
      if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return

      try {
        setIsSavingVoting(true)
        const nextSession = await adjustCanvasDotVoting(projectId, dashboardId, deltaSeconds)
        setSessionPayload(nextSession)
      } catch (error) {
        onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke oppdatere prikkvotering')
      } finally {
        setIsSavingVoting(false)
      }
    },
    [dashboardId, enabled, onSyncError, projectId],
  )

  const endVoting = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return
    try {
      setIsSavingVoting(true)
      const nextSession = await endCanvasDotVoting(projectId, dashboardId)
      setSessionPayload(nextSession)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke avslutte prikkvotering')
    } finally {
      setIsSavingVoting(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const clearVoting = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return
    try {
      setIsSavingVoting(true)
      await clearCanvasDotVoting(projectId, dashboardId)
      setSessionPayload(null)
      setBallots([])
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
