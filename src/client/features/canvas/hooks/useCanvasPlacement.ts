import { useCallback, useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type React from 'react'
import type { CanvasFrame, PendingCanvasFrameDraft, PendingCsvStickyImport } from '../model/types.ts'

type UseCanvasPlacementParams = {
  frames: CanvasFrame[]
  setFrames: Dispatch<SetStateAction<CanvasFrame[]>>
  pendingFrameDraft: PendingCanvasFrameDraft | null
  setPendingFrameDraft: Dispatch<SetStateAction<PendingCanvasFrameDraft | null>>
  pendingCsvStickyImport: PendingCsvStickyImport | null
  pendingCsvStickyImportRef: MutableRefObject<PendingCsvStickyImport | null>
  pendingFigureDragStart: { x: number; y: number } | null
  setPendingFigureDragStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>
  pendingFramePointer: { x: number; y: number } | null
  setPendingFramePointer: Dispatch<SetStateAction<{ x: number; y: number } | null>>
  setPendingFramePlacementLabel: Dispatch<SetStateAction<string | null>>
  cancelPendingFramePlacement: () => void
  isImportingStickyCsv: boolean
  setIsImportingStickyCsv: Dispatch<SetStateAction<boolean>>
  isImportingStickyCsvRef: MutableRefObject<boolean>
  setImportStickyProgressCurrent: Dispatch<SetStateAction<number>>
  setImportStickyProgressTotal: Dispatch<SetStateAction<number>>
  setIsSavingCanvasItem: Dispatch<SetStateAction<boolean>>
  setSyncError: Dispatch<SetStateAction<string | null>>
  getCanvasPointerPosition: (clientX: number, clientY: number) => { x: number; y: number } | null
  getPendingFrameContentAnchorOffset: (draft: PendingCanvasFrameDraft) => { x: number; y: number }
  getDefaultFrameSize: (frameOrKind: CanvasFrame | CanvasFrame['kind']) => {
    width: number
    height: number
    minWidth: number
    minHeight: number
  }
  getNextAutoSectionLabel: (frames: CanvasFrame[], excludeFrameId?: string) => string
  estimateStickyFrameHeight: (text: string, width: number) => number
  estimateTableFrameHeight: (rowCount: number) => number
  persistFrame: (frame: CanvasFrame) => Promise<CanvasFrame>
  sectionHeaderHeight: number
  topBuffer: number

  isDrawingMode: boolean
  startDrawingAt: (point: { x: number; y: number }) => void
  continueDrawingAt: (point: { x: number; y: number }) => void
  selectionBox: {
    startX: number
    startY: number
    currentX: number
    currentY: number
    additive: boolean
  } | null
  setSelectionBox: Dispatch<
    SetStateAction<{
      startX: number
      startY: number
      currentX: number
      currentY: number
      additive: boolean
    } | null>
  >
  setSelectedFrameIds: Dispatch<SetStateAction<string[]>>
  isInteractionLocked?: boolean
}

type UseCanvasPlacementResult = {
  handleCanvasSurfaceMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
  handleCanvasSurfaceMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void
  handleCanvasSurfaceMouseLeave: () => void
}

const useCanvasPlacement = ({
  frames,
  setFrames,
  pendingFrameDraft,
  setPendingFrameDraft,
  pendingCsvStickyImport,
  pendingCsvStickyImportRef,
  pendingFigureDragStart,
  setPendingFigureDragStart,
  pendingFramePointer,
  setPendingFramePointer,
  setPendingFramePlacementLabel,
  cancelPendingFramePlacement,
  isImportingStickyCsv,
  setIsImportingStickyCsv,
  isImportingStickyCsvRef,
  setImportStickyProgressCurrent,
  setImportStickyProgressTotal,
  setIsSavingCanvasItem,
  setSyncError,
  getCanvasPointerPosition,
  getPendingFrameContentAnchorOffset,
  getDefaultFrameSize,
  getNextAutoSectionLabel,
  estimateStickyFrameHeight,
  estimateTableFrameHeight,
  persistFrame,
  sectionHeaderHeight,
  topBuffer,
  isDrawingMode,
  startDrawingAt,
  continueDrawingAt,
  selectionBox,
  setSelectionBox,
  setSelectedFrameIds,
  isInteractionLocked = false,
}: UseCanvasPlacementParams): UseCanvasPlacementResult => {
  useEffect(() => {
    if (!pendingFrameDraft && !pendingCsvStickyImport) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelPendingFramePlacement()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancelPendingFramePlacement, pendingCsvStickyImport, pendingFrameDraft])

  const handlePlacePendingFrame = useCallback(
    async (clientX: number, clientY: number) => {
      if (!pendingFrameDraft) return
      const pointer = getCanvasPointerPosition(clientX, clientY)
      if (!pointer) return
      const contentAnchorOffset = getPendingFrameContentAnchorOffset(pendingFrameDraft)

      const nextFrame: CanvasFrame = {
        ...pendingFrameDraft,
        id: `${Date.now()}-${Math.random()}`,
        x: Math.max(0, pointer.x - contentAnchorOffset.x),
        y: Math.max(-topBuffer, pointer.y - contentAnchorOffset.y),
      }

      try {
        setIsSavingCanvasItem(true)
        setSyncError(null)
        const persistedFrame = await persistFrame(nextFrame)
        setFrames((prev) => [...prev, persistedFrame])
        setPendingFrameDraft(null)
        setPendingFramePlacementLabel(null)
        setPendingFramePointer(null)
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre element i canvas')
      } finally {
        setIsSavingCanvasItem(false)
      }
    },
    [
      getCanvasPointerPosition,
      getPendingFrameContentAnchorOffset,
      pendingFrameDraft,
      persistFrame,
      setFrames,
      setIsSavingCanvasItem,
      setPendingFrameDraft,
      setPendingFramePlacementLabel,
      setPendingFramePointer,
      setSyncError,
      topBuffer,
    ],
  )

  const handlePlacePendingCsvImport = useCallback(
    async (clientX: number, clientY: number) => {
      const activePendingCsvImport = pendingCsvStickyImportRef.current
      if (!activePendingCsvImport) return
      if (isImportingStickyCsvRef.current) return
      const pointer = getCanvasPointerPosition(clientX, clientY)
      if (!pointer) return

      const stickyWidth = 320
      const stickyHeight = 180
      const columnGap = 24
      const stickyGap = 18
      const cardsPerRow = 2
      const sectionTitle = activePendingCsvImport.sectionTitle.trim()
      const sectionLabel = sectionTitle || getNextAutoSectionLabel(frames)
      const sectionPaddingX = 24
      const sectionPaddingBottom = 24
      const baseX = Math.max(0, pointer.x)
      const baseY = Math.max(-topBuffer, pointer.y)
      const contentStartX = baseX + sectionPaddingX
      const contentStartY = baseY + sectionHeaderHeight
      const timestampSeed = Date.now()
      const importedFrames: CanvasFrame[] = []
      const isTableImport =
        Array.isArray(activePendingCsvImport.tableHeaders) &&
        activePendingCsvImport.tableHeaders.length > 0 &&
        Array.isArray(activePendingCsvImport.tableRows)

      if (isTableImport) {
        const tableRowCount = activePendingCsvImport.tableRows?.length ?? 0
        importedFrames.push({
          id: `csv-table-${timestampSeed}`,
          kind: 'text',
          tableHeaders: activePendingCsvImport.tableHeaders,
          tableRows: activePendingCsvImport.tableRows,
          label: 'Tabell',
          x: contentStartX,
          y: contentStartY,
          width: 700,
          height: estimateTableFrameHeight(tableRowCount),
          refreshNonce: 0,
        })
      } else if (activePendingCsvImport.aggregatedRatingsText) {
        const summaryText = activePendingCsvImport.aggregatedRatingsText || ''
        importedFrames.push({
          id: `csv-rating-summary-${timestampSeed}`,
          kind: 'sticky',
          textContent: summaryText,
          label: 'Post-it-lapp',
          x: contentStartX,
          y: contentStartY,
          width: stickyWidth,
          height: estimateStickyFrameHeight(summaryText, stickyWidth),
          refreshNonce: 0,
        })
      } else {
        let currentRowY = contentStartY

        for (
          let rowStartIndex = 0;
          rowStartIndex < activePendingCsvImport.noteTexts.length;
          rowStartIndex += cardsPerRow
        ) {
          const rowNotes = activePendingCsvImport.noteTexts.slice(rowStartIndex, rowStartIndex + cardsPerRow)
          const rowHeights = rowNotes.map((content) => estimateStickyFrameHeight(content, stickyWidth))
          const tallestRowHeight = Math.max(...rowHeights, stickyHeight)

          rowNotes.forEach((content, rowOffset) => {
            const rowIndex = rowStartIndex + rowOffset
            importedFrames.push({
              id: `csv-sticky-${timestampSeed}-${rowIndex}`,
              kind: 'sticky',
              textContent: content,
              label: 'Post-it-lapp',
              x: contentStartX + rowOffset * (stickyWidth + columnGap),
              y: currentRowY,
              width: stickyWidth,
              height: rowHeights[rowOffset] ?? stickyHeight,
              refreshNonce: 0,
            })
          })

          currentRowY += tallestRowHeight + stickyGap
        }
      }

      if (importedFrames.length === 0) {
        setSyncError('Ingen rader å importere til canvas')
        return
      }

      const rightEdge = importedFrames.reduce((max, frame) => {
        const defaults = getDefaultFrameSize(frame)
        return Math.max(max, frame.x + (frame.width ?? defaults.width))
      }, baseX)
      const bottomEdge = importedFrames.reduce((max, frame) => {
        const defaults = getDefaultFrameSize(frame)
        return Math.max(max, frame.y + (frame.height ?? defaults.height))
      }, baseY + sectionHeaderHeight)

      const sectionFrame: CanvasFrame = {
        id: `csv-section-${timestampSeed}`,
        kind: 'section',
        label: sectionLabel,
        sectionLayout: 'grid',
        x: baseX,
        y: baseY,
        width: Math.max(420, Math.ceil(rightEdge - baseX + sectionPaddingX)),
        height: Math.max(sectionHeaderHeight + 160, Math.ceil(bottomEdge - baseY + sectionPaddingBottom)),
        refreshNonce: 0,
      }

      const framesToPersist: CanvasFrame[] = [sectionFrame, ...importedFrames]

      try {
        setPendingFramePointer(null)
        isImportingStickyCsvRef.current = true
        setIsImportingStickyCsv(true)
        setIsSavingCanvasItem(true)
        setImportStickyProgressTotal(framesToPersist.length)
        setImportStickyProgressCurrent(0)
        setSyncError(null)
        const persistedFrames: CanvasFrame[] = []
        for (const [frameIndex, frame] of framesToPersist.entries()) {
          const persistedFrame = await persistFrame(frame)
          persistedFrames.push(persistedFrame)
          setImportStickyProgressCurrent(frameIndex + 1)
        }
        setFrames((prev) => [...prev, ...persistedFrames])
        cancelPendingFramePlacement()
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke importere CSV til canvas')
      } finally {
        isImportingStickyCsvRef.current = false
        setIsImportingStickyCsv(false)
        setIsSavingCanvasItem(false)
        setImportStickyProgressCurrent(0)
        setImportStickyProgressTotal(0)
      }
    },
    [
      cancelPendingFramePlacement,
      estimateStickyFrameHeight,
      estimateTableFrameHeight,
      frames,
      getCanvasPointerPosition,
      getDefaultFrameSize,
      getNextAutoSectionLabel,
      isImportingStickyCsvRef,
      pendingCsvStickyImportRef,
      persistFrame,
      sectionHeaderHeight,
      setFrames,
      setImportStickyProgressCurrent,
      setImportStickyProgressTotal,
      setIsImportingStickyCsv,
      setIsSavingCanvasItem,
      setPendingFramePointer,
      setSyncError,
      topBuffer,
    ],
  )

  const handleCanvasSurfaceMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isInteractionLocked) return
      if (pendingFrameDraft) {
        event.preventDefault()
        event.stopPropagation()
        const isLineOrArrow =
          pendingFrameDraft.kind === 'figure' &&
          (pendingFrameDraft.figureType === 'line' || pendingFrameDraft.figureType === 'arrow')
        if (isLineOrArrow) {
          const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
          if (pointer) {
            setPendingFigureDragStart(pointer)
            setPendingFramePointer(pointer)
          }
          return
        }
        void handlePlacePendingFrame(event.clientX, event.clientY)
        return
      }
      if (pendingCsvStickyImport) {
        if (isImportingStickyCsvRef.current) return
        event.preventDefault()
        event.stopPropagation()
        void handlePlacePendingCsvImport(event.clientX, event.clientY)
        return
      }
      const target = event.target as HTMLElement
      const clickedInsideFrame = Boolean(target.closest('article'))
      const clickedInteractiveControl = Boolean(target.closest('button, a, input, textarea, select'))
      if (clickedInsideFrame || clickedInteractiveControl) return
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.closest('article')) {
        activeElement.blur()
      }
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return

      if (!isDrawingMode) {
        const additive = event.metaKey || event.ctrlKey
        if (!additive) setSelectedFrameIds([])
        event.preventDefault()
        event.stopPropagation()
        setSelectionBox({
          startX: pointer.x,
          startY: pointer.y,
          currentX: pointer.x,
          currentY: pointer.y,
          additive,
        })
        return
      }

      event.preventDefault()
      event.stopPropagation()
      startDrawingAt(pointer)
    },
    [
      getCanvasPointerPosition,
      handlePlacePendingCsvImport,
      handlePlacePendingFrame,
      isDrawingMode,
      isImportingStickyCsvRef,
      pendingCsvStickyImport,
      pendingFrameDraft,
      isInteractionLocked,
      setPendingFigureDragStart,
      setPendingFramePointer,
      setSelectedFrameIds,
      setSelectionBox,
      startDrawingAt,
    ],
  )

  const handleCanvasSurfaceMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return
      if (isDrawingMode) {
        continueDrawingAt(pointer)
        return
      }
      if (pendingFrameDraft || pendingCsvStickyImport) {
        if (pendingCsvStickyImport && isImportingStickyCsv) return
        setPendingFramePointer(pointer)
      }
      if (selectionBox) {
        setSelectionBox((current) => (current ? { ...current, currentX: pointer.x, currentY: pointer.y } : current))
      }
    },
    [
      continueDrawingAt,
      getCanvasPointerPosition,
      isDrawingMode,
      isImportingStickyCsv,
      pendingCsvStickyImport,
      pendingFrameDraft,
      selectionBox,
      setPendingFramePointer,
      setSelectionBox,
    ],
  )

  const handleCanvasSurfaceMouseLeave = useCallback(() => {
    if (isDrawingMode) return
    if (!pendingFrameDraft && !pendingCsvStickyImport) return
    setPendingFramePointer(null)
  }, [isDrawingMode, pendingCsvStickyImport, pendingFrameDraft, setPendingFramePointer])

  useEffect(() => {
    if (!pendingFigureDragStart || !pendingFrameDraft) return

    const updateDrag = (event: MouseEvent) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return
      setPendingFramePointer(pointer)
    }

    const finalizeDrag = async () => {
      const start = pendingFigureDragStart
      const end = pendingFramePointer || start
      setPendingFigureDragStart(null)

      const minX = Math.min(start.x, end.x)
      const maxX = Math.max(start.x, end.x)
      const minY = Math.min(start.y, end.y)
      const maxY = Math.max(start.y, end.y)

      const width = Math.max(12, maxX - minX)
      const height = Math.max(12, maxY - minY)

      let dir = 0
      if (end.x >= start.x && end.y >= start.y) dir = 0
      else if (end.x <= start.x && end.y <= start.y) dir = 1
      else if (end.x >= start.x && end.y <= start.y) dir = 2
      else if (end.x <= start.x && end.y >= start.y) dir = 3

      const nextFrame: CanvasFrame = {
        ...pendingFrameDraft,
        id: `${Date.now()}-${Math.random()}`,
        x: Math.max(0, minX),
        y: Math.max(-topBuffer, minY),
        width,
        height,
        figureOrientation: dir,
        iconRotationDeg: 0,
      }

      try {
        setIsSavingCanvasItem(true)
        setSyncError(null)
        const persistedFrame = await persistFrame(nextFrame)
        setFrames((prev) => [...prev, persistedFrame])
        setPendingFrameDraft(null)
        setPendingFramePlacementLabel(null)
        setPendingFramePointer(null)
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre element i canvas')
      } finally {
        setIsSavingCanvasItem(false)
      }
    }

    window.addEventListener('mousemove', updateDrag)
    window.addEventListener('mouseup', finalizeDrag)
    return () => {
      window.removeEventListener('mousemove', updateDrag)
      window.removeEventListener('mouseup', finalizeDrag)
    }
  }, [
    getCanvasPointerPosition,
    pendingFigureDragStart,
    pendingFrameDraft,
    pendingFramePointer,
    persistFrame,
    setFrames,
    setIsSavingCanvasItem,
    setPendingFigureDragStart,
    setPendingFrameDraft,
    setPendingFramePlacementLabel,
    setPendingFramePointer,
    setSyncError,
    topBuffer,
  ])

  return {
    handleCanvasSurfaceMouseDown,
    handleCanvasSurfaceMouseMove,
    handleCanvasSurfaceMouseLeave,
  }
}

export default useCanvasPlacement
