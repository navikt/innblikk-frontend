import { useEffect, useRef, useState } from 'react';
import { ActionMenu, Button, Table, Pagination, VStack, HelpText, TextField, Tooltip } from '@navikt/ds-react';
import { MoreVertical, Search } from 'lucide-react';
import type { Website } from '../../../shared/types/chart.ts';
import type { MarketingRow, QueryStats } from '../model/types';
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx';
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx';
import { downloadCsvFile } from '../utils/trafficUtils';

type AnalysisTableProps = {
    title: string;
    data: MarketingRow[];
    metricLabel: string;
    queryStats: QueryStats | null;
    selectedWebsite: Website | null;
    metricType: string;
    addToDashboardSqlTemplate: string;
};

const AnalysisTable = ({ title, data, metricLabel, queryStats, selectedWebsite, metricType, addToDashboardSqlTemplate }: AnalysisTableProps) => {
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [page, setPage] = useState(1);
    const rowsPerPage = 20;

    const filteredData = data.filter(row =>
        row.name.toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
    const currentPage = Math.min(page, totalPages);
    const paginatedData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    useEffect(() => {
        if (showSearch) searchInputRef.current?.focus();
    }, [showSearch]);

    const formatValue = (count: number) => {
        if (metricType === 'proportion') {
            return `${count.toFixed(1)}%`;
        }
        return count.toLocaleString('nb-NO');
    };

    const handleDownloadCSV = () => {
        if (!data.length) return;

        const headers = ['Navn', metricLabel];
        const csvRows = [
            headers.join(','),
            ...data.map((item) => {
                return [
                    `"${item.name}"`,
                    metricType === 'proportion' ? `${item.count.toFixed(1)}%` : item.count
                ].join(',');
            })
        ];

        const csvContent = csvRows.join('\n');
        downloadCsvFile(csvContent, `marketing_${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    };

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

        if (name === '(exit)') {
            return (
                <div className="flex items-center gap-2 max-w-full">
                    <span className="truncate">Utganger (Exit)</span>
                    <HelpText title="Hva betyr dette?" strategy="fixed">
                        Dette viser vanligvis til økter som ble avsluttet uten ny sidevisning, eller data som mangler kildeinformasjon ved utgang.
                    </HelpText>
                </div>
            );
        }

        if (name === '(not set)') {
            return "Ikke satt (not set)";
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

        return <div className="truncate">{name}</div>;
    };

    const addToDashboardSql = addToDashboardSqlTemplate;

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
                            <ActionMenu.Item onClick={handleDownloadCSV} disabled={data.length === 0}>Last ned CSV</ActionMenu.Item>
                            <ActionMenu.Item onClick={() => setShowAddToDashboardDialog(true)} disabled={!filteredData.length}>
                                Legg til i dashboard
                            </ActionMenu.Item>
                            {queryStats && (
                                <>
                                    <ActionMenu.Divider />
                                    <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                                        {queryStats.totalBytesProcessedGB} GB prosessert
                                    </div>
                                </>
                            )}
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
                <Table size="small">
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Navn</Table.HeaderCell>
                            <Table.HeaderCell align="right">{metricLabel}</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {paginatedData.map((row, i) => (
                            <Table.Row key={i}>
                                <Table.DataCell className="max-w-md" title={row.name}>
                                    {renderName(row.name)}
                                </Table.DataCell>
                                <Table.DataCell align="right">{formatValue(row.count)}</Table.DataCell>
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

export default AnalysisTable;
