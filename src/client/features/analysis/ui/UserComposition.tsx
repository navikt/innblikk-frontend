import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Alert, Loader, Tabs } from '@navikt/ds-react';
import { Share2, Check } from 'lucide-react';
import { parseISO } from 'date-fns';
import ChartLayout from './ChartLayout.tsx';
import WebsitePicker from './WebsitePicker.tsx';
import PeriodPicker from './PeriodPicker.tsx';
import UrlPathFilter from './UrlPathFilter.tsx';
import { ResultsPanel } from '../../chartbuilder';
import type { Website } from '../../../shared/types/chart.ts';
import { normalizeUrlToPath, getDateRangeFromPeriod, getStoredPeriod, savePeriodPreference, getCookieCountByParams } from '../../../shared/lib/utils.ts';
import { useCookieSupport, useCookieStartDate } from '../../../shared/hooks/useSiteimproveSupport.ts';
import { translateValue } from '../../../shared/lib/translations.ts';
import type { IVerticalBarChartProps } from '@fluentui/react-charting';


const UserComposition = () => {
    const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
    const usesCookies = useCookieSupport(selectedWebsite?.domain);
    const cookieStartDate = useCookieStartDate(selectedWebsite?.domain);
    const [searchParams] = useSearchParams();

    // Initialize state from URL params - support multiple paths
    const pathsFromUrl = searchParams.getAll('urlPath');
    const legacyPath = searchParams.get('pagePath');
    const initialPaths = pathsFromUrl.length > 0
        ? pathsFromUrl.map(p => normalizeUrlToPath(p)).filter(Boolean)
        : (legacyPath ? [normalizeUrlToPath(legacyPath)].filter(Boolean) : []);
    const [urlPaths, setUrlPaths] = useState<string[]>(initialPaths);
    const [pathOperator, setPathOperator] = useState<string>(() => searchParams.get('pathOperator') || 'equals');
    const [period, setPeriodState] = useState<string>(() => getStoredPeriod(searchParams.get('period')));

    // Wrap setPeriod to also save to localStorage
    const setPeriod = (newPeriod: string) => {
        setPeriodState(newPeriod);
        savePeriodPreference(newPeriod);
    };

    // Support custom dates from URL
    const fromDateFromUrl = searchParams.get("from");
    const toDateFromUrl = searchParams.get("to");
    const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined;
    const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined;

    const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate);
    const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate);

    type CompositionRow = {
        category: string;
        value: string;
        count: number;
    };

    type QueryStatsLike = {
        totalBytesProcessedGB?: string;
        estimatedCostUSD?: string;
    };

    type CompositionApiResponse =
        | { error: string }
        | { data: CompositionRow[]; queryStats?: QueryStatsLike };

    const [data, setData] = useState<CompositionRow[] | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('browser');
    const [queryStats, setQueryStats] = useState<QueryStatsLike | null>(null);
    const [copySuccess, setCopySuccess] = useState<boolean>(false);
    const [hasAutoSubmitted, setHasAutoSubmitted] = useState<boolean>(false);
    const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null);

    const buildFilterKey = useCallback(() =>
        JSON.stringify({
            websiteId: selectedWebsite?.id ?? null,
            urlPaths,
            pathOperator,
            period,
            customStartDate: customStartDate?.toISOString() ?? null,
            customEndDate: customEndDate?.toISOString() ?? null,
        }), [selectedWebsite?.id, urlPaths, pathOperator, period, customStartDate, customEndDate]);
    const hasUnappliedFilterChanges = buildFilterKey() !== lastAppliedFilterKey;

    const fetchData = useCallback(async () => {
        if (!selectedWebsite) return;
        const appliedFilterKey = buildFilterKey();

        setLoading(true);
        setError(null);
        setData(null);
        setQueryStats(null);

        const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate);
        if (!dateRange) {
            setError('Vennligst velg en gyldig periode.');
            setLoading(false);
            return;
        }
        const { startDate, endDate } = dateRange;
        const { countBy, countBySwitchAt } = getCookieCountByParams(usesCookies, cookieStartDate, startDate, endDate);

        try {
            const response = await fetch('/api/bigquery/composition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    websiteId: selectedWebsite.id,
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    urlPath: urlPaths.length > 0 ? urlPaths[0] : undefined,
                    pathOperator: pathOperator,
                    countBy,
                    countBySwitchAt
                }),
            });

            if (!response.ok) throw new Error('Kunne ikke hente data');

            const result: CompositionApiResponse = await response.json();

            if ('error' in result) {
                setError(result.error);
                return;
            }

            setData(result.data);

            if (activeCategory === 'custom' && !result.data.some((item) => item.category === 'custom')) {
                setActiveCategory('browser');
            }

            setQueryStats(result.queryStats ?? null);

            const newParams = new URLSearchParams(window.location.search);
            newParams.set('period', period);
            if (urlPaths.length > 0) {
                newParams.set('urlPath', urlPaths[0]);
                newParams.set('pathOperator', pathOperator);
                newParams.delete('pagePath');
            } else {
                newParams.delete('urlPath');
                newParams.delete('pathOperator');
                newParams.delete('pagePath');
            }
            window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
            setLastAppliedFilterKey(appliedFilterKey);
        } catch {
            setError('Det oppstod en feil ved henting av data.');
        } finally {
            setLoading(false);
        }
    }, [selectedWebsite, buildFilterKey, period, customStartDate, customEndDate, usesCookies, cookieStartDate, urlPaths, pathOperator, activeCategory]);

    // Auto-submit when website is selected (from localStorage, URL, or Home page picker)
    useEffect(() => {
        if (selectedWebsite && !hasAutoSubmitted && !loading) {
            setHasAutoSubmitted(true);
            fetchData();
        }
    }, [selectedWebsite, hasAutoSubmitted, loading, fetchData]);

    const copyShareLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch {
            // ignore
        }
    };

    // Helper to transform data for ResultsDisplay based on active category
    const getCategoryData = () => {
        if (!data) return null;

        const categoryData = data.filter((row) => row.category === activeCategory);
        const total = categoryData.reduce((sum, row) => sum + row.count, 0);

        return {
            data: categoryData.map((row) => {
                const percentage = total > 0 ? ((row.count / total) * 100).toFixed(1) : '0.0';
                return {
                    [activeCategory]: row.value,
                    Antall: row.count,
                    Andel: `${percentage}%`,
                };
            }),
        };
    };

    const prepareBarChartData = (): IVerticalBarChartProps | null => {
        const currentData = getCategoryData();
        if (!currentData?.data || currentData.data.length === 0) return null;

        return {
            data: currentData.data.map((row) => ({
                x: String(translateValue(activeCategory, row[activeCategory]) || 'Ukjent'),
                y: Number(row.Antall),
            })),
            barWidth: 20,
            yAxisTickCount: 5,
        };
    };

    const preparePieChartData = (): { data: Array<{ x: string; y: number }>; total: number } | null => {
        const currentData = getCategoryData();
        if (!currentData?.data || currentData.data.length === 0) return null;

        const total = currentData.data.reduce((sum, row) => sum + Number(row.Antall), 0);

        return {
            data: currentData.data.map((row) => ({
                x: String(translateValue(activeCategory, row[activeCategory]) || 'Ukjent'),
                y: Number(row.Antall),
            })),
            total,
        };
    };

    const prepareLineChartData = () => null;

    return (
        <ChartLayout
            title="Brukerdetaljer"
            description="Se informasjon om besøkende."
            currentPage="brukersammensetning"
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
                    <UrlPathFilter
                        urlPaths={urlPaths}
                        onUrlPathsChange={setUrlPaths}
                        pathOperator={pathOperator}
                        onPathOperatorChange={setPathOperator}
                        selectedWebsiteDomain={selectedWebsite?.domain}
                        label="URL"
                    />

                    <PeriodPicker
                        period={period}
                        onPeriodChange={setPeriod}
                        startDate={customStartDate}
                        onStartDateChange={setCustomStartDate}
                        endDate={customEndDate}
                        onEndDateChange={setCustomEndDate}
                    />

                    <div className="flex items-end pb-[2px] mt-8 sm:mt-0">
                        <Button
                            onClick={fetchData}
                            disabled={!selectedWebsite || loading || !hasUnappliedFilterChanges}
                            loading={loading}
                            size="small"
                        >
                            Vis brukerdetaljer
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

            {loading && (
                <div className="flex justify-center items-center h-full">
                    <Loader size="xlarge" title="Henter data..." />
                </div>
            )}

            {!loading && data && (
                <>
                    <Tabs value={activeCategory} onChange={setActiveCategory}>
                        <Tabs.List>
                            <Tabs.Tab value="browser" label="Nettleser" />
                            <Tabs.Tab value="os" label="Operativsystem" />
                            <Tabs.Tab value="device" label="Enhet" />
                            <Tabs.Tab value="screen" label="Skjerm" />
                            <Tabs.Tab value="language" label="Språk" />
                            <Tabs.Tab value="country" label="Land" />
                            {data.some((item: CompositionRow) => item.category === 'custom') && (
                                <Tabs.Tab value="custom" label="Egendefinert" />
                            )}
                        </Tabs.List>

                        <div className="mt-6">
                            <ResultsPanel
                                result={getCategoryData()}
                                loading={false}
                                error={null}
                                queryStats={queryStats}
                                lastAction="run"
                                showLoadingMessage={false}
                                executeQuery={() => { }}
                                handleRetry={() => { }}
                                prepareLineChartData={prepareLineChartData}
                                prepareBarChartData={prepareBarChartData}
                                preparePieChartData={preparePieChartData}
                                hideHeading={true}
                                hiddenTabs={['linechart', 'areachart']}
                            />
                        </div>
                    </Tabs>

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
        </ChartLayout>
    );
};

export default UserComposition;
