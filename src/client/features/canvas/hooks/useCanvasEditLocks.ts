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

const LOCK_SYNC_INTERVAL_MS = 10_000
const LOCK_RENEW_INTERVAL_MS = 10_000

const createEditorId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `editor-${crypto.randomUUID()}`
  }
  return `editor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

type ActiveLockMap = Record<number, { ownerId: string; ownerLabel: string; expiresAt: string }>

const toActiveLocksByFrameGraphId = (records: CanvasEditLockRecord[]): ActiveLockMap => {
  const now = Date.now()
  const next: ActiveLockMap = {}
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
  const [activeLocksByFrameGraphId, setActiveLocksByFrameGraphId] = useState<ActiveLockMap>({})
  const isPollingRef = useRef(false)
  const wsRef = useRef(ws)
  useEffect(() => {
    wsRef.current = ws
  })

  const wsConnected = ws?.isConnected ?? false

  useEffect(() => {
    if (!ws) return
    return ws.subscribe('canvas:lock:state', (payload) => {
      const nextLocks = payload as ActiveLockMap
      if (nextLocks && typeof nextLocks === 'object') {
        setActiveLocksByFrameGraphId(nextLocks)
      }
    })
  }, [ws])

  const syncLocksHttp = useCallback(async () => {
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
    if (wsConnected) return

    void syncLocksHttp()
    const intervalId = window.setInterval(() => {
      void syncLocksHttp()
    }, LOCK_SYNC_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [dashboardId, enabled, projectId, syncLocksHttp, wsConnected])

  const acquireLock = useCallback(
    async (frame: CanvasFrame): Promise<boolean> => {
      if (!enabled || projectId === null || dashboardId === null) return true
      if (!frame.graphId || !frame.categoryId) return true

      if (wsRef.current?.isConnected) {
        return new Promise((resolve) => {
          const ws = wsRef.current!
          let settled = false

          const unsubAcquired = ws.subscribe('canvas:lock:acquired', (payload) => {
            const p = payload as { frameGraphId: number } | null
            if (p?.frameGraphId !== frame.graphId) return
            if (settled) return
            settled = true
            unsubAcquired()
            unsubDenied()
            resolve(true)
          })

          const unsubDenied = ws.subscribe('canvas:lock:denied', (payload) => {
            const p = payload as { frameGraphId: number } | null
            if (p?.frameGraphId !== frame.graphId) return
            if (settled) return
            settled = true
            unsubAcquired()
            unsubDenied()
            resolve(false)
          })

          ws.sendRaw({ type: 'lock:acquire', frameGraphId: frame.graphId, ownerId: editorId, ownerLabel: editorLabel })

          window.setTimeout(() => {
            if (settled) return
            settled = true
            unsubAcquired()
            unsubDenied()
            resolve(true)
          }, 3000)
        })
      }

      const result = await acquireCanvasEditLock({
        projectId,
        dashboardId,
        categoryId: frame.categoryId,
        frameGraphId: frame.graphId,
        ownerId: editorId,
        ownerLabel: editorLabel,
      })
      await syncLocksHttp()
      return result.ok
    },
    [dashboardId, editorId, enabled, projectId, syncLocksHttp],
  )

  const releaseLock = useCallback(
    async (frame: CanvasFrame): Promise<void> => {
      if (!enabled || projectId === null || dashboardId === null) return
      if (!frame.graphId || !frame.categoryId) return

      if (wsRef.current?.isConnected) {
        wsRef.current.sendRaw({ type: 'lock:release', frameGraphId: frame.graphId, ownerId: editorId })
        return
      }

      await releaseCanvasEditLock({
        projectId,
        dashboardId,
        categoryId: frame.categoryId,
        frameGraphId: frame.graphId,
        ownerId: editorId,
      })
      await syncLocksHttp()
    },
    [dashboardId, editorId, enabled, projectId, syncLocksHttp],
  )

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return
    const frame = activeEditableFrame
    if (!frame?.graphId || !frame.categoryId) return

    let isActive = true

    const renew = async () => {
      if (!isActive) return
      if (!frame.categoryId || !frame.graphId) return

      if (wsRef.current?.isConnected) {
        wsRef.current.sendRaw({ type: 'lock:renew', frameGraphId: frame.graphId, ownerId: editorId })
        return
      }

      await acquireCanvasEditLock({
        projectId,
        dashboardId,
        categoryId: frame.categoryId,
        frameGraphId: frame.graphId,
        ownerId: editorId,
        ownerLabel: editorLabel,
      })
      await syncLocksHttp()
    }

    void renew()
    const intervalId = window.setInterval(() => {
      void renew()
    }, LOCK_RENEW_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [activeEditableFrame, dashboardId, editorId, enabled, projectId, syncLocksHttp])

  useEffect(() => {
    return () => {
      if (!enabled || projectId === null || dashboardId === null) return
      const frame = activeEditableFrame
      if (!frame?.graphId || !frame.categoryId) return

      if (wsRef.current?.isConnected) {
        wsRef.current.sendRaw({ type: 'lock:release', frameGraphId: frame.graphId, ownerId: editorId })
        return
      }

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
