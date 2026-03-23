import { Alert } from '@navikt/ds-react'
import type { QueryStats } from '../model/types'

interface CostEstimateDisplayProps {
  estimate: QueryStats
  onDismiss: () => void
}

export default function CostEstimateDisplay({ estimate, onDismiss }: CostEstimateDisplayProps) {
  const gb = Number(estimate.totalBytesProcessedGB ?? 0)
  const cost = Number(estimate.estimatedCostUSD ?? NaN) || (isFinite(gb) ? gb * 0.00625 : 0)

  return (
    <Alert variant="info" className="relative" size="small" style={{ marginTop: 24 }}>
      <button
        type="button"
        aria-label="Lukk"
        onClick={onDismiss}
        className="absolute right-2 top-2 font-bold cursor-pointer"
      >
        ×
      </button>
      <div className="space-y-1 text-sm">
        <div>
          <strong>Data:</strong>
          {isFinite(gb) && gb >= 0.01 ? ` ${gb} GB` : ''}
        </div>
        {cost > 0 && (
          <div>
            <strong>Kostnad:</strong> ${cost.toFixed(2)} USD
          </div>
        )}
        {estimate.cacheHit && <div className="text-[var(--ax-text-success)]">✓ Cached (no cost)</div>}
      </div>
    </Alert>
  )
}
