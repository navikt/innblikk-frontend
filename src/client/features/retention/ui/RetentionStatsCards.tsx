import type { RetentionStats as RetentionStatsType } from '../model/types'

interface RetentionStatsProps {
  stats: RetentionStatsType
}

const RetentionStatsCards = ({ stats }: RetentionStatsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Totalt antall brukere</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">{stats.baseline.toLocaleString('nb-NO')}</div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">Unike brukere (Dag 0)</div>
      </div>
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Kom tilbake samme dag</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
          {stats.baseline > 0 ? ((stats.sameDayReturningUsers / stats.baseline) * 100).toFixed(1) : 0}%
        </div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
          {stats.sameDayReturningUsers.toLocaleString('nb-NO')} unike brukere
        </div>
      </div>
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Kom ikke tilbake</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
          {stats.baseline > 0 ? ((stats.nonReturningUsers / stats.baseline) * 100).toFixed(1) : 0}%
        </div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
          {stats.nonReturningUsers.toLocaleString('nb-NO')} unike brukere
        </div>
      </div>
    </div>
  )
}

export default RetentionStatsCards
