import { ICON_CARD_HEADER_HEIGHT, WEBSITE_CARD_HEADER_HEIGHT } from './canvasUtils.ts'
import type { CanvasFrame, ConnectionAnchorSide } from '../model/types.ts'

type CanvasFrameSize = {
  width: number
  height: number
}

type ResolveFrameSize = (frame: CanvasFrame) => CanvasFrameSize

export const getCanvasFrameBounds = (
  frame: CanvasFrame,
  resolveFrameSize: ResolveFrameSize,
): { left: number; top: number; right: number; bottom: number } => {
  const { width, height } = resolveFrameSize(frame)
  return {
    left: frame.x,
    top: frame.y,
    right: frame.x + width,
    bottom: frame.y + height,
  }
}

export const getCanvasFrameAnchor = (
  frame: CanvasFrame,
  side: ConnectionAnchorSide,
  resolveFrameSize: ResolveFrameSize,
): { x: number; y: number } => {
  const { width, height } = resolveFrameSize(frame)
  const headerHeight =
    frame.kind === 'website' ? WEBSITE_CARD_HEADER_HEIGHT : frame.kind === 'icon' ? ICON_CARD_HEADER_HEIGHT : 0
  const bodyTop = frame.y + headerHeight
  const bodyHeight = Math.max(height - headerHeight, 0)
  const centerX = frame.x + width / 2
  const centerY = bodyTop + bodyHeight / 2

  if (side === 'top') return { x: centerX, y: bodyTop }
  if (side === 'bottom') return { x: centerX, y: frame.y + height }
  if (side === 'left') return { x: frame.x, y: centerY }
  return { x: frame.x + width, y: centerY }
}

export const getDominantConnectionSide = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): ConnectionAnchorSide => {
  const dx = toX - fromX
  const dy = toY - fromY
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }
  return dy >= 0 ? 'bottom' : 'top'
}

export const getNearestCanvasAnchorSide = (
  frame: CanvasFrame,
  pointX: number,
  pointY: number,
  resolveFrameSize: ResolveFrameSize,
): ConnectionAnchorSide => {
  const { width, height } = resolveFrameSize(frame)
  const headerHeight =
    frame.kind === 'website' ? WEBSITE_CARD_HEADER_HEIGHT : frame.kind === 'icon' ? ICON_CARD_HEADER_HEIGHT : 0
  const bodyTop = frame.y + headerHeight
  const distances: Array<{ side: ConnectionAnchorSide; distance: number }> = [
    { side: 'left', distance: Math.abs(pointX - frame.x) },
    { side: 'right', distance: Math.abs(pointX - (frame.x + width)) },
    { side: 'top', distance: Math.abs(pointY - bodyTop) },
    { side: 'bottom', distance: Math.abs(pointY - (frame.y + height)) },
  ]
  distances.sort((a, b) => a.distance - b.distance)
  return distances[0]?.side ?? 'left'
}
