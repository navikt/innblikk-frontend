import type { JourneyStats } from '../../model/types.ts'
import { formatNumber, getPercentage } from '../../utils/formatters.ts'

interface JourneyStatsGridProps {
  journeyStats: JourneyStats | null
}

const StatCard = ({ label, value, subtitle }: { label: string; value: string; subtitle: string }) => (
  <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
    <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">{label}</div>
    <div className="text-2xl font-bold text-[var(--ax-text-default)] mb-1">{value}</div>
    <div className="text-sm text-[var(--ax-text-subtle)] mt-1">{subtitle}</div>
  </div>
)

const JourneyStatsGrid = ({ journeyStats }: JourneyStatsGridProps) => {
  const totalSessions = journeyStats?.total_sessions || 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <StatCard label="Økter" value={formatNumber(totalSessions)} subtitle="Totalt i utvalget" />
      <StatCard
        label="Utførte handlinger"
        value={getPercentage(journeyStats?.sessions_with_events || 0, totalSessions)}
        subtitle={`${formatNumber(journeyStats?.sessions_with_events || 0)} økter`}
      />
      <StatCard
        label="Navigering uten handling"
        value={getPercentage(journeyStats?.sessions_no_events_navigated || 0, totalSessions)}
        subtitle={`${formatNumber(journeyStats?.sessions_no_events_navigated || 0)} økter`}
      />
      <StatCard
        label="Forlot nettstedet"
        value={getPercentage(journeyStats?.sessions_no_events_bounced || 0, totalSessions)}
        subtitle={`${formatNumber(journeyStats?.sessions_no_events_bounced || 0)} økter`}
      />
    </div>
  )
}

export default JourneyStatsGrid
