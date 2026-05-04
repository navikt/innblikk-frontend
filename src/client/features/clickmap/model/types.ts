import type { QueryStats } from '../../../shared/types/queryStats'

export type ClickmapItem = {
  sourcePath: string
  linkText: string
  destination: string
  section: string
  audience: string
  component: string
  count: number
}

export type ClickmapResponse = {
  data?: ClickmapItem[]
  queryStats?: QueryStats
}
