import { describe, expect, it } from 'vitest'
import { buildCanvasHierarchy } from './canvasHierarchy.ts'
import type { CanvasFrame } from '../model/types.ts'

const baseFrame = (overrides: Partial<CanvasFrame>): CanvasFrame => ({
  id: 'frame',
  kind: 'text',
  label: 'Label',
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  refreshNonce: 0,
  ...overrides,
})

const getBounds = (frame: CanvasFrame) => {
  const width = frame.width ?? 120
  const height = frame.height ?? 80
  return {
    left: frame.x,
    top: frame.y,
    right: frame.x + width,
    bottom: frame.y + height,
  }
}

describe('buildCanvasHierarchy', () => {
  it('groups frames under containing sections in canvas order', () => {
    const section = baseFrame({ id: 'section-1', kind: 'section', label: 'Seksjon A', width: 500, height: 300 })
    const inSection = baseFrame({ id: 'frame-in', kind: 'sticky', label: 'Lapp', x: 50, y: 60, textContent: 'Inne' })
    const topLevel = baseFrame({ id: 'frame-top', kind: 'text', label: 'Tekst', x: 650, y: 20, textContent: 'Utenfor' })

    const result = buildCanvasHierarchy({
      frames: [inSection, topLevel, section],
      getFrameBounds: getBounds,
    })

    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[0]?.type).toBe('section')
    expect(result.nodes[1]?.type).toBe('element')

    const sectionNode = result.nodes[0]
    if (sectionNode?.type !== 'section') throw new Error('Expected section node')

    expect(sectionNode.elements).toHaveLength(1)
    expect(sectionNode.elements[0]?.id).toBe('frame-in')
    expect(result.frameContainingSectionIdByFrameId['frame-in']).toBe('section-1')
  })

  it('uses text content as element label when available', () => {
    const textFrame = baseFrame({ id: 'text-1', kind: 'text', label: 'Fallback', textContent: 'Faktisk tekst' })

    const result = buildCanvasHierarchy({
      frames: [textFrame],
      getFrameBounds: getBounds,
    })

    expect(result.nodes).toHaveLength(1)
    const node = result.nodes[0]
    if (!node || node.type !== 'element') throw new Error('Expected top-level element node')

    expect(node.label).toBe('Faktisk tekst')
  })
})
