/**
 * Shared Website type returned by the BigQuery /api/bigquery/websites endpoint.
 */
export interface Website {
  id: string
  name: string
  domain: string
  teamId: string
  createdAt: string
  updatedAt?: string
}
