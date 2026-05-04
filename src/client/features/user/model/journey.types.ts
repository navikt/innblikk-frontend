import type { QueryStats } from '../../../shared/types/queryStats'

export type JourneyNode = {
  nodeId: string
  name: string
}

export type JourneyLink = {
  source: number
  target: number
  value: number
  color?: string
}

export type JourneyData = {
  nodes: JourneyNode[]
  links: JourneyLink[]
}

export type { QueryStats }

export type JourneyApiRequest = {
  websiteId: string
  startUrl: string
  startDate: string
  endDate: string
  steps: number
  limit: number
  direction: string
}

export type JourneyApiResponse = {
  nodes?: JourneyNode[]
  links?: JourneyLink[]
  queryStats?: QueryStats
}
