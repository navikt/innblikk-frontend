import type { CanvasFrame } from '../../model/types.ts'
import {
  HEADING_FONT_SIZE_DEFAULT,
  HEADING_FONT_SIZE_MAX,
  HEADING_FONT_SIZE_MIN,
  HEADING_TEXT_CHAR_WIDTH_FACTOR,
  HEADING_TEXT_EXTRA_WIDTH,
  HEADING_TEXT_MAX_WIDTH,
  HEADING_TEXT_MIN_WIDTH,
  HEADING_TEXT_VERTICAL_PADDING,
} from '../../utils/canvasUtils.ts'

const parseNumberParam = (value: string | null): number | null => {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const parseCanvasShareRouteContext = (
  search: string,
): {
  projectId: number | null
  dashboardId: number | null
  categoryId: number | null
} => {
  const params = new URLSearchParams(search)
  return {
    projectId: parseNumberParam(params.get('projectId')),
    dashboardId: parseNumberParam(params.get('dashboardId')),
    categoryId: parseNumberParam(params.get('categoryId')),
  }
}

export const buildCanvasShareUrl = (params: {
  projectId: number | null
  dashboardId: number | null
  categoryId: number | null
}): string => {
  const query = new URLSearchParams()
  if (params.projectId !== null) query.set('projectId', String(params.projectId))
  if (params.dashboardId !== null) query.set('dashboardId', String(params.dashboardId))
  if (params.categoryId !== null) query.set('categoryId', String(params.categoryId))
  const serialized = query.toString()
  return `/canvas/share${serialized ? `?${serialized}` : ''}`
}

const getCanvasShareDefaultFrameSize = (frame: CanvasFrame): { width: number; height: number } => {
  if (frame.kind === 'website' && frame.isInternalDashboard) return { width: 760, height: 760 }
  if (frame.kind === 'website') return { width: 420, height: 700 }
  if (frame.kind === 'image') return { width: 420, height: 420 }
  if (frame.kind === 'chart') return { width: 560, height: 360 }
  if (frame.kind === 'sql-editor') return { width: 420, height: 760 }
  if (frame.kind === 'heading') return { width: 420, height: 72 }
  if (frame.kind === 'text') return { width: 360, height: 180 }
  if (frame.kind === 'link') return { width: 380, height: 112 }
  if (frame.kind === 'icon') return { width: 280, height: 240 }
  if (frame.kind === 'figure') return { width: 240, height: 240 }
  if (frame.kind === 'drawing') return { width: 240, height: 160 }
  if (frame.kind === 'section') return { width: 640, height: 420 }
  return { width: 360, height: 180 }
}

const getHeadingFrameFontSize = (frame: CanvasFrame): number => {
  if (frame.kind !== 'heading') return HEADING_FONT_SIZE_DEFAULT
  return Math.max(
    HEADING_FONT_SIZE_MIN,
    Math.min(HEADING_FONT_SIZE_MAX, frame.headingFontSize ?? HEADING_FONT_SIZE_DEFAULT),
  )
}

const getHeadingFrameWidth = (frame: CanvasFrame): number => {
  if (frame.kind !== 'heading') return frame.width ?? getCanvasShareDefaultFrameSize(frame).width

  const headingText = (frame.headingText || frame.label || '').trim()
  const fontSize = getHeadingFrameFontSize(frame)
  const estimatedTextWidth =
    Math.ceil(headingText.length * (fontSize * HEADING_TEXT_CHAR_WIDTH_FACTOR)) + HEADING_TEXT_EXTRA_WIDTH
  const autoWidth = Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, estimatedTextWidth))
  const defaultHeadingSize = getCanvasShareDefaultFrameSize(frame)
  const hasLegacyDefaultSize =
    Number(frame.width) === defaultHeadingSize.width &&
    (frame.height ?? defaultHeadingSize.height) === defaultHeadingSize.height

  if (Number.isFinite(frame.width) && !hasLegacyDefaultSize) {
    return Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, Number(frame.width)))
  }

  return autoWidth
}

const getHeadingFrameHeight = (frame: CanvasFrame): number => {
  if (frame.kind !== 'heading') return frame.height ?? getCanvasShareDefaultFrameSize(frame).height

  const headingText = (frame.headingText || frame.label || '').trim()
  const width = getHeadingFrameWidth(frame)
  const fontSize = getHeadingFrameFontSize(frame)
  const usableWidth = Math.max(1, width - HEADING_TEXT_EXTRA_WIDTH)
  const charsPerLine = Math.max(12, Math.floor(usableWidth / (fontSize * HEADING_TEXT_CHAR_WIDTH_FACTOR)))
  const lineCount = headingText
    ? headingText.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
    : 1

  return Math.max(28, lineCount * Math.ceil(fontSize * 1.05) + HEADING_TEXT_VERTICAL_PADDING)
}

export const getCanvasShareFrameBounds = (
  frame: CanvasFrame,
): { left: number; top: number; right: number; bottom: number } => {
  const defaults = getCanvasShareDefaultFrameSize(frame)
  const width = frame.kind === 'heading' ? getHeadingFrameWidth(frame) : (frame.width ?? defaults.width)
  const height = frame.kind === 'heading' ? getHeadingFrameHeight(frame) : (frame.height ?? defaults.height)
  return {
    left: frame.x,
    top: frame.y,
    right: frame.x + width,
    bottom: frame.y + height,
  }
}
