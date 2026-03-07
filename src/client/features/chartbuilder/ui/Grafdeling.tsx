import { Alert, BodyLong, Loader, TextField, Button } from '@navikt/ds-react';
import { subDays } from 'date-fns';
import ChartLayout from '../../analysis/ui/ChartLayoutOriginal.tsx';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx';
import ResultsPanel from './results/ResultsPanel.tsx';
import { useGrafdeling } from '../hooks/useGrafdeling.ts';

export default function Grafdeling() {
  const {
    query,
    result,
    loading,
    error,
    description,
    dashboardTitle,
    queryStats,
    lastProcessedSql,
    selectedWebsite,
    websiteId,
    dateRange,
    period,
    urlPath,
    hasMetabaseDateFilter,
    hasUrlPathFilter,
    hasWebsiteIdPlaceholder,
    hasNettsidePlaceholder,
    customVariables,
    customVariableValues,
    hasFilters,

    setSelectedWebsite,
    setWebsiteIdState,
    setDateRange,
    setPeriod,
    setUrlPath,
    setCustomVariableValues,

    executeQuery,
    handleRetry,

    prepareLineChartData,
    prepareBarChartData,
    preparePieChartData,
  } = useGrafdeling();

  const renderContent = () => {
    if (loading && !result) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader size="3xlarge" title="Laster data..." />
          <BodyLong className="mt-4 text-[var(--ax-text-subtle)]">Henter data...</BodyLong>
        </div>
      );
    }
    if (error && !loading) {
      return (
        <div className="space-y-4">
          <Alert variant="error"><BodyLong>{error}</BodyLong></Alert>
          {lastProcessedSql && (
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap bg-[var(--ax-bg-neutral-soft)] border border-[var(--ax-border-neutral-subtle)] rounded p-3 text-[var(--ax-text-default)]">
              {lastProcessedSql}
            </pre>
          )}
        </div>
      );
    }
    if (!loading && !error && result) {
      return (
        <ResultsPanel
          result={result}
          loading={loading}
          error={error}
          queryStats={queryStats}
          lastAction={null}
          showLoadingMessage={loading}
          executeQuery={handleRetry}
          handleRetry={handleRetry}
          prepareLineChartData={prepareLineChartData}
          prepareBarChartData={prepareBarChartData}
          preparePieChartData={preparePieChartData}
          hideHeading={true}
          sql={lastProcessedSql || query}
          showSqlCode={true}
          showEditButton={true}
          hiddenTabs={result && result.data && result.data.length > 12 ? ['barchart', 'piechart'] : []}
          containerStyle="white"
          websiteId={websiteId}
        />
      );
    }
    return null;
  };

  const filtersContent = hasFilters ? (
    <div className="space-y-6">
      {(hasWebsiteIdPlaceholder || hasNettsidePlaceholder) && (
        <WebsitePicker
          selectedWebsite={selectedWebsite}
          onWebsiteChange={(website) => {
            setSelectedWebsite(website);
            if (website) setWebsiteIdState(website.id);
          }}
        />
      )}

      {hasMetabaseDateFilter && (
        <PeriodPicker
          period={period}
          startDate={dateRange.from}
          endDate={dateRange.to}
          onPeriodChange={(p) => {
            setPeriod(p);
            if (p !== 'custom') {
              const now = new Date();
              if (p === 'current_month') {
                setDateRange({ from: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)), to: now });
              } else if (p === 'last_month') {
                setDateRange({ from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) });
              } else {
                setDateRange({ from: subDays(now, 30), to: now });
              }
            }
          }}
          onStartDateChange={(date) => setDateRange(prev => ({ ...prev, from: date }))}
          onEndDateChange={(date) => setDateRange(prev => ({ ...prev, to: date }))}
        />
      )}

      {hasUrlPathFilter && (
        <div className="pt-4">
          <TextField
            label="URL"
            size="small"
            value={urlPath}
            onChange={(e) => setUrlPath(e.target.value)}
          />
        </div>
      )}

      {customVariables.map(varName => (
        <TextField
          key={varName}
          label={varName}
          size="small"
          value={customVariableValues[varName] || ''}
          onChange={(e) => setCustomVariableValues(prev => ({ ...prev, [varName]: e.target.value }))}
        />
      ))}

      <div className="pt-2">
        <Button onClick={() => executeQuery(query)} size="small" className="w-full">
          Oppdater graf
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <ChartLayout
      title={description || 'Umami grafdeling'}
      description={dashboardTitle ? `Fra dashboard: ${dashboardTitle}` : "Delt visualisering fra Umami"}
      currentPage="grafdeling"
      hideSidebar={false}
      hideAnalysisSelector={true}
      filters={filtersContent}
    >
      {renderContent()}
    </ChartLayout>
  );
}
