import type { QueryStats } from '../../../shared/types/queryStats'

export type StepParam = { key: string; value: string; operator: 'equals' | 'contains' }

export type FunnelStep = {
  type: 'url' | 'event'
  value: string
  query?: string
  eventScope?: 'current-path' | 'anywhere'
  params?: StepParam[]
}

export type { QueryStats }

export type FunnelResultRow = {
  step: number
  url: string
  count: number
  params?: StepParam[]
}

export type TimingResultRow = {
  fromStep: number // -1 for total row
  toStep: number
  fromUrl?: string
  toUrl?: string
  avgSeconds: number | null
  medianSeconds: number | null
}

export type FunnelApiResponse =
  | { error: string }
  | { data: Omit<FunnelResultRow, 'params'>[]; sql?: string; queryStats?: QueryStats }

export type TimingApiResponse = { error: string } | { data: TimingResultRow[]; sql?: string; queryStats?: QueryStats }

export type EventsApiResponse = { events?: { name: string }[] }
