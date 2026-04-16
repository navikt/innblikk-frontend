import { useCallback, useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type React from 'react'
import type { CanvasDeleteTarget, CanvasFrame } from '../model/types.ts'
import {
  CANVAS_TOP_BUFFER,
  HEADING_FONT_SIZE_DEFAULT,
  HEADING_FONT_SIZE_MAX,
  HEADING_FONT_SIZE_MIN,
  HEADING_TEXT_CHAR_WIDTH_FACTOR,
  HEADING_TEXT_EXTRA_WIDTH,
  HEADING_TEXT_MAX_WIDTH,
  HEADING_TEXT_MIN_WIDTH,
  HEADING_TEXT_VERTICAL_PADDING,
  PLANNER_COLUMN_LABEL_PREFIX,
} from '../utils/canvasUtils.ts'

type CanvasDragState = {
  ids: string[]
  pointerStartX: number
  pointerStartY: number
  frameStartPositions: Record<string, { x: number; y: number }>
}

type CanvasSelectionBox = {
  startX: number
  startY: number
  currentX: number
  currentY: number
  additive: boolean
}

type CanvasResizeState = {
  id: string
  startX: number
  startY: number
  startFrameX: number
  startFrameY: number
  startWidth: number
  startHeight: number
  dir: 'se' | 'sw' | 'ne' | 'nw'
}

type GridSectionLayoutConfig = {
  paddingX: number
  paddingTop: number
  paddingBottom: number
  gapX: number
  gapY: number
}

type UseCanvasInteractionsParams = {
  isDotVotingActive: boolean
  frames: CanvasFrame[]
  framesRef: MutableRefObject<CanvasFrame[]>
  visibleFrames: CanvasFrame[]
  dragState: CanvasDragState | null
  setDragState: Dispatch<SetStateAction<CanvasDragState | null>>
  selectedFrameIds: string[]
  setSelectedFrameIds: Dispatch<SetStateAction<string[]>>
  selectionBox: CanvasSelectionBox | null
  setSelectionBox: Dispatch<SetStateAction<CanvasSelectionBox | null>>
  resizeState: CanvasResizeState | null
  setResizeState: Dispatch<SetStateAction<CanvasResizeState | null>>
  canvasZoom: number
  gridSectionLayoutConfig: GridSectionLayoutConfig
  gridSectionLayoutMinColumnWidth: number
  getCanvasPointerPosition: (clientX: number, clientY: number) => { x: number; y: number } | null
  getDefaultFrameSize: (frameOrKind: CanvasFrame | CanvasFrame['kind']) => {
    width: number
    height: number
    minWidth: number
    minHeight: number
  }
  getFrameBounds: (frame: CanvasFrame) => { left: number; top: number; right: number; bottom: number }
  getFrameBoundsForLayout: (frame: CanvasFrame) => { left: number; top: number; right: number; bottom: number }
  getGridLayoutFrameHeight: (frame: CanvasFrame) => number
  getGridSectionTopSpacing: (frame: CanvasFrame) => number
  compareFramesForSectionOrder: (a: CanvasFrame, b: CanvasFrame) => number
  compareFramesForGridLayout: (a: CanvasFrame, b: CanvasFrame) => number
  reflowGridSections: (
    inputFrames: CanvasFrame[],
    sectionIds: string[],
  ) => { nextFrames: CanvasFrame[]; changedFrameIds: Set<string> }
  setFrames: Dispatch<SetStateAction<CanvasFrame[]>>
  persistFrame: (frame: CanvasFrame) => Promise<CanvasFrame>
  setSyncError: Dispatch<SetStateAction<string | null>>
  setDeleteTarget: Dispatch<SetStateAction<CanvasDeleteTarget | null>>
}

type UseCanvasInteractionsResult = {
  getHeadingFrameFontSize: (frame: CanvasFrame) => number
  getHeadingFrameWidth: (frame: CanvasFrame) => number
  getHeadingFrameHeight: (frame: CanvasFrame) => number
  handleDragStart: (event: React.MouseEvent | React.TouchEvent, frame: CanvasFrame) => void
  handleResizeStart: (event: React.MouseEvent, frame: CanvasFrame, dir?: 'se' | 'sw' | 'ne' | 'nw') => void
  handleAdjustHeadingFontSize: (id: string, delta: number) => void
}

const useCanvasInteractions = ({
  isDotVotingActive,
  frames,
  framesRef,
  visibleFrames,
  dragState,
  setDragState,
  selectedFrameIds,
  setSelectedFrameIds,
  selectionBox,
  setSelectionBox,
  resizeState,
  setResizeState,
  canvasZoom,
  gridSectionLayoutConfig,
  gridSectionLayoutMinColumnWidth,
  getCanvasPointerPosition,
  getDefaultFrameSize,
  getFrameBounds,
  getFrameBoundsForLayout,
  getGridLayoutFrameHeight,
  getGridSectionTopSpacing,
  compareFramesForSectionOrder,
  compareFramesForGridLayout,
  reflowGridSections,
  setFrames,
  persistFrame,
  setSyncError,
  setDeleteTarget,
}: UseCanvasInteractionsParams): UseCanvasInteractionsResult => {
  const getHeadingFrameFontSize = useCallback((frame: CanvasFrame): number => {
    if (frame.kind !== 'heading') return HEADING_FONT_SIZE_DEFAULT
    return Math.max(
      HEADING_FONT_SIZE_MIN,
      Math.min(HEADING_FONT_SIZE_MAX, frame.headingFontSize ?? HEADING_FONT_SIZE_DEFAULT),
    )
  }, [])

  const getHeadingFrameWidth = useCallback(
    (frame: CanvasFrame): number => {
      if (frame.kind !== 'heading') return frame.width ?? getDefaultFrameSize(frame).width

      const headingText = (frame.headingText || frame.label || '').trim()
      const fontSize = getHeadingFrameFontSize(frame)
      const estimatedTextWidth =
        Math.ceil(headingText.length * (fontSize * HEADING_TEXT_CHAR_WIDTH_FACTOR)) + HEADING_TEXT_EXTRA_WIDTH
      const autoWidth = Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, estimatedTextWidth))
      const defaultHeadingSize = getDefaultFrameSize('heading')
      const hasLegacyDefaultSize =
        Number(frame.width) === defaultHeadingSize.width &&
        (frame.height ?? defaultHeadingSize.height) === defaultHeadingSize.height

      if (Number.isFinite(frame.width) && !hasLegacyDefaultSize) {
        return Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, Number(frame.width)))
      }

      return autoWidth
    },
    [getDefaultFrameSize, getHeadingFrameFontSize],
  )

  const getHeadingFrameHeight = useCallback(
    (frame: CanvasFrame): number => {
      if (frame.kind !== 'heading') return frame.height ?? getDefaultFrameSize(frame).height

      const headingText = (frame.headingText || frame.label || '').trim()
      const width = getHeadingFrameWidth(frame)
      const fontSize = getHeadingFrameFontSize(frame)
      const usableWidth = Math.max(1, width - HEADING_TEXT_EXTRA_WIDTH)
      const charsPerLine = Math.max(12, Math.floor(usableWidth / (fontSize * HEADING_TEXT_CHAR_WIDTH_FACTOR)))
      const lineCount = headingText
        ? headingText.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
        : 1
      return Math.max(28, lineCount * Math.ceil(fontSize * 1.05) + HEADING_TEXT_VERTICAL_PADDING)
    },
    [getDefaultFrameSize, getHeadingFrameFontSize, getHeadingFrameWidth],
  )

  const handleDragStart = useCallback(
    (event: React.MouseEvent | React.TouchEvent, frame: CanvasFrame) => {
      if (isDotVotingActive) return
      if ('button' in event && event.button !== 0) return

      const isAdditiveSelection = event.metaKey || event.ctrlKey
      if (isAdditiveSelection) {
        event.preventDefault()
        event.stopPropagation()
        setSelectedFrameIds((current) =>
          current.includes(frame.id) ? current.filter((id) => id !== frame.id) : [...current, frame.id],
        )
        return
      }

      const clientX = 'clientX' in event ? event.clientX : event.touches[0]?.clientX
      const clientY = 'clientY' in event ? event.clientY : event.touches[0]?.clientY
      if (clientX === undefined || clientY === undefined) return

      const pointer = getCanvasPointerPosition(clientX, clientY)
      if (!pointer) return

      const selectedIds = selectedFrameIds.includes(frame.id) ? selectedFrameIds : [frame.id]
      const sectionContainedIds =
        frame.kind === 'section'
          ? visibleFrames
              .filter((candidate) => {
                if (candidate.id === frame.id || candidate.kind === 'section') return false
                const sectionBounds = getFrameBounds(frame)
                const candidateBounds = getFrameBounds(candidate)
                return (
                  candidateBounds.left >= sectionBounds.left &&
                  candidateBounds.right <= sectionBounds.right &&
                  candidateBounds.top >= sectionBounds.top &&
                  candidateBounds.bottom <= sectionBounds.bottom
                )
              })
              .map((candidate) => candidate.id)
          : []
      const idsToMove = [...new Set([...selectedIds, ...sectionContainedIds])]
      const frameStartPositions = Object.fromEntries(
        frames
          .filter((item) => idsToMove.includes(item.id))
          .map((item) => [item.id, { x: item.x, y: item.y }] as const),
      )
      setSelectedFrameIds(idsToMove)
      setDragState({
        ids: idsToMove,
        pointerStartX: pointer.x,
        pointerStartY: pointer.y,
        frameStartPositions,
      })
    },
    [
      frames,
      getCanvasPointerPosition,
      getFrameBounds,
      isDotVotingActive,
      selectedFrameIds,
      setDragState,
      setSelectedFrameIds,
      visibleFrames,
    ],
  )

  const handleResizeStart = useCallback(
    (event: React.MouseEvent, frame: CanvasFrame, dir: 'se' | 'sw' | 'ne' | 'nw' = 'se') => {
      if (isDotVotingActive) return
      event.preventDefault()
      event.stopPropagation()
      const defaults = getDefaultFrameSize(frame)
      setResizeState({
        id: frame.id,
        startX: event.clientX,
        startY: event.clientY,
        startFrameX: frame.x,
        startFrameY: frame.y,
        startWidth: frame.kind === 'heading' ? getHeadingFrameWidth(frame) : (frame.width ?? defaults.width),
        startHeight: frame.kind === 'heading' ? getHeadingFrameHeight(frame) : (frame.height ?? defaults.height),
        dir,
      })
    },
    [getDefaultFrameSize, getHeadingFrameHeight, getHeadingFrameWidth, isDotVotingActive, setResizeState],
  )

  const handleAdjustHeadingFontSize = useCallback(
    (id: string, delta: number) => {
      const currentFrame = frames.find((frame) => frame.id === id)
      if (!currentFrame || currentFrame.kind !== 'heading') return

      const currentSize = currentFrame.headingFontSize ?? HEADING_FONT_SIZE_DEFAULT
      const nextSize = Math.max(HEADING_FONT_SIZE_MIN, Math.min(HEADING_FONT_SIZE_MAX, currentSize + delta))
      if (nextSize === currentSize) return

      const nextFrame: CanvasFrame = {
        ...currentFrame,
        headingFontSize: nextSize,
        refreshNonce: currentFrame.refreshNonce + 1,
      }

      setFrames((prev) => prev.map((frame) => (frame.id === id ? nextFrame : frame)))
      void persistFrame(nextFrame).catch((error) => {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre skriftstorrelse')
      })
    },
    [frames, persistFrame, setFrames, setSyncError],
  )

  useEffect(() => {
    if (!dragState) return

    const onPointerMove = (event: MouseEvent | TouchEvent) => {
      const clientX = 'clientX' in event ? event.clientX : event.touches[0]?.clientX
      const clientY = 'clientY' in event ? event.clientY : event.touches[0]?.clientY
      if (clientX === undefined || clientY === undefined) return

      const pointer = getCanvasPointerPosition(clientX, clientY)
      if (!pointer) return
      const deltaX = pointer.x - dragState.pointerStartX
      const deltaY = pointer.y - dragState.pointerStartY

      setFrames((prev) =>
        prev.map((frame) =>
          dragState.ids.includes(frame.id)
            ? {
                ...frame,
                x: Math.max(0, (dragState.frameStartPositions[frame.id]?.x ?? frame.x) + deltaX),
                y: Math.max(-CANVAS_TOP_BUFFER, (dragState.frameStartPositions[frame.id]?.y ?? frame.y) + deltaY),
              }
            : frame,
        ),
      )
    }

    const onPointerUp = () => {
      const movedFrames = framesRef.current.filter((frame) => dragState.ids.includes(frame.id))
      const framesToPersistById = new Map(movedFrames.map((frame) => [frame.id, frame]))
      const originalMovedFramesById = new Map(
        movedFrames.map((frame) => [
          frame.id,
          {
            ...frame,
            x: dragState.frameStartPositions[frame.id]?.x ?? frame.x,
            y: dragState.frameStartPositions[frame.id]?.y ?? frame.y,
          },
        ]),
      )

      const applyStickyColumnSnap = (movedFrame: CanvasFrame): CanvasFrame => {
        if (movedFrame.kind !== 'sticky') return movedFrame
        const getFrameRect = (frame: CanvasFrame) => {
          const fallbackSize =
            frame.kind === 'figure'
              ? { width: 240, height: 200 }
              : frame.kind === 'sticky'
                ? { width: 360, height: 180 }
                : { width: 320, height: 200 }
          const width = frame.width ?? fallbackSize.width
          const height = frame.height ?? fallbackSize.height
          return {
            left: frame.x,
            top: frame.y,
            right: frame.x + width,
            bottom: frame.y + height,
            width,
            height,
          }
        }
        const movedRect = getFrameRect(movedFrame)
        const movedCenterX = movedRect.left + movedRect.width / 2
        const movedCenterY = movedRect.top + movedRect.height / 2

        const targetColumn = framesRef.current.find((frame) => {
          if (
            frame.kind !== 'figure' ||
            frame.figureType !== 'square' ||
            !frame.label.startsWith(PLANNER_COLUMN_LABEL_PREFIX)
          )
            return false
          const columnRect = getFrameRect(frame)
          return (
            movedCenterX >= columnRect.left &&
            movedCenterX <= columnRect.right &&
            movedCenterY >= columnRect.top &&
            movedCenterY <= columnRect.bottom
          )
        })

        if (!targetColumn) return movedFrame
        {
          const targetRect = getFrameRect(targetColumn)
          const stickyGap = 14
          const columnPaddingX = 16
          const columnPaddingTop = 72
          const stickyFramesInColumn = framesRef.current
            .filter((frame) => {
              if (frame.id === movedFrame.id || frame.kind !== 'sticky') return false
              const stickyRect = getFrameRect(frame)
              const stickyCenterX = stickyRect.left + stickyRect.width / 2
              const stickyCenterY = stickyRect.top + stickyRect.height / 2
              return (
                stickyCenterX >= targetRect.left &&
                stickyCenterX <= targetRect.right &&
                stickyCenterY >= targetRect.top &&
                stickyCenterY <= targetRect.bottom
              )
            })
            .sort(compareFramesForSectionOrder)
          const stickyHeight = movedRect.height
          return {
            ...movedFrame,
            x: Math.max(0, targetRect.left + columnPaddingX),
            y: Math.max(
              -CANVAS_TOP_BUFFER,
              targetRect.top + columnPaddingTop + stickyFramesInColumn.length * (stickyHeight + stickyGap),
            ),
          }
        }
      }

      movedFrames.forEach((movedFrame) => {
        const snapped = applyStickyColumnSnap(movedFrame)
        framesToPersistById.set(movedFrame.id, snapped)
      })

      const resolveFrameAfterSnap = (frameId: string): CanvasFrame | null => {
        const moved = framesToPersistById.get(frameId)
        if (moved) return moved
        return framesRef.current.find((frame) => frame.id === frameId) ?? null
      }

      const resolveContainingGridSection = (
        frame: CanvasFrame,
        resolveFrame: (frameId: string) => CanvasFrame | null,
      ): CanvasFrame | null => {
        if (frame.kind === 'section') return null
        const frameBounds = getFrameBoundsForLayout(frame)
        const frameCenterX = (frameBounds.left + frameBounds.right) / 2
        const frameCenterY = (frameBounds.top + frameBounds.bottom) / 2
        return (
          framesRef.current.find((candidate) => {
            const section = resolveFrame(candidate.id)
            if (!section || section.kind !== 'section' || section.sectionLayout !== 'grid') return false
            if ((section.categoryId ?? null) !== (frame.categoryId ?? null)) return false
            const sectionBounds = getFrameBoundsForLayout(section)
            return (
              frameCenterX >= sectionBounds.left &&
              frameCenterX <= sectionBounds.right &&
              frameCenterY >= sectionBounds.top &&
              frameCenterY <= sectionBounds.bottom
            )
          }) ?? null
        )
      }

      const affectedGridSectionIds = new Set<string>()
      movedFrames.forEach((movedFrame) => {
        const originalFrame = originalMovedFramesById.get(movedFrame.id) ?? movedFrame
        const previousSection = resolveContainingGridSection(
          originalFrame,
          (id) => framesRef.current.find((f) => f.id === id) ?? null,
        )
        if (previousSection) affectedGridSectionIds.add(previousSection.id)
        const nextFrame = resolveFrameAfterSnap(movedFrame.id)
        if (!nextFrame) return
        const nextSection = resolveContainingGridSection(nextFrame, resolveFrameAfterSnap)
        if (nextSection) affectedGridSectionIds.add(nextSection.id)
      })

      const reflowGridSection = (sectionId: string) => {
        const sectionFrame = resolveFrameAfterSnap(sectionId)
        if (!sectionFrame || sectionFrame.kind !== 'section' || sectionFrame.sectionLayout !== 'grid') return

        const sectionBounds = getFrameBoundsForLayout(sectionFrame)
        const contentLeft = sectionBounds.left + gridSectionLayoutConfig.paddingX
        const contentRight = sectionBounds.right - gridSectionLayoutConfig.paddingX
        const contentTop = sectionBounds.top + gridSectionLayoutConfig.paddingTop

        const containedFrames = framesRef.current
          .map((frame) => resolveFrameAfterSnap(frame.id) ?? frame)
          .filter((frame): frame is CanvasFrame => Boolean(frame))
          .filter((frame) => {
            if (frame.id === sectionId || frame.kind === 'section') return false
            if ((frame.categoryId ?? null) !== (sectionFrame.categoryId ?? null)) return false
            const bounds = getFrameBoundsForLayout(frame)
            const centerX = (bounds.left + bounds.right) / 2
            const centerY = (bounds.top + bounds.bottom) / 2
            return (
              centerX >= sectionBounds.left &&
              centerX <= sectionBounds.right &&
              centerY >= sectionBounds.top &&
              centerY <= sectionBounds.bottom
            )
          })
          .sort(compareFramesForGridLayout)

        const contentWidth = Math.max(1, contentRight - contentLeft)
        const estimatedColumnCount = Math.max(
          1,
          Math.floor(
            (contentWidth + gridSectionLayoutConfig.gapX) /
              (gridSectionLayoutMinColumnWidth + gridSectionLayoutConfig.gapX),
          ),
        )
        const columnCount = Math.max(1, Math.min(estimatedColumnCount, containedFrames.length))
        const columnWidth =
          columnCount <= 1
            ? contentWidth
            : (contentWidth - gridSectionLayoutConfig.gapX * (columnCount - 1)) / columnCount
        const columnBottoms = Array.from({ length: columnCount }, () => contentTop)
        let contentBottomEdge = contentTop

        containedFrames.forEach((frame) => {
          const defaults = getDefaultFrameSize(frame)
          const width = frame.width ?? defaults.width
          const height = getGridLayoutFrameHeight(frame)

          const shouldSpanAllColumns = columnCount === 1 || width > columnWidth
          if (shouldSpanAllColumns) {
            const topSpacing = getGridSectionTopSpacing(frame)
            const nextY = Math.max(...columnBottoms) + topSpacing
            const nextFrame: CanvasFrame = {
              ...frame,
              x: Math.max(0, contentLeft),
              y: Math.max(-CANVAS_TOP_BUFFER, nextY),
              height,
            }
            const nextBottom = nextFrame.y + height + gridSectionLayoutConfig.gapY
            for (let index = 0; index < columnBottoms.length; index += 1) {
              columnBottoms[index] = nextBottom
            }
            contentBottomEdge = Math.max(contentBottomEdge, nextFrame.y + height)
            framesToPersistById.set(nextFrame.id, nextFrame)
            return
          }

          let targetColumn = 0
          for (let index = 1; index < columnBottoms.length; index += 1) {
            if (columnBottoms[index] < columnBottoms[targetColumn]) {
              targetColumn = index
            }
          }

          const nextX = contentLeft + targetColumn * (columnWidth + gridSectionLayoutConfig.gapX)
          const topSpacing = getGridSectionTopSpacing(frame)
          const nextY = columnBottoms[targetColumn] + topSpacing

          const nextFrame: CanvasFrame = {
            ...frame,
            x: Math.max(0, nextX),
            y: Math.max(-CANVAS_TOP_BUFFER, nextY),
            height,
          }
          columnBottoms[targetColumn] = nextFrame.y + height + gridSectionLayoutConfig.gapY
          contentBottomEdge = Math.max(contentBottomEdge, nextFrame.y + height)
          framesToPersistById.set(nextFrame.id, nextFrame)
        })

        const nextSectionFrame: CanvasFrame = {
          ...sectionFrame,
          height: Math.max(
            sectionFrame.height ?? getDefaultFrameSize(sectionFrame).height,
            Math.ceil(contentBottomEdge - sectionFrame.y + gridSectionLayoutConfig.paddingBottom),
          ),
        }
        framesToPersistById.set(nextSectionFrame.id, nextSectionFrame)
      }

      ;[...affectedGridSectionIds].forEach((sectionId) => {
        reflowGridSection(sectionId)
      })

      const framesToPersist = [...framesToPersistById.values()]
      setFrames((prev) =>
        prev.map((frame) => {
          const replacement = framesToPersistById.get(frame.id)
          return replacement ?? frame
        }),
      )
      void Promise.all(
        framesToPersist
          .filter((frame) => Boolean(frame.graphId))
          .map((frame) =>
            persistFrame(frame).catch((error) => {
              setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre posisjon i canvas')
              return frame
            }),
          ),
      )
      setDragState(null)
    }

    window.addEventListener('mousemove', onPointerMove as EventListener)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove as EventListener, { passive: false })
    window.addEventListener('touchend', onPointerUp)

    return () => {
      window.removeEventListener('mousemove', onPointerMove as EventListener)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove as EventListener)
      window.removeEventListener('touchend', onPointerUp)
    }
  }, [
    compareFramesForGridLayout,
    compareFramesForSectionOrder,
    dragState,
    framesRef,
    getCanvasPointerPosition,
    getDefaultFrameSize,
    getFrameBoundsForLayout,
    getGridLayoutFrameHeight,
    getGridSectionTopSpacing,
    gridSectionLayoutConfig,
    gridSectionLayoutMinColumnWidth,
    persistFrame,
    setDragState,
    setFrames,
    setSyncError,
  ])

  useEffect(() => {
    if (!resizeState) return

    let hasStopped = false
    const stopResize = () => {
      if (hasStopped) return
      hasStopped = true
      const resizedFrame = framesRef.current.find((frame) => frame.id === resizeState.id)
      if (resizedFrame?.kind === 'section' && resizedFrame.sectionLayout === 'grid') {
        const { nextFrames, changedFrameIds } = reflowGridSections(framesRef.current, [resizedFrame.id])
        setFrames(nextFrames)
        const framesToPersist = nextFrames.filter((frame) => changedFrameIds.has(frame.id) && Boolean(frame.graphId))
        void Promise.all(
          framesToPersist.map((frame) =>
            persistFrame(frame).catch((error) => {
              setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre seksjonsoppsett')
              return frame
            }),
          ),
        )
      } else if (resizedFrame?.graphId) {
        void persistFrame(resizedFrame).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre storrelse i canvas')
        })
      }
      setResizeState(null)
    }

    const onMouseMove = (event: MouseEvent) => {
      if (event.buttons === 0) {
        stopResize()
        return
      }
      setFrames((prev) =>
        (() => {
          const nextFrames = prev.map((frame) => {
            if (frame.id !== resizeState.id) return frame
            const defaults = getDefaultFrameSize(frame)
            const deltaX = (event.clientX - resizeState.startX) / canvasZoom
            const deltaY = (event.clientY - resizeState.startY) / canvasZoom
            if (frame.kind === 'heading') {
              const nextWidth = resizeState.dir.endsWith('w')
                ? Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, resizeState.startWidth - deltaX))
                : Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, resizeState.startWidth + deltaX))
              const nextX = resizeState.dir.endsWith('w')
                ? resizeState.startFrameX + (resizeState.startWidth - nextWidth)
                : resizeState.startFrameX
              return {
                ...frame,
                x: Math.max(0, nextX),
                width: nextWidth,
              }
            }
            let nextX = resizeState.startFrameX
            let nextY = resizeState.startFrameY
            let nextWidth = resizeState.startWidth
            let nextHeight = resizeState.startHeight

            if (resizeState.dir.endsWith('e')) {
              nextWidth = Math.max(defaults.minWidth, resizeState.startWidth + deltaX)
            }

            if (resizeState.dir.endsWith('w')) {
              nextWidth = Math.max(defaults.minWidth, resizeState.startWidth - deltaX)
              nextX = resizeState.startFrameX + (resizeState.startWidth - nextWidth)
            }

            if (resizeState.dir.startsWith('s')) {
              nextHeight = Math.max(defaults.minHeight, resizeState.startHeight + deltaY)
            }

            if (resizeState.dir.startsWith('n')) {
              nextHeight = Math.max(defaults.minHeight, resizeState.startHeight - deltaY)
              nextY = resizeState.startFrameY + (resizeState.startHeight - nextHeight)
            }

            return {
              ...frame,
              x: Math.max(0, nextX),
              y: Math.max(-CANVAS_TOP_BUFFER, nextY),
              width: nextWidth,
              height: nextHeight,
            }
          })

          const resizedSection = nextFrames.find(
            (frame) => frame.id === resizeState.id && frame.kind === 'section' && frame.sectionLayout === 'grid',
          )
          if (!resizedSection) return nextFrames
          return reflowGridSections(nextFrames, [resizedSection.id]).nextFrames
        })(),
      )
    }

    const onMouseUp = () => stopResize()
    const onWindowBlur = () => stopResize()

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [
    canvasZoom,
    framesRef,
    getDefaultFrameSize,
    persistFrame,
    reflowGridSections,
    resizeState,
    setFrames,
    setResizeState,
    setSyncError,
  ])

  useEffect(() => {
    if (!selectionBox) return

    const updateSelectionBox = (event: MouseEvent) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return
      setSelectionBox((current) => (current ? { ...current, currentX: pointer.x, currentY: pointer.y } : current))
    }

    const finalizeSelection = () => {
      const left = Math.min(selectionBox.startX, selectionBox.currentX)
      const right = Math.max(selectionBox.startX, selectionBox.currentX)
      const top = Math.min(selectionBox.startY, selectionBox.currentY)
      const bottom = Math.max(selectionBox.startY, selectionBox.currentY)
      const hasVisibleBox = right - left > 4 || bottom - top > 4
      const selectedIds = hasVisibleBox
        ? visibleFrames
            .filter((frame) => {
              const bounds = getFrameBounds(frame)
              return !(bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bottom)
            })
            .map((frame) => frame.id)
        : []
      setSelectedFrameIds((current) =>
        selectionBox.additive ? [...new Set([...current, ...selectedIds])] : selectedIds,
      )
      setSelectionBox(null)
    }

    window.addEventListener('mousemove', updateSelectionBox)
    window.addEventListener('mouseup', finalizeSelection)
    return () => {
      window.removeEventListener('mousemove', updateSelectionBox)
      window.removeEventListener('mouseup', finalizeSelection)
    }
  }, [getCanvasPointerPosition, getFrameBounds, selectionBox, setSelectedFrameIds, setSelectionBox, visibleFrames])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSelectAllShortcut =
        (event.key === 'a' || event.key === 'A') && (event.metaKey || event.ctrlKey) && !event.altKey
      if (!isSelectAllShortcut) return

      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || false
      if (isTypingTarget) return

      event.preventDefault()
      setSelectedFrameIds(visibleFrames.map((frame) => frame.id))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setSelectedFrameIds, visibleFrames])

  useEffect(() => {
    if (selectedFrameIds.length === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || false
      if (isTypingTarget) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      event.preventDefault()
      setDeleteTarget({
        type: 'frames',
        ids: selectedFrameIds,
        label: `${selectedFrameIds.length} valgte kort`,
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedFrameIds, setDeleteTarget])

  useEffect(() => {
    if (selectedFrameIds.length === 0) return

    const onWindowMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('article')) return
      if (target.closest('button, a, input, textarea, select, [role="menu"], [role="menuitem"]')) return
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.closest('article')) {
        activeElement.blur()
      }
      setSelectedFrameIds([])
    }

    window.addEventListener('mousedown', onWindowMouseDown)
    return () => window.removeEventListener('mousedown', onWindowMouseDown)
  }, [selectedFrameIds, setSelectedFrameIds])

  return {
    getHeadingFrameFontSize,
    getHeadingFrameWidth,
    getHeadingFrameHeight,
    handleDragStart,
    handleResizeStart,
    handleAdjustHeadingFontSize,
  }
}

export default useCanvasInteractions
export type { CanvasDragState, CanvasResizeState, CanvasSelectionBox, GridSectionLayoutConfig }
