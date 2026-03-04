import { useState, useEffect } from 'react';
import { Button, Table, Heading, Pagination, VStack, Select, TextField } from '@navikt/ds-react';
import { Download, ExternalLink } from 'lucide-react';
import type { Website } from '../../../shared/types/chart.ts';
import { formatMetricValue, formatCsvValue, downloadCsvFile } from '../utils/trafficUtils';

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

    useEffect(() => {
        setPage(1);
    }, [search, typeFilter]);

    const paginatedData = filteredData.slice((page - 1) * rowsPerPage, page * rowsPerPage);
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);

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

    return (
        <VStack gap="space-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <Heading level="3" size="small">{title}</Heading>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto min-w-0">
                    <div className="w-full sm:w-32">
                        <Select
                            label="Filter"
                            hideLabel
                            size="small"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'external' | 'internal')}
                        >
                            <option value="all">Alle</option>
                            <option value="external">Eksterne</option>
                            <option value="internal">Interne</option>
                        </Select>
                    </div>
                    <div className="w-full sm:w-64 min-w-0">
                        <TextField
                            label="Søk"
                            hideLabel
                            placeholder="Søk..."
                            size="small"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>
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
                    <div className="flex gap-2 p-3 bg-[var(--ax-bg-neutral-soft)] border-t justify-between items-center min-w-full">
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={handleDownloadCSV}
                            icon={<Download size={16} />}
                        >
                            Last ned CSV
                        </Button>
                    </div>
                </div>
            </div>
            {totalPages > 1 && (
                <Pagination
                    page={page}
                    onPageChange={setPage}
                    count={totalPages}
                    size="small"
                />
            )}
        </VStack>
    );
};

export default CombinedEntrancesTable;
