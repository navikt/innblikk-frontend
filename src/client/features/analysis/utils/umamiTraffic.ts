import type { UmamiNode, UmamiLink, StepData } from '../model/types.ts'

export interface ProcessedJourneyData {
  stepsData: StepData[]
  adjacency: number[][]
  reverseAdjacency: number[][]
}

export const processJourneyData = (nodes: UmamiNode[], links: UmamiLink[]): ProcessedJourneyData => {
  if (!nodes || nodes.length === 0) {
    return { stepsData: [], adjacency: [], reverseAdjacency: [] }
  }

  const stepsMap = new Map<number, UmamiNode[]>()
  nodes.forEach((node) => {
    const match = node.nodeId.match(/^(\d+):/)
    if (match) {
      const step = parseInt(match[1])
      if (!stepsMap.has(step)) stepsMap.set(step, [])
      stepsMap.get(step)?.push(node)
    }
  })

  const nodeValues = new Map<string, number>()
  nodes.forEach((n) => nodeValues.set(n.nodeId, 0))

  const adjacency: number[][] = Array(nodes.length)
    .fill(null)
    .map(() => [])
  const reverseAdjacency: number[][] = Array(nodes.length)
    .fill(null)
    .map(() => [])

  links.forEach((link) => {
    adjacency[link.source].push(link.target)
    reverseAdjacency[link.target].push(link.source)

    const sourceNode = nodes[link.source]
    const targetNode = nodes[link.target]

    if (sourceNode) {
      const sourceStep = parseInt(sourceNode.nodeId.split(':')[0])
      if (sourceStep === 0) {
        nodeValues.set(sourceNode.nodeId, (nodeValues.get(sourceNode.nodeId) || 0) + link.value)
      }
    }
    if (targetNode) {
      nodeValues.set(targetNode.nodeId, (nodeValues.get(targetNode.nodeId) || 0) + link.value)
    }
  })

  const sortedSteps = Array.from(stepsMap.keys()).sort((a, b) => a - b)

  const stepsData: StepData[] = sortedSteps.map((step) => {
    const stepNodes = stepsMap.get(step) || []
    const stepTotal = stepNodes.reduce((sum, node) => sum + (nodeValues.get(node.nodeId) || 0), 0)

    const items = stepNodes
      .map((node) => {
        const val = nodeValues.get(node.nodeId) || 0
        return {
          name: node.name,
          value: val,
          percentage: stepTotal > 0 ? (val / stepTotal) * 100 : 0,
          nodeId: node.nodeId,
        }
      })
      .sort((a, b) => b.value - a.value)

    return { step: step + 1, items, totalValue: stepTotal }
  })

  return { stepsData, adjacency, reverseAdjacency }
}

export const getConnectedNodeIds = (
  selectedNodeId: string,
  nodes: UmamiNode[],
  adjacency: number[][],
  reverseAdjacency: number[][],
): Set<string> => {
  const connected = new Set<string>()
  const selectedNodeIndex = nodes.findIndex((n) => n.nodeId === selectedNodeId)
  if (selectedNodeIndex === -1) return connected

  const visited = new Set<number>()
  visited.add(selectedNodeIndex)
  connected.add(nodes[selectedNodeIndex].nodeId)

  // Downstream (forward BFS)
  let currentQueue = [selectedNodeIndex]
  while (currentQueue.length > 0) {
    const nextQueue: number[] = []
    for (const idx of currentQueue) {
      for (const targetIdx of adjacency[idx]) {
        if (!visited.has(targetIdx)) {
          visited.add(targetIdx)
          connected.add(nodes[targetIdx].nodeId)
          nextQueue.push(targetIdx)
        }
      }
    }
    currentQueue = nextQueue
  }

  // Upstream (backward BFS)
  currentQueue = [selectedNodeIndex]
  const visitedUpstream = new Set<number>()
  visitedUpstream.add(selectedNodeIndex)

  while (currentQueue.length > 0) {
    const nextQueue: number[] = []
    for (const idx of currentQueue) {
      for (const sourceIdx of reverseAdjacency[idx]) {
        if (!visitedUpstream.has(sourceIdx)) {
          visitedUpstream.add(sourceIdx)
          connected.add(nodes[sourceIdx].nodeId)
          nextQueue.push(sourceIdx)
        }
      }
    }
    currentQueue = nextQueue
  }

  return connected
}
