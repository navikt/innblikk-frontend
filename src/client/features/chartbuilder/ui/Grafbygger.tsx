import { useCallback, useEffect, useRef, useState } from 'react';
import { ProgressBar } from '@navikt/ds-react';
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx';
import QueryPreview from './results/QueryPreview.tsx';
import EventFilter from './grafbygger/EventFilter.tsx';
import ChartLayout from '../../analysis/ui/ChartLayoutOriginal.tsx';
import MetricSelector from './grafbygger/MetricSelector.tsx';
import SegmentBy, { type SegmentByRef } from './grafbygger/SegmentBy.tsx';
import GroupingOptions from './grafbygger/GroupingOptions.tsx';
import DisplayOptions from './grafbygger/DisplayOptions.tsx';
import AlertWithCloseButton from './grafbygger/AlertWithCloseButton.tsx';
import SidebarSection from '../../../shared/ui/SidebarSection.tsx';
import ActionFeedbackButton from '../../../shared/ui/ActionFeedbackButton.tsx';
import type { SegmentDefinition } from '../../../shared/types/chart.ts';
import { FILTER_COLUMNS } from '../../../shared/lib/constants.ts';
import { DATE_FORMATS, METRICS } from '../model/constants.ts';
import { sanitizeColumnName } from '../utils/sanitize.ts';
import { getMetricColumns } from '../utils/metricColumns.ts';
import { useChartConfig } from '../hooks/useChartConfig.ts';

const ChartsPage = () => {
  const [interactiveDateFilterEnabled, setInteractiveDateFilterEnabled] = useState<boolean>(true);
  const [isWebsitePickerInitializing, setIsWebsitePickerInitializing] = useState<boolean>(true);
  const [fakeProgress, setFakeProgress] = useState<number>(1);
  const [groupingResetSignal, setGroupingResetSignal] = useState<number>(0);
  const [metricResetSignal, setMetricResetSignal] = useState<number>(0);
  const segmentByRef = useRef<SegmentByRef>(null);

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

  const handleSegmentsChange = useCallback((segments: SegmentDefinition[]) => {
    setConfig(prev => ({
      ...prev,
      segments
    }));
  }, [setConfig]);

  const handleResetGroupings = useCallback(() => {
    setConfig(prev => ({ ...prev, groupByFields: [] }));
    setGroupingResetSignal(prev => prev + 1);
  }, [setConfig]);

  const handleResetMetrics = useCallback(() => {
    summarizeRef.current?.resetConfig(false);
    setMetricResetSignal(prev => prev + 1);
  }, [summarizeRef]);

  const handleResetAllWithSignals = useCallback(() => {
    resetAll();
    setGroupingResetSignal(prev => prev + 1);
    setMetricResetSignal(prev => prev + 1);
  }, [resetAll]);

  // Keep sidebar sections visible during background event/detail fetches.
  // Only gate on initial website/date readiness.
  const isSidebarLoading = isWebsitePickerInitializing || (!!config.website && !dateRangeReady);

  useEffect(() => {
    if (!isSidebarLoading) {
      setFakeProgress(1);
      return;
    }

    const intervalId = window.setInterval(() => {
      setFakeProgress((prev) => (prev >= 11 ? 1 : prev + 1));
    }, 180);

    return () => window.clearInterval(intervalId);
  }, [isSidebarLoading]);

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
              onInitialLoadingChange={setIsWebsitePickerInitializing}
              dateRangeInDays={dateRangeInDays}
              shouldReload={forceReload}
              resetIncludeParams={resetIncludeParams}
              requestIncludeParams={requestIncludeParams}
              disableAutoEvents={true}
              requestLoadEvents={requestLoadEvents}
              onLoadingChange={setIsEventsLoading}
            />
          </div>

          {isSidebarLoading ? (
            <div className="px-1 py-2 max-w-[180px]">
              <span id="grafbygger-loading-progress" className="sr-only">Laster data</span>
              <ProgressBar
                value={fakeProgress}
                valueMax={12}
                size="small"
                aria-labelledby="grafbygger-loading-progress"
              />
            </div>
          ) : !config.website ? (
            <div className="px-1 py-2 text-sm text-(--ax-text-subtle)">Velg nettside og datoperiode først.</div>
          ) : (
            <>
              {/* ── Hendelse ───────────────────────────────────────── */}
              <SidebarSection
                title="Hendelse"
                action={
                  <ActionFeedbackButton
                    label="Tilbakestill"
                    activeLabel="Tilbakestilt!"
                    size="xsmall"
                    onClick={() => chartFiltersRef.current?.resetFilters(false)}
                    className="text-(--ax-text-danger)! !px-2 !py-1"
                  />
                }
              >
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
              </SidebarSection>

              {/* ── Målt som ───────────────────────────────────────── */}
              <SidebarSection
                title="Målt som..."
                action={
                  <ActionFeedbackButton
                    label="Tilbakestill"
                    activeLabel="Tilbakestilt!"
                    size="xsmall"
                    onClick={handleResetMetrics}
                    className="text-(--ax-text-danger)! !px-2 !py-1"
                  />
                }
              >
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
                  resetSignal={metricResetSignal}
                />
              </SidebarSection>

              {/* ── Segmenter etter ────────────────────────────────── */}
              <SidebarSection
                title="Segmenter etter..."
                action={
                  <ActionFeedbackButton
                    label="Tilbakestill"
                    activeLabel="Tilbakestilt!"
                    size="xsmall"
                    onClick={() => segmentByRef.current?.resetSegments(false)}
                    className="text-(--ax-text-danger)! !px-2 !py-1"
                  />
                }
              >
                <SegmentBy
                  ref={segmentByRef}
                  parameters={parameters}
                  availableEvents={availableEvents}
                  dateRangeInDays={dateRangeInDays}
                  onDateRangeInDaysChange={(days) => {
                    setDateRangeInDays(days);
                    setRequestLoadEvents(true);
                  }}
                  onEnableCustomEvents={(withParams = false) => {
                    setRequestLoadEvents(true);
                    if (withParams) {
                      setRequestIncludeParams(true);
                    }
                  }}
                  isEventsLoading={isEventsLoading}
                  onSegmentsChange={handleSegmentsChange}
                />
              </SidebarSection>

              {/* ── Gruppert etter ─────────────────────────────────── */}
              <SidebarSection
                title="Gruppert etter..."
                action={
                  <ActionFeedbackButton
                    label="Tilbakestill"
                    activeLabel="Tilbakestilt!"
                    size="xsmall"
                    onClick={handleResetGroupings}
                    className="text-(--ax-text-danger)! !px-2 !py-1"
                  />
                }
              >
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
                  resetSignal={groupingResetSignal}
                />
              </SidebarSection>

              {/* ── Visningsalternativer ───────────────────────────── */}
              <SidebarSection
                title="Visningsalternativer"
                action={
                  <ActionFeedbackButton
                    label="Tilbakestill"
                    activeLabel="Tilbakestilt!"
                    size="xsmall"
                    onClick={() => displayOptionsRef.current?.resetOptions(false)}
                    className="text-(--ax-text-danger)! !px-2 !py-1"
                  />
                }
              >
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
              </SidebarSection>
            </>
          )}
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
          onResetAll={handleResetAllWithSignals}
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
