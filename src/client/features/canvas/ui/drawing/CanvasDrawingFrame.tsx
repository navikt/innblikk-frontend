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
  const strokes = parseDrawingPath(drawingPath)
  const strokeStyles = parseDrawingStrokeStyles(drawingStrokeStyles)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
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
            stroke={style?.color || strokeColor}
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
