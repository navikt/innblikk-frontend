import { useMemo, useState } from 'react'
import { Button } from '@navikt/ds-react'
import { ExternalLink } from 'lucide-react'
import AnalysisActionModal from '../../analysis/ui/AnalysisActionModal.tsx'
import { normalizeUrlToPath } from '../../../shared/lib/utils.ts'
import type { JourneyLink, JourneyNode } from '../model'

type CanvasNode = {
  nodeId: string
  name: string
  value: number
  step: number
  displayStep: number
}

type CanvasStep = {
  step: number
  displayStep: number
  nodes: CanvasNode[]
  totalValue: number
}

type UserJourneyCanvasViewProps = {
  nodes: JourneyNode[]
  links: JourneyLink[]
  reverseVisualOrder?: boolean
  journeyDirection?: string
  websiteId?: string
  period?: string
  domain?: string
}

const FRAME_WIDTH = 340
const FRAME_GAP = 52
const FRAME_HEADER_HEIGHT = 64
const FRAME_PADDING = 12
const CARD_HEIGHT = 244
const CARD_GAP = 14
const MIN_CANVAS_HEIGHT = 620
const MAX_NODES_PER_STEP = 6

const parseStep = (nodeId: string): number => {
  const match = nodeId.match(/^(\d+):/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return parseInt(match[1], 10)
}

const buildPreviewTargetUrl = (domain: string | undefined, path: string): string | null => {
  if (!domain || !path) return null

  const normalizedPath = normalizeUrlToPath(path)
  if (!normalizedPath) return null

  const withProtocol = domain.startsWith('http://') || domain.startsWith('https://') ? domain : `https://${domain}`

  try {
    const domainUrl = new URL(withProtocol)
    const finalPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
    return new URL(finalPath, domainUrl.origin).toString()
  } catch {
    return null
  }
}

const createPreviewProxySrc = (domain: string | undefined, pagePath: string): string => {
  const target = buildPreviewTargetUrl(domain, pagePath)
  return target ? `/api/clickmap-preview?url=${encodeURIComponent(target)}` : ''
}

const getConnectedNodeIds = (selectedNodeIndex: number, nodes: JourneyNode[], links: JourneyLink[]): Set<string> => {
  const connected = new Set<string>()
  const adjacency: number[][] = Array.from({ length: nodes.length }, () => [])
  const reverseAdjacency: number[][] = Array.from({ length: nodes.length }, () => [])

  links.forEach((link) => {
    if (nodes[link.source] && nodes[link.target]) {
      adjacency[link.source].push(link.target)
      reverseAdjacency[link.target].push(link.source)
    }
  })

  const walk = (start: number, graph: number[][]) => {
    const queue = [start]
    const visited = new Set<number>([start])

    while (queue.length > 0) {
      const current = queue.shift()
      if (current === undefined) continue

      connected.add(nodes[current].nodeId)

      graph[current].forEach((next) => {
        if (!visited.has(next)) {
          visited.add(next)
          queue.push(next)
        }
      })
    }
  }

  walk(selectedNodeIndex, adjacency)
  walk(selectedNodeIndex, reverseAdjacency)

  return connected
}

const UserJourneyCanvasView = ({
  nodes,
  links,
  reverseVisualOrder = false,
  journeyDirection = 'forward',
  websiteId,
  period = 'current_month',
  domain,
}: UserJourneyCanvasViewProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)

  const nodeValues = useMemo(() => {
    const values = new Map<number, number>()
    nodes.forEach((_, idx) => values.set(idx, 0))

    links.forEach((link) => {
      const source = nodes[link.source]
      const target = nodes[link.target]
      if (!source || !target) return

      const sourceStep = parseStep(source.nodeId)
      if (sourceStep === 0) {
        values.set(link.source, (values.get(link.source) || 0) + link.value)
      }
      values.set(link.target, (values.get(link.target) || 0) + link.value)
    })

    return values
  }, [links, nodes])

  const stepsData = useMemo<CanvasStep[]>(() => {
    const byStep = new Map<number, CanvasNode[]>()

    nodes.forEach((node, idx) => {
      const step = parseStep(node.nodeId)
      if (step === Number.MAX_SAFE_INTEGER) return

      if (!byStep.has(step)) byStep.set(step, [])

      byStep.get(step)?.push({
        nodeId: node.nodeId,
        name: node.name,
        value: nodeValues.get(idx) || 0,
        step,
        displayStep: journeyDirection === 'backward' ? step * -1 : step,
      })
    })

    return Array.from(byStep.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([step, stepNodes]) => {
        const sortedNodes = [...stepNodes].sort((a, b) => b.value - a.value)
        const limitedNodes = sortedNodes.slice(0, MAX_NODES_PER_STEP)
        return {
          step,
          displayStep: journeyDirection === 'backward' ? step * -1 : step,
          nodes: limitedNodes,
          totalValue: limitedNodes.reduce((sum, node) => sum + node.value, 0),
        }
      })
  }, [journeyDirection, nodeValues, nodes])

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>()
    stepsData.forEach((step) => {
      step.nodes.forEach((node) => ids.add(node.nodeId))
    })
    return ids
  }, [stepsData])

  const selectedNodeIndex = useMemo(() => {
    if (!selectedNodeId) return -1
    return nodes.findIndex((node) => node.nodeId === selectedNodeId)
  }, [nodes, selectedNodeId])

  const connectedNodeIds = useMemo(() => {
    if (selectedNodeIndex < 0) return new Set<string>()
    return getConnectedNodeIds(selectedNodeIndex, nodes, links)
  }, [links, nodes, selectedNodeIndex])

  const renderedSteps = useMemo(() => {
    if (!reverseVisualOrder) return stepsData
    return [...stepsData].reverse()
  }, [reverseVisualOrder, stepsData])

  const stepToColumn = useMemo(() => {
    const result = new Map<number, number>()
    renderedSteps.forEach((step, idx) => result.set(step.step, idx))
    return result
  }, [renderedSteps])

  const nodeTopById = useMemo(() => {
    const centersById = new Map<string, number>()
    const topById = new Map<string, number>()

    const incomingByTarget = new Map<string, Array<{ sourceId: string; value: number }>>()

    links.forEach((link) => {
      const sourceNode = nodes[link.source]
      const targetNode = nodes[link.target]
      if (!sourceNode || !targetNode) return
      if (!visibleNodeIds.has(sourceNode.nodeId) || !visibleNodeIds.has(targetNode.nodeId)) return

      if (!incomingByTarget.has(targetNode.nodeId)) incomingByTarget.set(targetNode.nodeId, [])
      incomingByTarget.get(targetNode.nodeId)?.push({ sourceId: sourceNode.nodeId, value: link.value })
    })

    const getBaselineCenter = (index: number): number =>
      FRAME_PADDING + CARD_HEIGHT / 2 + index * (CARD_HEIGHT + CARD_GAP)

    renderedSteps.forEach((step) => {
      const desired = step.nodes.map((node, index) => {
        const incoming = incomingByTarget.get(node.nodeId) || []
        const weighted = incoming
          .map((entry) => ({ center: centersById.get(entry.sourceId), weight: entry.value }))
          .filter((item): item is { center: number; weight: number } => typeof item.center === 'number')

        if (!weighted.length) {
          return { nodeId: node.nodeId, desiredCenter: getBaselineCenter(index), index }
        }

        const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
        const weightedCenter = weighted.reduce((sum, item) => sum + item.center * item.weight, 0) / totalWeight

        return { nodeId: node.nodeId, desiredCenter: weightedCenter + index * 0.001, index }
      })

      desired
        .sort((a, b) => a.desiredCenter - b.desiredCenter || a.index - b.index)
        .forEach((entry, idx) => {
          const desiredTop = entry.desiredCenter - CARD_HEIGHT / 2
          const prevNodeId = desired[idx - 1]?.nodeId
          const minTop =
            idx === 0
              ? FRAME_PADDING
              : Math.max(FRAME_PADDING, (topById.get(prevNodeId) || FRAME_PADDING) + CARD_HEIGHT + CARD_GAP)

          const top = Math.max(desiredTop, minTop)
          topById.set(entry.nodeId, top)
          centersById.set(entry.nodeId, top + CARD_HEIGHT / 2)
        })
    })

    return topById
  }, [links, nodes, renderedSteps, visibleNodeIds])

  const containerHeight = useMemo(
    () =>
      Math.max(
        MIN_CANVAS_HEIGHT,
        ...Array.from(nodeTopById.values()).map((top) => top + CARD_HEIGHT + FRAME_HEADER_HEIGHT + FRAME_PADDING),
      ),
    [nodeTopById],
  )

  const nodeGeometry = useMemo(() => {
    const result = new Map<string, { x: number; y: number; width: number; height: number }>()

    renderedSteps.forEach((step) => {
      const col = stepToColumn.get(step.step)
      if (col === undefined) return

      const frameX = col * (FRAME_WIDTH + FRAME_GAP)
      const cardX = frameX + FRAME_PADDING

      step.nodes.forEach((node) => {
        const y = FRAME_HEADER_HEIGHT + (nodeTopById.get(node.nodeId) || FRAME_PADDING)
        result.set(node.nodeId, { x: cardX, y, width: FRAME_WIDTH - FRAME_PADDING * 2, height: CARD_HEIGHT })
      })
    })

    return result
  }, [nodeTopById, renderedSteps, stepToColumn])

  const paths = useMemo(() => {
    return links
      .map((link) => {
        const sourceNode = nodes[link.source]
        const targetNode = nodes[link.target]
        if (!sourceNode || !targetNode) return null
        if (!visibleNodeIds.has(sourceNode.nodeId) || !visibleNodeIds.has(targetNode.nodeId)) return null

        const sourceRect = nodeGeometry.get(sourceNode.nodeId)
        const targetRect = nodeGeometry.get(targetNode.nodeId)
        if (!sourceRect || !targetRect) return null

        const sourceIsLeft = sourceRect.x < targetRect.x
        const x1 = sourceIsLeft ? sourceRect.x + sourceRect.width : sourceRect.x
        const x2 = sourceIsLeft ? targetRect.x : targetRect.x + targetRect.width
        const y1 = sourceRect.y + sourceRect.height / 2
        const y2 = targetRect.y + targetRect.height / 2

        const distance = Math.max(80, Math.abs(x2 - x1))
        const cp1x = sourceIsLeft ? x1 + distance * 0.45 : x1 - distance * 0.45
        const cp2x = sourceIsLeft ? x2 - distance * 0.45 : x2 + distance * 0.45

        const inFocus = selectedNodeId
          ? connectedNodeIds.has(sourceNode.nodeId) && connectedNodeIds.has(targetNode.nodeId)
          : true

        return {
          d: `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`,
          width: Math.max(1.5, Math.min(6, Math.log10(link.value + 1) * 2.2)),
          opacity: inFocus ? 0.8 : 0.1,
          key: `${sourceNode.nodeId}-${targetNode.nodeId}-${link.value}`,
        }
      })
      .filter((path): path is NonNullable<typeof path> => !!path)
  }, [connectedNodeIds, links, nodeGeometry, nodes, selectedNodeId, visibleNodeIds])

  if (!renderedSteps.length) {
    return <div className="p-4 text-gray-500">Ingen data å vise i canvas.</div>
  }

  return (
    <>
      <div className="mb-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3">
        <p className="text-sm text-[var(--ax-text-subtle)]">
          Canvas-visning viser topp {MAX_NODES_PER_STEP} sider per steg for bedre ytelse.
        </p>
      </div>

      <section className="relative overflow-auto rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-6">
        <div
          className="relative"
          style={{
            width: `${renderedSteps.length * FRAME_WIDTH + Math.max(0, renderedSteps.length - 1) * FRAME_GAP}px`,
            minHeight: `${containerHeight}px`,
          }}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {paths.map((path) => (
              <path
                key={path.key}
                d={path.d}
                stroke="var(--journey-line-color, #0067c5)"
                strokeWidth={path.width}
                fill="none"
                opacity={path.opacity}
                strokeLinecap="round"
              />
            ))}
          </svg>

          {renderedSteps.map((step) => {
            const col = stepToColumn.get(step.step) || 0
            const frameX = col * (FRAME_WIDTH + FRAME_GAP)

            return (
              <div
                key={step.step}
                className="absolute rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)]"
                style={{ left: `${frameX}px`, top: 0, width: `${FRAME_WIDTH}px`, minHeight: `${containerHeight}px` }}
              >
                <div className="sticky top-0 z-20 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ax-text-subtle)]">Steg</div>
                  <div className="text-base font-semibold text-[var(--ax-text-default)]">{step.displayStep}</div>
                  <div className="text-xs text-[var(--ax-text-subtle)]">
                    {step.totalValue.toLocaleString('nb-NO')} besøk
                  </div>
                </div>

                <div className="relative" style={{ minHeight: `${containerHeight - FRAME_HEADER_HEIGHT}px` }}>
                  {step.nodes.map((node) => {
                    const top = FRAME_HEADER_HEIGHT + (nodeTopById.get(node.nodeId) || FRAME_PADDING)
                    const isSelected = selectedNodeId === node.nodeId
                    const isDimmed = selectedNodeId !== null && !connectedNodeIds.has(node.nodeId)
                    const iframeSrc = createPreviewProxySrc(domain, node.name)

                    return (
                      <article
                        key={node.nodeId}
                        className={`absolute left-3 right-3 overflow-hidden rounded-md border bg-[var(--ax-bg-default)] transition-all ${
                          isSelected
                            ? 'border-blue-600 ring-2 ring-blue-600 shadow-md'
                            : 'border-[var(--ax-border-neutral-subtle)] hover:border-[var(--ax-border-neutral-strong)]'
                        } ${isDimmed ? 'opacity-30 grayscale' : 'opacity-100'}`}
                        style={{ top: `${top}px`, height: `${CARD_HEIGHT}px` }}
                        onClick={() => setSelectedNodeId((prev) => (prev === node.nodeId ? null : node.nodeId))}
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] px-2 py-1.5">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-[var(--ax-text-default)]">
                              {node.name}
                            </div>
                            <div className="text-[11px] text-[var(--ax-text-subtle)]">
                              {node.value.toLocaleString('nb-NO')} brukere
                            </div>
                          </div>

                          <Button
                            size="xsmall"
                            variant="tertiary"
                            icon={<ExternalLink size={14} />}
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedUrl(node.name)
                            }}
                          >
                            Analyse
                          </Button>
                        </div>

                        <div className="h-[198px] bg-white">
                          {iframeSrc ? (
                            <iframe
                              title={`Forhåndsvisning av ${node.name}`}
                              src={iframeSrc}
                              className="h-full w-full"
                              loading="lazy"
                              sandbox="allow-same-origin allow-scripts allow-forms"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-[var(--ax-text-subtle)]">
                              Kunne ikke lage forhåndsvisning for denne siden.
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <AnalysisActionModal
        open={!!selectedUrl}
        onClose={() => setSelectedUrl(null)}
        urlPath={selectedUrl}
        websiteId={websiteId}
        period={period}
        domain={domain}
      />
    </>
  )
}

export default UserJourneyCanvasView
