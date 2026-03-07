import { useState } from 'react';
import { ActionMenu, Button, Heading, Label, Loader, Select, Switch, Tooltip } from '@navikt/ds-react';
import { MoreVertical } from 'lucide-react';
import { LineChart, ResponsiveContainer } from '@fluentui/react-charting';
import TrafficStats from './TrafficStats.tsx';
import type { Granularity, OversiktTabContentProps } from '../../model/types.ts';
import { useOversiktDayDividers } from '../../hooks/useOversiktDayDividers.ts';
import AddToDashboardDialog from '../../../../shared/ui/AddToDashboardDialog.tsx';
import { getTrafficSeriesSqlTemplate } from '../../../traffic/utils/trafficDashboardSqlTemplates.ts';
import { openSqlEditorWithContext } from '../../../../shared/lib/openSqlEditor.ts';

const OversiktTabContent = ({
    hasAttemptedFetch,
    isLoadingPageMetrics,
    hasFetchedPageMetrics,
    submittedComparePreviousPeriod,
    comparisonSummary,
    comparisonRangeLabel,
    submittedDateRange,
    submittedPreviousDateRange,
    formatComparisonValue,
    formatComparisonDelta,
    seriesData,
    submittedMetricType,
    totalOverride,
    submittedGranularity,
    showAverage,
    onShowAverageChange,
    comparePreviousPeriod,
    onComparePreviousPeriodChange,
    granularity,
    onGranularityChange,
    chartData,
    chartYMax,
    chartYMin,
    chartKey,
    processedSeriesData,
    processedPreviousSeriesData,
    getMetricLabelWithCount,
    includedPagesWithCompare,
    onSelectInternalUrl,
    selectedWebsite,
    getMetricLabelCapitalized,
    ChartDataTableComponent,
    TrafficTableComponent,
}: OversiktTabContentProps) => {
    const [showTableSection, setShowTableSection] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);

    const handleDownloadCsv = () => {
        if (!processedSeriesData.length) return;

        const headers = ['Tid', getMetricLabelWithCount(submittedMetricType)];
        const csvRows = [
            headers.join(','),
            ...processedSeriesData.map((item) => [
                new Date(item.time).toLocaleString('nb-NO'),
                item.count,
            ].join(',')),
        ];

        const csvContent = csvRows.join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `trafikkoversikt_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const {
        chartWrapperRef,
        dayDividerXs,
        isMultiDayHourly,
        formatXAxisDateLabel,
    } = useOversiktDayDividers(
        submittedGranularity,
        submittedDateRange,
        chartData,
        chartKey,
        processedSeriesData.length,
    );

    if (hasAttemptedFetch && (isLoadingPageMetrics || !hasFetchedPageMetrics)) {
        return (
            <div className="flex justify-center items-center h-full py-16">
                <Loader size="xlarge" title="Henter data..." />
            </div>
        );
    }

    return (
        <>
            {!submittedComparePreviousPeriod && (
                <TrafficStats
                    data={seriesData}
                    metricType={submittedMetricType}
                    totalOverride={totalOverride}
                    granularity={submittedGranularity}
                />
            )}
            {submittedComparePreviousPeriod && comparisonSummary && comparisonRangeLabel && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Valgt periode</div>
                        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                            {formatComparisonValue(comparisonSummary.currentValue)}
                        </div>
                        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">{comparisonRangeLabel.current}</div>
                    </div>
                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Forrige periode</div>
                        <div className="text-2xl font-bold text-[var(--ax-text-default)]">
                            {formatComparisonValue(comparisonSummary.previousValue)}
                        </div>
                        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">{comparisonRangeLabel.previous}</div>
                    </div>
                    <div className="bg-[var(--ax-bg-default)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm">
                        <div className="text-sm text-[var(--ax-text-default)] font-medium mb-1">Endring</div>
                        <div className={`text-2xl font-bold ${comparisonSummary.deltaPercent !== null ? (comparisonSummary.deltaPercent > 0 ? 'text-green-700' : comparisonSummary.deltaPercent < 0 ? 'text-red-700' : 'text-[var(--ax-text-default)]') : 'text-[var(--ax-text-default)]'}`}>
                            {comparisonSummary.deltaPercent === null
                                ? '–'
                                : `${comparisonSummary.deltaPercent >= 0 ? '+' : ''}${comparisonSummary.deltaPercent.toFixed(1)}%`}
                        </div>
                        <div className="text-sm text-[var(--ax-text-subtle)] mt-1">
                            {formatComparisonDelta(comparisonSummary.deltaValue)}
                        </div>
                    </div>
                </div>
            )}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4">
                    <div className="mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <Heading level="3" size="small">Trafikk over tid</Heading>
                        <div className="flex items-center gap-2 sm:ml-auto">
                            <Label size="small" htmlFor="traffic-granularity">Intervall</Label>
                            <Select
                                id="traffic-granularity"
                                label="Tidsoppløsning"
                                hideLabel
                                size="small"
                                value={granularity}
                                onChange={(e) => onGranularityChange(e.target.value as Granularity)}
                            >
                                <option value="day">Daglig</option>
                                <option value="week">Ukentlig</option>
                                <option value="month">Månedlig</option>
                                <option value="hour">Time</option>
                            </Select>
                            <ActionMenu>
                                <Tooltip content="Flere valg" placement="top">
                                    <ActionMenu.Trigger>
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            size="xsmall"
                                            icon={<MoreVertical aria-hidden />}
                                            aria-label="Flere valg for graf"
                                        />
                                    </ActionMenu.Trigger>
                                </Tooltip>
                                <ActionMenu.Content align="end">
                                    <ActionMenu.Item onClick={handleDownloadCsv} disabled={!processedSeriesData.length}>
                                        Last ned
                                    </ActionMenu.Item>
                                    <ActionMenu.Item onClick={() => setShowAddToDashboardDialog(true)}>
                                        Legg til i dashboard
                                    </ActionMenu.Item>
                                    <ActionMenu.Item onClick={() => openSqlEditorWithContext({ sql: getTrafficSeriesSqlTemplate(), websiteId: selectedWebsite?.id })}>
                                        Åpne i SQL-editor
                                    </ActionMenu.Item>
                                    <ActionMenu.Item onClick={() => onShowAverageChange(!showAverage)}>
                                        {showAverage ? 'Skjul gjennomsnitt' : 'Vis gjennomsnitt'}
                                    </ActionMenu.Item>
                                </ActionMenu.Content>
                            </ActionMenu>
                        </div>
                    </div>
                    <div style={{ width: '100%', height: '340px' }}>
                        {chartData ? (
                            <div
                                ref={chartWrapperRef}
                                className={isMultiDayHourly ? 'traffic-hourly-day-dividers relative' : undefined}
                            >
                                {isMultiDayHourly && dayDividerXs.length > 0 && (
                                    <div className="pointer-events-none absolute inset-0 z-[1]">
                                        {dayDividerXs.map((x, index) => (
                                            <span
                                                key={`day-divider-${index}-${x}`}
                                                className="absolute top-[20px] bottom-[56px] w-px bg-[var(--ax-border-neutral-subtle)] opacity-70"
                                                style={{ left: `${x}px` }}
                                            />
                                        ))}
                                    </div>
                                )}
                                <ResponsiveContainer>
                                    <LineChart
                                        key={chartKey}
                                        data={chartData}
                                        legendsOverflowText={'Overflow Items'}
                                        yAxisTickFormat={(d: number | string) => submittedMetricType === 'proportion' ? `${Number(d).toFixed(1)}%` : Number(d).toLocaleString('nb-NO')}
                                        yAxisTickCount={6}
                                        yMaxValue={chartYMax}
                                        yMinValue={chartYMin}
                                        allowMultipleShapesForPoints={true}
                                        enablePerfOptimization={true}
                                        customDateTimeFormatter={formatXAxisDateLabel}
                                        margins={{ left: 85, right: 40, top: 20, bottom: 26 }}
                                        legendProps={{
                                            allowFocusOnLegends: true,
                                            styles: {
                                                text: { color: 'var(--ax-text-default)' },
                                            }
                                        }}
                                        styles={{
                                            calloutContentX: {
                                                color: 'var(--ax-text-default)',
                                            },
                                        }}
                                    />
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                Ingen data tilgjengelig for diagram
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap justify-end items-center gap-4 mt-1">
                        <Switch
                            checked={comparePreviousPeriod}
                            onChange={(e) => onComparePreviousPeriodChange(e.target.checked)}
                            size="small"
                        >
                            Sammenlign med forrige periode
                        </Switch>
                        <Switch
                            checked={showTableSection}
                            onChange={(e) => setShowTableSection(e.target.checked)}
                            size="small"
                        >
                            Vis som tabell
                        </Switch>
                    </div>
                </div>

                {showTableSection && (
                    <div className="flex flex-col md:flex-row gap-8 mt-4">
                        <div className="w-full md:flex-1 md:basis-0 min-w-0">
                            <ChartDataTableComponent
                                data={processedSeriesData}
                                previousData={processedPreviousSeriesData}
                                metricLabel={getMetricLabelWithCount(submittedMetricType)}
                                submittedDateRange={submittedDateRange}
                                submittedPreviousDateRange={submittedPreviousDateRange}
                            />
                        </div>

                        <div className="w-full md:flex-1 md:basis-0 min-w-0">
                            <TrafficTableComponent
                                title="Inkluderte sider"
                                data={includedPagesWithCompare}
                                onRowClick={onSelectInternalUrl}
                                selectedWebsite={selectedWebsite}
                                metricLabel={getMetricLabelCapitalized(submittedMetricType)}
                                showCompare={submittedComparePreviousPeriod}
                            />
                        </div>
                    </div>
                )}
            </div>
            <AddToDashboardDialog
                open={showAddToDashboardDialog}
                onClose={() => setShowAddToDashboardDialog(false)}
                graphName="Trafikk over tid"
                sqlText={getTrafficSeriesSqlTemplate()}
                graphType="LINE"
                sourceWebsiteId={selectedWebsite?.id}
            />
        </>
    );
};

export default OversiktTabContent;
