import { useEffect, useMemo, useState } from 'react';
import { Pagination, Select } from '@navikt/ds-react';
import { parseJourneyStep } from '../../utils/parsers.ts';

interface JourneyTableViewProps {
    journeys: { path: string[]; count: number }[];
    totalSessions: number;
}

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100] as const;

const JourneyTableView = ({ journeys, totalSessions }: JourneyTableViewProps) => {
    const [page, setPage] = useState<number>(1);
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);

    const totalPages = Math.max(1, Math.ceil(journeys.length / rowsPerPage));

    useEffect(() => {
        setPage(1);
    }, [journeys.length, rowsPerPage]);

    const paginatedJourneys = useMemo(() => {
        const startIndex = (page - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        return journeys.slice(startIndex, endIndex);
    }, [journeys, page, rowsPerPage]);

    const startRow = journeys.length === 0 ? 0 : (page - 1) * rowsPerPage + 1;
    const endRow = Math.min(page * rowsPerPage, journeys.length);

    return (
        <>
            <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
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

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between p-3 bg-[var(--ax-bg-neutral-soft)] border-t">
                    <div className="text-sm text-[var(--ax-text-subtle)]">
                        Viser {startRow}-{endRow} av {journeys.length} rader
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
            </div>

            <div className="mt-4 flex justify-center">
                <Pagination
                    page={page}
                    onPageChange={setPage}
                    count={totalPages}
                    size="small"
                />
            </div>
        </>
    );
};

export default JourneyTableView;
