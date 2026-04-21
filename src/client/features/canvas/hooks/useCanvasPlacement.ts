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
  setPlacementA11yAnnouncement: Dispatch<SetStateAction<string>>
  onAutoPlacedSection?: (frame: CanvasFrame) => void
  onFramePlaced?: (frame: CanvasFrame) => void
  getCanvasPointerPosition: (clientX: number, clientY: number) => { x: number; y: number } | null
  getPendingFrameContentAnchorOffset: (draft: PendingCanvasFrameDraft) => { x: number; y: number }
  getDefaultFrameSize: (frameOrKind: CanvasFrame | CanvasFrame['kind']) => {
    width: number
    height: number
    minWidth: number
    minHeight: number
  }
  getNextAutoSectionLabel: (frames: CanvasFrame[], excludeFrameId?: string) => string
  activeCanvasCategoryId: number | null
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
  handleAutoPlacePendingFrame: () => Promise<void>
}

const CSV_IMPORT_MAX_PERSIST_ATTEMPTS = 3
const CSV_IMPORT_RETRY_BASE_DELAY_MS = 300

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
  setPlacementA11yAnnouncement,
  onAutoPlacedSection,
  onFramePlaced,
  getCanvasPointerPosition,
  getPendingFrameContentAnchorOffset,
  getDefaultFrameSize,
  getNextAutoSectionLabel,
  activeCanvasCategoryId,
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
  const getNextSectionAutoPlacementPoint = useCallback(
    (sectionWidth: number, sectionHeight: number): { x: number; y: number } | null => {
      const sectionGapX = 24
      const sectionGapY = 48
      const baseX = 24
      // Leave vertical space so users can add a heading above the first section later.
      const baseY = 96

      const existingSections = frames.filter((frame) => frame.kind === 'section')
      if (existingSections.length === 0) {
        return { x: baseX, y: baseY }
      }

      const occupiedBounds = existingSections.map((sectionFrame) => {
        const sectionDefaults = getDefaultFrameSize(sectionFrame)
        return {
          left: sectionFrame.x,
          right: sectionFrame.x + (sectionFrame.width ?? sectionDefaults.width),
          top: sectionFrame.y,
          bottom: sectionFrame.y + (sectionFrame.height ?? sectionDefaults.height),
        }
      })

      const previousSection = existingSections[existingSections.length - 1]
      if (previousSection) {
        const previousDefaults = getDefaultFrameSize(previousSection)
        const previousRight = previousSection.x + (previousSection.width ?? previousDefaults.width)
        const candidateTop = previousSection.y

        let candidateLeft = previousRight + sectionGapX
        const maxAdjustments = Math.max(existingSections.length * 2, 8)
        for (let attempt = 0; attempt < maxAdjustments; attempt += 1) {
          const candidateRight = candidateLeft + sectionWidth
          const candidateBottom = candidateTop + sectionHeight
          const overlappingSection = occupiedBounds.find((occupied) => {
            const intersectsHorizontally = candidateLeft < occupied.right && candidateRight > occupied.left
            const intersectsVertically = candidateTop < occupied.bottom && candidateBottom > occupied.top
            return intersectsHorizontally && intersectsVertically
          })

          if (!overlappingSection) {
            return { x: candidateLeft, y: candidateTop }
          }

          candidateLeft = overlappingSection.right + sectionGapX
        }
      }

      const candidateLimit = Math.max(existingSections.length + 4, 10)
      for (let row = 0; row < candidateLimit; row += 1) {
        for (let column = 0; column < candidateLimit; column += 1) {
          const candidateLeft = baseX + column * (sectionWidth + sectionGapX)
          const candidateTop = baseY + row * (sectionHeight + sectionGapY)
          const candidateRight = candidateLeft + sectionWidth
          const candidateBottom = candidateTop + sectionHeight

          const overlapsExistingSection = occupiedBounds.some((occupied) => {
            const intersectsHorizontally = candidateLeft < occupied.right && candidateRight > occupied.left
            const intersectsVertically = candidateTop < occupied.bottom && candidateBottom > occupied.top
            return intersectsHorizontally && intersectsVertically
          })
          if (overlapsExistingSection) continue

          return { x: candidateLeft, y: candidateTop }
        }
      }

      return null
    },
    [frames, getDefaultFrameSize],
  )

  const handlePlacePendingFrame = useCallback(
    async (clientX: number, clientY: number) => {
      if (!pendingFrameDraft) return
      const existingSectionCount =
        pendingFrameDraft.kind === 'section' ? frames.filter((frame) => frame.kind === 'section').length : 0
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
        if (pendingFrameDraft.kind === 'section') {
          setPlacementA11yAnnouncement(
            existingSectionCount > 0 ? 'Seksjon plassert ved siden av forrige seksjon.' : 'Seksjon plassert.',
          )
          window.requestAnimationFrame(() => {
            onAutoPlacedSection?.(persistedFrame)
          })
        } else {
          window.requestAnimationFrame(() => {
            onFramePlaced?.(persistedFrame)
          })
        }
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
      frames,
      getPendingFrameContentAnchorOffset,
      pendingFrameDraft,
      persistFrame,
      setFrames,
      setIsSavingCanvasItem,
      onAutoPlacedSection,
      onFramePlaced,
      setPendingFrameDraft,
      setPlacementA11yAnnouncement,
      setPendingFramePlacementLabel,
      setPendingFramePointer,
      setSyncError,
      topBuffer,
    ],
  )

  const handleAutoPlacePendingFrame = useCallback(async () => {
    if (!pendingFrameDraft) return
    const existingSectionCount =
      pendingFrameDraft.kind === 'section' ? frames.filter((frame) => frame.kind === 'section').length : 0
    const contentAnchorOffset = getPendingFrameContentAnchorOffset(pendingFrameDraft)
    const isSection = pendingFrameDraft.kind === 'section'
    const sectionAutoPlacementAnchor = (() => {
      if (!isSection) return null

      const defaultSectionSize = getDefaultFrameSize('section')
      const sectionWidth = pendingFrameDraft.width ?? defaultSectionSize.width
      const sectionHeight = pendingFrameDraft.height ?? defaultSectionSize.height
      const autoPlacementPoint = getNextSectionAutoPlacementPoint(sectionWidth, sectionHeight)
      if (!autoPlacementPoint) return null
      return {
        x: autoPlacementPoint.x + contentAnchorOffset.x,
        y: autoPlacementPoint.y + contentAnchorOffset.y,
      }
    })()

    const nonSectionAutoPlacementAnchor = (() => {
      if (isSection) return null

      const frameDefaults = getDefaultFrameSize(pendingFrameDraft.kind)
      const frameWidth = pendingFrameDraft.width ?? frameDefaults.width
      const frameHeight = pendingFrameDraft.height ?? frameDefaults.height
      const frameGapX = 24
      const frameGapY = 24
      const baseX = 24
      const baseY = 96

      const occupiedBounds = frames.map((existingFrame) => {
        const existingDefaults = getDefaultFrameSize(existingFrame)
        return {
          left: existingFrame.x,
          right: existingFrame.x + (existingFrame.width ?? existingDefaults.width),
          top: existingFrame.y,
          bottom: existingFrame.y + (existingFrame.height ?? existingDefaults.height),
        }
      })

      const candidateLimit = Math.max(frames.length + 6, 12)
      for (let row = 0; row < candidateLimit; row += 1) {
        for (let column = 0; column < candidateLimit; column += 1) {
          const candidateLeft = baseX + column * (frameWidth + frameGapX)
          const candidateTop = baseY + row * (frameHeight + frameGapY)
          const candidateRight = candidateLeft + frameWidth
          const candidateBottom = candidateTop + frameHeight

          const overlapsExistingFrame = occupiedBounds.some((occupied) => {
            const intersectsHorizontally = candidateLeft < occupied.right && candidateRight > occupied.left
            const intersectsVertically = candidateTop < occupied.bottom && candidateBottom > occupied.top
            return intersectsHorizontally && intersectsVertically
          })
          if (overlapsExistingFrame) continue

          return {
            x: candidateLeft + contentAnchorOffset.x,
            y: candidateTop + contentAnchorOffset.y,
          }
        }
      }

      return null
    })()

    const anchor = sectionAutoPlacementAnchor ?? nonSectionAutoPlacementAnchor
    if (!anchor) return

    const nextFrame: CanvasFrame = {
      ...pendingFrameDraft,
      id: `${Date.now()}-${Math.random()}`,
      x: Math.max(0, anchor.x - contentAnchorOffset.x),
      y: Math.max(-topBuffer, anchor.y - contentAnchorOffset.y),
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(nextFrame)
      setFrames((prev) => [...prev, persistedFrame])
      if (pendingFrameDraft.kind === 'section') {
        setPlacementA11yAnnouncement(
          existingSectionCount > 0
            ? 'Seksjon plassert automatisk ved siden av forrige seksjon.'
            : 'Seksjon plassert automatisk.',
        )
        window.requestAnimationFrame(() => {
          onAutoPlacedSection?.(persistedFrame)
        })
      } else {
        setPlacementA11yAnnouncement(`${pendingFrameDraft.label || 'Element'} ble plassert automatisk.`)
        window.requestAnimationFrame(() => {
          onFramePlaced?.(persistedFrame)
        })
      }
      setPendingFrameDraft(null)
      setPendingFramePlacementLabel(null)
      setPendingFramePointer(null)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre element i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }, [
    frames,
    getDefaultFrameSize,
    getNextSectionAutoPlacementPoint,
    getPendingFrameContentAnchorOffset,
    pendingFrameDraft,
    persistFrame,
    setFrames,
    setIsSavingCanvasItem,
    setPlacementA11yAnnouncement,
    onAutoPlacedSection,
    onFramePlaced,
    setPendingFrameDraft,
    setPendingFramePlacementLabel,
    setPendingFramePointer,
    setSyncError,
    topBuffer,
  ])

  const importPendingCsvAt = useCallback(
    async (baseX: number, baseY: number) => {
      const activePendingCsvImport = pendingCsvStickyImportRef.current
      if (!activePendingCsvImport) return
      if (isImportingStickyCsvRef.current) return

      const stickyWidth = 320
      const stickyHeight = 180
      const columnGap = 24
      const stickyGap = 18
      const cardsPerRow = 2
      const sectionTitle = activePendingCsvImport.sectionTitle.trim()
      const sectionLabel = sectionTitle || getNextAutoSectionLabel(frames)
      const sectionPaddingX = 24
      const sectionPaddingBottom = 24
      const importCategoryId = activeCanvasCategoryId ?? undefined
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
          categoryId: importCategoryId,
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
          categoryId: importCategoryId,
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
              categoryId: importCategoryId,
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
        categoryId: importCategoryId,
        x: baseX,
        y: baseY,
        width: Math.max(420, Math.ceil(rightEdge - baseX + sectionPaddingX)),
        height: Math.max(sectionHeaderHeight + 160, Math.ceil(bottomEdge - baseY + sectionPaddingBottom)),
        refreshNonce: 0,
      }
      const optimisticSectionFrame: CanvasFrame = {
        ...sectionFrame,
        width: 640,
        height: 280,
      }
      const importPlaceholderFrame: CanvasFrame = {
        id: `csv-import-placeholder-${timestampSeed}`,
        kind: 'text',
        label: 'Import pågår',
        textContent: `Importerer ${importedFrames.length} elementer...`,
        categoryId: importCategoryId,
        x: contentStartX,
        y: contentStartY,
        width: 520,
        height: 120,
        refreshNonce: 0,
      }

      const framesToPersist: CanvasFrame[] = [sectionFrame, ...importedFrames]
      const persistedFrames: CanvasFrame[] = []
      const optimisticFrameIds = new Set([sectionFrame.id, importPlaceholderFrame.id])

      const persistWithRetry = async (frame: CanvasFrame): Promise<CanvasFrame | null> => {
        let lastError: unknown = null
        for (let attempt = 1; attempt <= CSV_IMPORT_MAX_PERSIST_ATTEMPTS; attempt += 1) {
          try {
            return await persistFrame(frame)
          } catch (error) {
            lastError = error
            if (attempt >= CSV_IMPORT_MAX_PERSIST_ATTEMPTS) break
            const delayMs = CSV_IMPORT_RETRY_BASE_DELAY_MS * attempt
            await new Promise((resolve) => window.setTimeout(resolve, delayMs))
          }
        }
        console.error('CSV import frame persist failed:', lastError)
        return null
      }
      const reconcileOptimisticFrames = () => {
        setFrames((prev) => [...prev.filter((frame) => !optimisticFrameIds.has(frame.id)), ...persistedFrames])
      }

      try {
        setPendingFramePointer(null)
        isImportingStickyCsvRef.current = true
        setIsImportingStickyCsv(true)
        setIsSavingCanvasItem(true)
        setImportStickyProgressTotal(framesToPersist.length)
        setImportStickyProgressCurrent(0)
        setSyncError(null)
        setFrames((prev) => [...prev, optimisticSectionFrame, importPlaceholderFrame])

        for (const [frameIndex, frame] of framesToPersist.entries()) {
          const persistedFrame = await persistWithRetry(frame)
          if (persistedFrame) {
            persistedFrames.push(persistedFrame)
          }
          setImportStickyProgressCurrent(frameIndex + 1)
        }
        reconcileOptimisticFrames()

        if (persistedFrames.length === 0) {
          setSyncError('Kunne ikke importere CSV til canvas')
          return
        }

        cancelPendingFramePlacement()

        const failedCount = framesToPersist.length - persistedFrames.length
        if (failedCount > 0) {
          setSyncError(
            `Importerte ${persistedFrames.length} av ${framesToPersist.length}. ${failedCount} elementer feilet.`,
          )
        }
      } catch (error) {
        reconcileOptimisticFrames()
        if (persistedFrames.length > 0) {
          cancelPendingFramePlacement()
          const failedCount = framesToPersist.length - persistedFrames.length
          setSyncError(
            `Importen ble avbrutt. Importerte ${persistedFrames.length} av ${framesToPersist.length}. ${failedCount} elementer feilet.`,
          )
        } else {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke importere CSV til canvas')
        }
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
      getDefaultFrameSize,
      getNextAutoSectionLabel,
      activeCanvasCategoryId,
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
    ],
  )

  const handlePlacePendingCsvImport = useCallback(
    async (clientX: number, clientY: number) => {
      const pointer = getCanvasPointerPosition(clientX, clientY)
      if (!pointer) return
      await importPendingCsvAt(Math.max(0, pointer.x), Math.max(-topBuffer, pointer.y))
    },
    [getCanvasPointerPosition, importPendingCsvAt, topBuffer],
  )

  const handleAutoPlacePendingCsvImport = useCallback(async () => {
    const activePendingCsvImport = pendingCsvStickyImportRef.current
    if (!activePendingCsvImport) return
    if (isImportingStickyCsvRef.current) return

    const sectionDefaults = getDefaultFrameSize('section')
    const autoPoint = getNextSectionAutoPlacementPoint(sectionDefaults.width, sectionDefaults.height)
    if (!autoPoint) return

    await importPendingCsvAt(autoPoint.x, Math.max(-topBuffer, autoPoint.y))
  }, [
    getDefaultFrameSize,
    getNextSectionAutoPlacementPoint,
    importPendingCsvAt,
    isImportingStickyCsvRef,
    pendingCsvStickyImportRef,
    topBuffer,
  ])

  const handleAutoPlaceAnyPendingFrame = useCallback(async () => {
    if (pendingFrameDraft) {
      await handleAutoPlacePendingFrame()
      return
    }
    if (pendingCsvStickyImport) {
      await handleAutoPlacePendingCsvImport()
    }
  }, [handleAutoPlacePendingCsvImport, handleAutoPlacePendingFrame, pendingCsvStickyImport, pendingFrameDraft])

  useEffect(() => {
    if (!pendingFrameDraft && !pendingCsvStickyImport) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isImportingStickyCsvRef.current) return
      if (event.key === 'Escape') {
        cancelPendingFramePlacement()
        return
      }
      if (event.key === 'Enter' && (pendingFrameDraft || pendingCsvStickyImport)) {
        event.preventDefault()
        void handleAutoPlaceAnyPendingFrame()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    cancelPendingFramePlacement,
    handleAutoPlaceAnyPendingFrame,
    isImportingStickyCsvRef,
    pendingCsvStickyImport,
    pendingFrameDraft,
  ])

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
      const clickedInsideFrame = Boolean(target.closest('[data-canvas-frame-root="true"]'))
      const clickedInteractiveControl = Boolean(target.closest('button, a, input, textarea, select'))
      if (clickedInsideFrame || clickedInteractiveControl) return
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.closest('[data-canvas-frame-root="true"]')) {
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
    handleAutoPlacePendingFrame: handleAutoPlaceAnyPendingFrame,
  }
}

export default useCanvasPlacement
