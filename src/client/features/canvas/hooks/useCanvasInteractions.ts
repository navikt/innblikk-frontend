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

const DRAG_PERSIST_THRESHOLD_PX = 3

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
  dir: 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w'
}

type UseCanvasInteractionsParams = {
  isInteractionLocked: boolean
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
  getCanvasPointerPosition: (clientX: number, clientY: number) => { x: number; y: number } | null
  getDefaultFrameSize: (frameOrKind: CanvasFrame | CanvasFrame['kind']) => {
    width: number
    height: number
    minWidth: number
    minHeight: number
  }
  getFrameBounds: (frame: CanvasFrame) => { left: number; top: number; right: number; bottom: number }
  findContainingGridSectionId: (frame: CanvasFrame, framePool: CanvasFrame[]) => string | null
  compareFramesForSectionOrder: (a: CanvasFrame, b: CanvasFrame) => number
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
  handleResizeStart: (
    event: React.MouseEvent | React.TouchEvent,
    frame: CanvasFrame,
    dir?: 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w',
  ) => void
  handleAdjustHeadingFontSize: (id: string, delta: number) => void
  handleSetHeadingFontSize: (id: string, sizePx: number) => void
}

const useCanvasInteractions = ({
  isInteractionLocked,
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
  getCanvasPointerPosition,
  getDefaultFrameSize,
  getFrameBounds,
  findContainingGridSectionId,
  compareFramesForSectionOrder,
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
      if (isInteractionLocked) return
      if ('button' in event && event.button !== 0) return

      const interactionTarget = event.target
      if (interactionTarget instanceof Element) {
        const interactiveAncestor = interactionTarget.closest(
          [
            'button',
            'a',
            'input',
            'textarea',
            'select',
            'option',
            'label',
            'summary',
            '[role="button"]',
            '[role="menuitem"]',
            '[contenteditable="true"]',
            '[data-canvas-no-drag="true"]',
          ].join(','),
        )
        if (interactiveAncestor) return
      }

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
      isInteractionLocked,
      selectedFrameIds,
      setDragState,
      setSelectedFrameIds,
      visibleFrames,
    ],
  )

  const handleResizeStart = useCallback(
    (
      event: React.MouseEvent | React.TouchEvent,
      frame: CanvasFrame,
      dir: 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w' = 'se',
    ) => {
      if (isInteractionLocked) return
      event.preventDefault()
      event.stopPropagation()
      const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX
      const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY
      if (clientX === undefined || clientY === undefined) return
      const defaults = getDefaultFrameSize(frame)
      setResizeState({
        id: frame.id,
        startX: clientX,
        startY: clientY,
        startFrameX: frame.x,
        startFrameY: frame.y,
        startWidth: frame.kind === 'heading' ? getHeadingFrameWidth(frame) : (frame.width ?? defaults.width),
        startHeight: frame.kind === 'heading' ? getHeadingFrameHeight(frame) : (frame.height ?? defaults.height),
        dir,
      })
    },
    [getDefaultFrameSize, getHeadingFrameHeight, getHeadingFrameWidth, isInteractionLocked, setResizeState],
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

  const handleSetHeadingFontSize = useCallback(
    (id: string, sizePx: number) => {
      const currentFrame = frames.find((frame) => frame.id === id)
      if (!currentFrame || currentFrame.kind !== 'heading') return

      const currentSize = currentFrame.headingFontSize ?? HEADING_FONT_SIZE_DEFAULT
      const nextSize = Math.max(HEADING_FONT_SIZE_MIN, Math.min(HEADING_FONT_SIZE_MAX, sizePx))
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
      const movedFrameIds = movedFrames
        .filter((frame) => {
          const start = dragState.frameStartPositions[frame.id]
          if (!start) return false
          return (
            Math.abs(frame.x - start.x) >= DRAG_PERSIST_THRESHOLD_PX ||
            Math.abs(frame.y - start.y) >= DRAG_PERSIST_THRESHOLD_PX
          )
        })
        .map((frame) => frame.id)
      const movedFrameIdSet = new Set(movedFrameIds)

      if (movedFrameIds.length === 0) {
        setFrames((prev) =>
          prev.map((frame) => {
            const start = dragState.frameStartPositions[frame.id]
            if (!start) return frame
            if (frame.x === start.x && frame.y === start.y) return frame
            return {
              ...frame,
              x: start.x,
              y: start.y,
            }
          }),
        )
        setDragState(null)
        return
      }

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
        if (!movedFrameIdSet.has(movedFrame.id)) return
        const snapped = applyStickyColumnSnap(movedFrame)
        const normalizedForManualReorder: CanvasFrame =
          snapped.kind === 'sticky' && Number.isFinite(snapped.finalVoteRank)
            ? {
                ...snapped,
                finalVoteRank: undefined,
              }
            : snapped
        framesToPersistById.set(movedFrame.id, normalizedForManualReorder)
      })

      const framesAfterSnap = framesRef.current.map((frame) => framesToPersistById.get(frame.id) ?? frame)

      const affectedGridSectionIds = new Set<string>()
      movedFrames.forEach((movedFrame) => {
        if (!movedFrameIdSet.has(movedFrame.id)) return
        const originalFrame = originalMovedFramesById.get(movedFrame.id) ?? movedFrame
        const previousSectionId = findContainingGridSectionId(originalFrame, framesRef.current)
        if (previousSectionId) affectedGridSectionIds.add(previousSectionId)
        const nextFrame = framesToPersistById.get(movedFrame.id) ?? movedFrame
        const nextSectionId = findContainingGridSectionId(nextFrame, framesAfterSnap)
        if (nextSectionId) affectedGridSectionIds.add(nextSectionId)
      })

      const { nextFrames: reflowedFrames, changedFrameIds } = reflowGridSections(framesAfterSnap, [
        ...affectedGridSectionIds,
      ])
      changedFrameIds.forEach((frameId) => {
        const reflowedFrame = reflowedFrames.find((frame) => frame.id === frameId)
        if (!reflowedFrame) return
        framesToPersistById.set(frameId, reflowedFrame)
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
    compareFramesForSectionOrder,
    dragState,
    findContainingGridSectionId,
    framesRef,
    getCanvasPointerPosition,
    persistFrame,
    reflowGridSections,
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

    const onPointerMove = (event: MouseEvent | TouchEvent) => {
      if ('buttons' in event && event.buttons === 0) {
        stopResize()
        return
      }
      const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX
      const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY
      if (clientX === undefined || clientY === undefined) return
      if ('touches' in event) {
        event.preventDefault()
      }
      setFrames((prev) =>
        (() => {
          const nextFrames = prev.map((frame) => {
            if (frame.id !== resizeState.id) return frame
            const defaults = getDefaultFrameSize(frame)
            const deltaX = (clientX - resizeState.startX) / canvasZoom
            const deltaY = (clientY - resizeState.startY) / canvasZoom
            if (frame.kind === 'heading') {
              const isWestResize = resizeState.dir === 'w' || resizeState.dir === 'sw' || resizeState.dir === 'nw'
              const nextWidth = isWestResize
                ? Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, resizeState.startWidth - deltaX))
                : Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, resizeState.startWidth + deltaX))
              const nextX = isWestResize
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

            if (resizeState.dir === 'e' || resizeState.dir === 'se' || resizeState.dir === 'ne') {
              nextWidth = Math.max(defaults.minWidth, resizeState.startWidth + deltaX)
            }

            if (resizeState.dir === 'w' || resizeState.dir === 'sw' || resizeState.dir === 'nw') {
              nextWidth = Math.max(defaults.minWidth, resizeState.startWidth - deltaX)
              nextX = resizeState.startFrameX + (resizeState.startWidth - nextWidth)
            }

            if (resizeState.dir === 's' || resizeState.dir === 'se' || resizeState.dir === 'sw') {
              nextHeight = Math.max(defaults.minHeight, resizeState.startHeight + deltaY)
            }

            if (resizeState.dir === 'n' || resizeState.dir === 'ne' || resizeState.dir === 'nw') {
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

    const onPointerUp = () => stopResize()
    const onWindowBlur = () => stopResize()

    window.addEventListener('mousemove', onPointerMove as EventListener)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('touchmove', onPointerMove as EventListener, { passive: false })
    window.addEventListener('touchend', onPointerUp)
    window.addEventListener('touchcancel', onPointerUp)
    document.addEventListener('mousemove', onPointerMove as EventListener, true)
    document.addEventListener('mouseup', onPointerUp, true)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('mousemove', onPointerMove as EventListener)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('touchmove', onPointerMove as EventListener)
      window.removeEventListener('touchend', onPointerUp)
      window.removeEventListener('touchcancel', onPointerUp)
      document.removeEventListener('mousemove', onPointerMove as EventListener, true)
      document.removeEventListener('mouseup', onPointerUp, true)
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
      if (target.closest('[data-canvas-frame-root="true"]')) return
      if (target.closest('button, a, input, textarea, select, [role="menu"], [role="menuitem"]')) return
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.closest('[data-canvas-frame-root="true"]')) {
        activeElement.blur()
      }
      setSelectedFrameIds([])
    }

    window.addEventListener('mousedown', onWindowMouseDown)
    return () => window.removeEventListener('mousedown', onWindowMouseDown)
  }, [selectedFrameIds, setSelectedFrameIds])

  useEffect(() => {
    if (selectedFrameIds.length === 0 && !selectionBox) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || false
      if (isTypingTarget) return

      event.preventDefault()
      setSelectionBox(null)
      setSelectedFrameIds([])
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedFrameIds.length, selectionBox, setSelectedFrameIds, setSelectionBox])

  return {
    getHeadingFrameFontSize,
    getHeadingFrameWidth,
    getHeadingFrameHeight,
    handleDragStart,
    handleResizeStart,
    handleAdjustHeadingFontSize,
    handleSetHeadingFontSize,
  }
}

export default useCanvasInteractions
export type { CanvasDragState, CanvasResizeState, CanvasSelectionBox }
