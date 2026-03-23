import { useMemo, useState, useRef, useLayoutEffect } from 'react'
import type { UmamiNode, UmamiLink, ConnectionPath } from '../model/types.ts'
import { processJourneyData, getConnectedNodeIds } from '../utils/umamiTraffic.ts'

export const useUmamiTraffic = (nodes: UmamiNode[], links: UmamiLink[], isFullscreen: boolean) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [paths, setPaths] = useState<ConnectionPath[]>([])

  const contentRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const { stepsData, adjacency, reverseAdjacency } = useMemo(() => processJourneyData(nodes, links), [nodes, links])

  const connectedNodeIds = useMemo(
    () =>
      selectedNodeId ? getConnectedNodeIds(selectedNodeId, nodes, adjacency, reverseAdjacency) : new Set<string>(),
    [selectedNodeId, nodes, adjacency, reverseAdjacency],
  )

  // Calculate SVG connection paths
  useLayoutEffect(() => {
    if (!selectedNodeId || !contentRef.current) {
      const t = setTimeout(() => setPaths([]), 0)
      return () => clearTimeout(t)
    }

    const rafId = requestAnimationFrame(() => {
      if (!contentRef.current) return

      const newPaths: ConnectionPath[] = []
      const contentRect = contentRef.current.getBoundingClientRect()

      const createPath = (sourceId: string, targetId: string): string | null => {
        const sourceEl = nodeRefs.current.get(sourceId)
        const targetEl = nodeRefs.current.get(targetId)
        if (!sourceEl || !targetEl) return null

        const sourceRect = sourceEl.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()

        const x1 = sourceRect.right - contentRect.left
        const y1 = sourceRect.top + sourceRect.height / 2 - contentRect.top
        const x2 = targetRect.left - contentRect.left
        const y2 = targetRect.top + targetRect.height / 2 - contentRect.top

        const dist = Math.abs(x2 - x1)
        const cp1x = x1 + dist * 0.5
        const cp2x = x2 - dist * 0.5

        return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`
      }

      links.forEach((link) => {
        const sourceNode = nodes[link.source]
        const targetNode = nodes[link.target]

        if (
          sourceNode &&
          targetNode &&
          connectedNodeIds.has(sourceNode.nodeId) &&
          connectedNodeIds.has(targetNode.nodeId)
        ) {
          const d = createPath(sourceNode.nodeId, targetNode.nodeId)
          if (d) newPaths.push({ d, opacity: 0.8 })
        }
      })

      setPaths(newPaths)
    })

    return () => cancelAnimationFrame(rafId)
  }, [selectedNodeId, nodes, links, stepsData, connectedNodeIds, isFullscreen])

  // Handle resize
  useLayoutEffect(() => {
    const handleResize = () => setSelectedNodeId((prev) => prev)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleNode = (nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId))
  }

  return {
    stepsData,
    selectedNodeId,
    connectedNodeIds,
    paths,
    contentRef,
    nodeRefs,
    toggleNode,
  }
}
