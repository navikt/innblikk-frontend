import { getCanvasIconColor } from '../icon/CanvasIconRegistry.ts'

type CanvasFigureType = 'square' | 'circle' | 'line' | 'arrow'

type CanvasFigureFrameProps = {
  id: string
  width: number
  height: number
  figureType?: CanvasFigureType
  figureColor?: string
  iconRotationDeg?: number
  figureOrientation?: number
  label: string
}

const CanvasFigureFrame = ({
  id,
  width,
  height,
  figureType,
  figureColor,
  iconRotationDeg,
  figureOrientation,
  label,
}: CanvasFigureFrameProps) => {
  const resolvedFigureType = figureType ?? 'square'
  // More subtle stroke width, baseline is slightly smaller
  const strokeWidth = Math.max(1.5, Math.floor(Math.min(width, height) * 0.024))
  const strokeColor = getCanvasIconColor(figureColor)
  const strokeColorForRender = strokeColor.toLowerCase() === '#111111' ? 'var(--ax-text-default)' : strokeColor
  const markerId = `canvas-figure-arrow-${id}`

  // For shapes like square and circle, iconRotationDeg is actual degrees.
  // For line and arrow, it's currently used for quadrant mode (0-3).
  const isLineOrArrow = resolvedFigureType === 'line' || resolvedFigureType === 'arrow'
  const rotation = isLineOrArrow ? 0 : (iconRotationDeg ?? 0)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block h-full w-full"
      aria-label={label}
      role="img"
      style={rotation ? { rotate: `${rotation}deg` } : undefined}
    >
      {resolvedFigureType === 'arrow' && (
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,4 L0,8 z" fill={strokeColorForRender} />
          </marker>
        </defs>
      )}
      {resolvedFigureType === 'square' && (
        <rect
          x={strokeWidth}
          y={strokeWidth}
          width={Math.max(0, width - strokeWidth * 2)}
          height={Math.max(0, height - strokeWidth * 2)}
          rx={Math.min(14, Math.floor(Math.min(width, height) * 0.1))}
          fill="none"
          stroke={strokeColorForRender}
          strokeWidth={strokeWidth}
        />
      )}
      {resolvedFigureType === 'circle' && (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={Math.max(0, width / 2 - strokeWidth)}
          ry={Math.max(0, height / 2 - strokeWidth)}
          fill="none"
          stroke={strokeColorForRender}
          strokeWidth={strokeWidth}
        />
      )}
      {resolvedFigureType === 'line' &&
        (() => {
          const dir = figureOrientation ?? 0
          const isAscending = dir === 2 || dir === 3
          const isReversedX = dir === 1 || dir === 3
          let startX = isReversedX ? width - strokeWidth : strokeWidth
          let startY = isAscending
            ? dir === 2
              ? height - strokeWidth
              : strokeWidth
            : dir === 0
              ? strokeWidth
              : height - strokeWidth
          let endX = isReversedX ? strokeWidth : width - strokeWidth
          let endY = isAscending
            ? dir === 2
              ? strokeWidth
              : height - strokeWidth
            : dir === 0
              ? height - strokeWidth
              : strokeWidth

          if (width <= 12) {
            startX = width / 2
            endX = width / 2
          }
          if (height <= 12) {
            startY = height / 2
            endY = height / 2
          }
          return (
            <line
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={strokeColorForRender}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )
        })()}
      {resolvedFigureType === 'arrow' &&
        (() => {
          const dir = figureOrientation ?? 0
          const isAscending = dir === 2 || dir === 3
          const isReversedX = dir === 1 || dir === 3

          let startX = isReversedX ? width - strokeWidth : strokeWidth
          let startY = isAscending
            ? dir === 2
              ? height - strokeWidth
              : strokeWidth
            : dir === 0
              ? strokeWidth
              : height - strokeWidth
          let intendedEndX = isReversedX ? strokeWidth : width - strokeWidth
          let intendedEndY = isAscending
            ? dir === 2
              ? strokeWidth
              : height - strokeWidth
            : dir === 0
              ? height - strokeWidth
              : strokeWidth

          if (width <= 12) {
            startX = width / 2
            intendedEndX = width / 2
          }
          if (height <= 12) {
            startY = height / 2
            intendedEndY = height / 2
          }

          // Calculate hypotenuse and vector to subtract arrow marker padding
          const dx = intendedEndX - startX
          const dy = intendedEndY - startY
          const length = Math.max(0.1, Math.hypot(dx, dy))
          const padding = strokeWidth * 1.8
          const endX = startX + dx * Math.max(0, (length - padding) / length)
          const endY = startY + dy * Math.max(0, (length - padding) / length)

          return (
            <line
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={strokeColorForRender}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              markerEnd={`url(#${markerId})`}
            />
          )
        })()}
    </svg>
  )
}

export default CanvasFigureFrame
