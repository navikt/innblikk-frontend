import { useCallback, useRef, useState } from 'react'
import { Bleed, Box, Checkbox, ExpansionCard, Loader } from '@navikt/ds-react'
import { ArrowCirclepathReverseIcon } from '@navikt/aksel-icons'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import QueryPreview from './results/QueryPreview.tsx'
import ResultsDisplayOptions from './results/ResultsDisplayOptions.tsx'
import EventFilter from './grafbygger/EventFilter.tsx'
import ChartLayout from '../../analysis/ui/ChartLayoutOriginal.tsx'
import MetricSelector from './grafbygger/MetricSelector.tsx'
import CohortPicker, { type CohortPickerRef } from './grafbygger/CohortPicker.tsx'
import GroupingOptions from './grafbygger/GroupingOptions.tsx'
import AlertWithCloseButton from './grafbygger/AlertWithCloseButton.tsx'
import SidebarSection from '../../../shared/ui/SidebarSection.tsx'
import ActionFeedbackButton from '../../../shared/ui/ActionFeedbackButton.tsx'
import { FILTER_COLUMNS } from '../../../shared/lib/constants.ts'
import { DATE_FORMATS, METRICS } from '../model/constants.ts'
import { sanitizeColumnName } from '../utils/sanitize.ts'
import { useChartConfig } from '../hooks/useChartConfig.ts'
import { fetchCohortDetail } from '../api/cohortApi.ts'

const ChartsPage = () => {
  const isFocusedMode = (() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    const value = params.get('focused')
    return value === '1' || value === 'true'
  })()
  const [isWebsitePickerInitializing, setIsWebsitePickerInitializing] = useState<boolean>(true)
  const [groupingResetSignal, setGroupingResetSignal] = useState<number>(0)
  const [metricResetSignal, setMetricResetSignal] = useState<number>(0)
  const [isEventFilterDirty, setIsEventFilterDirty] = useState<boolean>(false)
  const [interactiveDateFilterEnabled, setInteractiveDateFilterEnabled] = useState<boolean>(true)
  const cohortPickerRef = useRef<CohortPickerRef>(null)
  const cohortRequestIdRef = useRef(0)

  const {
    config,
    filters,
    parameters,
    availableEvents,
    dateRangeReady,
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

    setFilters,
    setDateRangeInDays,
    setRequestIncludeParams,
    setRequestLoadEvents,
    setIsEventsLoading,
    setResolvedCohorts,

    resetAll,
    addMetric,
    removeMetric,
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
  } = useChartConfig()

  const handleRatioModeChange = useCallback(
    (enabled: boolean) => {
      setConfig((prev) => ({
        ...prev,
        segmentRatioMode: enabled,
      }))
    },
    [setConfig],
  )

  const handleCohortIdsChange = useCallback(
    async (ids: string[]) => {
      const requestId = ++cohortRequestIdRef.current
      setConfig((prev) => ({ ...prev, cohortIds: ids }))
      if (ids.length === 0) {
        setResolvedCohorts([])
        return
      }
      try {
        const details = await Promise.all(ids.map((id) => fetchCohortDetail(id)))
        if (requestId === cohortRequestIdRef.current) {
          setResolvedCohorts(details)
        }
      } catch {
        if (requestId === cohortRequestIdRef.current) {
          setResolvedCohorts([])
        }
      }
    },
    [setConfig, setResolvedCohorts],
  )

  const handleResetGroupings = useCallback(() => {
    setConfig((prev) => ({ ...prev, groupByFields: [] }))
    setGroupingResetSignal((prev) => prev + 1)
  }, [setConfig])

  const handleResetMetrics = useCallback(() => {
    summarizeRef.current?.resetConfig(false)
    setMetricResetSignal((prev) => prev + 1)
  }, [summarizeRef])

  const handleResetAllWithSignals = useCallback(() => {
    resetAll()
    setGroupingResetSignal((prev) => prev + 1)
    setMetricResetSignal((prev) => prev + 1)
    cohortPickerRef.current?.resetCohorts()
    setResolvedCohorts([])
  }, [resetAll, setResolvedCohorts])

  const showResetEventFilters = isEventFilterDirty
  const showResetMetrics = !(
    config.metrics.length === 1 &&
    config.metrics[0].function === 'count' &&
    config.metrics[0].alias === 'antall'
  )
  const showResetSegments = (config.cohortIds?.length ?? 0) > 0
  const showResetGroupings = config.groupByFields.length > 0

  // Keep sidebar sections visible during background event/detail fetches.
  // Only gate on initial website/date readiness.
  const isSidebarLoading = isWebsitePickerInitializing || (!!config.website && !dateRangeReady)

  return (
    <ChartLayout
      title="Grafbyggeren"
      description="Lag tilpassede grafer og tabeller."
      currentPage="grafbygger"
      wideSidebar={true}
      sidebarFilterGap="space-16"
      showPageHeader={!isFocusedMode}
      showKontaktSection={!isFocusedMode}
      filters={
        <>
          {/* ── Nettside ───────────────────────────────────────── */}
          <Bleed asChild marginBlock="space-24" marginInline="space-24" reflectivePadding>
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
            <div className="px-1 py-2 mt-2 max-w-[180px]">
              <Loader size="small" title="Laster data" />
            </div>
          ) : !config.website ? null : (
            <>
              <SidebarSection
                title="Datakilder"
                action={
                  showResetEventFilters ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="xsmall"
                      icon={<ArrowCirclepathReverseIcon aria-hidden />}
                      onClick={() => chartFiltersRef.current?.resetFilters(false)}
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
                    setRequestLoadEvents(true)
                    if (withParams) {
                      setRequestIncludeParams(true)
                    }
                  }}
                  dateRangeInDays={dateRangeInDays}
                  onDateRangeInDaysChange={(days) => {
                    setDateRangeInDays(days)
                    setRequestLoadEvents(true)
                  }}
                  isEventsLoading={isEventsLoading}
                />
                <div className="mt-2">
                  <Checkbox
                    size="small"
                    checked={!interactiveDateFilterEnabled}
                    onChange={(e) => setInteractiveDateFilterEnabled(!e.target.checked)}
                  >
                    Overstyr tidsperiode
                  </Checkbox>
                </div>
              </SidebarSection>

              <SidebarSection
                title="Målt som..."
                action={
                  showResetMetrics ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="xsmall"
                      icon={<ArrowCirclepathReverseIcon aria-hidden />}
                      onClick={handleResetMetrics}
                    />
                  ) : undefined
                }
              >
                <MetricSelector
                  ref={summarizeRef}
                  metrics={config.metrics}
                  METRICS={METRICS}
                  removeMetric={removeMetric}
                  addMetric={addMetric}
                  filters={filters}
                  resetSignal={metricResetSignal}
                />
                <div className="mt-2">
                  <Checkbox
                    size="small"
                    checked={config.paramAggregation === 'representative'}
                    onChange={(e) => setParamAggregation(e.target.checked ? 'representative' : 'unique')}
                  >
                    Vis representativ parameterverdi
                  </Checkbox>
                </div>
              </SidebarSection>

              <SidebarSection
                title="Kohorter"
                action={
                  showResetSegments ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="xsmall"
                      icon={<ArrowCirclepathReverseIcon aria-hidden />}
                      onClick={() => cohortPickerRef.current?.resetCohorts()}
                    />
                  ) : undefined
                }
              >
                <CohortPicker
                  ref={cohortPickerRef}
                  websiteId={config.website?.id}
                  onCohortIdsChange={handleCohortIdsChange}
                  onRatioModeChange={handleRatioModeChange}
                />
              </SidebarSection>

              <SidebarSection
                title="Gruppert etter..."
                action={
                  showResetGroupings ? (
                    <ActionFeedbackButton
                      label="Tilbakestill"
                      activeLabel="Tilbakestilt!"
                      variant="tertiary"
                      size="xsmall"
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
                      chartFiltersRef.current.enableCustomEvents()
                    }
                    setRequestLoadEvents(true)
                    setRequestIncludeParams(true)
                  }}
                  isEventsLoading={isEventsLoading}
                  resetSignal={groupingResetSignal}
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
          <AlertWithCloseButton variant="success">{alertInfo.message}</AlertWithCloseButton>
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
        <ExpansionCard aria-label="Tilleggsvalg" size="small" className="mt-4">
          <ExpansionCard.Header>
            <ExpansionCard.Title as="h3" size="small">
              Tilleggsvalg
            </ExpansionCard.Title>
          </ExpansionCard.Header>
          <ExpansionCard.Content>
            <ResultsDisplayOptions
              orderBy={config.orderBy}
              setOrderBy={setOrderBy}
              clearOrderBy={clearOrderBy}
              limit={config.limit}
              setLimit={setLimit}
              columnOrderMode={config.columnOrderMode || 'default'}
              setColumnOrderMode={setColumnOrderMode}
              groupByFields={config.groupByFields}
              metrics={config.metrics}
            />
          </ExpansionCard.Content>
        </ExpansionCard>
      </div>
    </ChartLayout>
  )
}

export default ChartsPage
