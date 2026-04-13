import { getCanvasIconColor } from '../icon/CanvasIconRegistry.ts'

type CanvasFigureType = 'rectangle' | 'circle' | 'line' | 'arrow'

type CanvasFigureFrameProps = {
  id: string
  width: number
  height: number
  figureType?: CanvasFigureType
  figureColor?: string
  label: string
}

const CanvasFigureFrame = ({ id, width, height, figureType, figureColor, label }: CanvasFigureFrameProps) => {
  const resolvedFigureType = figureType ?? 'rectangle'
  const strokeWidth = Math.max(2, Math.floor(Math.min(width, height) * 0.035))
  const strokeColor = getCanvasIconColor(figureColor)
  const markerId = `canvas-figure-arrow-${id}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block h-full w-full"
      aria-label={label}
      role="img"
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
            <path d="M0,0 L10,4 L0,8 z" fill={strokeColor} />
          </marker>
        </defs>
      )}
      {resolvedFigureType === 'rectangle' && (
        <rect
          x={strokeWidth}
          y={strokeWidth}
          width={Math.max(0, width - strokeWidth * 2)}
          height={Math.max(0, height - strokeWidth * 2)}
          rx={Math.min(14, Math.floor(Math.min(width, height) * 0.1))}
          fill="none"
          stroke={strokeColor}
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
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      )}
      {resolvedFigureType === 'line' && (
        <line
          x1={strokeWidth}
          y1={height / 2}
          x2={Math.max(strokeWidth, width - strokeWidth)}
          y2={height / 2}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
      {resolvedFigureType === 'arrow' && (
        <line
          x1={strokeWidth}
          y1={height / 2}
          x2={Math.max(strokeWidth, width - strokeWidth * 1.8)}
          y2={height / 2}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          markerEnd={`url(#${markerId})`}
        />
      )}
    </svg>
  )
}

export default CanvasFigureFrame
