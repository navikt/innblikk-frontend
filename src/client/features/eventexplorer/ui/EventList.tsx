import { useEffect, useRef, useState } from 'react';
import { Heading, Button, Table, TextField, ActionMenu, Tooltip } from '@navikt/ds-react';
import { MoreVertical, Search } from 'lucide-react';
import type { QueryStats } from '../model/types.ts';
import AddToDashboardDialog from '../../../shared/ui/AddToDashboardDialog.tsx';
import { getEventListSqlTemplate } from '../utils/eventExplorerDashboardSql.ts';

interface EventListProps {
    events: { name: string; count: number }[];
    eventsQueryStats: QueryStats | null;
    websiteName?: string;
    onSelectEvent: (name: string) => void;
}

const EventList = ({ events, eventsQueryStats, websiteName, onSelectEvent }: EventListProps) => {
    const [eventSearch, setEventSearch] = useState<string>('');
    const [showSearch, setShowSearch] = useState(false);
    const [showAddToDashboardDialog, setShowAddToDashboardDialog] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const filteredEvents = events.filter(event =>
        event.name.toLowerCase().includes(eventSearch.toLowerCase())
    );

    useEffect(() => {
        if (showSearch) searchInputRef.current?.focus();
    }, [showSearch]);

    const handleDownloadCsv = () => {
        const headers = ['Hendelsesnavn', 'Antall'];
        const csvRows = [
            headers.join(','),
            ...filteredEvents.map((event) => [
                `"${event.name}"`,
                event.count
            ].join(','))
        ];
        const csvContent = csvRows.join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `hendelser_${websiteName || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4">
            <div className="mb-2 flex items-center justify-between gap-2">
                <Heading level="3" size="small">Egendefinerte hendelser</Heading>
                <div className="flex items-center gap-1">
                    <Tooltip content="Søk" placement="top">
                        <Button
                            type="button"
                            variant={showSearch ? 'secondary' : 'tertiary'}
                            size="xsmall"
                            icon={<Search aria-hidden />}
                            aria-label="Søk i hendelseslisten"
                            aria-pressed={showSearch}
                            onClick={() => {
                                setShowSearch((prev) => !prev);
                                if (showSearch) setEventSearch('');
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
                                    aria-label="Flere valg for hendelseslisten"
                                />
                            </ActionMenu.Trigger>
                        </Tooltip>
                        <ActionMenu.Content align="end">
                            <ActionMenu.Item onClick={handleDownloadCsv} disabled={filteredEvents.length === 0}>
                                Last ned
                            </ActionMenu.Item>
                            <ActionMenu.Item onClick={() => setShowAddToDashboardDialog(true)}>
                                Legg til i dashboard
                            </ActionMenu.Item>
                            {eventsQueryStats && (
                                <>
                                    <ActionMenu.Divider />
                                    <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                                        {eventsQueryStats.totalBytesProcessedGB} GB prosessert
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
                        placeholder="Søk..."
                        size="small"
                        value={eventSearch}
                        ref={searchInputRef}
                        onChange={(e) => setEventSearch(e.target.value)}
                    />
                </div>
            )}
            <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <Table size="small">
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell>Navn</Table.HeaderCell>
                                <Table.HeaderCell align="right">Antall tilfeller</Table.HeaderCell>
                                <Table.HeaderCell></Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {filteredEvents.map((event) => (
                                <Table.Row key={event.name}>
                                    <Table.DataCell>{event.name}</Table.DataCell>
                                    <Table.DataCell align="right">{event.count.toLocaleString('nb-NO')}</Table.DataCell>
                                    <Table.DataCell>
                                        <Button
                                            size="xsmall"
                                            variant="secondary"
                                            onClick={() => onSelectEvent(event.name)}
                                        >
                                            Utforsk
                                        </Button>
                                    </Table.DataCell>
                                </Table.Row>
                        ))}
                    </Table.Body>
                    </Table>
                </div>
            </div>
            <AddToDashboardDialog
                open={showAddToDashboardDialog}
                onClose={() => setShowAddToDashboardDialog(false)}
                graphName="Egendefinerte hendelser"
                sqlText={getEventListSqlTemplate()}
                graphType="TABLE"
            />
        </div>
    );
};

export default EventList;
