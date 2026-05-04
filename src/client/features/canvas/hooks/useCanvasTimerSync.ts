import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adjustCanvasTimer,
  clearCanvasTimer,
  fetchCanvasTimer,
  pauseCanvasTimer,
  resumeCanvasTimer,
  upsertCanvasTimer,
  type CanvasTimerPayload,
} from '../api/canvasTimerApi.ts'
import type { CanvasWebSocketHandle } from './useCanvasWebSocket.ts'

const TIMER_ACTIVE_SYNC_INTERVAL_MS = 2000
const TIMER_FINISHED_VISIBLE_MS = 15000

const formatRemainingTime = (remainingSeconds: number): string => {
  const total = Math.max(0, Math.floor(remainingSeconds))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const serializeTimerPayload = (payload: CanvasTimerPayload): string => {
  const json = JSON.stringify(payload)
  const escaped = json.replace(/'/g, "''").replace(/;/g, '\\u003B')
  return `SELECT '${escaped}' AS canvas_timer`
}

const parseTimerFromQuery = (queryMap: Record<string, unknown> | null): CanvasTimerPayload | null => {
  if (!queryMap) return null
  const sqlText = queryMap['sqlText'] as string | undefined
  if (!sqlText) return null
  const trimmed = sqlText.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_timer\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed
  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasTimerPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (!Number.isFinite(parsed.durationSeconds) || Number(parsed.durationSeconds) <= 0) return null
    if (typeof parsed.startedAt !== 'string' || !parsed.startedAt.trim()) return null
    if (typeof parsed.endsAt !== 'string' || !parsed.endsAt.trim()) return null
    if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt.trim()) return null
    const pausedRemainingSeconds = Number(parsed.pausedRemainingSeconds)
    return {
      durationSeconds: Math.max(1, Math.floor(Number(parsed.durationSeconds))),
      startedAt: parsed.startedAt,
      endsAt: parsed.endsAt,
      updatedAt: parsed.updatedAt,
      isPaused: typeof parsed.isPaused === 'boolean' ? parsed.isPaused : undefined,
      pausedRemainingSeconds:
        Number.isFinite(pausedRemainingSeconds) && pausedRemainingSeconds >= 0
          ? Math.floor(pausedRemainingSeconds)
          : undefined,
    }
  } catch {
    return null
  }
}

const getRunningRemainingSeconds = (payload: CanvasTimerPayload, nowMs: number): number => {
  const endsAtMs = Date.parse(payload.endsAt)
  if (!Number.isFinite(endsAtMs)) return 0
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
}

type UseCanvasTimerSyncParams = {
  enabled: boolean
  projectId: number | null
  dashboardId: number | null
  onSyncError?: (message: string) => void
  ws?: CanvasWebSocketHandle
}

const useCanvasTimerSync = ({ enabled, projectId, dashboardId, onSyncError, ws }: UseCanvasTimerSyncParams) => {
  const [timerPayload, setTimerPayload] = useState<CanvasTimerPayload | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isSavingTimer, setIsSavingTimer] = useState(false)
  const wsRef = useRef(ws)
  useEffect(() => {
    wsRef.current = ws
  })

  // Subscribe to WS timer events (both from join and from broadcasts)
  useEffect(() => {
    if (!ws) return
    return ws.subscribe('canvas:timer', (payload) => {
      // On join: payload is a query map (with sqlText) or null
      // On broadcast: payload is CanvasTimerPayload or null
      if (payload === null || payload === undefined) {
        setTimerPayload(null)
        return
      }
      const data = payload as Record<string, unknown>
      if ('sqlText' in data) {
        // Query map from backend (on join or after save)
        setTimerPayload(parseTimerFromQuery(data))
      } else if ('durationSeconds' in data) {
        // Direct payload (from broadcast)
        setTimerPayload(data as unknown as CanvasTimerPayload)
      } else {
        setTimerPayload(null)
      }
    })
  }, [ws])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const syncTimer = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) {
      setTimerPayload(null)
      return
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    try {
      const payload = await fetchCanvasTimer(projectId, dashboardId)
      setTimerPayload(payload)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke synkronisere timer')
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const refreshTimer = useCallback(async () => {
    await syncTimer()
  }, [syncTimer])

  // Initial load + polling: only when WS is NOT connected
  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) {
      setTimerPayload(null)
      return
    }

    // If WS is connected, skip REST polling — we get state on join + broadcasts
    if (ws?.isConnected) return

    void syncTimer()
    if (!timerPayload) return

    const intervalId = window.setInterval(() => {
      void syncTimer()
    }, TIMER_ACTIVE_SYNC_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [dashboardId, enabled, projectId, syncTimer, timerPayload, ws?.isConnected])

  const remainingSeconds = useMemo(() => {
    if (!timerPayload) return 0
    if (timerPayload.isPaused) {
      return Math.max(0, Math.floor(timerPayload.pausedRemainingSeconds ?? 0))
    }
    const endsAtMs = Date.parse(timerPayload.endsAt)
    if (!Number.isFinite(endsAtMs)) return 0
    return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
  }, [nowMs, timerPayload])

  const isTimerRunning = Boolean(timerPayload) && !timerPayload?.isPaused && remainingSeconds > 0
  const isTimerPaused = Boolean(timerPayload?.isPaused) && remainingSeconds > 0
  const timerLabel = timerPayload ? formatRemainingTime(remainingSeconds) : null

  const saveTimerViaWs = useCallback((payload: CanvasTimerPayload): boolean => {
    const currentWs = wsRef.current
    if (!currentWs?.isConnected) return false
    const sqlText = serializeTimerPayload(payload)
    currentWs.sendRaw({ type: 'timer:save', sqlText })
    setTimerPayload(payload)
    return true
  }, [])

  const startTimer = useCallback(
    async (minutes: number) => {
      if (!enabled || projectId === null || dashboardId === null) return
      const durationSeconds = Math.max(1, Math.floor(minutes * 60))
      const now = new Date()
      const payload: CanvasTimerPayload = {
        durationSeconds,
        startedAt: now.toISOString(),
        endsAt: new Date(now.getTime() + durationSeconds * 1000).toISOString(),
        updatedAt: now.toISOString(),
        isPaused: false,
      }

      if (saveTimerViaWs(payload)) return

      try {
        setIsSavingTimer(true)
        const nextPayload = await upsertCanvasTimer({ projectId, dashboardId, durationSeconds })
        setTimerPayload(nextPayload)
        wsRef.current?.broadcast('canvas:timer', nextPayload)
      } catch (error) {
        onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke starte timer')
      } finally {
        setIsSavingTimer(false)
      }
    },
    [dashboardId, enabled, onSyncError, projectId, saveTimerViaWs],
  )

  const stopTimer = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return

    const currentWs = wsRef.current
    if (currentWs?.isConnected) {
      currentWs.sendRaw({ type: 'timer:clear' })
      setTimerPayload(null)
      return
    }

    try {
      setIsSavingTimer(true)
      await clearCanvasTimer(projectId, dashboardId)
      setTimerPayload(null)
      wsRef.current?.broadcast('canvas:timer', null)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke stoppe timer')
    } finally {
      setIsSavingTimer(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const pauseTimer = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return

    if (timerPayload && !timerPayload.isPaused) {
      const now = Date.now()
      const remaining = getRunningRemainingSeconds(timerPayload, now)
      const nextPayload: CanvasTimerPayload = {
        ...timerPayload,
        updatedAt: new Date(now).toISOString(),
        isPaused: true,
        pausedRemainingSeconds: remaining,
      }
      if (saveTimerViaWs(nextPayload)) return
    }

    try {
      setIsSavingTimer(true)
      const nextPayload = await pauseCanvasTimer(projectId, dashboardId)
      setTimerPayload(nextPayload)
      wsRef.current?.broadcast('canvas:timer', nextPayload)
    } finally {
      setIsSavingTimer(false)
    }
  }, [dashboardId, enabled, projectId, saveTimerViaWs, timerPayload])

  const resumeTimer = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return

    if (timerPayload?.isPaused) {
      const now = Date.now()
      const remaining = Math.max(0, Math.floor(timerPayload.pausedRemainingSeconds ?? 0))
      const nextPayload: CanvasTimerPayload = {
        ...timerPayload,
        endsAt: new Date(now + remaining * 1000).toISOString(),
        updatedAt: new Date(now).toISOString(),
        isPaused: false,
        pausedRemainingSeconds: undefined,
      }
      if (saveTimerViaWs(nextPayload)) return
    }

    try {
      setIsSavingTimer(true)
      const nextPayload = await resumeCanvasTimer(projectId, dashboardId)
      setTimerPayload(nextPayload)
      wsRef.current?.broadcast('canvas:timer', nextPayload)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke fortsette nedtelling')
    } finally {
      setIsSavingTimer(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId, saveTimerViaWs, timerPayload])

  const adjustTimerMinutes = useCallback(
    async (deltaMinutes: number) => {
      if (!enabled || projectId === null || dashboardId === null) return
      const deltaSeconds = Math.floor(deltaMinutes * 60)
      if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return

      if (timerPayload) {
        const now = Date.now()
        const runningRemaining = getRunningRemainingSeconds(timerPayload, now)
        const pausedRemaining = Math.max(0, Math.floor(timerPayload.pausedRemainingSeconds ?? 0))
        const baseRemaining = timerPayload.isPaused ? pausedRemaining : runningRemaining
        const nextRemaining = Math.max(0, baseRemaining + deltaSeconds)

        const nextPayload: CanvasTimerPayload = {
          ...timerPayload,
          durationSeconds: Math.max(1, nextRemaining),
          updatedAt: new Date(now).toISOString(),
          isPaused: timerPayload.isPaused,
          pausedRemainingSeconds: timerPayload.isPaused ? nextRemaining : undefined,
          endsAt: timerPayload.isPaused ? timerPayload.endsAt : new Date(now + nextRemaining * 1000).toISOString(),
        }
        if (saveTimerViaWs(nextPayload)) return
      }

      try {
        setIsSavingTimer(true)
        const nextPayload = await adjustCanvasTimer(projectId, dashboardId, deltaSeconds)
        setTimerPayload(nextPayload)
        wsRef.current?.broadcast('canvas:timer', nextPayload)
      } catch (error) {
        onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke oppdatere nedtelling')
      } finally {
        setIsSavingTimer(false)
      }
    },
    [dashboardId, enabled, onSyncError, projectId, saveTimerViaWs, timerPayload],
  )

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return
    if (!timerPayload) return
    if (timerPayload.isPaused) return
    if (remainingSeconds > 0) return

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const currentWs = wsRef.current
        if (currentWs?.isConnected) {
          currentWs.sendRaw({ type: 'timer:clear' })
          setTimerPayload((current) => (current?.endsAt === timerPayload.endsAt ? null : current))
          return
        }

        try {
          await clearCanvasTimer(projectId, dashboardId)
          setTimerPayload((current) => (current?.endsAt === timerPayload.endsAt ? null : current))
        } catch (error) {
          onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke rydde ferdig nedtelling')
        }
      })()
    }, TIMER_FINISHED_VISIBLE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [dashboardId, enabled, onSyncError, projectId, remainingSeconds, timerPayload])

  return {
    timerPayload,
    timerLabel,
    remainingSeconds,
    isTimerRunning,
    isTimerPaused,
    isSavingTimer,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    adjustTimerMinutes,
    refreshTimer,
  }
}

export default useCanvasTimerSync
