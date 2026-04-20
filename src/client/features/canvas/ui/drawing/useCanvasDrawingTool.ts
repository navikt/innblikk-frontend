import { useCallback, useEffect, useRef, useState } from 'react'

export type CanvasDrawingPoint = { x: number; y: number }

export type CanvasDrawingStroke = {
  points: CanvasDrawingPoint[]
  color: string
  strokeWidth: number
}

type UseCanvasDrawingToolOptions = {
  getCanvasPointerPosition: (clientX: number, clientY: number) => CanvasDrawingPoint | null
  onCompleteDrawing: (params: { strokes: CanvasDrawingStroke[] }) => void | Promise<void>
  defaultColor: string
  defaultStrokeWidth: number
}

type UseCanvasDrawingToolResult = {
  isDrawingMode: boolean
  drawingStrokeColor: string
  drawingStrokeWidth: number
  activeDrawingStroke: CanvasDrawingStroke | null
  drawingDraftStrokes: CanvasDrawingStroke[]
  setDrawingStrokeColor: (value: string) => void
  setDrawingStrokeWidth: (value: number) => void
  openDrawingMode: () => void
  exitDrawingMode: () => void
  undoDrawingStroke: () => void
  startDrawingAt: (point: CanvasDrawingPoint) => void
  continueDrawingAt: (point: CanvasDrawingPoint) => void
  completeDrawing: () => Promise<void>
}

const useCanvasDrawingTool = ({
  getCanvasPointerPosition,
  onCompleteDrawing,
  defaultColor,
  defaultStrokeWidth,
}: UseCanvasDrawingToolOptions): UseCanvasDrawingToolResult => {
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [drawingStrokeColor, setDrawingStrokeColor] = useState(defaultColor)
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(defaultStrokeWidth)
  const [activeDrawingStroke, setActiveDrawingStroke] = useState<CanvasDrawingStroke | null>(null)
  const [drawingDraftStrokes, setDrawingDraftStrokes] = useState<CanvasDrawingStroke[]>([])
  const activeDrawingStrokeRef = useRef<CanvasDrawingStroke | null>(null)
  const drawingDraftStrokesRef = useRef<CanvasDrawingStroke[]>([])

  useEffect(() => {
    activeDrawingStrokeRef.current = activeDrawingStroke
  }, [activeDrawingStroke])

  useEffect(() => {
    drawingDraftStrokesRef.current = drawingDraftStrokes
  }, [drawingDraftStrokes])

  const clearDrawingInternal = useCallback(() => {
    setActiveDrawingStroke(null)
    setDrawingDraftStrokes([])
  }, [])

  const exitDrawingMode = useCallback(() => {
    clearDrawingInternal()
    setIsDrawingMode(false)
  }, [clearDrawingInternal])

  const openDrawingMode = useCallback(() => {
    clearDrawingInternal()
    setIsDrawingMode(true)
  }, [clearDrawingInternal])

  const undoDrawingStroke = useCallback(() => {
    if (activeDrawingStrokeRef.current?.points.length) {
      setActiveDrawingStroke(null)
      return
    }
    setDrawingDraftStrokes((current) => current.slice(0, -1))
  }, [])

  const completeDrawing = useCallback(async () => {
    const completedStrokes = [
      ...drawingDraftStrokesRef.current,
      ...(activeDrawingStrokeRef.current?.points.length ? [activeDrawingStrokeRef.current] : []),
    ]

    if (completedStrokes.length > 0) {
      await Promise.resolve(
        onCompleteDrawing({
          strokes: completedStrokes,
        }),
      )
    }

    clearDrawingInternal()
    setIsDrawingMode(false)
  }, [clearDrawingInternal, onCompleteDrawing])

  const startDrawingAt = useCallback(
    (point: CanvasDrawingPoint) => {
      setActiveDrawingStroke({
        points: [point],
        color: drawingStrokeColor,
        strokeWidth: drawingStrokeWidth,
      })
    },
    [drawingStrokeColor, drawingStrokeWidth],
  )

  const continueDrawingAt = useCallback((point: CanvasDrawingPoint) => {
    setActiveDrawingStroke((current) => {
      if (!current || current.points.length === 0) return current
      const lastPoint = current.points[current.points.length - 1]
      if (!lastPoint) return current
      const deltaX = point.x - lastPoint.x
      const deltaY = point.y - lastPoint.y
      if (Math.hypot(deltaX, deltaY) < 1) return current
      return {
        ...current,
        points: [...current.points, point],
      }
    })
  }, [])

  useEffect(() => {
    if (!isDrawingMode) return

    const onKeyDown = (event: KeyboardEvent) => {
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey
      if (isUndoShortcut) {
        event.preventDefault()
        undoDrawingStroke()
        return
      }

      if (event.key !== 'Escape') return

      if (activeDrawingStrokeRef.current?.points.length) {
        setActiveDrawingStroke(null)
        return
      }

      if (drawingDraftStrokesRef.current.length > 0) {
        setDrawingDraftStrokes([])
        return
      }

      exitDrawingMode()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [exitDrawingMode, isDrawingMode, undoDrawingStroke])

  useEffect(() => {
    if (!isDrawingMode || !activeDrawingStroke) return

    const onMouseMove = (event: MouseEvent) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return
      continueDrawingAt(pointer)
    }

    const onMouseUp = () => {
      const stroke = activeDrawingStrokeRef.current
      setActiveDrawingStroke(null)
      if (stroke?.points.length) {
        setDrawingDraftStrokes((current) => [...current, stroke])
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      const pointer = getCanvasPointerPosition(touch.clientX, touch.clientY)
      if (!pointer) return
      continueDrawingAt(pointer)
      event.preventDefault()
    }

    const onTouchEnd = () => {
      const stroke = activeDrawingStrokeRef.current
      setActiveDrawingStroke(null)
      if (stroke?.points.length) {
        setDrawingDraftStrokes((current) => [...current, stroke])
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [activeDrawingStroke, continueDrawingAt, getCanvasPointerPosition, isDrawingMode])

  return {
    isDrawingMode,
    drawingStrokeColor,
    drawingStrokeWidth,
    activeDrawingStroke,
    drawingDraftStrokes,
    setDrawingStrokeColor,
    setDrawingStrokeWidth,
    openDrawingMode,
    exitDrawingMode,
    undoDrawingStroke,
    startDrawingAt,
    continueDrawingAt,
    completeDrawing,
  }
}

export default useCanvasDrawingTool
