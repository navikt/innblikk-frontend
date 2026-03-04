import { useState, useEffect } from 'react';
import { Button, Table, Heading, Pagination, VStack, HelpText, TextField } from '@navikt/ds-react';
import { Download } from 'lucide-react';
import { formatMetricValue, formatCsvValue, downloadCsvFile } from '../utils/trafficUtils';

type ExternalTrafficTableProps = {
    title: string;
    data: { name: string; count: number }[];
    metricLabel: string;
    websiteDomain?: string;
    submittedMetricType: string;
};

const ExternalTrafficTable = ({ title, data, metricLabel, websiteDomain, submittedMetricType }: ExternalTrafficTableProps) => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;

    const filteredData = data.filter(row =>
        row.name.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        setPage(1);
    }, [search]);

    const paginatedData = filteredData.slice((page - 1) * rowsPerPage, page * rowsPerPage);
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);

    const renderName = (name: string) => {
        if (name === 'Interne sider') return <div className="whitespace-nowrap">Interne sider</div>;
        if (name === 'Ukjent / Andre') {
            return (
                <div className="flex items-center gap-2 max-w-full">
                    <span className="truncate">Ukjent / Andre</span>
                    <HelpText title="Hva betyr dette?" strategy="fixed">
                        Differansen mellom totalen og summen av identifiserte kanaler. Dette kan skyldes filtrering, begrenset antall kilder, eller manglende henvisningsdata.
                    </HelpText>
                </div>
            );
        }
        if (name === '(none)' || name === 'Direkte / Annet') {
            return (
                <div className="flex items-center gap-2 max-w-full">
                    <span className="truncate">Direkte / Ingen</span>
                    <HelpText title="Hva betyr dette?" strategy="fixed">
                        Besøk hvor det ikke er registrert noen henvisningskilde. Dette er ofte brukere som skriver inn nettadressen direkte, bruker bokmerker, eller kommer fra apper (som e-post eller Teams) som ikke sender data om hvor trafikken kommer fra.
                    </HelpText>
                </div>
            );
        }
        const normalizedName = name.toLowerCase().replace(/^www\./, '');
        const normalizedDomain = websiteDomain?.toLowerCase().replace(/^www\./, '');
        if (normalizedDomain && normalizedName === normalizedDomain) {
            return (
                <div className="flex items-center gap-2 max-w-full">
                    <span className="truncate">{name} (interntrafikk)</span>
                    <HelpText title="Hva betyr dette?" strategy="fixed">
                        Besøkende som kom fra andre sider på samme nettsted. For eksempel brukere som klikket på en lenke fra forsiden eller en annen underside.
                    </HelpText>
                </div>
            );
        }
        return <div className="whitespace-nowrap">{name}</div>;
    };

    const handleDownloadCSV = () => {
        if (!data.length) return;

        const headers = ['Navn', metricLabel];
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
                    <Table size="small" className="table-auto min-w-full [&_th:first-child]:!pl-2 [&_th:first-child]:!pr-2 [&_td:first-child]:!pl-2 [&_td:first-child]:!pr-2">
                        <colgroup>
                            <col style={{ width: '6.75rem' }} />
                            <col />
                        </colgroup>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell align="right" className="whitespace-normal leading-tight" style={{ width: '6.75rem', minWidth: '6.75rem' }}>{metricLabel}</Table.HeaderCell>
                                <Table.HeaderCell className="whitespace-nowrap">Navn</Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {paginatedData.map((row, i) => (
                                <Table.Row key={i}>
                                    <Table.DataCell align="right" className="tabular-nums" style={{ width: '6.75rem', minWidth: '6.75rem' }}>{formatMetricValue(row.count, submittedMetricType)}</Table.DataCell>
                                    <Table.DataCell className="whitespace-nowrap" title={row.name}>
                                        {renderName(row.name)}
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
                        <div className="flex gap-2">
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

export default ExternalTrafficTable;
