import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'
import type { CanvasConnection, CanvasFrame } from '../model/types.ts'
import { fetchCanvasStorageData } from '../api/canvasStorageApi.ts'

const DEFAULT_SYNC_INTERVAL_MS = 4000

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
    isIllustration: frame.isIllustration ?? null,
    imageRotationDeg: frame.imageRotationDeg ?? null,
    chartType: frame.chartType ?? null,
    chartSql: frame.chartSql ?? null,
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
  intervalMs?: number
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
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
}: UseCanvasBackgroundSyncParams) => {
  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return

    let isActive = true
    let isSyncInFlight = false

    const runSync = async () => {
      if (!isActive || isSyncInFlight) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

      isSyncInFlight = true
      try {
        const data = await fetchCanvasStorageData(projectId, dashboardId)
        if (!isActive) return

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
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke synkronisere canvas-data')
      } finally {
        isSyncInFlight = false
      }
    }

    const intervalId = window.setInterval(
      () => {
        void runSync()
      },
      Math.max(1000, intervalMs),
    )

    return () => {
      isActive = false
      window.clearInterval(intervalId)
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
  ])
}

export default useCanvasBackgroundSync
