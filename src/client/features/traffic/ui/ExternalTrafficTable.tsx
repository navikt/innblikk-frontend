import { useEffect, useRef, useState } from 'react';
import { ActionMenu, Button, Table, Pagination, VStack, HelpText, TextField, Tooltip } from '@navikt/ds-react';
import { MoreVertical, Search } from 'lucide-react';
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx';
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx';
import { formatMetricValue, formatCsvValue, downloadCsvFile } from '../utils/trafficUtils';
import { getExternalSourcesSqlTemplate } from '../utils/trafficDashboardSqlTemplates.ts';

type ExternalTrafficTableProps = {
    title: string;
    data: { name: string; count: number }[];
    metricLabel: string;
    websiteDomain?: string;
    submittedMetricType: string;
};

const ExternalTrafficTable = ({ title, data, metricLabel, websiteDomain, submittedMetricType }: ExternalTrafficTableProps) => {
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;

    const filteredData = data.filter(row =>
        row.name.toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
    const currentPage = Math.min(page, totalPages);
    const paginatedData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    useEffect(() => {
        if (showSearch) searchInputRef.current?.focus();
    }, [showSearch]);

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

    const addToDashboardSql = getExternalSourcesSqlTemplate();

    return (
        <>
        <VStack gap="space-4">
            <TableSectionHeader
                title={title}
                actions={(
                    <>
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
                controls={showSearch ? (
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
                ) : undefined}
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
        />
        </>
    );
};

export default ExternalTrafficTable;
