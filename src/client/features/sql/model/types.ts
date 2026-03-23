import type { QueryStats } from '../../../shared/types/queryStats'

export type { Website } from '../../../shared/types/website'

export type JsonPrimitive = string | number | boolean | null

export interface JsonObject {
  [key: string]: JsonValue
}

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export type Row = Record<string, JsonValue | undefined>

export type { QueryStats }

export type QueryResult = {
  data?: Row[]
  queryStats?: QueryStats
}

declare global {
  interface Window {
    __GCP_PROJECT_ID__?: string
  }
}
