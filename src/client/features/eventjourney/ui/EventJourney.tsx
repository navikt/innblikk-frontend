import { useState } from 'react';
import { TextField, Button, Alert, Loader, Switch, UNSAFE_Combobox } from '@navikt/ds-react';
import { Share2, Check, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import ChartLayout from '../../analysis/ui/ChartLayout.tsx';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx';
import { normalizeUrlToPath } from '../../../shared/lib/utils.ts';
import { useEventJourney } from '../hooks/useEventJourney.ts';
import { getUniqueEventTypes, filterJourneys } from '../utils/journeyFilters.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
import JourneyStatsGrid from './journey/JourneyStatsGrid.tsx';
import JourneyVisualView from './journey/JourneyVisualView.tsx';
import JourneyTableView from './journey/JourneyTableView.tsx';

type SelectedFunnelStep = {
    id: string;
    eventName: string;
    journeyOrder: number;
    details: { key: string; value: string }[];
};

const EventJourney = () => {
    const {
        selectedWebsite,
        setSelectedWebsite,
        urlPath,
        setUrlPath,
        period,
        setPeriod,
        customStartDate,
        setCustomStartDate,
        customEndDate,
        setCustomEndDate,
        data,
        loading,
        error,
        journeyStats,
        queryStats,
        hasUnappliedFilterChanges,
        fetchData
    } = useEventJourney();

    const [filterText, setFilterText] = useState<string>('');
    const [excludedEventTypes, setExcludedEventTypes] = useState<string[]>([]);
    const [showTableSection, setShowTableSection] = useState<boolean>(false);
    const [copySuccess, setCopySuccess] = useState<boolean>(false);
    const [selectedFunnelSteps, setSelectedFunnelSteps] = useState<SelectedFunnelStep[]>([]);

    const filteredData = filterJourneys(data, excludedEventTypes, filterText);
    const totalJourneySessions = data.reduce((total, journey) => total + journey.count, 0);

    const copyShareLink = async () => {
        const success = await copyToClipboard(window.location.href);
        if (success) {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }
    };

    const toggleFunnelStep = (id: string, eventName: string, journeyOrder: number, details: { key: string; value: string }[]) => {
        setSelectedFunnelSteps((current) => {
            const exists = current.some((step) => step.id === id);
            if (exists) {
                return current.filter((step) => step.id !== id);
            }
            return [...current, { id, eventName, journeyOrder, details }];
        });
    };

    const clearFunnelSteps = () => {
        setSelectedFunnelSteps([]);
    };

    const navigateToFunnel = () => {
        if (!selectedWebsite || selectedFunnelSteps.length === 0) return;

        const params = new URLSearchParams();
        params.set('websiteId', selectedWebsite.id);
        params.set('period', period);
        params.set('strict', 'true');

        if (period === 'custom' && customStartDate && customEndDate) {
            params.set('from', format(customStartDate, 'yyyy-MM-dd'));
            params.set('to', format(customEndDate, 'yyyy-MM-dd'));
        }

        params.append('step', normalizeUrlToPath(urlPath));

        const orderedEventSteps = [...selectedFunnelSteps].sort((a, b) => a.journeyOrder - b.journeyOrder);
        orderedEventSteps.forEach((step) => {
            const encodedEventName = encodeURIComponent(step.eventName);
            const encodedFilters = step.details
                .filter((detail) => detail.key.trim() && detail.value.trim())
                .map((detail) => `|param:${encodeURIComponent(detail.key)}=${encodeURIComponent(detail.value)}`)
                .join('');
            params.append('step', `event:${encodedEventName}|current-path${encodedFilters}`);
        });

        window.open(`/trakt?${params.toString()}`, '_blank');
    };

    return (
        <ChartLayout
            title="Hendelsesforløp"
            description="Se rekkefølgen av hendelser brukere gjør på en spesifikk side."
            currentPage="hendelsesreiser"
            websiteDomain={selectedWebsite?.domain}
            websiteName={selectedWebsite?.name}
            sidebarContent={
                <WebsitePicker
                    selectedWebsite={selectedWebsite}
                    onWebsiteChange={setSelectedWebsite}
                    variant="minimal"
                />
            }
            filters={
                <>
                    <TextField
                        size="small"
                        label="URL"
                        value={urlPath}
                        onChange={(e) => setUrlPath(e.target.value)}
                        onBlur={(e) => setUrlPath(normalizeUrlToPath(e.target.value))}
                    />

                    <PeriodPicker
                        period={period}
                        onPeriodChange={setPeriod}
                        startDate={customStartDate}
                        onStartDateChange={setCustomStartDate}
                        endDate={customEndDate}
                        onEndDateChange={setCustomEndDate}
                    />

                    <div className="flex items-end pb-[2px]">
                        <Button
                            onClick={fetchData}
                            disabled={!selectedWebsite || loading || !urlPath || !hasUnappliedFilterChanges}
                            loading={loading}
                            size="small"
                        >
                            Vis
                        </Button>
                    </div>
                </>
            }
        >
            {error && (
                <Alert variant="error" className="mb-4">
                    {error}
                </Alert>
            )}

            {!urlPath && !loading && data.length === 0 && (
                <Alert variant="info" className="mb-4">
                    Skriv inn en URL-sti for å se hendelsesforløp.
                </Alert>
            )}

            {loading && (
                <div className="flex justify-center items-center h-full">
                    <Loader size="xlarge" title="Laster hendelsesreiser..." />
                </div>
            )}

            {!loading && data.length > 0 && (
                <>
                    <JourneyStatsGrid journeyStats={journeyStats} />

                    <div className="mb-4">
                        <div className="flex flex-wrap items-end gap-3">
                            {getUniqueEventTypes(data).length > 0 && (
                                <UNSAFE_Combobox
                                    label="Skjul hendelser"
                                    size="small"
                                    options={getUniqueEventTypes(data)}
                                    selectedOptions={excludedEventTypes}
                                    isMultiSelect
                                    placeholder="Velg..."
                                    onToggleSelected={(option: string, isSelected: boolean) => {
                                        if (isSelected) {
                                            setExcludedEventTypes([...excludedEventTypes, option]);
                                        } else {
                                            setExcludedEventTypes(excludedEventTypes.filter(e => e !== option));
                                        }
                                    }}
                                    className="w-56"
                                />
                            )}
                            <TextField
                                label="Søk"
                                size="small"
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                className="w-48"
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <JourneyVisualView
                            journeys={filteredData}
                            totalSessions={totalJourneySessions}
                            selectedStepIds={selectedFunnelSteps.map((step) => step.id)}
                            onToggleFunnelStep={toggleFunnelStep}
                        />
                        <div className="mt-4 flex justify-end">
                            <Switch
                                checked={showTableSection}
                                onChange={(e) => setShowTableSection(e.target.checked)}
                                size="small"
                            >
                                Vis tabell
                            </Switch>
                        </div>
                    </div>

                    {showTableSection && (
                        <div className={`pt-4 ${selectedFunnelSteps.length > 0 ? 'pb-28' : ''}`}>
                            <JourneyTableView journeys={filteredData} totalSessions={totalJourneySessions} />
                        </div>
                    )}

                    {selectedFunnelSteps.length > 0 && (
                        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 border border-gray-700 text-white px-6 py-4 rounded-full shadow-2xl z-50 flex items-center gap-6">
                            <div className="flex flex-col">
                                <span className="font-bold text-lg">{selectedFunnelSteps.length} hendelser valgt</span>
                                <span className="text-sm text-gray-300">
                                    URL-stien blir automatisk første steg i trakten
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="tertiary"
                                    size="small"
                                    onClick={clearFunnelSteps}
                                    className="!text-white hover:!text-white hover:!bg-white/10"
                                >
                                    Tøm valgte
                                </Button>
                                <Button
                                    variant="primary"
                                    size="small"
                                    onClick={navigateToFunnel}
                                    icon={<ExternalLink size={16} />}
                                >
                                    Opprett traktanalyse
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end mt-8">
                        <Button
                            size="small"
                            variant="secondary"
                            icon={copySuccess ? <Check size={16} /> : <Share2 size={16} />}
                            onClick={copyShareLink}
                        >
                            {copySuccess ? 'Kopiert!' : 'Del analyse'}
                        </Button>
                    </div>
                </>
            )}

            {!loading && !error && queryStats?.totalBytesProcessedGB !== undefined && (
                <div className="text-sm text-[var(--ax-text-subtle)] text-right mt-4">
                    Data prosessert: {queryStats.totalBytesProcessedGB} GB
                </div>
            )}

            {!loading && urlPath && data.length === 0 && !error && (
                <div className="flex justify-center items-center h-full text-gray-500">
                    Ingen egendefinerte hendelser funnet for valgt periode og filter.
                </div>
            )}
        </ChartLayout>
    );
};

export default EventJourney;
