import type { QueryResult, QueryStats } from '../../sql/model/types'
import { requestJson } from '../../../shared/lib/apiClient'

export const estimateDndQueryCost = async (query: string): Promise<QueryStats> => {
  return requestJson<QueryStats>('/api/bigquery/chartbuilder-dnd/estimate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
}

export const executeDndQuery = async (query: string): Promise<QueryResult> => {
  return requestJson<QueryResult>('/api/bigquery/chartbuilder-dnd/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
}
