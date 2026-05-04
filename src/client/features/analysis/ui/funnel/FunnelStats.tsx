import React from 'react'
import type { FunnelStatsProps } from '../../model/types.ts'
import { computeFunnelStats } from '../../utils/funnelStats.ts'

const FunnelStats: React.FC<FunnelStatsProps> = ({ data }) => {
  const stats = computeFunnelStats(data)
  if (!stats) return null

  const { totalStarted, totalCompleted, dropoffCount, completionRate, dropoffRate } = stats

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Totalt startet</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">{totalStarted.toLocaleString('nb-NO')}</div>
      </div>
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Fullførte</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">{completionRate}%</div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
          {totalCompleted.toLocaleString('nb-NO')} fullførte
        </div>
      </div>
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Falt fra</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">{dropoffRate}%</div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">{dropoffCount.toLocaleString('nb-NO')} falt fra</div>
      </div>
    </div>
  )
}

export default FunnelStats
