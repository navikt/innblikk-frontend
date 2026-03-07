import { useEffect, useRef, useState } from 'react';
import { ActionMenu, Button, Table, Pagination, VStack, Select, TextField, Tooltip } from '@navikt/ds-react';
import { ExternalLink, Filter, MoreVertical, Search } from 'lucide-react';
import type { Website } from '../../../shared/types/chart.ts';
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx';
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx';
import { formatMetricValue, formatCsvValue, downloadCsvFile } from '../utils/trafficUtils';
import { getCombinedEntrancesSqlTemplate } from '../utils/trafficDashboardSqlTemplates.ts';

type CombinedEntrancesTableProps = {
    title: string;
    data: { name: string; count: number; type: 'external' | 'internal'; isDomainInternal?: boolean }[];
    onRowClick?: (name: string) => void;
    selectedWebsite: Website | null;
    metricLabel: string;
    submittedMetricType: string;
};

const CombinedEntrancesTable = ({
    title,
    data,
    onRowClick,
    selectedWebsite,
    metricLabel,
    submittedMetricType
}: CombinedEntrancesTableProps) => {
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const filterSelectRef = useRef<HTMLSelectElement>(null);
    const [typeFilter, setTypeFilter] = useState<'all' | 'external' | 'internal'>('all');
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;

    const filteredData = data.filter(row => {
        const matchesType = typeFilter === 'all'
            ? !row.isDomainInternal
            : (typeFilter === 'external'
                ? row.type === 'external' && !row.isDomainInternal
                : row.type === 'internal');
        const matchesSearch = row.name.toLowerCase().includes(search.toLowerCase());
        return matchesType && matchesSearch;
    });

    const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
    const currentPage = Math.min(page, totalPages);
    const paginatedData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    useEffect(() => {
        if (showSearch) searchInputRef.current?.focus();
    }, [showSearch]);

    useEffect(() => {
        if (showFilter) filterSelectRef.current?.focus();
    }, [showFilter]);

    const isClickableRow = (row: { name: string; type: 'external' | 'internal' }) =>
        row.type === 'internal' && row.name.startsWith('/') && onRowClick;

    const renderName = (row: { name: string; type: 'external' | 'internal' }) => {
        if (row.name === '/') return '/ (forside)';
        if (selectedWebsite && row.name.toLowerCase().replace(/^www\./, '') === selectedWebsite.domain.toLowerCase().replace(/^www\./, '')) {
            return `Interne sider (${row.name})`;
        }
        return row.name;
    };

    const handleDownloadCSV = () => {
        if (!data.length) return;

        const headers = ['Inngang', metricLabel];
        const csvRows = [
            headers.join(','),
            ...data.map((item) => {
                return [
                    item.name,
                    formatCsvValue(item.count, submittedMetricType)
                ].join(',');
            })
        ];

        const csvContent = csvRows.join('\n');
        downloadCsvFile(csvContent, `${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const addToDashboardSql = getCombinedEntrancesSqlTemplate();

    return (
        <>
        <VStack gap="space-4">
            <TableSectionHeader
                title={title}
                actions={(
                    <>
                    <Tooltip content="Filter" placement="top">
                        <Button
                            type="button"
                            variant={showFilter ? 'secondary' : 'tertiary'}
                            size="xsmall"
                            icon={<Filter aria-hidden />}
                            aria-label={`Filtrer ${title}`}
                            aria-pressed={showFilter}
                            onClick={() => setShowFilter((prev) => !prev)}
                        />
                    </Tooltip>
                    <Tooltip content="Søk" placement="top">
                        <Button
                            type="button"
                            variant={showSearch ? 'secondary' : 'tertiary'}
                            size="xsmall"
                            icon={<Search aria-hidden />}
                            aria-label={`Søk i ${title}`}
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
                                    aria-label={`Flere valg for ${title}`}
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
                controls={(
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto min-w-0">
                        {showFilter && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                                <span className="text-sm text-[var(--ax-text-default)] whitespace-nowrap">
                                    Type trafikkilde
                                </span>
                                <div className="w-full sm:w-32">
                                    <Select
                                        label="Trafikktype"
                                        hideLabel
                                        size="small"
                                        value={typeFilter}
                                        ref={filterSelectRef}
                                        onChange={(e) => setTypeFilter(e.target.value as 'all' | 'external' | 'internal')}
                                    >
                                        <option value="all">Alle</option>
                                        <option value="external">Eksterne</option>
                                        <option value="internal">Interne</option>
                                    </Select>
                                </div>
                            </div>
                        )}
                        {showSearch && (
                            <div className="w-full sm:w-64 min-w-0">
                                <TextField
                                    label="Søk"
                                    hideLabel
                                    placeholder="Søk..."
                                    size="small"
                                    value={search}
                                    ref={searchInputRef}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                )}
            />
            <div className="border rounded-lg overflow-x-auto">
                <div className="min-w-max">
                    <Table size="small" className="table-auto min-w-full [&_th:first-child]:!pl-2 [&_th:first-child]:!pr-2 [&_td:first-child]:!pl-2 [&_td:first-child]:!pr-2">
                        <colgroup>
                            <col style={{ width: '6.75rem' }} />
                            <col />
                        </colgroup>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell align="right" className="whitespace-normal leading-tight" style={{ width: '6.75rem', minWidth: '6.75rem' }}>{metricLabel}</Table.HeaderCell>
                                <Table.HeaderCell className="whitespace-nowrap">Inngang</Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {paginatedData.map((row, i) => (
                                <Table.Row
                                    key={i}
                                    className={isClickableRow(row) ? 'cursor-pointer hover:bg-[var(--ax-bg-neutral-soft)]' : ''}
                                    onClick={() => isClickableRow(row) && onRowClick?.(row.name)}
                                >
                                    <Table.DataCell align="right" className="tabular-nums" style={{ width: '6.75rem', minWidth: '6.75rem' }}>{formatMetricValue(row.count, submittedMetricType)}</Table.DataCell>
                                    <Table.DataCell className="whitespace-nowrap" title={row.name}>
                                        {isClickableRow(row) ? (
                                            <span className="flex items-center gap-1">
                                                <span
                                                    className="text-blue-600 hover:underline cursor-pointer whitespace-nowrap"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRowClick?.(row.name);
                                                    }}
                                                >
                                                    {renderName(row)}
                                                </span>
                                                <ExternalLink className="h-3 w-3 shrink-0 text-blue-600" />
                                            </span>
                                        ) : (
                                            <div className="whitespace-nowrap">{renderName(row)}</div>
                                        )}
                                    </Table.DataCell>
                                </Table.Row>
                            ))}
                            {filteredData.length === 0 && (
                                <Table.Row>
                                    <Table.DataCell colSpan={2} align="center">
                                        {data.length > 0 ? 'Ingen treff' : 'Ingen data'}
                                    </Table.DataCell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                </div>
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
            graphName={title}
            sqlText={addToDashboardSql}
            graphType="TABLE"
            sourceWebsiteId={selectedWebsite?.id}
        />
        </>
    );
};

export default CombinedEntrancesTable;
