import React from 'react'
import { HelpText } from '@navikt/ds-react'
import type { TrafficStatsProps } from '../../model/types.ts'
import {
  computeTrafficStats,
  formatMetricValue,
  getMetricExplainer,
  getTotalExplainer,
} from '../../utils/trafficStats.ts'
import { formatDateRange } from '../../utils/periodPicker.ts'
import { MetricExplainerPopover } from './MetricExplainerPopover.tsx'

const TrafficStats: React.FC<TrafficStatsProps> = ({
  data,
  metricType,
  totalOverride,
  granularity = 'day',
  submittedDateRange,
}) => {
  const stats = computeTrafficStats(data, metricType, totalOverride, granularity)
  if (!stats) return null

  const {
    box1Label,
    box1Value,
    box2Label,
    box2Value,
    box2Suffix,
    box3Label,
    box3Value,
    box3Subtext,
    box3Timestamp,
    valueSuffix,
  } = stats

  const totalExplainer = getTotalExplainer(metricType)
  const metricExplainer = getMetricExplainer(metricType)
  const periodLabel = submittedDateRange
    ? formatDateRange(submittedDateRange.startDate, submittedDateRange.endDate)
    : ''

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Box 1 — Totalt / Gjennomsnittlig andel (combined explainer: what + how aggregated) */}
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-sm text-[var(--ax-text-default)] font-medium">{box1Label}</div>
          <HelpText title={metricExplainer.title} placement="top">
            <MetricExplainerPopover
              metricExplainer={metricExplainer}
              totalExplainer={totalExplainer}
              metricType={metricType}
            />
          </HelpText>
        </div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)] flex items-baseline gap-2">
          {formatMetricValue(box1Value, metricType)}
          {valueSuffix && (
            <span className="text-sm font-normal text-[var(--ax-text-neutral-subtle)]">{valueSuffix}</span>
          )}
        </div>
        {periodLabel && <div className="text-sm text-[var(--ax-text-subtle)] mt-1">{periodLabel}</div>}
      </div>

      {/* Box 2 — Snitt per <unit> / Median andel */}
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">{box2Label}</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)] flex items-baseline flex-wrap gap-2">
          {formatMetricValue(box2Value, metricType)}
          {box2Suffix && <span className="text-sm font-normal text-[var(--ax-text-neutral-subtle)]">{box2Suffix}</span>}
        </div>
      </div>

      {/* Box 3 — Topp-periode / Høyeste andel */}
      <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">{box3Label}</div>
        <div className="text-2xl font-bold text-[var(--ax-text-default)] flex items-baseline flex-wrap gap-2">
          {formatMetricValue(box3Value, metricType)}
          {(valueSuffix || box3Subtext) && (
            <span className="text-sm font-normal text-[var(--ax-text-neutral-subtle)] inline-flex flex-wrap gap-1">
              {valueSuffix && <span>{valueSuffix}</span>}
              {box3Subtext && <span>{box3Subtext}</span>}
            </span>
          )}
        </div>
        {box3Timestamp && <div className="text-sm text-[var(--ax-text-subtle)] mt-1">{box3Timestamp}</div>}
      </div>
    </div>
  )
}

export default TrafficStats
