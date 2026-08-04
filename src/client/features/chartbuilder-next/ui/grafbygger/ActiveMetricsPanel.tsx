import { TextField } from '@navikt/ds-react'
import { useState } from 'react'
import type { Metric, MetricOption } from '../../../../shared/types/chart.ts'
import ToggleOption from '../../../../shared/ui/ToggleOption.tsx'

interface ActiveMetricsPanelProps {
  metrics: Metric[]
  METRICS: MetricOption[]
  updateMetric: (index: number, updates: Partial<Metric>) => void
}

const ActiveMetricsPanel = ({ metrics, METRICS, updateMetric }: ActiveMetricsPanelProps) => {
  const [showRenaming, setShowRenaming] = useState<boolean>(false)

  const getMetricDisplayName = (metric: Metric): string => {
    if (metric.function === 'distinct' && metric.column === 'session_id') return 'Antall unike besøkende'
    if (metric.function === 'distinct' && metric.column === 'visit_id') return 'Økter / besøk'
    if (metric.function === 'count' && metric.alias === 'Antall_sidevisninger') return 'Antall sidevisninger'
    if (metric.function === 'count' && metric.alias === 'Antall_hendelser') return 'Antall hendelser'
    if (
      metric.function === 'percentage' &&
      metric.column === 'session_id' &&
      metric.alias === 'Andel_av_besokende_pa_side'
    )
      return 'Andel av besøkende på side'
    if (metric.function === 'percentage' && metric.column === 'session_id') return 'Andel av besøkende'
    if (
      metric.function === 'percentage' &&
      metric.column === 'event_id' &&
      metric.alias === 'Andel_av_hendelser_pa_side'
    )
      return 'Andel av hendelser på side'
    if (metric.function === 'percentage' && metric.column === 'event_id') return 'Andel av hendelser'
    if (metric.function === 'andel' && metric.column === 'session_id') return 'Andel av totale besøkende'
    if (metric.function === 'bounce_rate' && metric.column === 'visit_id') return 'Fluktrate'
    if (metric.function === 'average' && metric.column === 'visit_duration')
      return metric.showInMinutes ? 'Besøksvarighet i minutter' : 'Besøksvarighet i sekunder'
    return METRICS.find((m) => m.value === metric.function)?.label || 'Måling'
  }

  if (metrics.length === 0) return null

  return (
    <div className="flex flex-col gap-3 pb-2">
      <ToggleOption label="Tilpass kolonnenavn" checked={showRenaming} onChange={(checked) => setShowRenaming(checked)}>
        {metrics.map((metric, index) => (
          <TextField
            key={index}
            label={getMetricDisplayName(metric)}
            value={metric.alias || ''}
            onChange={(e) => updateMetric(index, { alias: e.target.value })}
            placeholder={`metrikk_${index + 1}`}
            size="small"
          />
        ))}
      </ToggleOption>
    </div>
  )
}

export default ActiveMetricsPanel
