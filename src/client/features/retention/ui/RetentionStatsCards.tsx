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
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Kom tilbake etter 1 dag</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
          {stats.day1 ? ((stats.day1.returning_users / stats.baseline) * 100).toFixed(1) : 0}%
        </div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
          {stats.day1 ? stats.day1.returning_users.toLocaleString('nb-NO') : 0} unike brukere
        </div>
      </div>
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">
          {stats.day7 ? 'Kom tilbake etter 1 uke' : `Kom tilbake etter ${stats.lastDay?.day || 0} dager`}
        </div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
          {stats.day7
            ? ((stats.day7.returning_users / stats.baseline) * 100).toFixed(1)
            : stats.lastDay
              ? ((stats.lastDay.returning_users / stats.baseline) * 100).toFixed(1)
              : 0}
          %
        </div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
          {stats.day7
            ? stats.day7.returning_users.toLocaleString('nb-NO')
            : stats.lastDay
              ? stats.lastDay.returning_users.toLocaleString('nb-NO')
              : 0}{' '}
          unike brukere
        </div>
      </div>
    </div>
  )
}

export default RetentionStatsCards
