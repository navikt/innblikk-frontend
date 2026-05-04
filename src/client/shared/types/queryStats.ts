/**
 * Shared query cost/statistics metadata returned by BigQuery API endpoints.
 *
 * Some endpoints return numeric values while others return pre-formatted strings,
 * hence the union types for several fields.
 */
export type QueryStats = {
  totalBytesProcessed?: number
  totalBytesProcessedGB?: number | string
  estimatedCostUSD?: number | string
  cacheHit?: boolean
}
