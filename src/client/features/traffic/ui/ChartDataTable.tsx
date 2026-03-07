import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionMenu, Button, Table, Pagination, VStack, TextField, Tooltip } from '@navikt/ds-react';
import { MoreVertical, Search } from 'lucide-react';
import type { SeriesPoint, QueryStats, Granularity, DateRange } from '../model/types';
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx';
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx';
import { formatMetricValue, formatMetricDelta as formatMetricDeltaUtil, downloadCsvFile } from '../utils/trafficUtils';
import { getTrafficSeriesSqlTemplate } from '../utils/trafficDashboardSqlTemplates.ts';

type ChartDataTableProps = {
    data: SeriesPoint[];
    previousData: SeriesPoint[];
    metricLabel: string;
    submittedDateRange: DateRange | null;
    submittedPreviousDateRange: DateRange | null;
    submittedMetricType: string;
    submittedGranularity: Granularity;
    submittedComparePreviousPeriod: boolean;
    seriesQueryStats: QueryStats | null;
};

const ChartDataTable = (props: ChartDataTableProps) => {
    const {
        data,
        previousData,
        metricLabel,
        submittedDateRange,
        submittedPreviousDateRange,
        submittedMetricType,
        submittedGranularity,
        submittedComparePreviousPeriod,
    } = props;
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;

    const formatTime = (time: string) => {
        if (submittedGranularity === 'hour') {
            return `${new Date(time).toLocaleDateString('nb-NO')} ${new Date(time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`;
        }
        return new Date(time).toLocaleDateString('nb-NO');
    };

    const shouldShowCompareColumns = Boolean(
        submittedComparePreviousPeriod &&
        previousData.length &&
        submittedDateRange &&
        submittedPreviousDateRange
    );

    const previousByShiftedTime = useMemo(() => {
        const map = new Map<string, number>();

        if (!shouldShowCompareColumns || !submittedDateRange || !submittedPreviousDateRange) {
            return map;
        }

        const offsetMs = submittedDateRange.startDate.getTime() - submittedPreviousDateRange.startDate.getTime();
        previousData.forEach((item: SeriesPoint) => {
            const shiftedIso = new Date(new Date(item.time).getTime() + offsetMs).toISOString();
            map.set(shiftedIso, Number(item.count) || 0);
        });

        return map;
    }, [shouldShowCompareColumns, previousData, submittedDateRange, submittedPreviousDateRange]);

    const filteredData = data.filter(item =>
        formatTime(item.time).includes(search)
    );

    const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
    const currentPage = Math.min(page, totalPages);
    const paginatedData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    useEffect(() => {
        if (showSearch) searchInputRef.current?.focus();
    }, [showSearch]);

    const handleDownloadCSV = () => {
        if (!data.length) return;

        const dateHeader = submittedGranularity === 'hour' ? 'Tidspunkt' : 'Dato';
        const headers = shouldShowCompareColumns
            ? [dateHeader, metricLabel, 'Forrige', 'Endring']
            : [dateHeader, metricLabel];
        const csvRows = [
            headers.join(','),
            ...data.map((item) => {
                const timeStr = formatTime(item.time);
                const currentValue = Number(item.count) || 0;
                const baseRow = [timeStr, formatMetricValue(currentValue, submittedMetricType)];
                if (shouldShowCompareColumns) {
                    const previousValue = previousByShiftedTime.get(new Date(item.time).toISOString());
                    const hasPreviousValue = typeof previousValue === 'number';
                    baseRow.push(hasPreviousValue ? formatMetricValue(previousValue, submittedMetricType) : '-');
                    baseRow.push(hasPreviousValue ? formatMetricDeltaUtil(currentValue - previousValue, submittedMetricType) : '-');
                }
                return baseRow.join(',');
            })
        ];

        const csvContent = csvRows.join('\n');
        downloadCsvFile(csvContent, `oversikt_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const addToDashboardSql = getTrafficSeriesSqlTemplate();

    return (
        <>
        <VStack gap="space-4">
            <TableSectionHeader
                title="Oversikt"
                actions={(
                    <>
                    <Tooltip content="Søk" placement="top">
                        <Button
                            type="button"
                            variant={showSearch ? 'secondary' : 'tertiary'}
                            size="xsmall"
                            icon={<Search aria-hidden />}
                            aria-label="Søk i oversiktstabell"
                            aria-pressed={showSearch}
                            onClick={() => {
                                setShowSearch((prev) => !prev);
                                if (showSearch) setSearch('');
                            }}
                        />
                    </Tooltip>
                    <ActionMenu>
                        <Tooltip content="Flere valg" placement="top">
                            <ActionMenu.Trigger>
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    size="xsmall"
                                    icon={<MoreVertical aria-hidden />}
                                    aria-label="Flere valg for oversiktstabell"
                                />
                            </ActionMenu.Trigger>
                        </Tooltip>
                        <ActionMenu.Content align="end">
                            <ActionMenu.Item onClick={handleDownloadCSV} disabled={!data.length}>Last ned CSV</ActionMenu.Item>
                            <ActionMenu.Item onClick={() => setShowAddToDashboardDialog(true)} disabled={!filteredData.length}>
                                Legg til i dashboard
                            </ActionMenu.Item>
                        </ActionMenu.Content>
                    </ActionMenu>
                    </>
                )}
                controls={showSearch ? (
                    <div className="w-full sm:w-64 min-w-0">
                        <TextField
                            label={submittedGranularity === 'hour' ? 'Søk etter tidspunkt' : 'Søk etter dato'}
                            hideLabel
                            placeholder={submittedGranularity === 'hour' ? 'Søk etter tid...' : 'Søk etter dato...'}
                            size="small"
                            value={search}
                            ref={searchInputRef}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                ) : undefined}
            />
            <div className="border rounded-lg overflow-x-auto">
                <Table size="small" className="table-fixed w-full">
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>{submittedGranularity === 'hour' ? 'Tidspunkt' : 'Dato'}</Table.HeaderCell>
                            <Table.HeaderCell align="right">{metricLabel}</Table.HeaderCell>
                            {shouldShowCompareColumns && (
                                <Table.HeaderCell align="right">Forrige</Table.HeaderCell>
                            )}
                            {shouldShowCompareColumns && (
                                <Table.HeaderCell align="right">Endring</Table.HeaderCell>
                            )}
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {paginatedData.map((item, index) => {
                            const currentValue = Number(item.count) || 0;
                            const previousValue = previousByShiftedTime.get(new Date(item.time).toISOString());
                            const hasPreviousValue = typeof previousValue === 'number';
                            const deltaValue = hasPreviousValue ? currentValue - previousValue : null;

                            return (
                                <Table.Row key={index}>
                                    <Table.DataCell>
                                        {formatTime(item.time)}
                                    </Table.DataCell>
                                    <Table.DataCell align="right" className="tabular-nums">
                                        {formatMetricValue(currentValue, submittedMetricType)}
                                    </Table.DataCell>
                                    {shouldShowCompareColumns && (
                                        <Table.DataCell align="right" className="tabular-nums">
                                            {hasPreviousValue ? formatMetricValue(previousValue, submittedMetricType) : '-'}
                                        </Table.DataCell>
                                    )}
                                    {shouldShowCompareColumns && (
                                        <Table.DataCell
                                            align="right"
                                            className={`tabular-nums font-medium ${deltaValue && deltaValue > 0 ? 'text-green-700' : deltaValue && deltaValue < 0 ? 'text-red-700' : ''}`}
                                        >
                                            {deltaValue === null ? '-' : formatMetricDeltaUtil(deltaValue, submittedMetricType)}
                                        </Table.DataCell>
                                    )}
                                </Table.Row>
                            );
                        })}
                        {filteredData.length === 0 && (
                            <Table.Row>
                                <Table.DataCell colSpan={shouldShowCompareColumns ? 4 : 2} align="center">
                                    {data.length > 0 ? 'Ingen treff (Data: ' + data.length + ')' : 'Ingen data'}
                                </Table.DataCell>
                            </Table.Row>
                        )}
                    </Table.Body>
                </Table>
            </div>
            {totalPages > 1 && (
                <Pagination
                    page={currentPage}
                    onPageChange={setPage}
                    count={totalPages}
                    size="small"
                />
            )}
        </VStack>
        <AddToDashboardDialog
            open={showAddToDashboardDialog}
            onClose={() => setShowAddToDashboardDialog(false)}
            graphName="Oversikt"
            sqlText={addToDashboardSql}
            graphType="TABLE"
        />
        </>
    );
};

export default ChartDataTable;
