import { Button } from '@navikt/ds-react'
import { ChartNoAxesCombined, Trash2 } from 'lucide-react'
import type { CanvasConnectionMetric, CanvasConnectionVisual } from '../../model/types.ts'

type CanvasConnectionPreview = {
  path: string
}

type CanvasConnectionLayerProps = {
  connectionSegments: CanvasConnectionVisual[]
  connectionPreview: CanvasConnectionPreview | null
  connectionSegmentsWithMetrics: Array<CanvasConnectionVisual & { metrics: CanvasConnectionMetric }>
  onRequestRemoveConnection: (connection: CanvasConnectionVisual) => void
}

const CanvasConnectionLayer = ({
  connectionSegments,
  connectionPreview,
  connectionSegmentsWithMetrics,
  onRequestRemoveConnection,
}: CanvasConnectionLayerProps) => (
  <>
    {connectionSegments.length > 0 && (
      <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible">
        <defs>
          <marker
            id="canvas-connection-arrow"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,4 L0,8 z" fill="var(--ax-border-accent)" />
          </marker>
        </defs>
        {connectionSegments.map((segment) => (
          <g key={segment.id}>
            <path
              d={segment.path}
              stroke="var(--ax-border-accent)"
              strokeWidth={2}
              fill="none"
              markerEnd="url(#canvas-connection-arrow)"
            />
            <path
              d={segment.path}
              stroke="transparent"
              strokeWidth={16}
              fill="none"
              className="pointer-events-auto cursor-pointer"
              onClick={(event) => event.preventDefault()}
            />
          </g>
        ))}
      </svg>
    )}

    {connectionPreview && (
      <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible">
        <defs>
          <marker
            id="canvas-connection-arrow-preview"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,4 L0,8 z" fill="var(--ax-border-accent)" />
          </marker>
        </defs>
        <path
          d={connectionPreview.path}
          stroke="var(--ax-border-accent)"
          strokeWidth={3}
          strokeDasharray="8 5"
          strokeLinecap="round"
          fill="none"
          markerEnd="url(#canvas-connection-arrow-preview)"
        />
      </svg>
    )}

    {connectionSegmentsWithMetrics.map((segment) => (
      <div
        key={segment.id}
        className="group pointer-events-auto absolute z-[2] -translate-x-1/2 -translate-y-1/2 overflow-visible"
        style={{
          left: `${segment.labelX}px`,
          top: `${segment.labelY}px`,
        }}
      >
        <div className="absolute inset-x-0 -top-10 z-10 flex items-center justify-between gap-2 rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-3 py-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ax-text-default)]">
            <ChartNoAxesCombined size={13} className="text-[var(--ax-text-subtle)]" />
            <span>Kobling</span>
          </div>
          <Button
            size="xsmall"
            variant="tertiary"
            icon={<Trash2 size={14} />}
            onClick={() => onRequestRemoveConnection(segment)}
            title="Fjern kobling"
            aria-label="Fjern kobling"
          />
        </div>
        <div className="min-w-[165px] overflow-hidden rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] shadow-sm">
          <div className="space-y-2 px-3 py-2 text-[13px] leading-tight">
            <div className="space-y-0.5 text-right">
              <div className="font-semibold text-[14px] text-[var(--ax-text-success)]">
                {segment.metrics.percentageOfPrev}% gikk videre
              </div>
              <div className="text-[13px] text-[var(--ax-text-default)]">
                {segment.metrics.toCount.toLocaleString('nb-NO')} brukere
              </div>
            </div>
            <div className="h-px bg-[var(--ax-border-neutral-subtle)]" />
            <div className="space-y-0.5 text-right">
              <div className="font-semibold text-[14px] text-[var(--ax-text-danger)]">
                {segment.metrics.dropoffPercentage}% falt fra
              </div>
              <div className="text-[13px] text-[var(--ax-text-default)]">
                {segment.metrics.dropoffCount.toLocaleString('nb-NO')} brukere
              </div>
            </div>
          </div>
        </div>
      </div>
    ))}
  </>
)

export default CanvasConnectionLayer
