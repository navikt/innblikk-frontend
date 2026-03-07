import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { nb } from 'date-fns/locale';
import type { ILineChartDataPoint } from '@fluentui/react-charting';
import { useCookieSupport, useCookieStartDate } from '../../../shared/hooks/useSiteimproveSupport.ts';
import type { Website } from '../../../shared/types/chart.ts';
import { normalizeUrlToPath, getDateRangeFromPeriod, getStoredPeriod, savePeriodPreference, getStoredMetricType, saveMetricTypePreference, getCookieCountByParams, getCookieBadge, getVisitorLabelWithBadge } from '../../../shared/lib/utils.ts';
import type { SeriesPoint, PageMetricRow, BreakdownData, ExternalReferrerRow, QueryStats, Granularity, DateRange } from '../model/types';
import {
    isCompareEnabled,
    getPreviousDateRange,
    aggregateSeriesData,
    getComparablePeriodValue,
    getMetricLabel,
    getMetricLabelCapitalized as getMetricLabelCapitalizedUtil,
    getMetricUnitLabel,
    getCSVMetricLabel,
    downloadCsvFile,
} from '../utils/trafficUtils';
import {
    buildSeriesUrl,
    fetchTrafficSeries,
    fetchPreviousTrafficSeries,
    fetchTrafficBreakdown as fetchTrafficBreakdownApi,
    fetchPageMetrics as fetchPageMetricsApi,
    fetchExternalReferrers as fetchExternalReferrersApi,
} from '../api/trafficApi';

export const useTrafficAnalysis = () => {
    const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
    const usesCookies = useCookieSupport(selectedWebsite?.domain);
    const cookieStartDate = useCookieStartDate(selectedWebsite?.domain);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Initialize state from URL params - support multiple paths
    const pathsFromUrl = searchParams.getAll('urlPath');
    const initialPaths = pathsFromUrl.length > 0 ? pathsFromUrl.map(p => normalizeUrlToPath(p)).filter(Boolean) : [];
    const [urlPaths, setUrlPaths] = useState<string[]>(initialPaths);
    const [pathOperator, setPathOperator] = useState<string>(() => searchParams.get('pathOperator') || 'equals');
    const [period, setPeriodState] = useState<string>(() => getStoredPeriod(searchParams.get('period')));

    const setPeriod = (newPeriod: string) => {
        setPeriodState(newPeriod);
        savePeriodPreference(newPeriod);
    };

    const [submittedPeriod, setSubmittedPeriod] = useState<string>(() => getStoredPeriod(searchParams.get('period')));

    // Support custom dates from URL
    const fromDateFromUrl = searchParams.get("from");
    const toDateFromUrl = searchParams.get("to");
    const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined;
    const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined;

    const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate);
    const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate);
    const [submittedCustomStartDate, setSubmittedCustomStartDate] = useState<Date | undefined>(initialCustomStartDate);
    const [submittedCustomEndDate, setSubmittedCustomEndDate] = useState<Date | undefined>(initialCustomEndDate);
    const initialCompareValue = isCompareEnabled(searchParams.get('comparePrevious'));
    const [comparePreviousPeriod, setComparePreviousPeriod] = useState<boolean>(initialCompareValue);
    const [submittedComparePreviousPeriod, setSubmittedComparePreviousPeriod] = useState<boolean>(initialCompareValue);
    const [submittedDateRange, setSubmittedDateRange] = useState<DateRange | null>(null);
    const [submittedPreviousDateRange, setSubmittedPreviousDateRange] = useState<DateRange | null>(null);

    const [granularity, setGranularity] = useState<Granularity>('day');
    const [submittedGranularity, setSubmittedGranularity] = useState<Granularity>('day');

    // View options
    const [metricType, setMetricTypeState] = useState<string>(() => getStoredMetricType(searchParams.get('metricType')));
    const [submittedMetricType, setSubmittedMetricType] = useState<string>(() => getStoredMetricType(searchParams.get('metricType')));
    const [submittedUrlPaths, setSubmittedUrlPaths] = useState<string[]>(initialPaths);
    const [submittedPathOperator, setSubmittedPathOperator] = useState<string>(() => searchParams.get('pathOperator') || 'equals');

    const setMetricType = (newMetricType: string) => {
        setMetricTypeState(newMetricType);
        saveMetricTypePreference(newMetricType);
    };
    const [showAverage, setShowAverage] = useState<boolean>(false);

    // Data states
    const [seriesData, setSeriesData] = useState<SeriesPoint[]>([]);
    const [seriesTotalCount, setSeriesTotalCount] = useState<number | undefined>(undefined);
    const [previousSeriesData, setPreviousSeriesData] = useState<SeriesPoint[]>([]);
    const [previousSeriesTotalCount, setPreviousSeriesTotalCount] = useState<number | undefined>(undefined);
    const [pageMetrics, setPageMetrics] = useState<PageMetricRow[]>([]);
    const [previousPageMetrics, setPreviousPageMetrics] = useState<PageMetricRow[]>([]);
    const [seriesQueryStats, setSeriesQueryStats] = useState<QueryStats | null>(null);

    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false);
    const [copySuccess, setCopySuccess] = useState<boolean>(false);
    const [selectedInternalUrl, setSelectedInternalUrl] = useState<string | null>(null);
    const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null);

    const buildFilterKey = useCallback((granularityOverride = granularity) =>
        JSON.stringify({
            websiteId: selectedWebsite?.id ?? null,
            urlPaths,
            pathOperator,
            period,
            customStartDate: customStartDate?.toISOString() ?? null,
            customEndDate: customEndDate?.toISOString() ?? null,
            metricType,
            granularity: granularityOverride,
            comparePreviousPeriod,
        }), [selectedWebsite?.id, urlPaths, pathOperator, period, customStartDate, customEndDate, metricType, granularity, comparePreviousPeriod]);
    const hasUnappliedFilterChanges = buildFilterKey() !== lastAppliedFilterKey;

    const includedPagesData = useMemo(() => {
        if (!pageMetrics.length) return [];
        return pageMetrics.map(item => ({
            name: item.urlPath,
            count: submittedMetricType === 'pageviews' ? item.pageviews : (submittedMetricType === 'proportion' ? item.proportion : item.visitors)
        }));
    }, [pageMetrics, submittedMetricType]);

    const previousIncludedPagesMap = useMemo(() => {
        const map = new Map<string, number>();
        previousPageMetrics.forEach(item => {
            const value = submittedMetricType === 'pageviews'
                ? item.pageviews
                : (submittedMetricType === 'proportion' ? item.proportion : item.visitors);
            map.set(item.urlPath, Number(value) || 0);
        });
        return map;
    }, [previousPageMetrics, submittedMetricType]);

    const includedPagesWithCompare = useMemo(() => {
        if (!submittedComparePreviousPeriod) return includedPagesData;

        const rowMap = new Map<string, { name: string; count: number; previousCount: number; deltaCount: number }>();

        includedPagesData.forEach(item => {
            const previousCount = previousIncludedPagesMap.get(item.name) || 0;
            rowMap.set(item.name, {
                name: item.name,
                count: item.count,
                previousCount,
                deltaCount: item.count - previousCount
            });
        });

        previousIncludedPagesMap.forEach((previousCount, name) => {
            if (rowMap.has(name)) return;
            rowMap.set(name, {
                name,
                count: 0,
                previousCount,
                deltaCount: -previousCount
            });
        });

        return Array.from(rowMap.values()).sort((a, b) => b.count - a.count);
    }, [includedPagesData, previousIncludedPagesMap, submittedComparePreviousPeriod]);

    const totalOverride = useMemo(() => {
        if (submittedMetricType === 'visits' || submittedMetricType === 'visitors') {
            return seriesTotalCount;
        }
        return undefined;
    }, [submittedMetricType, seriesTotalCount]);

    const previousTotalOverride = useMemo(() => {
        if (submittedMetricType === 'visits' || submittedMetricType === 'visitors') {
            return previousSeriesTotalCount;
        }
        return undefined;
    }, [submittedMetricType, previousSeriesTotalCount]);

    const [breakdownData, setBreakdownData] = useState<BreakdownData>({ sources: [], exits: [] });
    const [externalReferrerData, setExternalReferrerData] = useState<ExternalReferrerRow[]>([]);
    const [hasFetchedPageMetrics, setHasFetchedPageMetrics] = useState<boolean>(false);
    const [hasFetchedBreakdown, setHasFetchedBreakdown] = useState<boolean>(false);
    const [hasFetchedExternalReferrers, setHasFetchedExternalReferrers] = useState<boolean>(false);
    const [isLoadingPageMetrics, setIsLoadingPageMetrics] = useState<boolean>(false);
    const [isLoadingBreakdown, setIsLoadingBreakdown] = useState<boolean>(false);
    const [isLoadingExternalReferrers, setIsLoadingExternalReferrers] = useState<boolean>(false);

    const getCountByQueryParams = useCallback((startDate: Date, endDate: Date) => {
        const { countBy, countBySwitchAt } = getCookieCountByParams(usesCookies, cookieStartDate, startDate, endDate);
        return {
            countByParams: countBy ? `&countBy=${countBy}` : '',
            countBySwitchAtParam: countBySwitchAt ? `&countBySwitchAt=${countBySwitchAt}` : ''
        };
    }, [usesCookies, cookieStartDate]);

    const currentDateRange = useMemo(() => getDateRangeFromPeriod(period, customStartDate, customEndDate), [period, customStartDate, customEndDate]);
    const cookieBadge = useMemo(() => {
        if (!currentDateRange) return '';
        return getCookieBadge(
            usesCookies,
            cookieStartDate,
            currentDateRange.startDate,
            currentDateRange.endDate
        );
    }, [usesCookies, cookieStartDate, currentDateRange]);
    const isPreCookieRange = useMemo(() => {
        if (!currentDateRange || !cookieStartDate) return false;
        return currentDateRange.endDate.getTime() < cookieStartDate.getTime();
    }, [currentDateRange, cookieStartDate]);

    const fetchSeriesData = useCallback(async () => {
        if (!selectedWebsite) return;

        if (metricType === 'proportion' && urlPaths.length === 0) {
            setError('Du må oppgi en URL-sti for å se andel.');
            return;
        }

        setLoading(true);
        setError(null);
        setSeriesData([]);
        setSeriesTotalCount(undefined);
        setPreviousSeriesData([]);
        setPreviousSeriesTotalCount(undefined);
        setPageMetrics([]);
        setPreviousPageMetrics([]);
        setBreakdownData({ sources: [], exits: [] });
        setExternalReferrerData([]);
        setHasFetchedPageMetrics(false);
        setHasFetchedBreakdown(false);
        setHasFetchedExternalReferrers(false);
        setIsLoadingPageMetrics(false);
        setIsLoadingBreakdown(false);
        setIsLoadingExternalReferrers(false);
        setHasAttemptedFetch(true);
        setSubmittedMetricType(metricType);
        setSubmittedUrlPaths(urlPaths);
        setSubmittedPathOperator(pathOperator);
        setSubmittedCustomStartDate(customStartDate);
        setSubmittedCustomEndDate(customEndDate);
        setSubmittedComparePreviousPeriod(comparePreviousPeriod);
        let effectiveGranularity = granularity;

        if (period === 'today' || period === 'yesterday') {
            effectiveGranularity = 'hour';
            setGranularity('hour');
        }
        const appliedFilterKey = buildFilterKey(effectiveGranularity);

        setSubmittedGranularity(effectiveGranularity);
        setSubmittedPeriod(period);

        const interval = effectiveGranularity === 'hour' ? 'hour' : 'day';

        const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate);
        if (!dateRange) {
            setError('Vennligst velg en gyldig periode.');
            setLoading(false);
            return;
        }
        const { startDate, endDate } = dateRange;
        const previousDateRange = comparePreviousPeriod ? getPreviousDateRange(startDate, endDate) : null;
        setSubmittedDateRange({ startDate, endDate });
        setSubmittedPreviousDateRange(previousDateRange);
        const { countByParams, countBySwitchAtParam } = getCountByQueryParams(startDate, endDate);

        try {
            const urlPath = urlPaths.length > 0 ? urlPaths[0] : '';
            const normalizedPath = urlPath !== '/' && urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;

            const seriesUrl = buildSeriesUrl(
                selectedWebsite.id, startDate, endDate, pathOperator, metricType, interval,
                normalizedPath, { countByParams, countBySwitchAtParam }
            );

            const seriesResult = await fetchTrafficSeries(seriesUrl);

            if (seriesResult.data) {
                console.log('[TrafficAnalysis] Received series data:', seriesResult.data.length, 'records');
                setSeriesData(seriesResult.data);
            }
            if (typeof seriesResult.totalCount === 'number') {
                setSeriesTotalCount(seriesResult.totalCount);
            }
            if (seriesResult.queryStats) {
                setSeriesQueryStats(seriesResult.queryStats);
            }

            if (comparePreviousPeriod && previousDateRange) {
                const previousCountByParams = getCountByQueryParams(previousDateRange.startDate, previousDateRange.endDate);
                const previousSeriesUrl = buildSeriesUrl(
                    selectedWebsite.id, previousDateRange.startDate, previousDateRange.endDate,
                    pathOperator, metricType, interval, normalizedPath, previousCountByParams
                );
                const previousSeriesResult = await fetchPreviousTrafficSeries(previousSeriesUrl);
                setPreviousSeriesData(previousSeriesResult.data || []);
                setPreviousSeriesTotalCount(typeof previousSeriesResult.totalCount === 'number' ? previousSeriesResult.totalCount : undefined);
            }

            // Update URL with configuration for sharing
            const newParams = new URLSearchParams(window.location.search);
            newParams.set('period', period);
            newParams.set('metricType', metricType);
            if (comparePreviousPeriod) {
                newParams.set('comparePrevious', '1');
            } else {
                newParams.delete('comparePrevious');
            }
            newParams.delete('urlPath');
            if (urlPaths.length > 0) {
                urlPaths.forEach(p => newParams.append('urlPath', p));
                newParams.set('pathOperator', pathOperator);
            } else {
                newParams.delete('pathOperator');
            }

            if (period === 'custom' && customStartDate && customEndDate) {
                newParams.set('from', format(customStartDate, 'yyyy-MM-dd'));
                newParams.set('to', format(customEndDate, 'yyyy-MM-dd'));
            } else {
                newParams.delete('from');
                newParams.delete('to');
            }

            window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
            setLastAppliedFilterKey(appliedFilterKey);

        } catch (err) {
            console.error('Error fetching traffic data:', err);
            const message = err instanceof Error ? err.message : 'Det oppstod en feil ved henting av data.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [selectedWebsite, metricType, urlPaths, pathOperator, customStartDate, customEndDate, comparePreviousPeriod, granularity, period, buildFilterKey, getCountByQueryParams]);

    // Auto-submit when website is selected
    useEffect(() => {
        if (selectedWebsite && !hasAttemptedFetch) {
            void fetchSeriesData();
        }
    }, [selectedWebsite, hasAttemptedFetch, fetchSeriesData]);

    // Auto-fetch when granularity changes
    useEffect(() => {
        if (!hasAttemptedFetch || !selectedWebsite || loading) return;
        if (granularity !== submittedGranularity) {
            void fetchSeriesData();
        }
    }, [granularity, submittedGranularity, hasAttemptedFetch, selectedWebsite, loading, fetchSeriesData]);

    // Auto-fetch when compare option changes
    useEffect(() => {
        if (!hasAttemptedFetch || !selectedWebsite || loading) return;
        if (comparePreviousPeriod !== submittedComparePreviousPeriod) {
            void fetchSeriesData();
        }
    }, [comparePreviousPeriod, submittedComparePreviousPeriod, hasAttemptedFetch, selectedWebsite, loading, fetchSeriesData]);

    const fetchTrafficBreakdownHandler = useCallback(async (startDate: Date, endDate: Date, options?: { urlPaths?: string[]; pathOperator?: string; metricType?: string }) => {
        if (!selectedWebsite) return;

        try {
            setIsLoadingBreakdown(true);
            const activeUrlPaths = options?.urlPaths ?? submittedUrlPaths;
            const activePathOperator = options?.pathOperator ?? submittedPathOperator;
            const activeMetricType = options?.metricType ?? submittedMetricType;
            const urlPath = activeUrlPaths.length > 0 ? activeUrlPaths[0] : '';
            const normalizedPath = urlPath !== '/' && urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;
            const countByParams = getCountByQueryParams(startDate, endDate);

            const result = await fetchTrafficBreakdownApi(
                selectedWebsite.id, startDate, endDate, normalizedPath, activePathOperator, activeMetricType, countByParams
            );

            if (result.sources || result.exits) {
                setBreakdownData({
                    sources: result.sources || [],
                    exits: result.exits || []
                });
            }
        } catch (err) {
            console.error('Error fetching traffic breakdown:', err);
        } finally {
            setHasFetchedBreakdown(true);
            setIsLoadingBreakdown(false);
        }
    }, [selectedWebsite, submittedUrlPaths, submittedPathOperator, submittedMetricType, getCountByQueryParams]);

    const fetchPageMetricsHandler = useCallback(async (startDate: Date, endDate: Date, options?: { urlPaths?: string[]; pathOperator?: string; metricType?: string }) => {
        if (!selectedWebsite) return;

        try {
            setIsLoadingPageMetrics(true);
            const activeUrlPaths = options?.urlPaths ?? submittedUrlPaths;
            const activePathOperator = options?.pathOperator ?? submittedPathOperator;
            const activeMetricType = options?.metricType ?? submittedMetricType;
            const urlPath = activeUrlPaths.length > 0 ? activeUrlPaths[0] : '';
            const normalizedPath = urlPath !== '/' && urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;
            const countByParams = getCountByQueryParams(startDate, endDate);

            const result = await fetchPageMetricsApi(
                selectedWebsite.id, startDate, endDate, normalizedPath, activePathOperator, activeMetricType, countByParams
            );

            if (result.data) {
                setPageMetrics(result.data);
            }

            if (submittedComparePreviousPeriod && submittedPreviousDateRange) {
                const previousCountByParams = getCountByQueryParams(
                    submittedPreviousDateRange.startDate,
                    submittedPreviousDateRange.endDate
                );
                const previousResult = await fetchPageMetricsApi(
                    selectedWebsite.id, submittedPreviousDateRange.startDate, submittedPreviousDateRange.endDate,
                    normalizedPath, activePathOperator, activeMetricType, previousCountByParams
                );
                setPreviousPageMetrics(previousResult.data || []);
            } else {
                setPreviousPageMetrics([]);
            }
        } catch (err) {
            console.error('Error fetching page metrics:', err);
        } finally {
            setHasFetchedPageMetrics(true);
            setIsLoadingPageMetrics(false);
        }
    }, [selectedWebsite, submittedUrlPaths, submittedPathOperator, submittedMetricType, submittedComparePreviousPeriod, submittedPreviousDateRange, getCountByQueryParams]);

    const fetchExternalReferrersHandler = useCallback(async (startDate: Date, endDate: Date, options?: { urlPaths?: string[]; pathOperator?: string; metricType?: string }) => {
        if (!selectedWebsite) return;

        try {
            setIsLoadingExternalReferrers(true);
            const activeUrlPaths = options?.urlPaths ?? submittedUrlPaths;
            const activePathOperator = options?.pathOperator ?? submittedPathOperator;
            const activeMetricType = options?.metricType ?? submittedMetricType;
            const urlPath = activeUrlPaths.length > 0 ? activeUrlPaths[0] : '';
            const normalizedPath = urlPath !== '/' && urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;
            const countByParams = getCountByQueryParams(startDate, endDate);

            const result = await fetchExternalReferrersApi(
                selectedWebsite.id, startDate, endDate, normalizedPath, activePathOperator, activeMetricType, countByParams
            );

            if (result.data && result.data.referrer) {
                setExternalReferrerData(result.data.referrer);
            }
        } catch (err) {
            console.error('Error fetching external referrers:', err);
        } finally {
            setHasFetchedExternalReferrers(true);
            setIsLoadingExternalReferrers(false);
        }
    }, [selectedWebsite, submittedUrlPaths, submittedPathOperator, submittedMetricType, getCountByQueryParams]);

    // Load all dependent traffic tables for the current selection.
    useEffect(() => {
        if (!hasAttemptedFetch || !selectedWebsite) return;

        const dateRange = getDateRangeFromPeriod(submittedPeriod, submittedCustomStartDate, submittedCustomEndDate);
        if (!dateRange) return;

        const { startDate, endDate } = dateRange;
        const options = {
            urlPaths: submittedUrlPaths,
            pathOperator: submittedPathOperator,
            metricType: submittedMetricType
        };

        if (!hasFetchedPageMetrics) {
            void fetchPageMetricsHandler(startDate, endDate, options);
        }
        if (!hasFetchedExternalReferrers) {
            void fetchExternalReferrersHandler(startDate, endDate, options);
        }
        if (!hasFetchedBreakdown) {
            void fetchTrafficBreakdownHandler(startDate, endDate, options);
        }
    }, [
        hasAttemptedFetch, selectedWebsite, submittedPeriod,
        submittedCustomStartDate, submittedCustomEndDate, submittedMetricType,
        submittedUrlPaths, submittedPathOperator,
        hasFetchedPageMetrics, hasFetchedExternalReferrers, hasFetchedBreakdown,
        fetchPageMetricsHandler, fetchExternalReferrersHandler, fetchTrafficBreakdownHandler
    ]);

    const processedSeriesData = useMemo(
        () => aggregateSeriesData(seriesData, submittedGranularity, submittedMetricType),
        [seriesData, submittedGranularity, submittedMetricType]
    );

    const processedPreviousSeriesData = useMemo(
        () => aggregateSeriesData(previousSeriesData, submittedGranularity, submittedMetricType),
        [previousSeriesData, submittedGranularity, submittedMetricType]
    );

    // Prepare Chart Data
    const chartData = useMemo(() => {
        if (!processedSeriesData.length) return null;

        const formatXAxisLabel = (date: Date) => {
            if (submittedGranularity === 'week') {
                return `Uke ${format(date, 'w', { locale: nb })}`;
            }
            if (submittedGranularity === 'month') {
                return format(date, 'MMM yyyy', { locale: nb });
            }
            if (submittedGranularity === 'hour') {
                return format(date, 'HH:mm');
            }
            return date.toLocaleDateString('nb-NO');
        };
        const formatCalloutDateLabel = (date: Date) => {
            if (submittedGranularity === 'hour') {
                return format(date, "EEE d. MMM yyyy 'kl.' HH:mm", { locale: nb });
            }
            if (submittedGranularity === 'week') {
                return `Uke ${format(date, 'w', { locale: nb })} (${format(date, 'd. MMM yyyy', { locale: nb })})`;
            }
            if (submittedGranularity === 'month') {
                return format(date, 'MMMM yyyy', { locale: nb });
            }
            return format(date, 'EEE d. MMM yyyy', { locale: nb });
        };
        const toChartValue = (rawValue: number) => (
            submittedMetricType === 'proportion'
                ? Math.min(rawValue * 100, 100)
                : rawValue
        );

        const metricLabel = getMetricLabel(submittedMetricType);
        const metricLabelCapitalized = getMetricLabelCapitalizedUtil(submittedMetricType);

        const points: ILineChartDataPoint[] = processedSeriesData.map((item: SeriesPoint) => {
            let value = Number(item.count) || 0;

            if (submittedMetricType === 'proportion') {
                if (value > 1.01) value = 0;
                if (value < 0) value = 0;
            }

            const pointDate = new Date(item.time);
            const xAxisLabel = formatXAxisLabel(pointDate);
            const xAxisCalloutLabel = formatCalloutDateLabel(pointDate);

            return {
                x: pointDate,
                y: toChartValue(value),
                legend: xAxisLabel,
                xAxisCalloutData: xAxisCalloutLabel,
                yAxisCalloutData: submittedMetricType === 'proportion'
                    ? `${(value * 100).toFixed(1)}%`
                    : `${value.toLocaleString('nb-NO')} ${metricLabel}`
            };
        });

        const lines: { legend: string; data: ILineChartDataPoint[]; color: string }[] = [
            {
                legend: metricLabelCapitalized,
                data: points,
                color: '#0072B2',
            }
        ];

        if (
            submittedComparePreviousPeriod &&
            processedPreviousSeriesData.length > 0 &&
            submittedDateRange &&
            submittedPreviousDateRange
        ) {
            const offsetMs = submittedDateRange.startDate.getTime() - submittedPreviousDateRange.startDate.getTime();
            const previousPoints: ILineChartDataPoint[] = processedPreviousSeriesData.map((item: SeriesPoint) => {
                let value = Number(item.count) || 0;

                if (submittedMetricType === 'proportion') {
                    if (value > 1.01) value = 0;
                    if (value < 0) value = 0;
                }

                const shiftedDate = new Date(new Date(item.time).getTime() + offsetMs);
                const xAxisLabel = formatXAxisLabel(shiftedDate);
                const xAxisCalloutLabel = formatCalloutDateLabel(shiftedDate);

                return {
                    x: shiftedDate,
                    y: toChartValue(value),
                    legend: xAxisLabel,
                    xAxisCalloutData: `${xAxisCalloutLabel} (forrige periode)`,
                    yAxisCalloutData: submittedMetricType === 'proportion'
                        ? `${(value * 100).toFixed(1)}%`
                        : `${value.toLocaleString('nb-NO')} ${metricLabel}`
                };
            });

            lines.push({
                legend: 'Forrige periode',
                data: previousPoints,
                color: '#D55E00',
            });
        }

        if (showAverage) {
            const total = points.reduce((sum, p) => sum + p.y, 0);
            const avg = total / points.length;
            const avgPoints = points.map(p => ({
                ...p,
                y: avg,
                yAxisCalloutData: submittedMetricType === 'proportion'
                    ? `Snitt per dag: ${avg.toFixed(1)}%`
                    : `Snitt per dag: ${Math.round(avg).toLocaleString('nb-NO')}`
            }));

            lines.push({
                legend: 'Snitt per dag',
                data: avgPoints,
                color: '#009E73',
            });
        }

        const allYValues = lines.flatMap(line => line.data.map(point => Number(point.y) || 0));
        const dataMax = Math.max(...allYValues, 0);
        const yMax = submittedMetricType === 'proportion'
            ? Math.max(dataMax * 1.1, 1)
            : dataMax * 1.1;

        return {
            data: {
                lineChartData: lines
            },
            yMax,
            yMin: 0,
        };
    }, [
        processedSeriesData,
        processedPreviousSeriesData,
        showAverage,
        submittedMetricType,
        submittedGranularity,
        submittedComparePreviousPeriod,
        submittedDateRange,
        submittedPreviousDateRange
    ]);

    const copyShareLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Failed to copy link:', err);
        }
    };

    const downloadCSV = () => {
        if (!seriesData.length) return;

        const metricLabel = getCSVMetricLabel(submittedMetricType);
        const dateHeader = submittedGranularity === 'hour' ? 'Tidspunkt' : 'Dato';
        const headers = [dateHeader, metricLabel];
        const csvRows = [
            headers.join(','),
            ...seriesData.map((item: SeriesPoint) => {
                const timeStr = submittedGranularity === 'hour'
                    ? `${new Date(item.time).toLocaleDateString('nb-NO')} ${new Date(item.time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`
                    : new Date(item.time).toLocaleDateString('nb-NO');
                return [
                    timeStr,
                    submittedMetricType === 'proportion' ? `${(item.count * 100).toFixed(1)}%` : item.count
                ].join(',');
            })
        ];

        const csvContent = csvRows.join('\n');
        downloadCsvFile(csvContent, `traffic_${selectedWebsite?.name || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    // Process Flow/Breakdown Data
    const { entrances, exits } = useMemo(() => {
        if (!breakdownData.sources.length && !breakdownData.exits.length) {
            return { entrances: [], exits: [] };
        }

        const normalizePathValue = (value: string) =>
            value !== '/' && value.endsWith('/') ? value.slice(0, -1) : value;
        const submittedPathSet = new Set(submittedUrlPaths.map(normalizePathValue));

        const sources = breakdownData.sources.map((s) => ({
            name: s.name,
            count: Number(s.visitors)
        }));

        const exitsList = breakdownData.exits.map((e) => ({
            name: e.name,
            count: Number(e.visitors)
        }))
            .filter(e => {
                if (!e.name.startsWith('/')) return true;
                return !submittedPathSet.has(normalizePathValue(e.name));
            })
            .sort((a, b) => b.count - a.count);

        const entrancesList = sources
            .filter(s => s.name.startsWith('/') && !submittedPathSet.has(normalizePathValue(s.name)))
            .sort((a, b) => b.count - a.count);

        return { entrances: entrancesList, exits: exitsList };
    }, [breakdownData, submittedUrlPaths]);

    const externalReferrers = useMemo(() => {
        return externalReferrerData
            .filter(item => item.name !== '(none)')
            .map(item => ({
                name: item.name,
                count: submittedMetricType === 'proportion'
                    ? Number(item.count) / 100
                    : Number(item.count)
            }));
    }, [externalReferrerData, submittedMetricType]);

    const combinedEntrances = useMemo(() => {
        const normalizedDomain = selectedWebsite?.domain?.toLowerCase().replace(/^www\./, '');
        const external = externalReferrers.map(item => ({
            name: item.name,
            count: item.count,
            type: 'external' as const,
            isDomainInternal: Boolean(normalizedDomain && item.name.toLowerCase().replace(/^www\./, '') === normalizedDomain)
        }));

        const internal = entrances.map(item => ({
            name: item.name,
            count: item.count,
            type: 'internal' as const,
            isDomainInternal: false
        }));

        return [...external, ...internal].sort((a, b) => b.count - a.count);
    }, [externalReferrers, entrances, selectedWebsite]);

    const entranceSummary = useMemo(() => {
        const channelMap = new Map<string, number>();
        const normalizedDomain = selectedWebsite?.domain?.toLowerCase().replace(/^www\./, '');

        externalReferrerData.forEach(item => {
            const rawName = String(item.name || '');
            const source = rawName.toLowerCase().replace(/^www\./, '');
            const count = submittedMetricType === 'proportion'
                ? Number(item.count || 0) / 100
                : Number(item.count || 0);
            let channel = 'Eksterne nettsider';

            if (source === '(none)') {
                channel = 'Direkte';
            } else if (normalizedDomain && source === normalizedDomain) {
                channel = 'Interne sider';
            } else if (source.includes('google') || source.includes('bing') || source.includes('yahoo') || source.includes('duckduckgo') || source.includes('ecosia') || source.includes('qwant')) {
                channel = 'Søkemotorer';
            } else if (source.includes('facebook') || source.includes('twitter') || source.includes('linkedin') || source.includes('instagram') || source.includes('tiktok') || source.includes('snapchat')) {
                channel = 'Sosiale medier';
            }

            channelMap.set(channel, (channelMap.get(channel) || 0) + count);
        });

        return Array.from(channelMap.entries())
            .map(([name, count]) => ({ name, count }))
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count);
    }, [externalReferrerData, selectedWebsite, submittedMetricType]);

    const seriesTotal = useMemo(() => {
        if (submittedMetricType === 'visits' || submittedMetricType === 'visitors') {
            return seriesTotalCount ?? 0;
        }
        if (!seriesData.length) return 0;
        return seriesData.reduce((sum, item) => sum + Number(item.count || 0), 0);
    }, [seriesData, seriesTotalCount, submittedMetricType]);

    const comparisonSummary = useMemo(() => {
        if (!submittedComparePreviousPeriod || !processedSeriesData.length || !processedPreviousSeriesData.length) {
            return null;
        }

        const currentValue = getComparablePeriodValue(processedSeriesData, submittedMetricType, totalOverride);
        const previousValue = getComparablePeriodValue(processedPreviousSeriesData, submittedMetricType, previousTotalOverride);
        const deltaValue = currentValue - previousValue;

        let deltaPercent: number | null = null;
        if (previousValue !== 0) {
            deltaPercent = (deltaValue / previousValue) * 100;
        } else if (currentValue === 0) {
            deltaPercent = 0;
        }

        return {
            currentValue,
            previousValue,
            deltaValue,
            deltaPercent,
        };
    }, [
        submittedComparePreviousPeriod,
        processedSeriesData,
        processedPreviousSeriesData,
        submittedMetricType,
        totalOverride,
        previousTotalOverride
    ]);

    const formatComparisonValue = (value: number) => {
        if (submittedMetricType === 'proportion') {
            return `${(value * 100).toFixed(1)}%`;
        }
        return Math.round(value).toLocaleString('nb-NO');
    };

    const formatComparisonDelta = (value: number) => {
        const unitLabel = getMetricUnitLabel(submittedMetricType);
        if (submittedMetricType === 'proportion') {
            return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} ${unitLabel}`;
        }
        return `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('nb-NO')} ${unitLabel}`;
    };

    const comparisonRangeLabel = useMemo(() => {
        if (!submittedDateRange || !submittedPreviousDateRange) return null;

        const formatRange = (range: DateRange) =>
            `${format(range.startDate, 'dd.MM.yy')}–${format(range.endDate, 'dd.MM.yy')}`;

        return {
            current: formatRange(submittedDateRange),
            previous: formatRange(submittedPreviousDateRange),
        };
    }, [submittedDateRange, submittedPreviousDateRange]);

    const entranceSummaryWithUnknown = useMemo(() => {
        if (submittedMetricType === 'proportion') {
            return entranceSummary;
        }
        if (!seriesTotal || !entranceSummary.length) return entranceSummary;

        const channelSum = entranceSummary.reduce((sum, item) => sum + Number(item.count || 0), 0);
        const diff = Math.round(seriesTotal - channelSum);

        if (diff > 0) {
            return [...entranceSummary, { name: 'Ukjent / Andre', count: diff }];
        }

        return entranceSummary;
    }, [entranceSummary, seriesTotal, submittedMetricType]);

    const navigateToJourney = () => {
        const params = new URLSearchParams();
        const effectivePeriod = submittedPeriod || period;
        const effectiveUrlPath = submittedUrlPaths.length > 0 ? submittedUrlPaths[0] : urlPaths[0];
        const effectiveCustomStartDate = submittedCustomStartDate ?? customStartDate;
        const effectiveCustomEndDate = submittedCustomEndDate ?? customEndDate;

        if (selectedWebsite?.id) params.set('websiteId', selectedWebsite.id);
        if (effectivePeriod) params.set('period', effectivePeriod);
        if (effectiveUrlPath) params.set('urlPath', effectiveUrlPath);

        if (effectivePeriod === 'custom' && effectiveCustomStartDate && effectiveCustomEndDate) {
            params.set('from', format(effectiveCustomStartDate, 'yyyy-MM-dd'));
            params.set('to', format(effectiveCustomEndDate, 'yyyy-MM-dd'));
        } else {
            const from = searchParams.get('from');
            const to = searchParams.get('to');
            if (effectivePeriod === 'custom' && from && to) {
                params.set('from', from);
                params.set('to', to);
            }
        }

        void navigate(`/brukerreiser?${params.toString()}`);
    };

    return {
        // Website
        selectedWebsite,
        setSelectedWebsite,
        usesCookies,
        cookieStartDate,

        // Filters
        urlPaths,
        setUrlPaths,
        pathOperator,
        setPathOperator,
        period,
        setPeriod,
        customStartDate,
        setCustomStartDate,
        customEndDate,
        setCustomEndDate,
        metricType,
        setMetricType,
        granularity,
        setGranularity,
        comparePreviousPeriod,
        setComparePreviousPeriod,
        showAverage,
        setShowAverage,

        // Submitted state
        submittedPeriod,
        submittedMetricType,
        submittedComparePreviousPeriod,
        submittedGranularity,
        submittedDateRange,
        submittedPreviousDateRange,

        // Data
        seriesData,
        previousSeriesData,
        processedSeriesData,
        processedPreviousSeriesData,
        chartData,
        seriesQueryStats,
        totalOverride,

        // Page metrics
        includedPagesWithCompare,

        // Breakdown
        combinedEntrances,
        entranceSummaryWithUnknown,
        exits,

        // Comparison
        comparisonSummary,
        comparisonRangeLabel,
        formatComparisonValue,
        formatComparisonDelta,

        // Loading / Error
        loading,
        error,
        hasAttemptedFetch,
        isLoadingPageMetrics,
        hasFetchedPageMetrics,
        isLoadingExternalReferrers,
        hasFetchedExternalReferrers,
        isLoadingBreakdown,
        hasFetchedBreakdown,

        // Actions
        fetchSeriesData,
        copyShareLink,
        downloadCSV,
        copySuccess,
        hasUnappliedFilterChanges,

        // Internal URL modal
        selectedInternalUrl,
        setSelectedInternalUrl,

        // Cookie
        currentDateRange,
        cookieBadge,
        isPreCookieRange,

        // Navigation
        navigateToJourney,

        // Re-export utils for sub-components
        getVisitorLabelWithBadge,
    };
};
