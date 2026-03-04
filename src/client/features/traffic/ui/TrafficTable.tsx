import { useState, useEffect } from 'react';
import { Button, Table, Heading, Pagination, VStack, HelpText, TextField } from '@navikt/ds-react';
import { Download, ExternalLink } from 'lucide-react';
import type { Website } from '../../../shared/types/chart.ts';
import { formatMetricValue, formatMetricDelta as formatMetricDeltaUtil, downloadCsvFile } from '../utils/trafficUtils';

type TrafficTableProps = {
    title: string;
    data: { name: string; count: number; previousCount?: number; deltaCount?: number }[];
    onRowClick?: (name: string) => void;
    selectedWebsite: Website | null;
    metricLabel: string;
    showCompare?: boolean;
    submittedMetricType: string;
};

const TrafficTable = ({
    title,
    data,
    onRowClick,
    selectedWebsite,
    metricLabel,
    showCompare = false,
    submittedMetricType
}: TrafficTableProps) => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;
    const valueColWidth = showCompare ? '5.75rem' : '6.75rem';
    const deltaColWidth = '6.5rem';

    const filteredData = data.filter(row =>
        row.name.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        setPage(1);
    }, [search]);

    const paginatedData = filteredData.slice((page - 1) * rowsPerPage, page * rowsPerPage);
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);

    const isClickableRow = (name: string) => name.startsWith('/') && onRowClick;

    const renderName = (name: string) => {
        if (name === '(none)') {
            return (
                <div className="flex items-center gap-2 max-w-full">
                    <span className="truncate">Direkte / Ingen</span>
                    <HelpText title="Hva betyr dette?" strategy="fixed">
                        Besøk hvor det ikke er registrert noen henvisningskilde. Dette er ofte brukere som skriver inn nettadressen direkte, bruker bokmerker, eller kommer fra apper (som e-post eller Teams) som ikke sender data om hvor trafikken kommer fra.
                    </HelpText>
                </div>
            );
        }

        if (name === '(exit)' || name === 'Exit') {
            return (
                <div className="flex items-center gap-2 max-w-full">
                    <span className="truncate">Forlot nettstedet</span>
                    <HelpText title="Hva betyr dette?" strategy="fixed">
                        Vi kan ikke se om de klikket på en ekstern lenke, lukket fanen/nettleseren.
                    </HelpText>
                </div>
            );
        }

        if (name === '(not set)') {
            return "Ikke satt (not set)";
        }

        if (name === '/') {
            return "/ (forside)";
        }

        if (selectedWebsite && name === selectedWebsite.domain) {
            return (
                <div className="flex items-center gap-2 max-w-full">
                    <span className="truncate">Interntrafikk ({name})</span>
                    <HelpText title="Hva betyr dette?" strategy="fixed">
                        Trafikk som ser ut til å komme fra samme domene. Dette skjer ofte ved omdirigeringer, eller hvis sporingskoden mistet sesjonsdata mellom to sidevisninger.
                    </HelpText>
                </div>
            );
        }

        return <div className="whitespace-nowrap">{name}</div>;
    };

    const handleDownloadCSV = () => {
        if (!data.length) return;

        const headers = showCompare
            ? ['URL-sti', metricLabel, 'Forrige', 'Endring']
            : ['URL-sti', metricLabel];
        const csvRows = [
            headers.join(','),
            ...data.map((item) => {
                const baseRow = [
                    item.name,
                    formatMetricValue(item.count, submittedMetricType)
                ];
                if (showCompare) {
                    baseRow.push(formatMetricValue(item.previousCount || 0, submittedMetricType));
                    baseRow.push(formatMetricDeltaUtil(item.deltaCount || 0, submittedMetricType));
                }
                return baseRow.join(',');
            })
        ];

        const csvContent = csvRows.join('\n');
        downloadCsvFile(csvContent, `${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    return (
        <VStack gap="space-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
                <Heading level="3" size="small">{title}</Heading>
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
            <div className="border rounded-lg overflow-x-auto">
                <div className="min-w-max">
                    <Table
                        size="small"
                        className="table-auto min-w-full [&_th:first-child]:!pl-2 [&_th:first-child]:!pr-2 [&_td:first-child]:!pl-2 [&_td:first-child]:!pr-2"
                    >
                        <colgroup>
                            <col style={{ width: valueColWidth }} />
                            {showCompare && <col style={{ width: valueColWidth }} />}
                            {showCompare && <col style={{ width: deltaColWidth }} />}
                            <col />
                        </colgroup>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell align="right" className="whitespace-normal leading-tight" style={{ width: valueColWidth, minWidth: valueColWidth }}>
                                    {metricLabel}
                                </Table.HeaderCell>
                                {showCompare && (
                                    <Table.HeaderCell align="right" className="whitespace-normal leading-tight" style={{ width: valueColWidth, minWidth: valueColWidth }}>
                                        Forrige
                                    </Table.HeaderCell>
                                )}
                                {showCompare && (
                                    <Table.HeaderCell align="right" className="whitespace-normal leading-tight" style={{ width: deltaColWidth, minWidth: deltaColWidth }}>
                                        Endring
                                    </Table.HeaderCell>
                                )}
                                <Table.HeaderCell className="whitespace-nowrap">URL-sti</Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {paginatedData.map((row, i) => (
                                <Table.Row
                                    key={i}
                                    className={isClickableRow(row.name) ? 'cursor-pointer hover:bg-[var(--ax-bg-neutral-soft)]' : ''}
                                    onClick={() => isClickableRow(row.name) && onRowClick?.(row.name)}
                                >
                                    <Table.DataCell align="right" className="tabular-nums" style={{ width: valueColWidth, minWidth: valueColWidth }}>
                                        {formatMetricValue(row.count, submittedMetricType)}
                                    </Table.DataCell>
                                    {showCompare && (
                                        <Table.DataCell align="right" className="tabular-nums" style={{ width: valueColWidth, minWidth: valueColWidth }}>
                                            {formatMetricValue(row.previousCount || 0, submittedMetricType)}
                                        </Table.DataCell>
                                    )}
                                    {showCompare && (
                                        <Table.DataCell
                                            align="right"
                                            className={`tabular-nums font-medium ${((row.deltaCount || 0) > 0) ? 'text-green-700' : ((row.deltaCount || 0) < 0) ? 'text-red-700' : ''}`}
                                            style={{ width: deltaColWidth, minWidth: deltaColWidth }}
                                        >
                                            {formatMetricDeltaUtil(row.deltaCount || 0, submittedMetricType)}
                                        </Table.DataCell>
                                    )}
                                    <Table.DataCell className="whitespace-nowrap" title={row.name}>
                                        {isClickableRow(row.name) ? (
                                            <span className="flex items-center gap-1">
                                                <span
                                                    className="text-blue-600 hover:underline cursor-pointer whitespace-nowrap"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRowClick?.(row.name);
                                                    }}
                                                >
                                                    {row.name === '/' ? '/ (forside)' : row.name}
                                                </span>
                                                <ExternalLink className="h-3 w-3 shrink-0 text-blue-600" />
                                            </span>
                                        ) : (
                                            renderName(row.name)
                                        )}
                                    </Table.DataCell>
                                </Table.Row>
                            ))}
                            {filteredData.length === 0 && (
                                <Table.Row>
                                    <Table.DataCell colSpan={showCompare ? 4 : 2} align="center">
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

export default TrafficTable;
