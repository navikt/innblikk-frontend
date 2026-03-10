import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Loader, Alert, Button, Tooltip, ActionMenu } from '@navikt/ds-react';
import { MoreVertical } from 'lucide-react';
import type { SavedChart } from '../../../../data/dashboard';
import AnalysisActionModal from '../../analysis/ui/AnalysisActionModal.tsx';
import DashboardWidgetLineChart from './widget/DashboardWidgetLineChart.tsx';
import DashboardWidgetBarChart from './widget/DashboardWidgetBarChart.tsx';
import DashboardWidgetPieChart from './widget/DashboardWidgetPieChart.tsx';
import DashboardWidgetTable from './widget/DashboardWidgetTable.tsx';
import DashboardWidgetSiteimprove from './widget/DashboardWidgetSiteimprove.tsx';
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx';
import TransferToMetabaseDialog from '../../../shared/ui/TransferToMetabaseDialog.tsx';
import { processDashboardSql } from '../utils/queryUtils.ts';
import {
    parseDashboardResponse,
    getSpanClass,
    type DashboardRow
} from '../utils/widgetUtils.ts';
import {executeBigQuery} from '../api/bigquery.ts';
import { buildEditorUrl, downloadChartCsv, generateShareUrl } from '../../analysis/utils/chartActions.ts';

type SelectedWebsite = {
    domain: string;
    [key: string]: unknown;
};

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const sanitizeHref = (href: string): string => {
    const trimmedHref = href.trim();
    if (!trimmedHref) return '#';
    if (trimmedHref.startsWith('/')) return trimmedHref;
    const lowered = trimmedHref.toLowerCase();
    if (lowered.startsWith('http://') || lowered.startsWith('https://') || lowered.startsWith('mailto:')) {
        return trimmedHref;
    }
    return '#';
};

const decodeHtmlEntities = (value: string): string =>
    value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

const renderInlineMarkdown = (input: string, references: Map<string, string>): string => {
    let value = escapeHtml(input);
    const anchorStash = new Map<string, string>();
    const codeStash = new Map<string, string>();
    let anchorIndex = 0;
    let codeIndex = 0;

    const stashAnchor = (label: string, href: string): string => {
        const token = `@@ANCHOR_${anchorIndex}@@`;
        anchorIndex += 1;
        const safeHref = escapeHtml(sanitizeHref(href));
        anchorStash.set(
            token,
            `<a href="${safeHref}" class="underline decoration-1 underline-offset-2" target="_blank" rel="noopener noreferrer">${label}</a>`,
        );
        return token;
    };

    value = value.replace(/`([^`]+)`/g, (_match, code: string) => {
        const token = `@@CODE_${codeIndex}@@`;
        codeIndex += 1;
        codeStash.set(token, `<code>${code}</code>`);
        return token;
    });

    value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, hrefWithMaybeTitle: string) => {
        const hrefToken = decodeHtmlEntities(hrefWithMaybeTitle.trim().split(/\s+/)[0] ?? '');
        return stashAnchor(text, hrefToken);
    });

    value = value.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text: string, id: string) => {
        const key = decodeHtmlEntities((id || text).trim()).toLowerCase();
        const href = references.get(key);
        if (!href) return match;
        return stashAnchor(text, href);
    });

    value = value.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, (_match, href: string) => {
        const decodedHref = decodeHtmlEntities(href);
        return stashAnchor(decodedHref, decodedHref);
    });

    value = value.replace(/(^|[\s(>])(https?:\/\/[^\s<]+)/g, (match, prefix: string, href: string) => {
        let rawHref = href;
        let trailing = '';
        while (/[.,!?;:)]$/.test(rawHref)) {
            trailing = rawHref.slice(-1) + trailing;
            rawHref = rawHref.slice(0, -1);
        }
        if (!rawHref) return match;
        const linked = stashAnchor(rawHref, decodeHtmlEntities(rawHref));
        return `${prefix}${linked}${trailing}`;
    });

    value = value.replace(/(^|[^[])\[([^\]]+)\](?!\()/g, (match, prefix: string, id: string) => {
        const key = decodeHtmlEntities(id.trim()).toLowerCase();
        const href = references.get(key);
        if (!href) return match;
        return `${prefix}${stashAnchor(id, href)}`;
    });

    value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    value = value.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    codeStash.forEach((html, token) => {
        value = value.split(token).join(html);
    });
    anchorStash.forEach((html, token) => {
        value = value.split(token).join(html);
    });

    return value;
};

const markdownToHtml = (markdown: string): string => {
    const rawLines = markdown.split(/\r?\n/);
    const references = new Map<string, string>();
    const lines = rawLines.filter((line) => {
        const match = line.match(/^\s*\[([^\]]+)\]:\s*(\S+)\s*$/);
        if (!match) return true;
        const key = match[1].trim().toLowerCase();
        references.set(key, match[2].trim());
        return false;
    });
    const html: string[] = [];
    let listType: 'ul' | 'ol' | null = null;
    let inCodeBlock = false;
    const codeBuffer: string[] = [];
    const paragraphBuffer: string[] = [];

    const closeList = () => {
        if (!listType) return;
        html.push(`</${listType}>`);
        listType = null;
    };

    const flushCodeBlock = () => {
        if (!inCodeBlock) return;
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer.length = 0;
        inCodeBlock = false;
    };

    const flushParagraph = () => {
        if (paragraphBuffer.length === 0) return;
        const content = paragraphBuffer
            .map((line) => renderInlineMarkdown(line, references))
            .join('<br />');
        html.push(`<p>${content}</p>`);
        paragraphBuffer.length = 0;
    };

    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const line = rawLine.trim();

        if (line.startsWith('```')) {
            flushParagraph();
            closeList();
            if (inCodeBlock) {
                flushCodeBlock();
            } else {
                inCodeBlock = true;
                codeBuffer.length = 0;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBuffer.push(rawLine);
            continue;
        }

        if (!line) {
            flushParagraph();
            closeList();
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            closeList();
            const level = headingMatch[1].length;
            html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2], references)}</h${level}>`);
            continue;
        }

        const nextLine = lines[index + 1]?.trim() ?? '';
        if (/^=+$/.test(nextLine)) {
            flushParagraph();
            closeList();
            html.push(`<h1>${renderInlineMarkdown(line, references)}</h1>`);
            index += 1;
            continue;
        }
        if (/^-+$/.test(nextLine)) {
            flushParagraph();
            closeList();
            html.push(`<h2>${renderInlineMarkdown(line, references)}</h2>`);
            index += 1;
            continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            flushParagraph();
            closeList();
            html.push('<hr />');
            continue;
        }

        const blockquoteMatch = line.match(/^>\s?(.+)$/);
        if (blockquoteMatch) {
            flushParagraph();
            closeList();
            html.push(`<blockquote><p>${renderInlineMarkdown(blockquoteMatch[1], references)}</p></blockquote>`);
            continue;
        }

        const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
        if (unorderedMatch) {
            flushParagraph();
            if (listType !== 'ul') {
                closeList();
                html.push('<ul>');
                listType = 'ul';
            }
            html.push(`<li>${renderInlineMarkdown(unorderedMatch[1], references)}</li>`);
            continue;
        }

        const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
        if (orderedMatch) {
            flushParagraph();
            if (listType !== 'ol') {
                closeList();
                html.push('<ol>');
                listType = 'ol';
            }
            html.push(`<li>${renderInlineMarkdown(orderedMatch[1], references)}</li>`);
            continue;
        }

        closeList();
        paragraphBuffer.push(rawLine.trimEnd());
    }

    flushParagraph();
    closeList();
    flushCodeBlock();
    return html.join('');
};

interface DashboardWidgetProps {
    chart: SavedChart;
    websiteId: string;
    selectedWebsite?: SelectedWebsite;
    filters: {
        urlFilters: string[];
        dateRange: string;
        pathOperator: string;
        metricType: 'visitors' | 'pageviews' | 'proportion' | 'visits';
        customStartDate?: Date;
        customEndDate?: Date;
    };
    onDataLoaded?: (stats: { id: string; gb: number; title: string; totalCount?: number }) => void;
    // Pre-fetched data from batched query (optional - if provided, skip individual fetch)
    prefetchedData?: DashboardRow[];
    // If true, this chart is being batch-loaded and should wait instead of fetching individually
    shouldWaitForBatch?: boolean;
    // Siteimprove group ID for group-level scoring (from custom filter selection)
    siteimproveGroupId?: string;
    dashboardTitle?: string;
    onEditChart?: (chartId?: string) => void;
    onDeleteChart?: (chartId?: string) => void;
    onCopyChart?: (chartId?: string, sourceWebsiteId?: string) => void;
    onMoveChart?: (chartId?: string) => void;
    replaceExploreActionWithSqlEditor?: boolean;
    titlePrefix?: ReactNode;
    titleBelow?: ReactNode;
}

export const DashboardWidget = ({
    chart,
    websiteId,
    filters,
    onDataLoaded,
    selectedWebsite,
    prefetchedData,
    shouldWaitForBatch,
    siteimproveGroupId,
    dashboardTitle,
    onEditChart,
    onDeleteChart,
    onCopyChart,
    onMoveChart,
    replaceExploreActionWithSqlEditor = false,
    titlePrefix,
    titleBelow,
}: DashboardWidgetProps) => {
    const [loading, setLoading] = useState(shouldWaitForBatch ?? false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<DashboardRow[]>([]);
    const [page, setPage] = useState(1);
    // Track if individual fetch has been done to prevent repeat fetches
    const [hasFetchedIndividually, setHasFetchedIndividually] = useState(false);
    // State for AnalysisActionModal (for links in table)
    const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
    const [showTransferToMetabaseDialog, setShowTransferToMetabaseDialog] = useState(false);
    const [copyLinkFeedback, setCopyLinkFeedback] = useState(false);
    const showShareAction = false; // Temporary: hide "Del grafen" in inline action menu

    // If prefetchedData is available, use it directly instead of fetching
    useEffect(() => {
        if (prefetchedData !== undefined) {
            setData(prefetchedData);
            setLoading(false);
            setError(null);
            setPage(1);
            setHasFetchedIndividually(false); // Reset since we got batch data
            return;
        }
    }, [prefetchedData]);

    // Reset fetch flag when filters or SQL changes (to allow variant/refetch updates)
    useEffect(() => {
        setHasFetchedIndividually(false);
    }, [websiteId, filters, chart.sql]);

    useEffect(() => {
        if (chart.type === 'text') {
            setLoading(false);
            setError(null);
            setData([]);
            return;
        }

        // Skip if we already have batch data
        if (prefetchedData !== undefined) return;

        // If told to wait for batch, just ensure loading state is shown
        if (shouldWaitForBatch) {
            setLoading(true);
            return;
        }

        // If we've already fetched individually, don't fetch again
        if (hasFetchedIndividually) return;

        const fetchData = async () => {
            if (!chart.sql) return;

            setLoading(true);
            setError(null);

            try {
                const processedSql = processDashboardSql(chart.sql, websiteId, filters);

                const resultPayload = await executeBigQuery(processedSql, 'Dashboard');
                const parsed = parseDashboardResponse(resultPayload);
                const resultData = parsed.data;
                setData(resultData);

                let totalCount = 0;
                if (resultData.length > 0) {
                    const keys = Object.keys(resultData[0]);
                    if (keys.length >= 2) {
                        const metricKey = keys[1];
                        totalCount = resultData.reduce((acc: number, row) => {
                            const raw = row[metricKey];
                            const val = typeof raw === 'number' ? raw : parseFloat(String(raw));
                            return Number.isFinite(val) ? acc + val : acc;
                        }, 0);
                    }
                }

                if (onDataLoaded) {
                    const bytes = parsed.totalBytesProcessed ?? 0;
                    const gb = bytes ? bytes / (1024 ** 3) : 0;
                    onDataLoaded({
                        id: chart.id || '',
                        gb,
                        title: chart.title,
                        totalCount,
                    });
                }

                setPage(1);
                setHasFetchedIndividually(true);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Ukjent feil';
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, [
        chart.type,
        chart.sql,
        chart.id,
        chart.title,
        websiteId,
        filters,
        prefetchedData,
        shouldWaitForBatch,
        hasFetchedIndividually,
        onDataLoaded,
    ]);

    // Render logic based on chart.type
    const colClass = getSpanClass(chart.width);

    if (chart.type === 'siteimprove') {
        return (
            <DashboardWidgetSiteimprove
                chart={chart}
                colClass={colClass}
                selectedWebsite={selectedWebsite}
                urlPath={filters.urlFilters[0]}
                siteimproveGroupId={siteimproveGroupId}
            />
        );
    }

    if (chart.type === 'title') {
        return (
            <div className={`pt-2 ${colClass}`}>
                <h2 className="text-2xl font-bold text-[var(--ax-text-default)]">{chart.title}</h2>
                {chart.description && <p className="text-[var(--ax-text-subtle)] mt-1">{chart.description}</p>}
            </div>
        );
    }

    const canShowActions =
        Boolean(chart.sql)
        || Boolean(onDeleteChart)
        || Boolean(onMoveChart)
        || Boolean(onEditChart)
        || Boolean(onCopyChart);
    const entityLabel = chart.type === 'text' ? 'tekstboks' : 'graf';

    const renderContent = () => {
        if (loading) return <div className="flex justify-center p-8"><Loader /></div>;
        if (error) return <Alert variant="error">{error}</Alert>;
        if (!data || data.length === 0) return <div className="text-[var(--ax-text-subtle)] p-8 text-center">Ingen data funnet</div>;

        if (chart.type === 'line') {
            return (
                <DashboardWidgetLineChart
                    data={data}
                    title={chart.title}
                />
            );
        } else if (chart.type === 'bar') {
            return <DashboardWidgetBarChart data={data} />;
        } else if (chart.type === 'pie') {
            return <DashboardWidgetPieChart data={data} />;
        } else if (chart.type === 'table') {
            return (
                <DashboardWidgetTable
                    data={data}
                    page={page}
                    onPageChange={setPage}
                    showTotal={chart.showTotal}
                    onSelectUrl={setSelectedUrl}
                />
            );
        }

        return <div>Ukjent diagramtype: {chart.type}</div>;
    };

    // Extract total value for tables with showTotal
    const tableTotalValue = chart.showTotal && chart.type === 'table' && data.length > 0 ? (() => {
        const totalRow = data.find((row) => Object.values(row).includes('__TOTAL__'));
        if (!totalRow) return null;
        const keys = Object.keys(totalRow);
        for (const key of keys) {
            const val = (totalRow as Record<string, unknown>)[key];
            if (typeof val === 'number') return val;
        }
        return null;
    })() : null;

    const handleOpenSharedView = () => {
        if (!chart.sql) return;
        window.open(generateShareUrl(chart, websiteId, filters, selectedWebsite?.domain, dashboardTitle), '_blank');
    };

    const handleCopyShareLink = async () => {
        if (!chart.sql) return;
        try {
            await navigator.clipboard.writeText(generateShareUrl(chart, websiteId, filters, selectedWebsite?.domain, dashboardTitle));
            setCopyLinkFeedback(true);
            setTimeout(() => setCopyLinkFeedback(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const handleOpenInSqlEditor = () => {
        if (!chart.sql) return;
        window.location.href = buildEditorUrl(chart, websiteId, filters, selectedWebsite?.domain);
    };

    const handleDownloadCsv = () => {
        if (!data || data.length === 0) return;
        downloadChartCsv(data, chart.title);
    };

    const chartActions = canShowActions ? (
        <ActionMenu>
            <Tooltip content="Flere valg" placement="top">
                <ActionMenu.Trigger>
                    <Button
                        variant="tertiary"
                        size="small"
                        aria-label={`Flere valg for ${entityLabel} ${chart.title}`}
                        icon={<MoreVertical aria-hidden="true" />}
                    />
                </ActionMenu.Trigger>
            </Tooltip>
            <ActionMenu.Content align="end">
                {!replaceExploreActionWithSqlEditor && (
                    <ActionMenu.Item onClick={handleOpenSharedView}>
                        Utforsk grafen
                    </ActionMenu.Item>
                )}
                {showShareAction && (
                    <ActionMenu.Item onClick={() => void handleCopyShareLink()}>
                        {copyLinkFeedback ? 'Lenke kopiert!' : 'Del grafen'}
                    </ActionMenu.Item>
                )}
                {onCopyChart && chart.sql && (
                    <ActionMenu.Item onClick={() => onCopyChart(chart.id, websiteId)}>
                        {`Kopier ${entityLabel}`}
                    </ActionMenu.Item>
                )}
                {onEditChart && (
                    <ActionMenu.Item onClick={() => onEditChart(chart.id)}>
                        {`Rediger ${entityLabel}`}
                    </ActionMenu.Item>
                )}
                {onMoveChart && (
                    <ActionMenu.Item onClick={() => onMoveChart(chart.id)}>
                        {`Flytt ${entityLabel} til annen fane`}
                    </ActionMenu.Item>
                )}
                {onDeleteChart && (
                    <ActionMenu.Item onClick={() => onDeleteChart(chart.id)}>
                        {`Slett ${entityLabel}`}
                    </ActionMenu.Item>
                )}
                {(Boolean(data && data.length > 0) || (replaceExploreActionWithSqlEditor && Boolean(chart.sql))) && <ActionMenu.Divider />}
                {data && data.length > 0 && (
                    <ActionMenu.Item onClick={() => setShowTransferToMetabaseDialog(true)}>
                        Overfør til Metabase
                    </ActionMenu.Item>
                )}
                {replaceExploreActionWithSqlEditor && chart.sql && (
                    <ActionMenu.Item onClick={handleOpenInSqlEditor}>
                        Åpne i SQL-editor
                    </ActionMenu.Item>
                )}
                {data && data.length > 0 && (
                    <ActionMenu.Item onClick={handleDownloadCsv}>
                        Last ned CSV
                    </ActionMenu.Item>
                )}
            </ActionMenu.Content>
        </ActionMenu>
    ) : null;

    if (chart.type === 'text') {
        return (
            <div
                className={`h-full bg-[var(--ax-bg-default)] pt-6 px-6 rounded-lg border border-[var(--ax-border-neutral-subtle)] ${chart.description ? 'pb-6' : 'pb-4'} ${colClass}`}
            >
                <TableSectionHeader
                    title={(
                        <span className="inline-flex items-center gap-2 min-w-0">
                            {titlePrefix}
                            <span className="whitespace-normal break-words">{chart.title}</span>
                        </span>
                    )}
                    headingLevel="2"
                    headingSize="medium"
                    actions={chartActions}
                />
                {chart.description && (
                    <article
                        className="prose prose-sm max-w-none text-[var(--ax-text-default)] prose-headings:text-[var(--ax-text-default)] prose-p:text-[var(--ax-text-default)] prose-li:text-[var(--ax-text-default)] prose-strong:text-[var(--ax-text-default)] prose-a:text-[var(--ax-text-accent)] prose-a:no-underline hover:prose-a:underline [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_h5]:text-base [&_h5]:font-semibold [&_h5]:mt-3 [&_h5]:mb-1 [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:tracking-wide [&_h6]:mt-3 [&_h6]:mb-1 [&_p]:leading-7 [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--ax-border-neutral)] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[var(--ax-text-subtle)] [&_code]:bg-[var(--ax-bg-neutral-soft)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_pre]:bg-[var(--ax-bg-neutral-soft)] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:border-[var(--ax-border-neutral-subtle)] [&_hr]:my-6"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(chart.description) }}
                    />
                )}
            </div>
        );
    }

    const containerClass = chart.type === 'table'
        ? `h-full bg-[var(--ax-bg-default)] p-6 rounded-lg border border-[var(--ax-border-neutral-subtle)] min-h-[400px] ${colClass}`
        : `h-full bg-[var(--ax-bg-default)] p-6 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm min-h-[400px] ${colClass}`;

    return (
        <>
            <div className={containerClass}>
                <div className="flex flex-col mb-4">
                    {chart.type === 'table' ? (
                        <TableSectionHeader
                            title={(
                                <span className="inline-flex items-center gap-2 min-w-0">
                                    {titlePrefix}
                                    <span className="whitespace-normal break-words">{chart.title}</span>
                                </span>
                            )}
                            headingLevel="2"
                            headingSize="medium"
                            meta={tableTotalValue !== null ? (
                                <p className="text-lg text-[var(--ax-text-default)] mt-1">
                                    {tableTotalValue.toLocaleString('nb-NO')} {filters.metricType === 'pageviews' ? 'sidevisninger totalt' : filters.metricType === 'visits' ? 'økter totalt' : 'besøk totalt'}
                                </p>
                            ) : undefined}
                            description={chart.description}
                            actions={chartActions}
                            controls={titleBelow ? (
                                <div className="mt-2">
                                    {titleBelow}
                                </div>
                            ) : undefined}
                        />
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {titlePrefix}
                                    <h2 className="text-xl font-semibold text-[var(--ax-text-default)] whitespace-normal break-words">
                                        {chart.title}
                                    </h2>
                                </div>
                                {chartActions}
                            </div>
                            {titleBelow && (
                                <div className="mt-2">
                                    {titleBelow}
                                </div>
                            )}
                            {tableTotalValue !== null && (
                                <p className="text-lg text-[var(--ax-text-default)] mt-1">
                                    {tableTotalValue.toLocaleString('nb-NO')} {filters.metricType === 'pageviews' ? 'sidevisninger totalt' : filters.metricType === 'visits' ? 'økter totalt' : 'besøk totalt'}
                                </p>
                            )}
                            {chart.description && (
                                <p className="text-[var(--ax-text-subtle)] text-sm mt-1">{chart.description}</p>
                            )}
                        </>
                    )}
                </div>
                {renderContent()}
            </div>

            <AnalysisActionModal
                open={!!selectedUrl}
                onClose={() => setSelectedUrl(null)}
                urlPath={selectedUrl}
                websiteId={websiteId}
                period={filters.dateRange}
                domain={selectedWebsite?.domain}
            />

            {chart.sql && (
                <TransferToMetabaseDialog
                    open={showTransferToMetabaseDialog}
                    onClose={() => setShowTransferToMetabaseDialog(false)}
                    sqlText={chart.sql}
                    sourceWebsiteId={websiteId}
                />
            )}
        </>
    );
};
