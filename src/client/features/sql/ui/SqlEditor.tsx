import { Button } from '@navikt/ds-react';
import { PlayIcon } from 'lucide-react';
import ChartLayout from '../../analysis/ui/ChartLayoutOriginal.tsx';
import { getGcpProjectId } from '../utils/formatters';
import { useSqlEditor } from '../hooks/useSqlEditor';
import SqlFilterPanel from './SqlFilterPanel';
import AvailableTablesInfo from './AvailableTablesInfo';
import QueryInputPanel from './QueryInputPanel';
import CostEstimateDisplay from './CostEstimateDisplay';
import QueryErrorDisplay from './QueryErrorDisplay';
import SqlResultsSection from './SqlResultsSection';

export default function SqlEditor() {
    const projectId = getGcpProjectId();
    const {
        query,
        result,
        estimate,
        loading,
        estimating,
        error,
        validateError,
        showValidation,
        showEstimate,
        shareSuccess,
        formatSuccess,
        lastProcessedSql,
        copiedMetabase,
        editorHeight,
        hasAttemptedFetch,
        oldTableWarning,
        showUpgradeSuccess,
        websiteId,
        period,
        dateRange,
        urlPath,
        selectedWebsite,
        customVariables,
        customVariableValues,
        hasMetabaseDateFilter,
        hasUrlPathFilter,
        hasWebsiteIdPlaceholder,
        hasNettsidePlaceholder,
        hasHardcodedWebsiteId,

        setEditorHeight,
        setShowValidation,
        setShowEstimate,
        setShowUpgradeSuccess,
        setUrlPath,
        setCustomVariableValues,

        handleQueryChange,
        handleWebsiteChange,
        handleUpgradeTables,
        handleAddDateFilter,
        handleCopyMetabase,
        handlePeriodChange,
        handleStartDateChange,
        handleEndDateChange,
        estimateCost,
        executeQuery,
        validateSQL,
        formatSQL,
        shareQuery,

        prepareLineChartData,
        prepareBarChartData,
        preparePieChartData,
    } = useSqlEditor();

    return (
        <ChartLayout
            title="SQL-editor"
            description="Kjør SQL-spørringer mot Umami datasettet i BigQuery."
            currentPage="sql"
            wideSidebar={true}
            filters={
                <>
                    <SqlFilterPanel
                        hasMetabaseDateFilter={hasMetabaseDateFilter}
                        hasUrlPathFilter={hasUrlPathFilter}
                        hasWebsiteIdPlaceholder={hasWebsiteIdPlaceholder}
                        hasNettsidePlaceholder={hasNettsidePlaceholder}
                        hasHardcodedWebsiteId={hasHardcodedWebsiteId}
                        customVariables={customVariables}
                        customVariableValues={customVariableValues}
                        selectedWebsite={selectedWebsite}
                        period={period}
                        dateRange={dateRange}
                        urlPath={urlPath}
                        onWebsiteChange={handleWebsiteChange}
                        onPeriodChange={handlePeriodChange}
                        onStartDateChange={handleStartDateChange}
                        onEndDateChange={handleEndDateChange}
                        onUrlPathChange={setUrlPath}
                        onCustomVariableChange={setCustomVariableValues}
                    />

                    <AvailableTablesInfo projectId={projectId} />

                    <QueryInputPanel
                        query={query}
                        editorHeight={editorHeight}
                        oldTableWarning={oldTableWarning}
                        showUpgradeSuccess={showUpgradeSuccess}
                        validateError={validateError}
                        showValidation={showValidation}
                        formatSuccess={formatSuccess}
                        shareSuccess={shareSuccess}
                        estimating={estimating}
                        onQueryChange={handleQueryChange}
                        onEditorHeightChange={setEditorHeight}
                        onUpgradeTables={handleUpgradeTables}
                        onDismissUpgradeSuccess={() => setShowUpgradeSuccess(false)}
                        onFormat={formatSQL}
                        onValidate={validateSQL}
                        onEstimateCost={estimateCost}
                        onShare={shareQuery}
                        onDismissValidation={() => setShowValidation(false)}
                    />

                    {estimate && showEstimate && (
                        <CostEstimateDisplay
                            estimate={estimate}
                            onDismiss={() => setShowEstimate(false)}
                        />
                    )}

                    {/* Submit Button */}
                    <div className="flex flex-wrap gap-2 mt-6">
                        <Button
                            onClick={executeQuery}
                            loading={loading}
                            icon={<PlayIcon size={18} />}
                            variant="primary"
                        >
                            Vis resultater
                        </Button>
                    </div>
                </>
            }
        >
            {error && (
                <QueryErrorDisplay
                    error={error}
                    lastProcessedSql={lastProcessedSql}
                    onAddDateFilter={handleAddDateFilter}
                />
            )}

            {hasAttemptedFetch && (
                <SqlResultsSection
                    result={result}
                    loading={loading}
                    estimating={estimating}
                    error={error}
                    queryStats={result?.queryStats ?? estimate}
                    query={query}
                    lastProcessedSql={lastProcessedSql}
                    websiteId={websiteId}
                    copiedMetabase={copiedMetabase}
                    onExecuteQuery={executeQuery}
                    onCopyMetabase={handleCopyMetabase}
                    prepareLineChartData={prepareLineChartData}
                    prepareBarChartData={prepareBarChartData}
                    preparePieChartData={preparePieChartData}
                />
            )}
        </ChartLayout>
    );
}
