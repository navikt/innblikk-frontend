import { useState } from 'react';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import QueryPreview from './results/QueryPreview.tsx';
import EventFilter from './grafbygger/EventFilter.tsx';
import ChartLayout from '../../analysis/ui/ChartLayoutOriginal.tsx';
import MetricSelector from './grafbygger/MetricSelector.tsx';
import GroupingOptions from './grafbygger/GroupingOptions.tsx';
import AlertWithCloseButton from './grafbygger/AlertWithCloseButton.tsx';
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
          <section>
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
          </section>

          {config.website && dateRangeReady && (
            <>
              {/* Step 2: Event Filter Selection */}
              <section className="mt-4">
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
                  hideHeader={true}
                  isEventsLoading={isEventsLoading}
                />
              </section>

              {/* Step 3: Metrics */}
              <section className="mt-4">
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
                  hideHeader={true}
                  availableEvents={availableEvents}
                  isEventsLoading={isEventsLoading}
                />
              </section>

              {/* Step 4: Display Options */}
              <section className="mt-4">
                <GroupingOptions
                  ref={displayOptionsRef}
                  groupByFields={config.groupByFields}
                  parameters={parameters}
                  dateFormat={config.dateFormat}
                  orderBy={config.orderBy}
                  columnOrderMode={config.columnOrderMode || 'default'}
                  paramAggregation={config.paramAggregation}
                  limit={config.limit}
                  DATE_FORMATS={DATE_FORMATS}
                  COLUMN_GROUPS={FILTER_COLUMNS}
                  sanitizeColumnName={sanitizeColumnName}
                  addGroupByField={addGroupByField}
                  removeGroupByField={removeGroupByField}
                  moveGroupField={moveGroupField}
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
                  onEnableCustomEvents={() => {
                    if (chartFiltersRef.current) {
                      chartFiltersRef.current.enableCustomEvents();
                    }
                    setRequestLoadEvents(true);
                    setRequestIncludeParams(true);
                  }}
                  hideHeader={true}
                  isEventsLoading={isEventsLoading}
                  interactiveMode={interactiveDateFilterEnabled}
                  setInteractiveMode={setInteractiveDateFilterEnabled}
                />
              </section>
            </>
          )}


        </>
      }
    >
      {/* Alert Display */}
      {
        alertInfo.show && (
          <div className="mb-4">
            <AlertWithCloseButton variant="success">
              {alertInfo.message}
            </AlertWithCloseButton>
          </div>
        )
      }

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
    </ChartLayout >
  );
};

export default ChartsPage;
