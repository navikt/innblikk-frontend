import type { GoalCompletionSummary } from '../model/types'

interface GoalCompletionStatsCardsProps {
  summary: GoalCompletionSummary
}

const formatAdaptivePercent = (part: number, total: number): string => {
  if (total <= 0 || part <= 0) return '0.0%'

  const percentage = (part / total) * 100
  const roundedOneDecimal = Number(percentage.toFixed(1))

  if (roundedOneDecimal === 0) return '<0.1%'
  return `${roundedOneDecimal.toFixed(1)}%`
}

const GoalCompletionStatsCards = ({ summary }: GoalCompletionStatsCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Startet prosessen</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
          {summary.totalStarters.toLocaleString('nb-NO')}
        </div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">Unike brukere</div>
      </div>
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Fullførte samme dag</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
          {formatAdaptivePercent(summary.sameDayCompleted, summary.totalStarters)}
        </div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
          {summary.sameDayCompleted.toLocaleString('nb-NO')} unike brukere
        </div>
      </div>
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Fullførte i perioden</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
          {formatAdaptivePercent(summary.totalCompleted, summary.totalStarters)}
        </div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
          {summary.totalCompleted.toLocaleString('nb-NO')} unike brukere
        </div>
      </div>
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Fullførte ikke</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
          {formatAdaptivePercent(summary.nonCompleted, summary.totalStarters)}
        </div>
        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
          {summary.nonCompleted.toLocaleString('nb-NO')} unike brukere
        </div>
      </div>
    </div>
  )
}

export default GoalCompletionStatsCards
