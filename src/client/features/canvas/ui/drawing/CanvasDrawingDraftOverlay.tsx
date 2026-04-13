import type { CanvasDrawingStroke } from './useCanvasDrawingTool.ts'

type CanvasDrawingDraftOverlayProps = {
  drawingDraftStrokes: CanvasDrawingStroke[]
  activeDrawingStroke: CanvasDrawingStroke | null
}

const CanvasDrawingDraftOverlay = ({ drawingDraftStrokes, activeDrawingStroke }: CanvasDrawingDraftOverlayProps) => {
  const resolveStrokeColor = (color: string): string =>
    color.trim().toLowerCase() === '#111111' ? 'var(--ax-text-default)' : color

  if (drawingDraftStrokes.length === 0 && !activeDrawingStroke?.points.length) {
    return null
  }

  return (
    <svg className="pointer-events-none absolute inset-0 z-[3] h-full w-full overflow-visible">
      {drawingDraftStrokes.map((stroke, index) => (
        <polyline
          key={`draft-stroke-${index}`}
          points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={resolveStrokeColor(stroke.color)}
          strokeWidth={stroke.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {activeDrawingStroke && activeDrawingStroke.points.length > 0 && (
        <polyline
          points={activeDrawingStroke.points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={resolveStrokeColor(activeDrawingStroke.color)}
          strokeWidth={activeDrawingStroke.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

export default CanvasDrawingDraftOverlay
