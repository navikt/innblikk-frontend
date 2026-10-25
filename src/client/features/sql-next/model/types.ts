import type { QueryStats } from '../../../shared/types/queryStats'

export type { QueryStats }
export type { Website } from '../../../shared/types/website'

export type JsonPrimitive = string | number | boolean | null

export interface JsonObject {
  [key: string]: JsonValue
}

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export type Row = Record<string, JsonValue | undefined>

export type QueryResult = {
  data?: Row[]
  queryStats?: QueryStats
}

export type BlockSectionId = 'keywords' | 'fields' | 'tables' | 'filters'

export interface SqlBuildingBlock {
  id: string
  label: string
  code: string
  section: BlockSectionId
  description?: string
}

export interface BigQueryColumnDoc {
  name: string
  label: string
  insertSnippet?: string
}

export interface BigQueryTableDoc {
  id: 'event' | 'session' | 'event_data' | 'website'
  title: string
  shortName: string
  datasetTable: string
  summary: string
  relationLabel?: string
  joinSnippet?: string
  columns: BigQueryColumnDoc[]
}

export interface MonacoEditorInstance {
  getSelection: () => unknown
  executeEdits: (
    source: string,
    edits: Array<{
      range: unknown
      text: string
      forceMoveMarkers?: boolean
    }>,
  ) => boolean
  focus: () => void
}
