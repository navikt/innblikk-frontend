import type { QueryStats } from '../../model'

interface QueryStatsDisplayProps {
  queryStats: QueryStats | null
}

export default function QueryStatsDisplay({ queryStats }: QueryStatsDisplayProps) {
  if (!queryStats) return null

  return (
    <div className="text-sm text-[var(--ax-text-subtle)] text-right mt-4">
      {queryStats.totalBytesProcessedGB !== undefined && (
        <span>
          Data prosessert:{' '}
          {typeof queryStats.totalBytesProcessedGB === 'number'
            ? queryStats.totalBytesProcessedGB.toFixed(2)
            : queryStats.totalBytesProcessedGB}{' '}
          GB
        </span>
      )}
      {queryStats.estimatedCostUSD !== undefined && (
        <span className="ml-4">
          Estimert kostnad: $
          {typeof queryStats.estimatedCostUSD === 'number'
            ? queryStats.estimatedCostUSD.toFixed(4)
            : queryStats.estimatedCostUSD}
        </span>
      )}
    </div>
  )
}
