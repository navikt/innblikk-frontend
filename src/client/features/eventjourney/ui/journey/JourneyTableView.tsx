import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionMenu, Button, Pagination, Select, TextField, Tooltip } from '@navikt/ds-react';
import { MoreVertical, Search } from 'lucide-react';
import { parseJourneyStep } from '../../utils/parsers.ts';
import TableSectionHeader from '../../../../shared/ui/TableSectionHeader.tsx';

interface JourneyTableViewProps {
    journeys: { path: string[]; count: number }[];
    totalSessions: number;
}

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100] as const;

const JourneyTableView = ({ journeys, totalSessions }: JourneyTableViewProps) => {
    const [page, setPage] = useState<number>(1);
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const filteredJourneys = useMemo(() =>
        journeys.filter((journey) =>
            journey.path
                .map((step) => parseJourneyStep(step).eventName)
                .join(' ')
                .toLowerCase()
                .includes(search.toLowerCase())
        ),
    [journeys, search]);

    const totalPages = Math.max(1, Math.ceil(filteredJourneys.length / rowsPerPage));
    const currentPage = Math.min(page, totalPages);

    const paginatedJourneys = useMemo(() => {
        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        return filteredJourneys.slice(startIndex, endIndex);
    }, [filteredJourneys, currentPage, rowsPerPage]);

    useEffect(() => {
        if (showSearch) searchInputRef.current?.focus();
    }, [showSearch]);

    const startRow = filteredJourneys.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
    const endRow = Math.min(currentPage * rowsPerPage, filteredJourneys.length);

    const handleDownloadCsv = () => {
        const headers = ['Antall', 'Andel', 'Sti'];
        const csvRows = [
            headers.join(','),
            ...filteredJourneys.map((journey) => [
                journey.count,
                `${totalSessions > 0 ? ((journey.count / totalSessions) * 100).toFixed(1) : '0.0'}%`,
                `"${journey.path.map((step) => parseJourneyStep(step).eventName).join(' -> ')}"`,
            ].join(',')),
        ];
        const csvContent = csvRows.join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `hendelsesforlop_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <div className="border border-[var(--ax-border-neutral-subtle)] rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
                <div className="p-4 pb-2">
                    <TableSectionHeader
                        title="Tabell"
                        actions={(
                            <>
                                <Tooltip content="Søk" placement="top">
                                    <Button
                                        type="button"
                                        variant={showSearch ? 'secondary' : 'tertiary'}
                                        size="xsmall"
                                        icon={<Search aria-hidden />}
                                        aria-label="Søk i tabell"
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
                                                aria-label="Flere valg for tabell"
                                            />
                                        </ActionMenu.Trigger>
                                    </Tooltip>
                                    <ActionMenu.Content align="end">
                                        <ActionMenu.Item onClick={handleDownloadCsv} disabled={filteredJourneys.length === 0}>
                                            Last ned
                                        </ActionMenu.Item>
                                        <ActionMenu.Divider />
                                        <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                                            {filteredJourneys.length} rader
                                        </div>
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
                </div>
                <div className="overflow-x-auto px-4">
                    <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
                        <thead className="bg-[var(--ax-bg-neutral-soft)]">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase">Antall</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase">Andel</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase">Sti</th>
                            </tr>
                        </thead>
                        <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
                            {paginatedJourneys.map((journey, idx) => (
                                <tr key={`${journey.path.join('|')}-${idx}`} className="hover:bg-[var(--ax-bg-neutral-soft)]">
                                    <td className="px-4 py-2 text-sm text-[var(--ax-text-default)]">{journey.count}</td>
                                    <td className="px-4 py-2 text-sm text-[var(--ax-text-default)]">
                                        {totalSessions > 0 ? ((journey.count / totalSessions) * 100).toFixed(1) : '0.0'}%
                                    </td>
                                    <td className="px-4 py-2 text-sm text-[var(--ax-text-default)] break-words">
                                        {journey.path.map((step) => parseJourneyStep(step).eventName).join(' → ')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 pb-4" aria-hidden="true" />
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="text-sm text-[var(--ax-text-subtle)]">
                    Viser {startRow}-{endRow} av {filteredJourneys.length} rader
                </div>
                <div className="w-full sm:w-auto sm:min-w-[120px]">
                    <Select
                        size="small"
                        label="Rader per side"
                        value={rowsPerPage}
                        onChange={(e) => setRowsPerPage(Number(e.target.value))}
                    >
                        {ROWS_PER_PAGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </Select>
                </div>
            </div>

            <div className="mt-4 flex justify-center">
                <Pagination
                    page={currentPage}
                    onPageChange={setPage}
                    count={totalPages}
                    size="small"
                />
            </div>
        </>
    );
};

export default JourneyTableView;
