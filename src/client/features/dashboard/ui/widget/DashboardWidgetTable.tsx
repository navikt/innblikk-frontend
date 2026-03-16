import { ActionMenu, Pagination, Table } from '@navikt/ds-react';
import { ExternalLink } from 'lucide-react';
import type { DashboardRow } from '../../utils/widgetUtils.ts';
import { formatTableValue, isClickablePath } from '../../utils/widgetUtils.ts';
import { translateValue } from '../../../../shared/lib/translations.ts';

interface DashboardWidgetTableProps {
    data: DashboardRow[];
    page: number;
    onPageChange: (page: number) => void;
    showTotal?: boolean;
    domain?: string;
    enableLinks?: boolean;
    onOpenAnalysisMenu?: (urlPath: string) => void;
}

const DashboardWidgetTable = ({
    data,
    page,
    onPageChange,
    showTotal,
    domain,
    enableLinks = true,
    onOpenAnalysisMenu,
}: DashboardWidgetTableProps) => {
    let tableData = data;

    if (showTotal) {
        tableData = data.filter((row) => !Object.values(row).includes('__TOTAL__'));
    }

    const rowsPerPage = 10;
    const totalRows = tableData.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage);

    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const currentData = tableData.slice(start, end);

    const openOnWebsite = (urlPath: string) => {
        const safeDomain = domain || 'nav.no';
        const protocol = safeDomain.includes('http') ? '' : 'https://';
        window.open(`${protocol}${safeDomain}${urlPath}`, '_blank');
    };

    const copyPath = async (urlPath: string) => {
        try {
            await navigator.clipboard.writeText(urlPath);
        } catch (error) {
            console.error('Failed to copy URL path:', error);
        }
    };

    return (
        <div className="flex flex-col">
            <div className="overflow-x-auto">
                <Table
                    size="small"
                    className="[&_th:first-child]:pl-0 [&_td:first-child]:pl-0"
                >
                    <Table.Header>
                        <Table.Row>
                            {Object.keys(tableData[0] || data[0]).map(key => (
                                <Table.HeaderCell key={key}>{key}</Table.HeaderCell>
                            ))}
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {currentData.map((row, i) => {
                            const keys = Object.keys(row);
                            return (
                                <Table.Row key={i}>
                                    {keys.map((key, j) => {
                                        const val = (row as Record<string, unknown>)[key];
                                        const rawString = formatTableValue(val);
                                        const translatedVal = String(translateValue(key, rawString));
                                        const displayVal = typeof val === 'number'
                                            ? val.toLocaleString('nb-NO')
                                            : translatedVal;
                                        const clickable = enableLinks && isClickablePath(val);
                                        return (
                                            <Table.DataCell
                                                key={j}
                                                className={`whitespace-nowrap ${clickable ? 'cursor-pointer' : ''}`}
                                                title={rawString}
                                            >
                                                {clickable ? (
                                                    <ActionMenu>
                                                        <ActionMenu.Trigger>
                                                            <button
                                                                type="button"
                                                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                                                            >
                                                                {displayVal} <ExternalLink className="h-3 w-3" />
                                                            </button>
                                                        </ActionMenu.Trigger>
                                                        <ActionMenu.Content align="start">
                                                            <ActionMenu.Item onClick={() => openOnWebsite(val)}>
                                                                <span className="inline-flex items-center gap-1">
                                                                    <span>Gå til siden</span>
                                                                    <ExternalLink aria-hidden size={16} />
                                                                </span>
                                                            </ActionMenu.Item>
                                                            <ActionMenu.Item onClick={() => void copyPath(val)}>
                                                                Kopier URL
                                                            </ActionMenu.Item>
                                                            {onOpenAnalysisMenu && (
                                                                <>
                                                                    <ActionMenu.Item onClick={() => onOpenAnalysisMenu(val)}>
                                                                        Analysevalg
                                                                    </ActionMenu.Item>
                                                                </>
                                                            )}
                                                        </ActionMenu.Content>
                                                    </ActionMenu>
                                                ) : (
                                                    displayVal
                                                )}
                                            </Table.DataCell>
                                        );
                                    })}
                                </Table.Row>
                            );
                        })}
                    </Table.Body>
                </Table>
            </div>
            {totalRows > rowsPerPage ? (
                <div className="flex justify-center pb-4 pt-2">
                    <Pagination
                        page={page}
                        onPageChange={onPageChange}
                        count={totalPages}
                        size="small"
                    />
                </div>
            ) : (
                <div className="pb-4" aria-hidden="true" />
            )}
        </div>
    );
};

export default DashboardWidgetTable;
