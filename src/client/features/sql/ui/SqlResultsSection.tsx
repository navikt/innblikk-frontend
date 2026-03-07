import { ResultsPanel } from '../../chartbuilder';
import { Button, Heading, Link } from '@navikt/ds-react';
import { ReadMore } from '@navikt/ds-react';
import { Copy } from 'lucide-react';
import type { ILineChartProps, IVerticalBarChartProps } from '@fluentui/react-charting';
import { truncateJSON } from '../utils/formatters';
import type { QueryResult, QueryStats } from '../model/types';

interface SqlResultsSectionProps {
    result: QueryResult | null;
    loading: boolean;
    estimating: boolean;
    error: string | null;
    queryStats: QueryStats | undefined | null;
    query: string;
    lastProcessedSql: string;
    websiteId: string | undefined;
    copiedMetabase: boolean;
    onExecuteQuery: () => Promise<void>;
    onCopyMetabase: () => void;
    prepareLineChartData: (includeAverage?: boolean) => ILineChartProps | null;
    prepareBarChartData: () => IVerticalBarChartProps | null;
    preparePieChartData: () => { data: Array<{ y: number; x: string }>; total: number } | null;
}

export default function SqlResultsSection({
    result,
    loading,
    estimating,
    error,
    queryStats,
    query,
    lastProcessedSql,
    websiteId,
    copiedMetabase,
    onExecuteQuery,
    onCopyMetabase,
    prepareLineChartData,
    prepareBarChartData,
    preparePieChartData,
}: SqlResultsSectionProps) {
    return (
        <>
            <ResultsPanel
                result={result}
                loading={loading}
                error={error}
                queryStats={queryStats}
                lastAction={null}
                showLoadingMessage={estimating || loading}
                executeQuery={onExecuteQuery}
                handleRetry={onExecuteQuery}
                prepareLineChartData={prepareLineChartData}
                prepareBarChartData={prepareBarChartData}
                preparePieChartData={preparePieChartData}
                sql={lastProcessedSql || query}
                showSqlCode={true}
                showEditButton={true}
                showCost={true}
                websiteId={websiteId}
                compactTableActions={true}
                compactTableTitle="Resultater"
                hideTableFooter={true}
                showDownloadReadMore={false}
            />

            {/* JSON Output - below results */}
            {result && (
                <ReadMore header="JSON" size="small" className="mt-6">
                    <pre className="bg-[var(--ax-bg-neutral-soft)] border border-gray-300 rounded p-3 text-xs font-mono whitespace-pre-wrap" style={{ margin: 0 }}>{truncateJSON(result)}</pre>
                </ReadMore>
            )}

            {/* Metabase quick actions */}
            <div className="mt-6 pt-2 space-y-1.5">
                <Heading level="3" size="xsmall">Legg til i Metabase</Heading>
                <div className="h-1" aria-hidden="true" />
                <div className="flex flex-col items-start gap-2">
                    <Button
                        size="small"
                        variant="secondary"
                        type="button"
                        onClick={onCopyMetabase}
                        icon={<Copy size={16} />}
                    >
                        {copiedMetabase ? 'Kopiert!' : 'Kopier spørring'}
                    </Button>
                    <div className="pl-[2px]">
                        <Link
                            href="https://metabase.ansatt.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjo3MzEsInR5cGUiOiJuYXRpdmUiLCJuYXRpdmUiOnsicXVlcnkiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX19LCJkaXNwbGF5IjoidGFibGUiLCJ2aXN1YWxpemF0aW9uX3NldHRpbmdzIjp7fSwidHlwZSI6InF1ZXN0aW9uIn0="
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm"
                        >
                            Åpne Metabase
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
