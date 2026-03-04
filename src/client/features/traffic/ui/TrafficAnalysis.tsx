import { useCallback } from 'react';
import { Button, Alert, Loader, Select } from '@navikt/ds-react';
import { Share2, Check } from 'lucide-react';
import ChartLayout from '../../analysis/ui/ChartLayout.tsx';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import OversiktTabContent from '../../analysis/ui/traffic/OversiktTabContent.tsx';
import InnOgUtgangerTabContent from '../../analysis/ui/traffic/InnOgUtgangerTabContent.tsx';
import AnalysisActionModal from '../../analysis/ui/AnalysisActionModal.tsx';
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx';
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx';
import CookieMixNotice from '../../analysis/ui/CookieMixNotice.tsx';
import type { Website } from '../../../shared/types/chart.ts';
import { useTrafficAnalysis } from '../hooks/useTrafficAnalysis';
import { getMetricLabelCapitalized, getMetricLabelWithCount } from '../utils/trafficUtils';
import ChartDataTable from './ChartDataTable';
import TrafficTable from './TrafficTable';
import CombinedEntrancesTable from './CombinedEntrancesTable';
import ExternalTrafficTable from './ExternalTrafficTable';

const TrafficAnalysis = () => {
    const {
        selectedWebsite,
        setSelectedWebsite,
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
        submittedPeriod,
        submittedMetricType,
        submittedComparePreviousPeriod,
        submittedGranularity,
        submittedDateRange,
        submittedPreviousDateRange,
        seriesData,
        previousSeriesData,
        processedSeriesData,
        processedPreviousSeriesData,
        chartData,
        seriesQueryStats,
        totalOverride,
        includedPagesWithCompare,
        combinedEntrances,
        entranceSummaryWithUnknown,
        exits,
        comparisonSummary,
        comparisonRangeLabel,
        formatComparisonValue,
        formatComparisonDelta,
        loading,
        error,
        hasAttemptedFetch,
        isLoadingPageMetrics,
        hasFetchedPageMetrics,
        isLoadingExternalReferrers,
        hasFetchedExternalReferrers,
        isLoadingBreakdown,
        hasFetchedBreakdown,
        fetchSeriesData,
        copyShareLink,
        copySuccess,
        hasUnappliedFilterChanges,
        selectedInternalUrl,
        setSelectedInternalUrl,
        currentDateRange,
        cookieBadge,
        isPreCookieRange,
        cookieStartDate,
        navigateToJourney,
        getVisitorLabelWithBadge,
    } = useTrafficAnalysis();

    // Bridge components: wrap the extracted table components to inject submittedMetricType
    // These wrappers match the ComponentType signatures expected by OversiktTabContent / InnOgUtgangerTabContent
    const BridgedChartDataTable = useCallback((props: {
        data: { time: string; count: number }[];
        previousData: { time: string; count: number }[];
        metricLabel: string;
        submittedDateRange: { startDate: Date; endDate: Date } | null;
        submittedPreviousDateRange: { startDate: Date; endDate: Date } | null;
    }) => (
        <ChartDataTable
            {...props}
            submittedMetricType={submittedMetricType}
            submittedGranularity={submittedGranularity}
            submittedComparePreviousPeriod={submittedComparePreviousPeriod}
            seriesQueryStats={seriesQueryStats}
        />
    ), [submittedMetricType, submittedGranularity, submittedComparePreviousPeriod, seriesQueryStats]);

    const BridgedTrafficTable = useCallback((props: {
        title: string;
        data: { name: string; count: number; previousCount?: number; deltaCount?: number }[];
        onRowClick?: (name: string) => void;
        selectedWebsite: Website | null;
        metricLabel: string;
        showCompare?: boolean;
    }) => (
        <TrafficTable {...props} submittedMetricType={submittedMetricType} />
    ), [submittedMetricType]);

    const BridgedCombinedEntrancesTable = useCallback((props: {
        title: string;
        data: { name: string; count: number; type: 'external' | 'internal'; isDomainInternal?: boolean }[];
        onRowClick?: (name: string) => void;
        selectedWebsite: Website | null;
        metricLabel: string;
    }) => (
        <CombinedEntrancesTable {...props} submittedMetricType={submittedMetricType} />
    ), [submittedMetricType]);

    const BridgedExternalTrafficTable = useCallback((props: {
        title: string;
        data: { name: string; count: number }[];
        metricLabel: string;
        websiteDomain?: string;
    }) => (
        <ExternalTrafficTable {...props} submittedMetricType={submittedMetricType} />
    ), [submittedMetricType]);

    return (
        <ChartLayout
            title="Trafikkoversikt"
            description="Se besøk over tid, hvor de kommer fra og hvor de går videre."
            currentPage="trafikkanalyse"
            websiteDomain={selectedWebsite?.domain}
            websiteName={selectedWebsite?.name}
            sidebarContent={
                <WebsitePicker
                    selectedWebsite={selectedWebsite}
                    onWebsiteChange={setSelectedWebsite}
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
                        className="w-full sm:w-[350px]"
                    />

                    <PeriodPicker
                        period={period}
                        onPeriodChange={setPeriod}
                        startDate={customStartDate}
                        onStartDateChange={setCustomStartDate}
                        endDate={customEndDate}
                        onEndDateChange={setCustomEndDate}
                    />

                    <div className="w-full sm:w-auto min-w-[200px]">
                        <Select
                            label="Visning"
                            size="small"
                            value={metricType}
                            key={`metric-${metricType}-${cookieBadge || 'nocookie'}`}
                            onChange={(e) => setMetricType(e.target.value)}
                        >
                            <option value="visitors">{currentDateRange
                                ? getVisitorLabelWithBadge()
                                : 'Unike besøkende'}</option>
                            <option value="visits">Økter / besøk</option>
                            <option value="pageviews">Sidevisninger</option>
                            <option value="proportion">Andel (av besøkende)</option>
                        </Select>
                    </div>

                    <div className="flex items-end pb-[2px]">
                        <Button
                            onClick={fetchSeriesData}
                            disabled={!selectedWebsite || loading || !hasUnappliedFilterChanges}
                            loading={loading}
                            size="small"
                        >
                            Vis trafikk
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

            {(cookieBadge === 'mix' || isPreCookieRange) && (
                <CookieMixNotice
                    websiteName={selectedWebsite?.name}
                    cookieStartDate={cookieStartDate}
                    variant={isPreCookieRange ? 'pre' : 'mix'}
                />
            )}

            {loading && (
                <div className="flex justify-center items-center h-full">
                    <Loader size="xlarge" title="Henter data..." />
                </div>
            )}

            {!loading && hasAttemptedFetch && !error && (
                <>
                    <div className="pt-4">
                        <OversiktTabContent
                            hasAttemptedFetch={hasAttemptedFetch}
                            isLoadingPageMetrics={isLoadingPageMetrics}
                            hasFetchedPageMetrics={hasFetchedPageMetrics}
                            submittedComparePreviousPeriod={submittedComparePreviousPeriod}
                            comparisonSummary={comparisonSummary}
                            comparisonRangeLabel={comparisonRangeLabel}
                            submittedDateRange={submittedDateRange}
                            submittedPreviousDateRange={submittedPreviousDateRange}
                            formatComparisonValue={formatComparisonValue}
                            formatComparisonDelta={formatComparisonDelta}
                            seriesData={seriesData}
                            submittedMetricType={submittedMetricType}
                            totalOverride={totalOverride}
                            submittedGranularity={submittedGranularity}
                            showAverage={showAverage}
                            onShowAverageChange={setShowAverage}
                            comparePreviousPeriod={comparePreviousPeriod}
                            onComparePreviousPeriodChange={setComparePreviousPeriod}
                            granularity={granularity}
                            onGranularityChange={setGranularity}
                            chartData={chartData?.data ?? null}
                            chartYMax={chartData?.yMax ?? 0}
                            chartYMin={chartData?.yMin ?? 0}
                            chartKey={`${submittedMetricType}-${submittedPeriod}-${seriesData.length}-${previousSeriesData.length}-${submittedComparePreviousPeriod ? 'compare' : 'single'}`}
                            processedSeriesData={processedSeriesData}
                            processedPreviousSeriesData={processedPreviousSeriesData}
                            getMetricLabelWithCount={getMetricLabelWithCount}
                            includedPagesWithCompare={includedPagesWithCompare}
                            onSelectInternalUrl={setSelectedInternalUrl}
                            selectedWebsite={selectedWebsite}
                            getMetricLabelCapitalized={getMetricLabelCapitalized}
                            ChartDataTableComponent={BridgedChartDataTable}
                            TrafficTableComponent={BridgedTrafficTable}
                        />
                    </div>

                    <div className="mt-8">
                        <InnOgUtgangerTabContent
                            hasAttemptedFetch={hasAttemptedFetch}
                            isLoadingExternalReferrers={isLoadingExternalReferrers}
                            hasFetchedExternalReferrers={hasFetchedExternalReferrers}
                            isLoadingBreakdown={isLoadingBreakdown}
                            hasFetchedBreakdown={hasFetchedBreakdown}
                            combinedEntrances={combinedEntrances}
                            entranceSummaryWithUnknown={entranceSummaryWithUnknown}
                            exits={exits}
                            selectedWebsite={selectedWebsite}
                            metricLabel={getMetricLabelCapitalized(submittedMetricType)}
                            onSelectInternalUrl={setSelectedInternalUrl}
                            onNavigateToJourney={navigateToJourney}
                            CombinedEntrancesTableComponent={BridgedCombinedEntrancesTable}
                            ExternalTrafficTableComponent={BridgedExternalTrafficTable}
                            TrafficTableComponent={BridgedTrafficTable}
                        />
                    </div>

                    <AnalysisActionModal
                        open={!!selectedInternalUrl}
                        onClose={() => setSelectedInternalUrl(null)}
                        urlPath={selectedInternalUrl}
                        websiteId={selectedWebsite?.id}
                        period={period}
                    />

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

export default TrafficAnalysis;
