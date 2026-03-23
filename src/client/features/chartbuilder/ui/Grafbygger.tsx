import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressBar, Box, Bleed } from "@navikt/ds-react";
import { ArrowCirclepathReverseIcon } from "@navikt/aksel-icons";
import WebsitePicker from "../../analysis/ui/WebsitePicker.tsx";
import QueryPreview from "./results/QueryPreview.tsx";
import EventFilter from "./grafbygger/EventFilter.tsx";
import ChartLayout from "../../analysis/ui/ChartLayoutOriginal.tsx";
import MetricSelector from "./grafbygger/MetricSelector.tsx";
import SegmentBy, { type SegmentByRef } from "./grafbygger/SegmentBy.tsx";
import GroupingOptions from "./grafbygger/GroupingOptions.tsx";
import DisplayOptions from "./grafbygger/DisplayOptions.tsx";
import AlertWithCloseButton from "./grafbygger/AlertWithCloseButton.tsx";
import SidebarSection from "../../../shared/ui/SidebarSection.tsx";
import ActionFeedbackButton from "../../../shared/ui/ActionFeedbackButton.tsx";
import type { SegmentDefinition } from "../../../shared/types/chart.ts";
import { FILTER_COLUMNS } from "../../../shared/lib/constants.ts";
import { DATE_FORMATS, METRICS } from "../model/constants.ts";
import { sanitizeColumnName } from "../utils/sanitize.ts";
import { getMetricColumns } from "../utils/metricColumns.ts";
import { useChartConfig } from "../hooks/useChartConfig.ts";

const ChartsPage = () => {
  const [interactiveDateFilterEnabled, setInteractiveDateFilterEnabled] =
    useState<boolean>(true);
  const [isWebsitePickerInitializing, setIsWebsitePickerInitializing] =
    useState<boolean>(true);
  const [fakeProgress, setFakeProgress] = useState<number>(1);
  const [groupingResetSignal, setGroupingResetSignal] = useState<number>(0);
  const [metricResetSignal, setMetricResetSignal] = useState<number>(0);
  const [isEventFilterDirty, setIsEventFilterDirty] = useState<boolean>(false);
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

  const handleSegmentsChange = useCallback(
    (segments: SegmentDefinition[]) => {
      setConfig((prev) => ({
        ...prev,
        segments,
      }));
    },
    [setConfig],
  );

  const handleResetGroupings = useCallback(() => {
    setConfig((prev) => ({ ...prev, groupByFields: [] }));
    setGroupingResetSignal((prev) => prev + 1);
  }, [setConfig]);

  const handleResetMetrics = useCallback(() => {
    summarizeRef.current?.resetConfig(false);
    setMetricResetSignal((prev) => prev + 1);
  }, [summarizeRef]);

  const handleResetAllWithSignals = useCallback(() => {
    resetAll();
    setGroupingResetSignal((prev) => prev + 1);
    setMetricResetSignal((prev) => prev + 1);
  }, [resetAll]);

  const hasSegmentConfigToReset = useCallback(
    (segments: SegmentDefinition[] | undefined): boolean => {
      if (!segments || segments.length === 0) {
        return false;
      }

      if (segments.length !== 1) {
        return true;
      }

      const [segment] = segments;
      const hasFilters = (segment.filters?.length || 0) > 0;
      const hasPerformedSelection =
        (segment.performed?.events?.length || 0) > 0;
      const hasCustomName = (segment.name || "").trim() !== "Alle brukere";

      return hasFilters || hasPerformedSelection || hasCustomName;
    },
    [],
  );

  const showResetEventFilters = isEventFilterDirty;
  const showResetMetrics = config.metrics.length > 0;
  const showResetSegments = hasSegmentConfigToReset(config.segments);
  const showResetGroupings = config.groupByFields.length > 0;
  const showResetDisplayOptions =
    Boolean(config.orderBy) ||
    (config.columnOrderMode || "default") !== "default" ||
    config.paramAggregation !== "unique" ||
    (config.limit ?? 1000) !== 1000 ||
    config.dateFormat !== "day" ||
    !interactiveDateFilterEnabled;

  // Keep sidebar sections visible during background event/detail fetches.
  // Only gate on initial website/date readiness.
  const isSidebarLoading =
    isWebsitePickerInitializing || (!!config.website && !dateRangeReady);

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
      sidebarFilterGap="space-16"
      filters={
        <>
          {/* ── Nettside ───────────────────────────────────────── */}
          <Bleed
            asChild
            marginBlock="space-24"
            marginInline="space-24"
            reflectivePadding
          >
            <Box background="accent-strong" className="pb-2">
              <WebsitePicker
                id="grafbygger-website-picker"
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
                labelClassName="[&_label]:text-[var(--ax-text-accent-contrast)]"
              />
            </Box>
          </Bleed>

          {isSidebarLoading ? (
            <div className="px-1 py-2 max-w-[180px]">
              <span id="grafbygger-loading-progress" className="sr-only">
                Laster data
              </span>
              <ProgressBar
                value={fakeProgress}
                valueMax={12}
                size="small"
                aria-labelledby="grafbygger-loading-progress"
              />
            </div>
          ) : !config.website ? (
            <div className="px-1 py-2 text-sm text-(--ax-text-subtle)">
              Velg nettside og datoperiode først.
            </div>
          ) : (
            <>
              {/* ── Hendelse ───────────────────────────────────────── */}
              <SidebarSection
                title="Hendelse"
                action={
                  showResetEventFilters ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="small"
                      icon={<ArrowCirclepathReverseIcon aria-hidden />}
                      onClick={() =>
                        chartFiltersRef.current?.resetFilters(false)
                      }
                    />
                  ) : undefined
                }
              >
                <EventFilter
                  ref={chartFiltersRef}
                  filters={filters}
                  parameters={parameters}
                  setFilters={setFilters}
                  onDirtyStateChange={setIsEventFilterDirty}
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
                  showResetMetrics ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="small"
                      icon={<ArrowCirclepathReverseIcon aria-hidden />}
                      onClick={handleResetMetrics}
                    />
                  ) : undefined
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
                  updateMetric={(index, updates) =>
                    updateMetric(index, updates)
                  }
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
                  showResetSegments ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="small"
                      icon={<ArrowCirclepathReverseIcon aria-hidden />}
                      onClick={() => segmentByRef.current?.resetSegments(false)}
                    />
                  ) : undefined
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
                  showResetGroupings ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="small"
                      icon={<ArrowCirclepathReverseIcon aria-hidden />}
                      onClick={handleResetGroupings}
                    />
                  ) : undefined
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
                  setDateFormat={(format) =>
                    setConfig((prev) => ({
                      ...prev,
                      dateFormat: format,
                    }))
                  }
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
                  showResetDisplayOptions ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="small"
                      icon={<ArrowCirclepathReverseIcon aria-hidden />}
                      onClick={() =>
                        displayOptionsRef.current?.resetOptions(false)
                      }
                    />
                  ) : undefined
                }
              >
                <DisplayOptions
                  ref={displayOptionsRef}
                  groupByFields={config.groupByFields}
                  orderBy={config.orderBy}
                  columnOrderMode={config.columnOrderMode || "default"}
                  paramAggregation={config.paramAggregation}
                  limit={config.limit}
                  COLUMN_GROUPS={FILTER_COLUMNS}
                  setOrderBy={setOrderBy}
                  clearOrderBy={clearOrderBy}
                  setDateFormat={(format) =>
                    setConfig((prev) => ({
                      ...prev,
                      dateFormat: format,
                    }))
                  }
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
            Forhåndsvisning fra dashboard: <strong>{titleFromUrl}</strong>. Du
            kan nå redigere og tilpasse grafen.
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
