import { useEffect, useRef, useState } from 'react';
import { ActionMenu, Button, Heading, TextField, Tooltip } from '@navikt/ds-react';
import { MoreVertical, Search } from 'lucide-react';
import type { SeriesPoint, QueryStats } from '../model/types.ts';
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx';
import { getEventSeriesSqlTemplate } from '../utils/eventExplorerDashboardSql.ts';

interface EventSeriesTrendTableProps {
    seriesData: SeriesPoint[];
    selectedEvent: string;
    queryStats: QueryStats | null;
}

const EventSeriesTrendTable = ({ seriesData, selectedEvent, queryStats }: EventSeriesTrendTableProps) => {
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const filteredSeriesData = seriesData.filter((item) =>
        new Date(item.time).toLocaleDateString('nb-NO').includes(search)
    );

    useEffect(() => {
        if (showSearch) searchInputRef.current?.focus();
    }, [showSearch]);

    const handleDownloadCsv = () => {
        const headers = ['Dato', 'Antall'];
        const csvRows = [
            headers.join(','),
            ...filteredSeriesData.map((item) => {
                return [
                    new Date(item.time).toLocaleDateString('nb-NO'),
                    item.count
                ].join(',');
            })
        ];
        const csvContent = csvRows.join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${selectedEvent}_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4">
            <div className="mb-2 flex items-center justify-between gap-2">
                <Heading level="3" size="small">Trend over tid</Heading>
                <div className="flex items-center gap-1">
                    <Tooltip content="Søk" placement="top">
                        <Button
                            type="button"
                            variant={showSearch ? 'secondary' : 'tertiary'}
                            size="xsmall"
                            icon={<Search aria-hidden />}
                            aria-label="Søk i trendtabell"
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
                                    aria-label="Flere valg for trendtabell"
                                />
                            </ActionMenu.Trigger>
                        </Tooltip>
                        <ActionMenu.Content align="end">
                            <ActionMenu.Item onClick={handleDownloadCsv} disabled={filteredSeriesData.length === 0}>
                                Last ned
                            </ActionMenu.Item>
                            <ActionMenu.Item onClick={() => setShowAddToDashboardDialog(true)}>
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
                </div>
            </div>
            {showSearch && (
                <div className="w-full sm:w-64 min-w-0">
                    <TextField
                        label="Søk"
                        hideLabel
                        placeholder="Søk etter dato..."
                        size="small"
                        value={search}
                        ref={searchInputRef}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            )}
            <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
                    <thead className="bg-[var(--ax-bg-neutral-soft)]">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Dato</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">Antall</th>
                        </tr>
                    </thead>
                    <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
                        {filteredSeriesData.map((item, index) => (
                            <tr key={index} className="hover:bg-[var(--ax-bg-neutral-soft)]">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--ax-text-default)]">
                                    {new Date(item.time).toLocaleDateString('nb-NO')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                                    {item.count.toLocaleString('nb-NO')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            </div>
            <AddToDashboardDialog
                open={showAddToDashboardDialog}
                onClose={() => setShowAddToDashboardDialog(false)}
                graphName={`Trend over tid: ${selectedEvent}`}
                sqlText={getEventSeriesSqlTemplate(selectedEvent)}
                graphType="LINE"
            />
        </div>
    );
};

export default EventSeriesTrendTable;
