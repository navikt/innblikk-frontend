import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Loader, Alert, Button, Tooltip } from '@navikt/ds-react';
import { MoreVertical } from 'lucide-react';
import type { SavedChart } from '../../../../data/dashboard';
import AnalysisActionModal from '../../analysis/ui/AnalysisActionModal.tsx';
import ChartActionModal from '../../analysis/ui/ChartActionModal.tsx';
import DashboardWidgetLineChart from './widget/DashboardWidgetLineChart.tsx';
import DashboardWidgetBarChart from './widget/DashboardWidgetBarChart.tsx';
import DashboardWidgetPieChart from './widget/DashboardWidgetPieChart.tsx';
import DashboardWidgetTable from './widget/DashboardWidgetTable.tsx';
import DashboardWidgetSiteimprove from './widget/DashboardWidgetSiteimprove.tsx';
import { processDashboardSql } from '../utils/queryUtils.ts';
import {
    parseDashboardResponse,
    getSpanClass,
    type DashboardRow
} from '../utils/widgetUtils.ts';
import {executeBigQuery} from '../api/bigquery.ts';

type SelectedWebsite = {
    domain: string;
    [key: string]: unknown;
};

interface DashboardWidgetProps {
    chart: SavedChart;
    websiteId: string;
    selectedWebsite?: SelectedWebsite;
    filters: {
        urlFilters: string[];
        dateRange: string;
        pathOperator: string;
        metricType: 'visitors' | 'pageviews' | 'proportion' | 'visits';
        customStartDate?: Date;
        customEndDate?: Date;
    };
    onDataLoaded?: (stats: { id: string; gb: number; title: string; totalCount?: number }) => void;
    // Pre-fetched data from batched query (optional - if provided, skip individual fetch)
    prefetchedData?: DashboardRow[];
    // If true, this chart is being batch-loaded and should wait instead of fetching individually
    shouldWaitForBatch?: boolean;
    // Siteimprove group ID for group-level scoring (from custom filter selection)
    siteimproveGroupId?: string;
    dashboardTitle?: string;
    onEditChart?: (chartId?: string) => void;
    onDeleteChart?: (chartId?: string) => void;
    onCopyChart?: (chartId?: string, sourceWebsiteId?: string) => void;
    onMoveChart?: (chartId?: string) => void;
    titlePrefix?: ReactNode;
    titleBelow?: ReactNode;
}

export const DashboardWidget = ({
    chart,
    websiteId,
    filters,
    onDataLoaded,
    selectedWebsite,
    prefetchedData,
    shouldWaitForBatch,
    siteimproveGroupId,
    dashboardTitle,
    onEditChart,
    onDeleteChart,
    onCopyChart,
    onMoveChart,
    titlePrefix,
    titleBelow,
}: DashboardWidgetProps) => {
    const [loading, setLoading] = useState(shouldWaitForBatch ?? false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<DashboardRow[]>([]);
    const [page, setPage] = useState(1);
    // Track if individual fetch has been done to prevent repeat fetches
    const [hasFetchedIndividually, setHasFetchedIndividually] = useState(false);
    // State for AnalysisActionModal (for links in table)
    const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
    // State for ChartActionModal (for title click)
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);

    // If prefetchedData is available, use it directly instead of fetching
    useEffect(() => {
        if (prefetchedData !== undefined) {
            setData(prefetchedData);
            setLoading(false);
            setError(null);
            setPage(1);
            setHasFetchedIndividually(false); // Reset since we got batch data
            return;
        }
    }, [prefetchedData]);

    // Reset fetch flag when filters or SQL changes (to allow variant/refetch updates)
    useEffect(() => {
        setHasFetchedIndividually(false);
    }, [websiteId, filters, chart.sql]);

    useEffect(() => {
        // Skip if we already have batch data
        if (prefetchedData !== undefined) return;

        // If told to wait for batch, just ensure loading state is shown
        if (shouldWaitForBatch) {
            setLoading(true);
            return;
        }

        // If we've already fetched individually, don't fetch again
        if (hasFetchedIndividually) return;

        const fetchData = async () => {
            if (!chart.sql) return;

            setLoading(true);
            setError(null);

            try {
                const processedSql = processDashboardSql(chart.sql, websiteId, filters);

                const resultPayload = await executeBigQuery(processedSql, 'Dashboard');
                const parsed = parseDashboardResponse(resultPayload);
                const resultData = parsed.data;
                setData(resultData);

                let totalCount = 0;
                if (resultData.length > 0) {
                    const keys = Object.keys(resultData[0]);
                    if (keys.length >= 2) {
                        const metricKey = keys[1];
                        totalCount = resultData.reduce((acc: number, row) => {
                            const raw = row[metricKey];
                            const val = typeof raw === 'number' ? raw : parseFloat(String(raw));
                            return Number.isFinite(val) ? acc + val : acc;
                        }, 0);
                    }
                }

                if (onDataLoaded) {
                    const bytes = parsed.totalBytesProcessed ?? 0;
                    const gb = bytes ? bytes / (1024 ** 3) : 0;
                    onDataLoaded({
                        id: chart.id || '',
                        gb,
                        title: chart.title,
                        totalCount,
                    });
                }

                setPage(1);
                setHasFetchedIndividually(true);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Ukjent feil';
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, [
        chart.sql,
        chart.id,
        chart.title,
        websiteId,
        filters,
        prefetchedData,
        shouldWaitForBatch,
        hasFetchedIndividually,
        onDataLoaded,
    ]);

    // Render logic based on chart.type
    const colClass = getSpanClass(chart.width);

    if (chart.type === 'siteimprove') {
        return (
            <DashboardWidgetSiteimprove
                chart={chart}
                colClass={colClass}
                selectedWebsite={selectedWebsite}
                urlPath={filters.urlFilters[0]}
                siteimproveGroupId={siteimproveGroupId}
            />
        );
    }

    if (chart.type === 'title') {
        return (
            <div className={`pt-2 ${colClass}`}>
                <h2 className="text-2xl font-bold text-[var(--ax-text-default)]">{chart.title}</h2>
                {chart.description && <p className="text-[var(--ax-text-subtle)] mt-1">{chart.description}</p>}
            </div>
        );
    }

    const renderContent = () => {
        if (loading) return <div className="flex justify-center p-8"><Loader /></div>;
        if (error) return <Alert variant="error">{error}</Alert>;
        if (!data || data.length === 0) return <div className="text-[var(--ax-text-subtle)] p-8 text-center">Ingen data funnet</div>;

        if (chart.type === 'line') {
            return (
                <DashboardWidgetLineChart
                    data={data}
                    title={chart.title}
                />
            );
        } else if (chart.type === 'bar') {
            return <DashboardWidgetBarChart data={data} />;
        } else if (chart.type === 'pie') {
            return <DashboardWidgetPieChart data={data} />;
        } else if (chart.type === 'table') {
            return (
                <DashboardWidgetTable
                    data={data}
                    page={page}
                    onPageChange={setPage}
                    showTotal={chart.showTotal}
                    onSelectUrl={setSelectedUrl}
                />
            );
        }

        return <div>Ukjent diagramtype: {chart.type}</div>;
    };

    // Extract total value for tables with showTotal
    const tableTotalValue = chart.showTotal && chart.type === 'table' && data.length > 0 ? (() => {
        const totalRow = data.find((row) => Object.values(row).includes('__TOTAL__'));
        if (!totalRow) return null;
        const keys = Object.keys(totalRow);
        for (const key of keys) {
            const val = (totalRow as Record<string, unknown>)[key];
            if (typeof val === 'number') return val;
        }
        return null;
    })() : null;

    return (
        <>
            <div className={`h-full bg-[var(--ax-bg-default)] p-6 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm min-h-[400px] ${colClass}`}>
                <div className="flex flex-col mb-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            {titlePrefix}
                            <h2 className="text-xl font-semibold text-[var(--ax-text-default)] truncate">
                                {chart.title}
                            </h2>
                        </div>
                        {chart.sql && (
                            <Tooltip content="Flere valg" placement="top">
                                <Button
                                    variant="tertiary"
                                    size="small"
                                    onClick={() => setIsActionModalOpen(true)}
                                    title={`Flere valg for ${chart.title}`}
                                    aria-label={`Flere valg for ${chart.title}`}
                                    icon={<MoreVertical aria-hidden="true" />}
                                />
                            </Tooltip>
                        )}
                    </div>
                    {titleBelow && (
                        <div className="mt-2">
                            {titleBelow}
                        </div>
                    )}
                    {tableTotalValue !== null && (
                        <p className="text-lg text-[var(--ax-text-default)] mt-1">
                            {tableTotalValue.toLocaleString('nb-NO')} {filters.metricType === 'pageviews' ? 'sidevisninger totalt' : filters.metricType === 'visits' ? 'økter totalt' : 'besøk totalt'}
                        </p>
                    )}
                    {chart.description && (
                        <p className="text-[var(--ax-text-subtle)] text-sm mt-1">{chart.description}</p>
                    )}
                </div>
                {renderContent()}
            </div>

            <AnalysisActionModal
                open={!!selectedUrl}
                onClose={() => setSelectedUrl(null)}
                urlPath={selectedUrl}
                websiteId={websiteId}
                period={filters.dateRange}
                domain={selectedWebsite?.domain}
            />

            <ChartActionModal
                open={isActionModalOpen}
                onClose={() => setIsActionModalOpen(false)}
                chart={chart}
                websiteId={websiteId}
                filters={filters}
                domain={selectedWebsite?.domain}
                data={data}
                dashboardTitle={dashboardTitle}
                onEditChart={onEditChart ? () => onEditChart(chart.id) : undefined}
                onDeleteChart={onDeleteChart ? () => onDeleteChart(chart.id) : undefined}
                onCopyChart={onCopyChart ? () => onCopyChart(chart.id, websiteId) : undefined}
                onMoveChart={onMoveChart ? () => onMoveChart(chart.id) : undefined}
            />
        </>
    );
};
