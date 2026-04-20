import type { CanvasFrame } from '../model/types.ts'
import { compareFramesForSectionOrder } from '../model/layout/gridSectionLayout.ts'
import { CANVAS_INVENTORY_KIND_OPTIONS } from './canvasUtils.ts'

export type CanvasHierarchyElement = {
  id: string
  kindLabel: string
  label: string
  frame: CanvasFrame
}

export type CanvasHierarchyNode =
  | {
      type: 'section'
      id: string
      label: string
      frame: CanvasFrame
      elements: CanvasHierarchyElement[]
    }
  | {
      type: 'element'
      id: string
      kindLabel: string
      label: string
      frame: CanvasFrame
    }

type CanvasFrameBounds = { left: number; top: number; right: number; bottom: number }

const getFallbackFrameLabel = (frame: CanvasFrame): string => {
  const fallbackLabel = frame.label.trim() || `${frame.kind} ${frame.id}`
  if (frame.kind === 'heading') return frame.headingText?.trim() || fallbackLabel
  if (frame.kind === 'text' || frame.kind === 'sticky') return frame.textContent?.trim() || fallbackLabel
  return fallbackLabel
}

const mapFrameToElementNode = (frame: CanvasFrame): CanvasHierarchyElement => {
  const kindLabel = CANVAS_INVENTORY_KIND_OPTIONS.find((option) => option.kind === frame.kind)?.label || frame.kind
  return {
    id: frame.id,
    kindLabel,
    label: getFallbackFrameLabel(frame),
    frame,
  }
}

export const buildCanvasHierarchy = ({
  frames,
  getFrameBounds,
}: {
  frames: CanvasFrame[]
  getFrameBounds: (frame: CanvasFrame) => CanvasFrameBounds
}): { nodes: CanvasHierarchyNode[]; frameContainingSectionIdByFrameId: Record<string, string> } => {
  const sortedFrames = [...frames].sort(compareFramesForSectionOrder)
  const sections = sortedFrames.filter((frame) => frame.kind === 'section')
  const frameContainingSectionIdByFrameId: Record<string, string> = {}

  sortedFrames.forEach((frame) => {
    if (frame.kind === 'section') return
    const bounds = getFrameBounds(frame)
    const centerX = (bounds.left + bounds.right) / 2
    const centerY = (bounds.top + bounds.bottom) / 2
    const containingSection = sections.find((section) => {
      const sectionBounds = getFrameBounds(section)
      return (
        centerX >= sectionBounds.left &&
        centerX <= sectionBounds.right &&
        centerY >= sectionBounds.top &&
        centerY <= sectionBounds.bottom
      )
    })
    if (containingSection) {
      frameContainingSectionIdByFrameId[frame.id] = containingSection.id
    }
  })

  const topLevelNodes: CanvasHierarchyNode[] = []
  const sectionElementFramesBySectionId = new Map<string, CanvasFrame[]>()

  sortedFrames.forEach((frame) => {
    if (frame.kind === 'section') {
      topLevelNodes.push({
        type: 'section',
        id: frame.id,
        label: frame.label.trim() || 'Seksjon',
        frame,
        elements: [],
      })
      sectionElementFramesBySectionId.set(frame.id, [])
      return
    }

    const containingSectionId = frameContainingSectionIdByFrameId[frame.id]
    if (containingSectionId) {
      const current = sectionElementFramesBySectionId.get(containingSectionId) ?? []
      current.push(frame)
      sectionElementFramesBySectionId.set(containingSectionId, current)
      return
    }

    topLevelNodes.push({
      type: 'element',
      ...mapFrameToElementNode(frame),
    })
  })

  return {
    frameContainingSectionIdByFrameId,
    nodes: topLevelNodes.map((node) => {
      if (node.type !== 'section') return node
      const elements = (sectionElementFramesBySectionId.get(node.id) ?? [])
        .sort(compareFramesForSectionOrder)
        .map(mapFrameToElementNode)
      return {
        ...node,
        elements,
      }
    }),
  }
}
