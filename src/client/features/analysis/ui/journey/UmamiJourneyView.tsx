import React from 'react';
import { Button, Tooltip, Loader } from '@navikt/ds-react';
import { Plus, Check, ExternalLink, ArrowRight } from 'lucide-react';
import AnalysisActionModal from '../AnalysisActionModal.tsx';
import type { UmamiJourneyFullViewProps } from '../../model/types.ts';
import { useUmamiJourney } from '../../hooks/useUmamiJourney.ts';

const UmamiJourneyView: React.FC<UmamiJourneyFullViewProps> = ({
    nodes, links, isFullscreen = false, reverseVisualOrder = false,
    journeyDirection = 'forward', websiteId, period = 'current_month', domain,
    customStartDate, customEndDate,
    onLoadMore, isLoadingMore,
}) => {
    const {
        stepsData, selectedNodeId, connectedNodeIds, paths, funnelSteps,
        selectedUrl, contentRef, containerRef, nodeRefs,
        toggleNode, toggleFunnelStep, clearFunnelSteps, navigateToFunnel,
        openActionModal, closeActionModal,
    } = useUmamiJourney(
        nodes,
        links,
        isFullscreen,
        reverseVisualOrder,
        journeyDirection,
        websiteId,
        period,
        customStartDate,
        customEndDate
    );

    if (!stepsData.length) {
        return <div className="p-4 text-gray-500">Ingen data å vise.</div>;
    }

    return (
        <>
            <div
                ref={containerRef}
                className={`bg-[var(--ax-bg-default)] w-full p-6 ${isFullscreen ? 'overflow-auto' : 'overflow-x-auto'}`}
            >
                <div className="relative min-w-max" ref={contentRef}>

                    {/* SVG Overlay */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                        {paths.map((path, i) => (
                            <path
                                key={i}
                                d={path.d}
                                stroke="var(--journey-line-color, #0067c5)"
                                strokeWidth="2"
                                fill="none"
                                opacity={path.opacity}
                            />
                        ))}
                    </svg>

                    <div className={`flex gap-8 relative z-20 ${reverseVisualOrder ? 'flex-row-reverse' : ''}`}>
                        {stepsData.map((stepData) => (
                            <div key={stepData.step} className="flex-shrink-0 w-60 flex flex-col gap-4">
                                {/* Step Header */}
                                <div className="flex flex-col items-center mb-2">
                                    <div className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-sm mb-2 shadow-sm border border-transparent dark:border-[var(--ax-border-neutral-subtle)]" style={{ backgroundColor: 'var(--funnel-box-bg, rgb(19, 17, 54))' }}>
                                        {stepData.displayStep}
                                    </div>
                                    <div className="text-sm font-semibold text-[var(--ax-text-default)]">
                                        {stepData.totalValue.toLocaleString('nb-NO')} besøkende
                                    </div>
                                </div>

                                {/* Step Items */}
                                <div className="flex flex-col gap-2">
                                    {stepData.items.map((item) => {
                                        const isSelected = selectedNodeId === item.nodeId;
                                        const isConnected = connectedNodeIds.has(item.nodeId);
                                        const isDimmed = selectedNodeId !== null && !isConnected;
                                        const isFunnelStep = funnelSteps.some(s => s.nodeId === item.nodeId);

                                        return (
                                            <div
                                                key={item.nodeId}
                                                ref={(el) => {
                                                    if (el) nodeRefs.current.set(item.nodeId, el);
                                                    else nodeRefs.current.delete(item.nodeId);
                                                }}
                                                onClick={() => toggleNode(item.nodeId)}
                                                className={`
                                                relative overflow-hidden rounded-md border transition-all duration-200 cursor-pointer group
                                                ${isSelected ? 'ring-2 ring-blue-600 border-blue-600 shadow-md' : 'border-transparent dark:border-[var(--ax-border-neutral-subtle)] hover:border-gray-400 dark:hover:border-[var(--ax-border-neutral-strong)] shadow-sm'}
                                                ${isFunnelStep ? 'ring-2 ring-green-500 border-green-500' : ''}
                                                ${isDimmed && !isFunnelStep ? 'opacity-30 grayscale' : 'opacity-100'}
                                                text-white
                                            `}
                                                style={{
                                                    minHeight: '40px',
                                                    backgroundColor: 'var(--funnel-box-bg, rgb(19, 17, 54))'
                                                }}
                                            >
                                                {/* Content */}
                                                <div className="relative z-10 p-2.5 flex justify-between items-center gap-2">
                                                    <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 group/text">
                                                        <span className="text-gray-400 flex-shrink-0 text-xs mt-0.5 self-start">
                                                            📄
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <Tooltip content={item.name} delay={500}>
                                                                <div className="flex items-start gap-1">
                                                                    <span className="font-medium text-xs leading-tight line-clamp-3 group-hover:line-clamp-none break-words text-left transition-all duration-200">
                                                                        {item.name}
                                                                    </span>

                                                                    {websiteId && (
                                                                        <button
                                                                            className="flex-shrink-0 p-1 rounded-md hover:bg-[var(--ax-bg-default)]/20 transition-all text-gray-400 opacity-0 group-hover/text:opacity-100"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openActionModal(item.name);
                                                                            }}
                                                                            title="Åpne i analyse"
                                                                        >
                                                                            <ExternalLink size={12} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </Tooltip>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0 self-start mt-0.5">
                                                        <span className="text-xs font-mono font-bold whitespace-nowrap">
                                                            {item.value.toLocaleString('nb-NO')}
                                                        </span>

                                                        <button
                                                            onClick={(e) => toggleFunnelStep(e, item.nodeId, item.name, stepData.step)}
                                                            className={`
                                                            w-6 h-6 rounded-full flex items-center justify-center transition-all
                                                            ${isFunnelStep
                                                                    ? 'bg-green-500 text-white opacity-100'
                                                                    : 'bg-[var(--ax-bg-default)]/30 text-white hover:bg-[var(--ax-bg-default)]/50 opacity-100'
                                                                }
                                                        `}
                                                            title={isFunnelStep ? "Fjern fra trakt" : "Legg til i trakt"}
                                                        >
                                                            {isFunnelStep ? <Check size={14} strokeWidth={3} /> : <Plus size={14} strokeWidth={3} />}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Percentage Bar */}
                                                <div className="absolute bottom-0 left-0 right-0 h-2 bg-[var(--ax-bg-default)]/30">
                                                    <div
                                                        className="h-full bg-orange-400 transition-all duration-500 ease-out"
                                                        style={{ width: `${item.percentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {/* Load More Button */}
                        {onLoadMore && (
                            <div className="flex-shrink-0 w-40 flex flex-col">
                                <button
                                    onClick={() => !isLoadingMore && onLoadMore(2)}
                                    disabled={isLoadingMore}
                                    className={`
                                        group flex flex-col items-center justify-center gap-3
                                        w-full h-[300px] mt-14 rounded-lg border-2 border-dashed border-gray-400
                                        hover:border-blue-600 hover:bg-[var(--ax-bg-accent-soft)] transition-all duration-200
                                        text-[var(--ax-text-subtle)] hover:text-blue-700
                                        ${isLoadingMore ? 'opacity-70 cursor-wait' : 'cursor-pointer'}
                                    `}
                                >
                                    {isLoadingMore ? (
                                        <>
                                            <Loader size="medium" />
                                            <span className="text-sm font-medium">Laster mer...</span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-12 h-12 rounded-full bg-[var(--ax-bg-neutral-soft)] group-hover:bg-[var(--ax-bg-accent-soft)] flex items-center justify-center transition-colors shadow-sm border border-[var(--ax-border-neutral-subtle)]">
                                                <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform text-[var(--ax-text-default)] group-hover:text-blue-700" />
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-base">Last inn mer</span>
                                                <span className="text-xs text-gray-500">Vis 2 steg til</span>
                                            </div>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Floating Funnel Builder Action Bar */}
                {funnelSteps.length > 0 && (
                    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 border border-gray-700 text-white px-8 py-5 rounded-full shadow-2xl z-50 flex items-center gap-8 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex flex-col">
                            <span className="font-bold text-xl">{funnelSteps.length} steg valgt</span>
                            <span className="text-sm text-gray-300">
                                {funnelSteps.length < 2
                                    ? "Du må velge minst to steg for å lage en trakt"
                                    : "Bygg en traktanalyse fra disse stegene"
                                }
                            </span>
                        </div>

                        <div className="flex items-center gap-4">
                            <Button
                                variant="tertiary"
                                size="medium"
                                onClick={clearFunnelSteps}
                                className="!text-white hover:!text-white hover:!bg-white/10"
                            >
                                Tøm valgte
                            </Button>
                            <Button
                                variant="primary"
                                size="medium"
                                onClick={navigateToFunnel}
                                disabled={funnelSteps.length < 2}
                                icon={<ExternalLink size={20} />}
                            >
                                Opprett traktanalyse
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <AnalysisActionModal
                open={!!selectedUrl}
                onClose={closeActionModal}
                urlPath={selectedUrl}
                websiteId={websiteId}
                period={period}
                domain={domain}
            />
        </>
    );
};

export default UmamiJourneyView;
