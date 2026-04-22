import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasFrame } from '../model/types.ts'
import {
  acquireCanvasEditLock,
  isCanvasEditLockActive,
  listCanvasEditLocks,
  releaseCanvasEditLock,
  type CanvasEditLockRecord,
} from '../api/canvasEditLockApi.ts'
import type { CanvasWebSocketHandle } from './useCanvasWebSocket.ts'

const LOCK_SYNC_INTERVAL_MS = 3000

const createEditorId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `editor-${crypto.randomUUID()}`
  }
  return `editor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const toActiveLocksByFrameGraphId = (
  records: CanvasEditLockRecord[],
): Record<number, { ownerId: string; ownerLabel: string; expiresAt: string }> => {
  const now = Date.now()
  const next: Record<number, { ownerId: string; ownerLabel: string; expiresAt: string }> = {}

  records.forEach((record) => {
    if (!isCanvasEditLockActive(record.payload, now)) return
    next[record.payload.frameGraphId] = {
      ownerId: record.payload.ownerId,
      ownerLabel: record.payload.ownerLabel,
      expiresAt: record.payload.expiresAt,
    }
  })

  return next
}

type UseCanvasEditLocksParams = {
  enabled: boolean
  projectId: number | null
  dashboardId: number | null
  activeEditableFrame: CanvasFrame | null
  onLostActiveLock?: () => void
  ws?: CanvasWebSocketHandle
}

const useCanvasEditLocks = ({
  enabled,
  projectId,
  dashboardId,
  activeEditableFrame,
  onLostActiveLock,
  ws,
}: UseCanvasEditLocksParams) => {
  const editorId = useMemo(() => createEditorId(), [])
  const editorLabel = 'En kollega'
  const [activeLocksByFrameGraphId, setActiveLocksByFrameGraphId] = useState<
    Record<number, { ownerId: string; ownerLabel: string; expiresAt: string }>
  >({})
  const isPollingRef = useRef(false)
  const wsRef = useRef(ws)
  useEffect(() => {
    wsRef.current = ws
  })

  useEffect(() => {
    if (!ws) return
    return ws.subscribe('canvas:locks', (payload) => {
      const nextLocks = payload as Record<number, { ownerId: string; ownerLabel: string; expiresAt: string }>
      if (nextLocks && typeof nextLocks === 'object') {
        setActiveLocksByFrameGraphId(nextLocks)
      }
    })
  }, [ws])

  const syncLocks = useCallback(async () => {
    if (!enabled || projectId === null || dashboardId === null) return
    if (isPollingRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    isPollingRef.current = true
    try {
      const records = await listCanvasEditLocks(projectId, dashboardId)
      const nextLocks = toActiveLocksByFrameGraphId(records)
      setActiveLocksByFrameGraphId(nextLocks)
      wsRef.current?.broadcast('canvas:locks', nextLocks)

      const activeFrameGraphId = activeEditableFrame?.graphId
      if (!activeFrameGraphId) return
      const lock = nextLocks[activeFrameGraphId]
      if (lock && lock.ownerId !== editorId) {
        onLostActiveLock?.()
      }
    } finally {
      isPollingRef.current = false
    }
  }, [activeEditableFrame?.graphId, dashboardId, editorId, enabled, onLostActiveLock, projectId])

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return
    void syncLocks()
    const intervalId = window.setInterval(() => {
      void syncLocks()
    }, LOCK_SYNC_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [dashboardId, enabled, projectId, syncLocks])

  const acquireLock = useCallback(
    async (frame: CanvasFrame): Promise<boolean> => {
      if (!enabled || projectId === null || dashboardId === null) return true
      if (!frame.graphId || !frame.categoryId) return true

      const result = await acquireCanvasEditLock({
        projectId,
        dashboardId,
        categoryId: frame.categoryId,
        frameGraphId: frame.graphId,
        ownerId: editorId,
        ownerLabel: editorLabel,
      })
      await syncLocks()
      return result.ok
    },
    [dashboardId, editorId, enabled, projectId, syncLocks],
  )

  const releaseLock = useCallback(
    async (frame: CanvasFrame): Promise<void> => {
      if (!enabled || projectId === null || dashboardId === null) return
      if (!frame.graphId || !frame.categoryId) return

      await releaseCanvasEditLock({
        projectId,
        dashboardId,
        categoryId: frame.categoryId,
        frameGraphId: frame.graphId,
        ownerId: editorId,
      })
      await syncLocks()
    },
    [dashboardId, editorId, enabled, projectId, syncLocks],
  )

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return
    const frame = activeEditableFrame
    if (!frame?.graphId || !frame.categoryId) return

    let isActive = true
    const renew = async () => {
      if (!isActive) return
      if (!frame.categoryId || !frame.graphId) return
      await acquireCanvasEditLock({
        projectId,
        dashboardId,
        categoryId: frame.categoryId,
        frameGraphId: frame.graphId,
        ownerId: editorId,
        ownerLabel: editorLabel,
      })
      await syncLocks()
    }

    void renew()
    const intervalId = window.setInterval(() => {
      void renew()
    }, LOCK_SYNC_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [activeEditableFrame, dashboardId, editorId, enabled, projectId, syncLocks])

  useEffect(() => {
    return () => {
      if (!enabled || projectId === null || dashboardId === null) return
      const frame = activeEditableFrame
      if (!frame?.graphId || !frame.categoryId) return
      void releaseCanvasEditLock({
        projectId,
        dashboardId,
        categoryId: frame.categoryId,
        frameGraphId: frame.graphId,
        ownerId: editorId,
      })
    }
  }, [activeEditableFrame, dashboardId, editorId, enabled, projectId])

  const getFrameLockStatus = useCallback(
    (frame: CanvasFrame): { isLockedByOther: boolean; ownerLabel: string | null } => {
      if (!frame.graphId) return { isLockedByOther: false, ownerLabel: null }
      const lock = activeLocksByFrameGraphId[frame.graphId]
      if (!lock) return { isLockedByOther: false, ownerLabel: null }
      if (lock.ownerId === editorId) return { isLockedByOther: false, ownerLabel: null }
      return { isLockedByOther: true, ownerLabel: lock.ownerLabel }
    },
    [activeLocksByFrameGraphId, editorId],
  )

  return {
    acquireLock,
    releaseLock,
    getFrameLockStatus,
  }
}

export default useCanvasEditLocks
