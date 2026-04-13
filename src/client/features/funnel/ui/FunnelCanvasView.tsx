import { useMemo, useState } from 'react'
import { Button } from '@navikt/ds-react'
import { ExternalLink } from 'lucide-react'
import AnalysisActionModal from '../../analysis/ui/AnalysisActionModal.tsx'
import { computeFunnelStepMetrics, getStepDestination, getStepLabel } from '../../analysis/utils/horizontalFunnel.ts'
import { normalizeUrlToPath } from '../../../shared/lib/utils.ts'
import type { FunnelResultRow } from '../model/types'

type FunnelCanvasViewProps = {
  data: FunnelResultRow[]
  loading?: boolean
  websiteId?: string
  period?: string
  domain?: string
}

const FRAME_WIDTH = 520
const FRAME_GAP = 260
const FRAME_HEIGHT = 760
const PREVIEW_HEIGHT = 600
const FLOW_LANE_HEIGHT = 0
const BETWEEN_STATS_WIDTH = 220
const BETWEEN_STATS_TOP = 20
const CONNECTOR_Y = 48
const TRANSITION_PRIMARY_TEXT = 'text-[40px] leading-none font-bold'
const TRANSITION_SECONDARY_TEXT = 'text-[30px] leading-none font-semibold'

const buildPreviewTargetUrl = (domain: string | undefined, path: string): string | null => {
  if (!domain || !path) return null

  const queryIndex = path.indexOf('?')
  const normalizedPath = normalizeUrlToPath(queryIndex === -1 ? path : path.substring(0, queryIndex))
  const querySuffix = queryIndex === -1 ? '' : path.substring(queryIndex)
  if (!normalizedPath) return null

  const withProtocol = domain.startsWith('http://') || domain.startsWith('https://') ? domain : `https://${domain}`

  try {
    const domainUrl = new URL(withProtocol)
    const finalPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
    return new URL(`${finalPath}${querySuffix}`, domainUrl.origin).toString()
  } catch {
    return null
  }
}

const createPreviewProxySrc = (domain: string | undefined, pagePath: string): string => {
  const target = buildPreviewTargetUrl(domain, pagePath)
  return target ? `/api/clickmap-preview?url=${encodeURIComponent(target)}` : ''
}

const FunnelCanvasView = ({ data, loading, websiteId, period = 'current_month', domain }: FunnelCanvasViewProps) => {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<number | null>(null)

  const paths = useMemo(() => {
    return data
      .map((item, index) => {
        if (index === data.length - 1) return null

        const currentX = index * (FRAME_WIDTH + FRAME_GAP)
        const nextX = (index + 1) * (FRAME_WIDTH + FRAME_GAP)

        const x1 = currentX + FRAME_WIDTH
        const x2 = nextX
        const y = CONNECTOR_Y
        const delta = Math.max(100, Math.abs(x2 - x1))
        const cp1x = x1 + delta * 0.45
        const cp2x = x2 - delta * 0.45

        const { percentageOfPrev } = computeFunnelStepMetrics(data, index + 1)
        const isFocused = selectedStep === null || selectedStep === item.step || selectedStep === data[index + 1]?.step

        return {
          key: `path-${item.step}-${data[index + 1]?.step}`,
          d: `M ${x1} ${y} C ${cp1x} ${y}, ${cp2x} ${y}, ${x2} ${y}`,
          strokeWidth: Math.max(2, Math.min(8, percentageOfPrev / 16)),
          opacity: isFocused ? 0.85 : 0.16,
          percentageOfPrev,
        }
      })
      .filter((path): path is NonNullable<typeof path> => !!path)
  }, [data, selectedStep])

  if (loading) {
    return <div className="animate-pulse h-64 bg-[var(--ax-bg-neutral-soft)] rounded-lg"></div>
  }

  if (!data || data.length === 0) {
    return <div className="text-center p-8 text-gray-500">Ingen data tilgjengelig for trakten.</div>
  }

  return (
    <>
      <section className="overflow-auto rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-6">
        <div
          className="relative"
          style={{
            width: `${data.length * FRAME_WIDTH + Math.max(0, data.length - 1) * FRAME_GAP}px`,
            minHeight: `${FRAME_HEIGHT + FLOW_LANE_HEIGHT}px`,
          }}
        >
          {data.slice(1).map((item, index) => {
            const currentIndex = index + 1
            const prevX = index * (FRAME_WIDTH + FRAME_GAP)
            const centerX = prevX + FRAME_WIDTH + FRAME_GAP / 2
            const left = centerX - BETWEEN_STATS_WIDTH / 2
            const { percentageOfPrev, dropoffCount, dropoffPercentage } = computeFunnelStepMetrics(data, currentIndex)
            const isFocused =
              selectedStep === null || selectedStep === data[currentIndex - 1]?.step || selectedStep === item.step

            return (
              <div
                key={`between-${data[currentIndex - 1]?.step}-${item.step}`}
                className={`absolute z-40 transition-opacity ${isFocused ? 'opacity-100' : 'opacity-45'}`}
                style={{ left: `${left}px`, top: `${BETWEEN_STATS_TOP}px`, width: `${BETWEEN_STATS_WIDTH}px` }}
              >
                <div className="flex flex-col items-center">
                  <div className="relative z-50 rounded-lg border border-[var(--ax-border-success-subtle)] bg-[var(--ax-bg-success-soft)] px-5 py-4 text-center shadow-sm min-w-[200px]">
                    <div className={`${TRANSITION_PRIMARY_TEXT} text-[var(--ax-text-success)]`}>
                      {percentageOfPrev}%
                    </div>
                    <div className={`${TRANSITION_SECONDARY_TEXT} text-[var(--ax-text-success)] mt-1`}>gikk videre</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ax-text-success)]">
                      {item.count.toLocaleString('nb-NO')} brukere
                    </div>
                  </div>

                  <>
                    <div className="mt-1 h-4 w-px bg-[var(--ax-border-danger-subtle)]" />
                    <div className="rounded-md border border-[var(--ax-border-danger-subtle)] bg-[var(--ax-bg-danger-soft)] px-5 py-4 text-center shadow-sm min-w-[200px]">
                      <div className={`${TRANSITION_PRIMARY_TEXT} text-[var(--ax-text-danger)]`}>
                        {dropoffPercentage}%
                      </div>
                      <div className={`${TRANSITION_SECONDARY_TEXT} text-[var(--ax-text-danger)] mt-1`}>falt fra</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--ax-text-danger)]">
                        {dropoffCount.toLocaleString('nb-NO')} brukere
                      </div>
                    </div>
                  </>
                </div>
              </div>
            )
          })}

          <svg className="pointer-events-none absolute inset-0 h-full w-full z-30">
            {paths.map((path) => (
              <path
                key={path.key}
                d={path.d}
                stroke="var(--journey-line-color, #0067c5)"
                strokeWidth={path.strokeWidth}
                fill="none"
                opacity={path.opacity}
                strokeLinecap="round"
                markerEnd="url(#funnel-flow-arrow)"
              />
            ))}
            <defs>
              <marker id="funnel-flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="var(--journey-line-color, #0067c5)" />
              </marker>
            </defs>
          </svg>

          {data.map((item, index) => {
            const x = index * (FRAME_WIDTH + FRAME_GAP)
            const label = getStepLabel(item.params)
            const destination = getStepDestination(item.params) || item.url
            const iframeSrc = item.url?.startsWith('/') ? createPreviewProxySrc(domain, item.url) : ''
            const funnelMetrics = index > 0 ? computeFunnelStepMetrics(data, index) : null

            const { totalConversionPercent } = computeFunnelStepMetrics(data, index)

            const isSelected = selectedStep === item.step
            const isDimmed = selectedStep !== null && selectedStep !== item.step

            return (
              <article
                key={`step-${item.step}`}
                className={`absolute overflow-hidden rounded-xl border bg-[var(--ax-bg-neutral-soft)] transition-all ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-600 shadow-lg'
                    : 'border-[var(--ax-border-neutral-subtle)] hover:border-[var(--ax-border-neutral-strong)]'
                } ${isDimmed ? 'opacity-40' : 'opacity-100'}`}
                style={{
                  left: `${x}px`,
                  top: `${FLOW_LANE_HEIGHT}px`,
                  width: `${FRAME_WIDTH}px`,
                  minHeight: `${FRAME_HEIGHT}px`,
                }}
                onClick={() => setSelectedStep((prev) => (prev === item.step ? null : item.step))}
              >
                <header className="border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ax-text-subtle)]">
                        Steg {item.step + 1}
                      </div>
                      <div className="text-base font-semibold text-[var(--ax-text-default)] break-all">
                        {label || destination}
                      </div>
                      <div className="text-sm text-[var(--ax-text-subtle)]">
                        {item.count.toLocaleString('nb-NO')} brukere ({totalConversionPercent}% av steg 1)
                      </div>
                      {funnelMetrics && (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-md border border-[var(--ax-border-success-subtle)] bg-[var(--ax-bg-success-soft)] px-2 py-1.5 text-center">
                            <div className="font-bold text-[var(--ax-text-success)]">
                              {funnelMetrics.percentageOfPrev}%
                            </div>
                            <div className="text-[var(--ax-text-success)]">gikk videre</div>
                            <div className="font-semibold text-[var(--ax-text-success)]">
                              {item.count.toLocaleString('nb-NO')} brukere
                            </div>
                          </div>
                          <div className="rounded-md border border-[var(--ax-border-danger-subtle)] bg-[var(--ax-bg-danger-soft)] px-2 py-1.5 text-center">
                            <div className="font-bold text-[var(--ax-text-danger)]">
                              {funnelMetrics.dropoffPercentage}%
                            </div>
                            <div className="text-[var(--ax-text-danger)]">falt fra</div>
                            <div className="font-semibold text-[var(--ax-text-danger)]">
                              {funnelMetrics.dropoffCount.toLocaleString('nb-NO')} brukere
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {websiteId && item.url?.startsWith('/') && (
                      <Button
                        size="xsmall"
                        variant="tertiary"
                        icon={<ExternalLink size={14} />}
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedUrl(item.url)
                        }}
                      >
                        Analyse
                      </Button>
                    )}
                  </div>
                </header>

                <div className="bg-white" style={{ height: `${PREVIEW_HEIGHT}px` }}>
                  {iframeSrc ? (
                    <iframe
                      title={`Forhåndsvisning av steg ${item.step + 1}`}
                      src={iframeSrc}
                      className="h-full w-full"
                      loading="lazy"
                      sandbox="allow-same-origin allow-scripts allow-forms"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--ax-text-subtle)]">
                      Ingen forhåndsvisning tilgjengelig for dette steget.
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <AnalysisActionModal
        open={!!selectedUrl}
        onClose={() => setSelectedUrl(null)}
        urlPath={selectedUrl}
        websiteId={websiteId}
        period={period}
        domain={domain}
      />
    </>
  )
}

export default FunnelCanvasView
