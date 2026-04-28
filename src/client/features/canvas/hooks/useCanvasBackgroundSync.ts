import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'
import type { CanvasConnection, CanvasFrame } from '../model/types.ts'
import { fetchCanvasStorageData } from '../api/canvasStorageApi.ts'
import type { CanvasWebSocketHandle } from './useCanvasWebSocket.ts'

const DEFAULT_SYNC_INTERVAL_MS = 4000
const WS_CONNECTED_SYNC_INTERVAL_MS = 30000
const MAX_SYNC_INTERVAL_MS = 30000
const HIDDEN_TAB_SYNC_INTERVAL_MS = 15000

const buildFrameSignature = (frame: CanvasFrame): string =>
  JSON.stringify({
    kind: frame.kind,
    categoryId: frame.categoryId ?? null,
    graphId: frame.graphId ?? null,
    queryId: frame.queryId ?? null,
    websiteId: frame.websiteId ?? null,
    targetUrl: frame.targetUrl ?? null,
    previewUrl: frame.previewUrl ?? null,
    renderWebsite: frame.renderWebsite ?? null,
    isInternalDashboard: frame.isInternalDashboard ?? null,
    visualizationMode: frame.visualizationMode ?? null,
    headingText: frame.headingText ?? null,
    headingFontSize: frame.headingFontSize ?? null,
    textContent: frame.textContent ?? null,
    tableHeaders: frame.tableHeaders ?? null,
    tableRows: frame.tableRows ?? null,
    iconName: frame.iconName ?? null,
    iconRotationDeg: frame.iconRotationDeg ?? null,
    iconColor: frame.iconColor ?? null,
    figureType: frame.figureType ?? null,
    figureColor: frame.figureColor ?? null,
    drawingPath: frame.drawingPath ?? null,
    drawingStrokeStyles: frame.drawingStrokeStyles ?? null,
    drawingStrokeWidth: frame.drawingStrokeWidth ?? null,
    drawingColor: frame.drawingColor ?? null,
    drawingRotationDeg: frame.drawingRotationDeg ?? null,
    drawingAltText: frame.drawingAltText ?? null,
    isIllustration: frame.isIllustration ?? null,
    imageRotationDeg: frame.imageRotationDeg ?? null,
    imageAltText: frame.imageAltText ?? null,
    chartType: frame.chartType ?? null,
    chartSql: frame.chartSql ?? null,
    sqlQuery: frame.sqlQuery ?? null,
    codeLanguage: frame.codeLanguage ?? null,
    label: frame.label ?? null,
    x: frame.x,
    y: frame.y,
    width: frame.width ?? null,
    height: frame.height ?? null,
  })

const buildConnectionSignature = (connection: CanvasConnection): string =>
  JSON.stringify({
    categoryId: connection.categoryId ?? null,
    graphId: connection.graphId ?? null,
    queryId: connection.queryId ?? null,
    fromFrameId: connection.fromFrameId ?? null,
    toFrameId: connection.toFrameId ?? null,
    fromGraphId: connection.fromGraphId ?? null,
    toGraphId: connection.toGraphId ?? null,
  })

const reconcileFrames = (
  current: CanvasFrame[],
  incoming: CanvasFrame[],
  lockedFrameIds: Set<string>,
): CanvasFrame[] => {
  const currentByGraphId = new Map<number, CanvasFrame>()
  const incomingGraphIds = new Set<number>()

  current.forEach((frame) => {
    if (frame.graphId) currentByGraphId.set(frame.graphId, frame)
  })
  incoming.forEach((frame) => {
    if (frame.graphId) incomingGraphIds.add(frame.graphId)
  })

  const nextFromIncoming = incoming.map((incomingFrame) => {
    if (!incomingFrame.graphId) return incomingFrame
    const existingFrame = currentByGraphId.get(incomingFrame.graphId)
    if (!existingFrame) return incomingFrame

    const hasSamePayload = buildFrameSignature(existingFrame) === buildFrameSignature(incomingFrame)
    if (hasSamePayload) return existingFrame
    if (lockedFrameIds.has(existingFrame.id)) return existingFrame
    return incomingFrame
  })

  const localUnsyncedFrames = current.filter((frame) => !frame.graphId)
  const lockedMissingSyncedFrames = current.filter(
    (frame) => frame.graphId && !incomingGraphIds.has(frame.graphId) && lockedFrameIds.has(frame.id),
  )

  return [...nextFromIncoming, ...lockedMissingSyncedFrames, ...localUnsyncedFrames]
}

const reconcileConnections = (current: CanvasConnection[], incoming: CanvasConnection[]): CanvasConnection[] => {
  const currentByGraphId = new Map<number, CanvasConnection>()
  current.forEach((connection) => {
    if (connection.graphId) currentByGraphId.set(connection.graphId, connection)
  })

  const nextFromIncoming = incoming.map((incomingConnection) => {
    if (!incomingConnection.graphId) return incomingConnection
    const existingConnection = currentByGraphId.get(incomingConnection.graphId)
    if (!existingConnection) return incomingConnection
    const hasSamePayload = buildConnectionSignature(existingConnection) === buildConnectionSignature(incomingConnection)
    return hasSamePayload ? existingConnection : incomingConnection
  })

  const localUnsyncedConnections = current.filter((connection) => !connection.graphId)
  return [...nextFromIncoming, ...localUnsyncedConnections]
}

const upsertIncomingFrame = (current: CanvasFrame[], incoming: CanvasFrame): CanvasFrame[] => {
  const incomingGraphId = incoming.graphId ?? null
  let didReplace = false

  const next = current.map((frame) => {
    const matchesById = frame.id === incoming.id
    const matchesByGraphId = incomingGraphId !== null && frame.graphId === incomingGraphId

    if (!matchesById && !matchesByGraphId) return frame
    didReplace = true
    const hasSamePayload = buildFrameSignature(frame) === buildFrameSignature(incoming)
    return hasSamePayload ? frame : incoming
  })

  if (didReplace) return next
  return [...current, incoming]
}

const buildCanvasDataSignature = (params: {
  categories: GraphCategoryDto[]
  frames: CanvasFrame[]
  connections: CanvasConnection[]
}): string => {
  const categories = [...params.categories]
    .map((category) => ({ id: category.id, name: category.name ?? '' }))
    .sort((a, b) => a.id - b.id)
  const frames = [...params.frames]
    .map((frame) => ({
      graphId: frame.graphId ?? null,
      id: frame.id,
      signature: buildFrameSignature(frame),
    }))
    .sort((a, b) => {
      if (a.graphId !== b.graphId)
        return (a.graphId ?? Number.MAX_SAFE_INTEGER) - (b.graphId ?? Number.MAX_SAFE_INTEGER)
      return a.id.localeCompare(b.id)
    })
  const connections = [...params.connections]
    .map((connection) => ({
      graphId: connection.graphId ?? null,
      id: connection.id,
      signature: buildConnectionSignature(connection),
    }))
    .sort((a, b) => {
      if (a.graphId !== b.graphId)
        return (a.graphId ?? Number.MAX_SAFE_INTEGER) - (b.graphId ?? Number.MAX_SAFE_INTEGER)
      return a.id.localeCompare(b.id)
    })

  return JSON.stringify({
    categories,
    frames,
    connections,
  })
}

const getAdaptiveDelayMs = (params: {
  baseIntervalMs: number
  unchangedSyncCount: number
  consecutiveErrorCount: number
}): number => {
  const baseIntervalMs = Math.max(1000, params.baseIntervalMs)

  if (params.consecutiveErrorCount > 0) {
    const errorMultiplier = 2 ** Math.min(4, params.consecutiveErrorCount)
    return Math.min(MAX_SYNC_INTERVAL_MS, Math.round(baseIntervalMs * errorMultiplier))
  }

  if (params.unchangedSyncCount <= 0) return baseIntervalMs
  const idleMultiplier = 1.5 ** Math.min(6, params.unchangedSyncCount)
  return Math.min(MAX_SYNC_INTERVAL_MS, Math.round(baseIntervalMs * idleMultiplier))
}

type UseCanvasBackgroundSyncParams = {
  enabled: boolean
  projectId: number | null
  dashboardId: number | null
  initialCategoryId: number | null
  activeCanvasCategoryId: number | null
  lockedFrameIds: Set<string>
  setCanvasCategories: Dispatch<SetStateAction<GraphCategoryDto[]>>
  setActiveCanvasCategoryId: Dispatch<SetStateAction<number | null>>
  setFrames: Dispatch<SetStateAction<CanvasFrame[]>>
  setConnections: Dispatch<SetStateAction<CanvasConnection[]>>
  setSyncError: Dispatch<SetStateAction<string | null>>
  onBeforeApplyRemoteData?: () => void
  intervalMs?: number
  ws?: CanvasWebSocketHandle
}

const useCanvasBackgroundSync = ({
  enabled,
  projectId,
  dashboardId,
  initialCategoryId,
  activeCanvasCategoryId,
  lockedFrameIds,
  setCanvasCategories,
  setActiveCanvasCategoryId,
  setFrames,
  setConnections,
  setSyncError,
  onBeforeApplyRemoteData,
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
  ws,
}: UseCanvasBackgroundSyncParams) => {
  const wsRef = useRef(ws)
  useEffect(() => {
    wsRef.current = ws
  })
  useEffect(() => {
    if (!ws) return
    const unsubscribe = ws.subscribe('canvas:frame', (payload) => {
      const frame = payload as CanvasFrame
      if (!frame?.id) return
      setFrames((current) => upsertIncomingFrame(current, frame))
    })
    return unsubscribe
  }, [ws, setFrames])

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return

    let isActive = true
    let isSyncInFlight = false
    let timeoutId: number | null = null
    let unchangedSyncCount = 0
    let consecutiveErrorCount = 0
    let previousDataSignature: string | null = null

    const scheduleNextSync = (delayMs: number) => {
      if (!isActive) return
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(
        () => {
          void runSync()
        },
        Math.max(1000, delayMs),
      )
    }

    const runSync = async () => {
      if (!isActive || isSyncInFlight) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        scheduleNextSync(HIDDEN_TAB_SYNC_INTERVAL_MS)
        return
      }

      isSyncInFlight = true
      try {
        const data = await fetchCanvasStorageData(projectId, dashboardId)
        if (!isActive) return

        const nextDataSignature = buildCanvasDataSignature(data)
        const hasDataChanged = previousDataSignature === null || previousDataSignature !== nextDataSignature
        previousDataSignature = nextDataSignature
        unchangedSyncCount = hasDataChanged ? 0 : unchangedSyncCount + 1
        consecutiveErrorCount = 0

        if (!hasDataChanged) return

        onBeforeApplyRemoteData?.()
        setCanvasCategories(data.categories)
        setActiveCanvasCategoryId((current) => {
          if (current !== null && data.categories.some((category) => category.id === current)) return current
          if (current === null && activeCanvasCategoryId !== null) {
            if (data.categories.some((category) => category.id === activeCanvasCategoryId))
              return activeCanvasCategoryId
          }
          if (initialCategoryId !== null && data.categories.some((category) => category.id === initialCategoryId)) {
            return initialCategoryId
          }
          return data.categories[0]?.id ?? null
        })
        setFrames((current) => reconcileFrames(current, data.frames, lockedFrameIds))
        setConnections((current) => reconcileConnections(current, data.connections))
      } catch (error) {
        if (!isActive) return
        consecutiveErrorCount += 1
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke synkronisere canvas-data')
      } finally {
        isSyncInFlight = false
        const wsIsConnected = wsRef.current?.isConnected ?? false
        const effectiveBaseInterval = wsIsConnected ? WS_CONNECTED_SYNC_INTERVAL_MS : intervalMs
        scheduleNextSync(
          getAdaptiveDelayMs({
            baseIntervalMs: effectiveBaseInterval,
            unchangedSyncCount,
            consecutiveErrorCount,
          }),
        )
      }
    }

    void runSync()

    return () => {
      isActive = false
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [
    activeCanvasCategoryId,
    dashboardId,
    enabled,
    initialCategoryId,
    intervalMs,
    lockedFrameIds,
    projectId,
    setActiveCanvasCategoryId,
    setCanvasCategories,
    setConnections,
    setFrames,
    setSyncError,
    onBeforeApplyRemoteData,
  ])
}

export default useCanvasBackgroundSync
