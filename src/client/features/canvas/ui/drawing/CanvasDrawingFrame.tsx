import { parseDrawingPath, parseDrawingStrokeStyles } from './CanvasDrawingUtils.ts'

type CanvasDrawingFrameProps = {
  width: number
  height: number
  drawingPath?: string
  drawingStrokeStyles?: string
  strokeColor: string
  strokeWidth: number
  label: string
}

const CanvasDrawingFrame = ({
  width,
  height,
  drawingPath,
  drawingStrokeStyles,
  strokeColor,
  strokeWidth,
  label,
}: CanvasDrawingFrameProps) => {
  const resolveStrokeColor = (color: string): string =>
    color.trim().toLowerCase() === '#111111' ? 'var(--ax-text-default)' : color

  const strokes = parseDrawingPath(drawingPath)
  const strokeStyles = parseDrawingStrokeStyles(drawingStrokeStyles)
  const allPoints = strokes.flatMap((stroke) => stroke)
  const maxStrokeWidth = strokeStyles.reduce(
    (maxValue, style) => Math.max(maxValue, style?.strokeWidth ?? strokeWidth),
    strokeWidth,
  )
  const padding = Math.max(4, maxStrokeWidth)
  const minX = allPoints.length > 0 ? Math.min(...allPoints.map((point) => point.x)) - padding : 0
  const minY = allPoints.length > 0 ? Math.min(...allPoints.map((point) => point.y)) - padding : 0
  const maxX = allPoints.length > 0 ? Math.max(...allPoints.map((point) => point.x)) + padding : width
  const maxY = allPoints.length > 0 ? Math.max(...allPoints.map((point) => point.y)) + padding : height
  const viewBoxWidth = Math.max(1, maxX - minX)
  const viewBoxHeight = Math.max(1, maxY - minY)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`${minX} ${minY} ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="none"
      className="block h-full w-full"
      aria-label={label}
      role="img"
    >
      {strokes.map((stroke, index) => {
        const style = strokeStyles[index]
        return (
          <polyline
            key={`drawing-stroke-${index}`}
            points={stroke.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={resolveStrokeColor(style?.color || strokeColor)}
            strokeWidth={style?.strokeWidth ?? strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}
    </svg>
  )
}

export default CanvasDrawingFrame
