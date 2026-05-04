import type { CanvasFrame } from '../types.ts'

export const GRID_SECTION_LAYOUT_CONFIG = {
  paddingX: 24,
  paddingTop: 72,
  paddingBottom: 24,
  gapX: 20,
  gapY: 18,
} as const

export const GRID_SECTION_LAYOUT_MIN_COLUMN_WIDTH = 280
const GRID_SECTION_LAYOUT_TEXT_TOP_SPACING = 2
const SECTION_ORDER_ROW_TOLERANCE_PX = 32

type DefaultFrameSizeResolver = (frameOrKind: CanvasFrame | CanvasFrame['kind']) => {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

export const getFrameBoundsForLayout = (
  frame: CanvasFrame,
  getDefaultFrameSize: DefaultFrameSizeResolver,
): { left: number; top: number; right: number; bottom: number } => {
  const defaults = getDefaultFrameSize(frame)
  const width = frame.width ?? defaults.width
  const height = frame.height ?? defaults.height
  return {
    left: frame.x,
    top: frame.y,
    right: frame.x + width,
    bottom: frame.y + height,
  }
}

export const compareFramesForSectionOrder = (a: CanvasFrame, b: CanvasFrame): number => {
  if (Math.abs(a.y - b.y) > SECTION_ORDER_ROW_TOLERANCE_PX) return a.y - b.y
  if (a.x !== b.x) return a.x - b.x
  if (a.y !== b.y) return a.y - b.y
  return a.id.localeCompare(b.id)
}

const getGridSectionTopSpacing = (frame: CanvasFrame): number =>
  frame.kind === 'text' ? GRID_SECTION_LAYOUT_TEXT_TOP_SPACING : 0

export const compareFramesForGridLayout = (a: CanvasFrame, b: CanvasFrame): number => {
  if (a.y !== b.y) return a.y - b.y
  if (a.x !== b.x) return a.x - b.x

  const aStableId = a.graphId ? `g-${a.graphId}` : `l-${a.id}`
  const bStableId = b.graphId ? `g-${b.graphId}` : `l-${b.id}`
  return aStableId.localeCompare(bStableId)
}

export const findContainingGridSectionId = (
  frame: CanvasFrame,
  framePool: CanvasFrame[],
  getDefaultFrameSize: DefaultFrameSizeResolver,
): string | null => {
  if (frame.kind === 'section') return null
  const bounds = getFrameBoundsForLayout(frame, getDefaultFrameSize)
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2
  const targetSection = framePool.find((candidate) => {
    if (candidate.kind !== 'section' || candidate.sectionLayout !== 'grid') return false
    if ((candidate.categoryId ?? null) !== (frame.categoryId ?? null)) return false
    const sectionBounds = getFrameBoundsForLayout(candidate, getDefaultFrameSize)
    return (
      centerX >= sectionBounds.left &&
      centerX <= sectionBounds.right &&
      centerY >= sectionBounds.top &&
      centerY <= sectionBounds.bottom
    )
  })
  return targetSection?.id ?? null
}

export const reflowGridSections = ({
  inputFrames,
  sectionIds,
  getDefaultFrameSize,
  getGridLayoutFrameHeight,
  topBuffer,
}: {
  inputFrames: CanvasFrame[]
  sectionIds: string[]
  getDefaultFrameSize: DefaultFrameSizeResolver
  getGridLayoutFrameHeight: (frame: CanvasFrame) => number
  topBuffer: number
}): { nextFrames: CanvasFrame[]; changedFrameIds: Set<string> } => {
  const uniqueSectionIds = [...new Set(sectionIds)]
  if (uniqueSectionIds.length === 0) return { nextFrames: inputFrames, changedFrameIds: new Set<string>() }

  const byId = new Map(inputFrames.map((frame) => [frame.id, frame]))
  const changedFrameIds = new Set<string>()
  const sortedGridSections = inputFrames
    .filter((frame) => frame.kind === 'section' && frame.sectionLayout === 'grid')
    .sort(compareFramesForSectionOrder)
  const sectionFrameIdsBySectionId = new Map<string, string[]>()

  inputFrames.forEach((frame) => {
    if (frame.kind === 'section') return
    const bounds = getFrameBoundsForLayout(frame, getDefaultFrameSize)
    const centerX = (bounds.left + bounds.right) / 2
    const centerY = (bounds.top + bounds.bottom) / 2
    const containingSection = sortedGridSections.find((sectionFrame) => {
      if ((sectionFrame.categoryId ?? null) !== (frame.categoryId ?? null)) return false
      const sectionBounds = getFrameBoundsForLayout(sectionFrame, getDefaultFrameSize)
      return (
        centerX >= sectionBounds.left &&
        centerX <= sectionBounds.right &&
        centerY >= sectionBounds.top &&
        centerY <= sectionBounds.bottom
      )
    })
    if (!containingSection) return
    const current = sectionFrameIdsBySectionId.get(containingSection.id) ?? []
    current.push(frame.id)
    sectionFrameIdsBySectionId.set(containingSection.id, current)
  })

  uniqueSectionIds.forEach((sectionId) => {
    const sectionFrame = byId.get(sectionId)
    if (!sectionFrame || sectionFrame.kind !== 'section' || sectionFrame.sectionLayout !== 'grid') return

    const sectionBounds = getFrameBoundsForLayout(sectionFrame, getDefaultFrameSize)
    const contentLeft = sectionBounds.left + GRID_SECTION_LAYOUT_CONFIG.paddingX
    const contentRight = sectionBounds.right - GRID_SECTION_LAYOUT_CONFIG.paddingX
    const contentTop = sectionBounds.top + GRID_SECTION_LAYOUT_CONFIG.paddingTop

    const containedFrames = (sectionFrameIdsBySectionId.get(sectionId) ?? [])
      .map((frameId) => byId.get(frameId))
      .filter((frame): frame is CanvasFrame => Boolean(frame && frame.kind !== 'section'))
      .sort(compareFramesForGridLayout)

    const contentWidth = Math.max(1, contentRight - contentLeft)
    const estimatedColumnCount = Math.max(
      1,
      Math.floor(
        (contentWidth + GRID_SECTION_LAYOUT_CONFIG.gapX) /
          (GRID_SECTION_LAYOUT_MIN_COLUMN_WIDTH + GRID_SECTION_LAYOUT_CONFIG.gapX),
      ),
    )
    const columnCount = Math.max(1, Math.min(estimatedColumnCount, containedFrames.length))
    const columnWidth =
      columnCount <= 1
        ? contentWidth
        : (contentWidth - GRID_SECTION_LAYOUT_CONFIG.gapX * (columnCount - 1)) / columnCount
    const columnBottoms = Array.from({ length: columnCount }, () => contentTop)
    let contentBottomEdge = contentTop

    containedFrames.forEach((frame) => {
      const defaults = getDefaultFrameSize(frame)
      const width = frame.width ?? defaults.width
      const height = getGridLayoutFrameHeight(frame)

      const shouldSpanAllColumns = columnCount === 1 || width > columnWidth
      if (shouldSpanAllColumns) {
        const topSpacing = getGridSectionTopSpacing(frame)
        const nextY = Math.max(...columnBottoms) + topSpacing
        const nextFrame: CanvasFrame = {
          ...frame,
          x: Math.max(0, contentLeft),
          y: Math.max(-topBuffer, nextY),
          height,
        }
        byId.set(nextFrame.id, nextFrame)
        changedFrameIds.add(nextFrame.id)
        const nextBottom = nextFrame.y + height + GRID_SECTION_LAYOUT_CONFIG.gapY
        for (let index = 0; index < columnBottoms.length; index += 1) {
          columnBottoms[index] = nextBottom
        }
        contentBottomEdge = Math.max(contentBottomEdge, nextFrame.y + height)
        return
      }

      let targetColumn = 0
      for (let index = 1; index < columnBottoms.length; index += 1) {
        if (columnBottoms[index] < columnBottoms[targetColumn]) {
          targetColumn = index
        }
      }

      const nextX = contentLeft + targetColumn * (columnWidth + GRID_SECTION_LAYOUT_CONFIG.gapX)
      const topSpacing = getGridSectionTopSpacing(frame)
      const nextY = columnBottoms[targetColumn] + topSpacing

      const nextFrame: CanvasFrame = {
        ...frame,
        x: Math.max(0, nextX),
        y: Math.max(-topBuffer, nextY),
        height,
      }
      byId.set(nextFrame.id, nextFrame)
      changedFrameIds.add(nextFrame.id)
      columnBottoms[targetColumn] = nextFrame.y + height + GRID_SECTION_LAYOUT_CONFIG.gapY
      contentBottomEdge = Math.max(contentBottomEdge, nextFrame.y + height)
    })

    const nextSectionFrame: CanvasFrame = {
      ...sectionFrame,
      height: Math.max(
        sectionFrame.height ?? getDefaultFrameSize(sectionFrame).height,
        Math.ceil(contentBottomEdge - sectionFrame.y + GRID_SECTION_LAYOUT_CONFIG.paddingBottom),
      ),
    }
    byId.set(nextSectionFrame.id, nextSectionFrame)
    changedFrameIds.add(nextSectionFrame.id)
  })

  const nextFrames = inputFrames.map((frame) => byId.get(frame.id) ?? frame)
  return { nextFrames, changedFrameIds }
}
