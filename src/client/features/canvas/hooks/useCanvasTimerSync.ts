import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adjustCanvasTimer,
  clearCanvasTimer,
  fetchCanvasTimer,
  pauseCanvasTimer,
  resumeCanvasTimer,
  upsertCanvasTimer,
  type CanvasTimerPayload,
} from '../api/canvasTimerApi.ts'

const TIMER_ACTIVE_SYNC_INTERVAL_MS = 2000
const TIMER_FINISHED_VISIBLE_MS = 15000

const formatRemainingTime = (remainingSeconds: number): string => {
  const total = Math.max(0, Math.floor(remainingSeconds))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

type UseCanvasTimerSyncParams = {
  enabled: boolean
  projectId: number | null
  dashboardId: number | null
  onSyncError?: (message: string) => void
}

const useCanvasTimerSync = ({ enabled, projectId, dashboardId, onSyncError }: UseCanvasTimerSyncParams) => {
  const [timerPayload, setTimerPayload] = useState<CanvasTimerPayload | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isSavingTimer, setIsSavingTimer] = useState(false)

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

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) {
      setTimerPayload(null)
      return
    }

    void syncTimer()
    if (!timerPayload) return

    const intervalId = window.setInterval(() => {
      void syncTimer()
    }, TIMER_ACTIVE_SYNC_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [dashboardId, enabled, projectId, syncTimer, timerPayload])

  const remainingSeconds = useMemo(() => {
    if (!timerPayload) return 0
    const endsAtMs = Date.parse(timerPayload.endsAt)
    if (!Number.isFinite(endsAtMs)) return 0
    return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
  }, [nowMs, timerPayload])

  const isTimerRunning = Boolean(timerPayload) && remainingSeconds > 0
  const isTimerPaused = Boolean(timerPayload?.isPaused) && remainingSeconds > 0
  const timerLabel = timerPayload ? formatRemainingTime(remainingSeconds) : null

  const startTimer = useCallback(
    async (minutes: number) => {
      if (!enabled || projectId === null || dashboardId === null) return
      const durationSeconds = Math.max(1, Math.floor(minutes * 60))
      try {
        setIsSavingTimer(true)
        const nextPayload = await upsertCanvasTimer({
          projectId,
          dashboardId,
          durationSeconds,
        })
        setTimerPayload(nextPayload)
      } catch (error) {
        onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke starte timer')
      } finally {
        setIsSavingTimer(false)
      }
    },
    [dashboardId, enabled, onSyncError, projectId],
  )

  const stopTimer = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return
    try {
      setIsSavingTimer(true)
      await clearCanvasTimer(projectId, dashboardId)
      setTimerPayload(null)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke stoppe timer')
    } finally {
      setIsSavingTimer(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const pauseTimer = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return
    try {
      setIsSavingTimer(true)
      const nextPayload = await pauseCanvasTimer(projectId, dashboardId)
      setTimerPayload(nextPayload)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke pause nedtelling')
    } finally {
      setIsSavingTimer(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const resumeTimer = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return
    try {
      setIsSavingTimer(true)
      const nextPayload = await resumeCanvasTimer(projectId, dashboardId)
      setTimerPayload(nextPayload)
    } catch (error) {
      onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke fortsette nedtelling')
    } finally {
      setIsSavingTimer(false)
    }
  }, [dashboardId, enabled, onSyncError, projectId])

  const adjustTimerMinutes = useCallback(
    async (deltaMinutes: number) => {
      if (!enabled || projectId === null || dashboardId === null) return
      const deltaSeconds = Math.floor(deltaMinutes * 60)
      if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return
      try {
        setIsSavingTimer(true)
        const nextPayload = await adjustCanvasTimer(projectId, dashboardId, deltaSeconds)
        setTimerPayload(nextPayload)
      } catch (error) {
        onSyncError?.(error instanceof Error ? error.message : 'Kunne ikke oppdatere nedtelling')
      } finally {
        setIsSavingTimer(false)
      }
    },
    [dashboardId, enabled, onSyncError, projectId],
  )

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return
    if (!timerPayload) return
    if (remainingSeconds > 0) return

    const timeoutId = window.setTimeout(() => {
      void (async () => {
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
