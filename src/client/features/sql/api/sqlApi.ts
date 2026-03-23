import type { QueryStats, QueryResult } from '../model/types'

export { fetchWebsites } from '../../../shared/api/websiteApi'

export const estimateQueryCost = async (processedSql: string): Promise<QueryStats> => {
  const response = await fetch('/api/bigquery/estimate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: processedSql, analysisType: 'Sqlverktøy' }),
  })

  const data = (await response.json()) as QueryStats & { error?: string }

  if (!response.ok) {
    throw new Error(data.error || 'Estimation failed')
  }

  return data
}

export const executeQueryApi = async (processedSql: string): Promise<QueryResult> => {
  const response = await fetch('/api/bigquery', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: processedSql, analysisType: 'Sqlverktøy' }),
  })

  const data = (await response.json()) as QueryResult & { error?: string }

  if (!response.ok) {
    throw new Error(data.error || 'Query failed')
  }

  return data
}
