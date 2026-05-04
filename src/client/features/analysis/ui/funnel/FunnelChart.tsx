import React from 'react'
import { ExternalLink } from 'lucide-react'
import AnalysisActionModal from '../AnalysisActionModal.tsx'
import type { FunnelChartProps } from '../../model/types.ts'
import { computeFunnelStepMetrics, getStepLabel, getStepDestination } from '../../utils/horizontalFunnel.ts'
import { useHorizontalFunnel } from '../../hooks/useHorizontalFunnel.ts'

const FunnelChart: React.FC<FunnelChartProps> = ({ data, loading, websiteId, period }) => {
  const { selectedUrl, handleUrlClick, closeModal } = useHorizontalFunnel(websiteId)

  if (loading) {
    return <div className="animate-pulse h-64 bg-[var(--ax-bg-neutral-soft)] rounded-lg"></div>
  }

  if (!data || data.length === 0) {
    return <div className="text-center p-8 text-gray-500">Ingen data tilgjengelig for trakten.</div>
  }

  const maxCount = Math.max(...data.map((d) => d.count))

  return (
    <>
      <div className="flex flex-col items-center w-full max-w-5xl mx-auto py-6 px-4">
        {data.map((item, index) => {
          const { percentageOfPrev, dropoffCount, dropoffPercentage, totalConversionPercent } =
            computeFunnelStepMetrics(data, index)

          const widthPercentage = maxCount > 0 ? Math.max((item.count / maxCount) * 100, 20) : 20
          const isClickable = websiteId && item.url && item.url.startsWith('/')

          return (
            <div key={item.step} className="w-full flex flex-col items-center relative">
              {/* Connector with stats between cards */}
              {index > 0 && (
                <div className="w-full flex items-center justify-center py-2 relative">
                  {/* Left side: gikk videre (conversion) */}
                  <div className="flex-1 flex justify-end pr-3 md:pr-6">
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--ax-bg-success-soft)] border border-[var(--ax-border-success-subtle)]"
                      title={`${percentageOfPrev}% av brukerne fra forrige steg gikk videre til dette steget`}
                    >
                      <span className="text-lg md:text-xl font-bold text-[var(--ax-text-success)]">
                        {percentageOfPrev}%
                      </span>
                      <span className="text-sm font-medium text-[var(--ax-text-success)] hidden sm:inline">
                        gikk videre
                      </span>
                    </div>
                  </div>

                  {/* Center: Connector line */}
                  <div className="flex flex-col items-center">
                    <div className="w-0.5 h-3 bg-[var(--ax-border-neutral-moderate)]"></div>
                    <div className="w-2 h-2 rounded-full bg-[var(--ax-border-neutral-strong)]"></div>
                    <div className="w-0.5 h-3 bg-[var(--ax-border-neutral-moderate)]"></div>
                  </div>

                  {/* Right side: falt fra (dropoff) */}
                  <div className="flex-1 flex justify-start pl-3 md:pl-6">
                    {dropoffCount > 0 ? (
                      <div
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--ax-bg-danger-soft)] border border-[var(--ax-border-danger-subtle)]"
                        title={`${dropoffCount.toLocaleString('nb-NO')} brukere (${dropoffPercentage}%) falt fra mellom forrige steg og dette steget`}
                      >
                        <span className="text-lg md:text-xl font-bold text-[var(--ax-text-danger)]">
                          {dropoffPercentage}%
                        </span>
                        <span className="text-sm font-medium text-[var(--ax-text-danger)] hidden sm:inline">
                          falt fra (-{dropoffCount.toLocaleString('nb-NO')})
                        </span>
                      </div>
                    ) : (
                      <div className="px-3 py-1.5">
                        <span className="text-sm font-medium text-gray-400">Ingen frafall</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* The Step Card */}
              <div className="w-full flex justify-center" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div
                  className="relative flex flex-col items-center justify-center py-3 px-4 rounded-lg shadow-sm transition-all duration-300 hover:shadow-md text-white border border-transparent dark:border-[var(--ax-border-neutral-subtle)]"
                  style={{
                    width: `${widthPercentage}%`,
                    minWidth: '180px',
                    backgroundColor: 'var(--funnel-box-bg, rgb(19, 17, 54))',
                  }}
                >
                  <div className="text-[11px] font-bold opacity-80 uppercase tracking-wider mb-0.5">
                    Steg {item.step + 1}
                  </div>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-2xl md:text-3xl font-bold">{item.count.toLocaleString('nb-NO')}</span>
                    <span
                      className="text-sm md:text-base font-medium opacity-75"
                      title="Prosent av alle som startet i trakten"
                    >
                      ({totalConversionPercent}%)
                    </span>
                  </div>

                  {/* URL / Step Value Display */}
                  {(() => {
                    const labelCandidate = getStepLabel(item.params)
                    const destCandidate = getStepDestination(item.params)

                    return (
                      <div className="flex flex-col items-center gap-1 w-full mt-1">
                        {labelCandidate && (
                          <div className="text-xs font-bold text-white mb-0.5 px-2 text-center line-clamp-2">
                            {labelCandidate}
                          </div>
                        )}

                        <div
                          className={`text-[11px] bg-[var(--ax-bg-default)]/10 border border-white/20 rounded px-2 py-0.5 opacity-90 max-w-full font-medium break-words text-center flex items-center justify-center gap-1 ${isClickable ? 'cursor-pointer hover:bg-[var(--ax-bg-default)]/20 hover:opacity-100 transition-colors' : ''}`}
                          title={item.url}
                          onClick={(e) => (isClickable && item.url ? handleUrlClick(e, item.url) : undefined)}
                        >
                          <span className="truncate max-w-[150px]">{destCandidate || item.url}</span>
                          {isClickable && <ExternalLink size={10} className="inline-block flex-shrink-0" />}
                        </div>

                        {/* Other Params */}
                        {item.params && item.params.length > 0 && (
                          <div className="mt-1 flex flex-wrap justify-center gap-1 max-w-full">
                            {item.params
                              .filter(
                                (p) =>
                                  !['lenketekst', 'tekst', 'label', 'tittel', 'destinasjon', 'url'].includes(
                                    p.key.toLowerCase(),
                                  ),
                              )
                              .map((p, i) => (
                                <div
                                  key={i}
                                  className="bg-[var(--ax-bg-default)]/5 border border-white/10 px-1 py-0.5 rounded text-[9px] font-medium text-white/70 whitespace-nowrap max-w-full truncate"
                                  title={`${p.key} = ${p.value}`}
                                >
                                  {p.key}: {p.value}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <AnalysisActionModal
        open={!!selectedUrl}
        onClose={closeModal}
        urlPath={selectedUrl}
        websiteId={websiteId}
        period={period}
      />
    </>
  )
}

export default FunnelChart
