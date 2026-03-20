import { useState } from 'react';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import QueryPreview from './results/QueryPreview.tsx';
import EventFilter from './grafbygger/EventFilter.tsx';
import ChartLayout from '../../analysis/ui/ChartLayoutOriginal.tsx';
import MetricSelector from './grafbygger/MetricSelector.tsx';
import GroupingOptions from './grafbygger/GroupingOptions.tsx';
import DisplayOptions from './grafbygger/DisplayOptions.tsx';
import AlertWithCloseButton from './grafbygger/AlertWithCloseButton.tsx';
import SidebarSection from '../../../shared/ui/SidebarSection.tsx';
import ActionFeedbackButton from '../../../shared/ui/ActionFeedbackButton.tsx';
import { FILTER_COLUMNS } from '../../../shared/lib/constants.ts';
import { DATE_FORMATS, METRICS } from '../model/constants.ts';
import { sanitizeColumnName } from '../utils/sanitize.ts';
import { getMetricColumns } from '../utils/metricColumns.ts';
import { useChartConfig } from '../hooks/useChartConfig.ts';

const ChartsPage = () => {
  const [interactiveDateFilterEnabled, setInteractiveDateFilterEnabled] = useState<boolean>(true);

  const {
    config,
    filters,
    parameters,
    availableEvents,
    dateRangeReady,
    maxDaysAvailable,
    dateRangeInDays,
    forceReload,
    resetIncludeParams,
    requestIncludeParams,
    requestLoadEvents,
    isEventsLoading,
    currentStep,
    alertInfo,
    generatedSQL,
    hasAppliedUrlParams,
    titleFromUrl,

    chartFiltersRef,
    summarizeRef,
    displayOptionsRef,

    setFilters,
    setDateRangeInDays,
    setRequestIncludeParams,
    setRequestLoadEvents,
    setIsEventsLoading,

    resetAll,
    addMetric,
    removeMetric,
    updateMetric,
    moveMetric,
    addGroupByField,
    removeGroupByField,
    moveGroupField,
    setOrderBy,
    clearOrderBy,
    setConfig,
    setParamAggregation,
    setLimit,
    setColumnOrderMode,
    handleWebsiteChange,
    handleEventsLoad,
  } = useChartConfig();

  return (
    <ChartLayout
      title="Grafbyggeren"
      description="Lag tilpassede grafer og tabeller."
      currentPage="grafbygger"
      wideSidebar={true}
      filters={
        <>
          {/* ── Nettside ───────────────────────────────────────── */}
          <div className="pb-2">
            <WebsitePicker
              selectedWebsite={config.website}
              onWebsiteChange={handleWebsiteChange}
              onEventsLoad={handleEventsLoad}
              dateRangeInDays={dateRangeInDays}
              shouldReload={forceReload}
              resetIncludeParams={resetIncludeParams}
              requestIncludeParams={requestIncludeParams}
              disableAutoEvents={true}
              requestLoadEvents={requestLoadEvents}
              onLoadingChange={setIsEventsLoading}
            />
          </div>

          {/* ── Hendelse ───────────────────────────────────────── */}
          <SidebarSection
            title="Hendelse"
            action={
              <ActionFeedbackButton
                label="Tilbakestill"
                activeLabel="Tilbakestilt!"
                onClick={() => chartFiltersRef.current?.resetFilters(false)}
                className="text-(--ax-text-danger)!"
              />
            }
          >
            {config.website && dateRangeReady ? (
              <EventFilter
                ref={chartFiltersRef}
                filters={filters}
                parameters={parameters}
                setFilters={setFilters}
                availableEvents={availableEvents}
                onEnableCustomEvents={(withParams = false) => {
                  setRequestLoadEvents(true);
                  if (withParams) {
                    setRequestIncludeParams(true);
                  }
                }}
                dateRangeInDays={dateRangeInDays}
                onDateRangeInDaysChange={(days) => {
                  setDateRangeInDays(days);
                  setRequestLoadEvents(true);
                }}
                isEventsLoading={isEventsLoading}
              />
            ) : (
              <p className="text-sm text-(--ax-text-subtle)">Velg nettside og datoperiode først.</p>
            )}
          </SidebarSection>

          {/* ── Målt som ───────────────────────────────────────── */}
          <SidebarSection
            title="Målt som..."
            action={
              <ActionFeedbackButton
                label="Tilbakestill"
                activeLabel="Tilbakestilt!"
                onClick={() => summarizeRef.current?.resetConfig(false)}
                className="text-(--ax-text-danger)!"
              />
            }
          >
            {config.website && dateRangeReady ? (
              <MetricSelector
                ref={summarizeRef}
                metrics={config.metrics}
                parameters={parameters}
                METRICS={METRICS}
                COLUMN_GROUPS={FILTER_COLUMNS}
                getMetricColumns={getMetricColumns}
                sanitizeColumnName={sanitizeColumnName}
                updateMetric={(index, updates) => updateMetric(index, updates)}
                removeMetric={removeMetric}
                addMetric={addMetric}
                moveMetric={moveMetric}
                filters={filters}
                availableEvents={availableEvents}
                isEventsLoading={isEventsLoading}
              />
            ) : (
              <p className="text-sm text-(--ax-text-subtle)">Velg nettside og datoperiode først.</p>
            )}
          </SidebarSection>

          {/* ── Gruppert etter ─────────────────────────────────── */}
          <SidebarSection
            title="Gruppert etter..."
            action={
              <ActionFeedbackButton
                label="Tilbakestill"
                activeLabel="Tilbakestilt!"
                onClick={() => setConfig(prev => ({ ...prev, groupByFields: [] }))}
                className="text-(--ax-text-danger)!"
              />
            }
          >
            {config.website && dateRangeReady ? (
              <GroupingOptions
                groupByFields={config.groupByFields}
                parameters={parameters}
                dateFormat={config.dateFormat}
                DATE_FORMATS={DATE_FORMATS}
                COLUMN_GROUPS={FILTER_COLUMNS}
                sanitizeColumnName={sanitizeColumnName}
                addGroupByField={addGroupByField}
                removeGroupByField={removeGroupByField}
                moveGroupField={moveGroupField}
                setDateFormat={(format) => setConfig(prev => ({
                  ...prev,
                  dateFormat: format
                }))}
                filters={filters}
                onEnableCustomEvents={() => {
                  if (chartFiltersRef.current) {
                    chartFiltersRef.current.enableCustomEvents();
                  }
                  setRequestLoadEvents(true);
                  setRequestIncludeParams(true);
                }}
                isEventsLoading={isEventsLoading}
              />
            ) : (
              <p className="text-sm text-(--ax-text-subtle)">Velg nettside og datoperiode først.</p>
            )}
          </SidebarSection>

          {/* ── Visningsalternativer ───────────────────────────── */}
          <SidebarSection
            title="Visningsalternativer"
            action={
              <ActionFeedbackButton
                label="Tilbakestill"
                activeLabel="Tilbakestilt!"
                onClick={() => displayOptionsRef.current?.resetOptions(false)}
                className="text-(--ax-text-danger)!"
              />
            }
          >
            {config.website && dateRangeReady ? (
              <DisplayOptions
                ref={displayOptionsRef}
                groupByFields={config.groupByFields}
                orderBy={config.orderBy}
                columnOrderMode={config.columnOrderMode || 'default'}
                paramAggregation={config.paramAggregation}
                limit={config.limit}
                COLUMN_GROUPS={FILTER_COLUMNS}
                setOrderBy={setOrderBy}
                clearOrderBy={clearOrderBy}
                setDateFormat={(format) => setConfig(prev => ({
                  ...prev,
                  dateFormat: format
                }))}
                setParamAggregation={setParamAggregation}
                setLimit={setLimit}
                setColumnOrderMode={setColumnOrderMode}
                metrics={config.metrics}
                filters={filters}
                setFilters={setFilters}
                maxDaysAvailable={maxDaysAvailable}
                interactiveMode={interactiveDateFilterEnabled}
                setInteractiveMode={setInteractiveDateFilterEnabled}
              />
            ) : (
              <p className="text-sm text-(--ax-text-subtle)">Velg nettside og datoperiode først.</p>
            )}
          </SidebarSection>
        </>
      }
    >
      {/* Alert Display */}
      {alertInfo.show && (
        <div className="mb-4">
          <AlertWithCloseButton variant="success">
            {alertInfo.message}
          </AlertWithCloseButton>
        </div>
      )}

      {/* Alert when pre-loaded from Dashboard */}
      {titleFromUrl && hasAppliedUrlParams && config.website && (
        <div className="mb-4">
          <AlertWithCloseButton variant="info">
            Forhåndsvisning fra dashboard: <strong>{titleFromUrl}</strong>. Du kan nå redigere og tilpasse grafen.
          </AlertWithCloseButton>
        </div>
      )}

      <div className="sticky top-6 max-h-[calc(100vh-4rem)] overflow-y-auto">
        <QueryPreview
          sql={generatedSQL}
          activeStep={currentStep}
          openFormprogress={false}
          filters={filters}
          metrics={config.metrics}
          groupByFields={config.groupByFields}
          onResetAll={resetAll}
          availableEvents={availableEvents}
          isEventsLoading={isEventsLoading}
          websiteId={config.website?.id}
          showDownloadReadMore={false}
        />
      </div>
    </ChartLayout>
  );
};

export default ChartsPage;
