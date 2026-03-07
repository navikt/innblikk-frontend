import { Button, Heading, Loader } from '@navikt/ds-react';
import { ArrowRight } from 'lucide-react';
import type { InnOgUtgangerTabContentProps } from '../../model/types.ts';

const InnOgUtgangerTabContent = ({
    hasAttemptedFetch,
    isLoadingExternalReferrers,
    hasFetchedExternalReferrers,
    isLoadingBreakdown,
    hasFetchedBreakdown,
    combinedEntrances,
    entranceSummaryWithUnknown,
    exits,
    selectedWebsite,
    metricLabel,
    onSelectInternalUrl,
    onNavigateToJourney,
    CombinedEntrancesTableComponent,
    ExternalTrafficTableComponent,
    TrafficTableComponent,
}: InnOgUtgangerTabContentProps) => {
    if (hasAttemptedFetch && ((isLoadingExternalReferrers || !hasFetchedExternalReferrers) || (isLoadingBreakdown || !hasFetchedBreakdown))) {
        return (
            <div className="flex justify-center items-center h-full py-16">
                <Loader size="xlarge" title="Henter data..." />
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row gap-8">
            <div className="w-full md:flex-1 md:basis-0 min-w-0 flex flex-col gap-8">
                <CombinedEntrancesTableComponent
                    title="Innganger"
                    data={combinedEntrances}
                    onRowClick={onSelectInternalUrl}
                    selectedWebsite={selectedWebsite}
                    metricLabel={metricLabel}
                />
                <ExternalTrafficTableComponent
                    title="Innganger oppsummert"
                    data={entranceSummaryWithUnknown}
                    metricLabel={metricLabel}
                    websiteDomain={selectedWebsite?.domain}
                />
            </div>
            <div className="w-full md:flex-1 md:basis-0 min-w-0 flex flex-col gap-8">
                <TrafficTableComponent
                    title="Utganger"
                    data={exits}
                    onRowClick={onSelectInternalUrl}
                    selectedWebsite={selectedWebsite}
                    metricLabel={metricLabel}
                />
                <div className="rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-6">
                    <Heading level="3" size="small" className="mb-3">Vil du se hele brukerreisen?</Heading>
                    <p className="text-[var(--ax-text-subtle)] mb-5">
                        Siden du er på nå viser hvor besøk starter og slutter. I navigasjonsflyt ser du hele reisen gjennom nettstedet.
                    </p>
                    <Button
                        variant="secondary"
                        size="small"
                        icon={<ArrowRight size={16} />}
                        iconPosition="right"
                        onClick={onNavigateToJourney}
                        disabled={!selectedWebsite}
                    >
                        Gå til navigasjonsflyt
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default InnOgUtgangerTabContent;
