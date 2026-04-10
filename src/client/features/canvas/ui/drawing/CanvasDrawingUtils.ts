import type { CanvasDrawingPoint } from './useCanvasDrawingTool.ts'

export type CanvasDrawingStrokeStyle = {
  color: string
  strokeWidth: number
}

export const parseDrawingPath = (rawPath?: string): CanvasDrawingPoint[][] => {
  if (!rawPath) return []
  return rawPath
    .split('|')
    .map((stroke) =>
      stroke
        .trim()
        .split(/\s+/)
        .map((point) => {
          const [xValue, yValue] = point.split(',')
          const x = Number(xValue)
          const y = Number(yValue)
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null
          return { x, y }
        })
        .filter((point): point is CanvasDrawingPoint => point !== null),
    )
    .filter((stroke) => stroke.length > 0)
}

export const parseDrawingStrokeStyles = (rawStyles?: string): CanvasDrawingStrokeStyle[] => {
  if (!rawStyles) return []
  try {
    const parsed: unknown = JSON.parse(rawStyles)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const colorValue = record.color
        const strokeWidthValue = record.strokeWidth
        const color = typeof colorValue === 'string' ? colorValue : ''
        const strokeWidth = typeof strokeWidthValue === 'number' ? strokeWidthValue : Number(strokeWidthValue)
        if (!color || !Number.isFinite(strokeWidth) || strokeWidth <= 0) return null
        return {
          color,
          strokeWidth,
        }
      })
      .filter((item): item is CanvasDrawingStrokeStyle => item !== null)
  } catch {
    return []
  }
}
