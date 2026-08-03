import { useState } from 'react'
import { Button, Alert, Loader } from '@navikt/ds-react'
import { Share2, Check } from 'lucide-react'
import { Events, type KopierLenkeProperties } from '@navikt/analytics-types'
import ChartLayout from '../../analysis/ui/ChartLayout.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx'
import { useEventExplorer } from '../hooks/useEventExplorer.ts'
import { copyToClipboard } from '../utils/clipboard.ts'
import EventList from './EventList.tsx'
import EventDetailView from './EventDetailView.tsx'
import { SqlViewer } from '../../chartbuilder'

const EventExplorer = () => {
  const {
    selectedWebsite,
    setSelectedWebsite,
    urlPaths,
    setUrlPaths,
    pathOperator,
    setPathOperator,
    selectedEvent,
    setSelectedEvent,
    events,
    loadingEvents,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    hasSearched,
    seriesData,
    propertiesData,
    loadingData,
    error,
    queryStats,
    eventsQueryStats,
    generatedSql,
    allParameterValues,
    loadingValues,
    hasLoadedValues,
    latestEvents,
    selectedParameterForDrilldown,
    setSelectedParameterForDrilldown,
    parameterValuesQueryStats,
    hasUnappliedFilterChanges,
    fetchEventsData,
    fetchAllParameterValues,
  } = useEventExplorer()

  const [copySuccess, setCopySuccess] = useState<boolean>(false)

  const copyShareLink = async () => {
    const success = await copyToClipboard(window.location.href)
    if (success) {
      const properties: KopierLenkeProperties = { seksjon: 'event-explorer' }
      window.umami?.track(Events.KOPIER_LENKE, properties)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const handleBackToEvents = () => {
    setSelectedEvent('')
    setSelectedParameterForDrilldown(null)
  }

  return (
    <ChartLayout
      title="Egendefinerte hendelser"
      description="Utforsk egendefinerte hendelser."
      currentPage="event-explorer"
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={<WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />}
      onFiltersSubmit={() => {
        if (!selectedWebsite || loadingEvents || !hasUnappliedFilterChanges) return
        void fetchEventsData()
      }}
      filters={
        <>
          <UrlPathFilter
            urlPaths={urlPaths}
            onUrlPathsChange={setUrlPaths}
            pathOperator={pathOperator}
            onPathOperatorChange={setPathOperator}
            selectedWebsiteDomain={selectedWebsite?.domain}
            className="w-full sm:w-[300px]"
            label="URL"
            showOperator={true}
          />

          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            startDate={customStartDate}
            onStartDateChange={setCustomStartDate}
            endDate={customEndDate}
            onEndDateChange={setCustomEndDate}
          />

          <div className="w-full sm:w-auto self-end pb-[2px]">
            <Button
              onClick={fetchEventsData}
              disabled={!selectedWebsite || loadingEvents || !hasUnappliedFilterChanges}
              loading={loadingEvents}
              size="small"
            >
              Vis hendelser
            </Button>
          </div>
        </>
      }
    >
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {loadingEvents && (
        <div className="flex justify-center items-center h-full">
          <Loader size="xlarge" title="Henter hendelser..." />
        </div>
      )}

      {!selectedEvent && !loadingEvents && hasSearched && events.length > 0 && (
        <EventList
          events={events}
          eventsQueryStats={eventsQueryStats}
          websiteName={selectedWebsite?.name}
          selectedWebsiteId={selectedWebsite?.id}
          onSelectEvent={setSelectedEvent}
        />
      )}
      {!selectedEvent && generatedSql && <SqlViewer sql={generatedSql} seksjon="event-explorer" />}

      {selectedEvent && (
        <EventDetailView
          selectedEvent={selectedEvent}
          seriesData={seriesData}
          propertiesData={propertiesData}
          loadingData={loadingData}
          error={error}
          queryStats={queryStats}
          allParameterValues={allParameterValues}
          loadingValues={loadingValues}
          hasLoadedValues={hasLoadedValues}
          latestEvents={latestEvents}
          selectedParameterForDrilldown={selectedParameterForDrilldown}
          parameterValuesQueryStats={parameterValuesQueryStats}
          onBack={handleBackToEvents}
          onDrilldown={setSelectedParameterForDrilldown}
          onFetchValues={fetchAllParameterValues}
        />
      )}

      {!loadingEvents && hasSearched && (events.length > 0 || selectedEvent) && (
        <div className="flex justify-end mt-8">
          <Button
            size="small"
            variant="secondary"
            icon={copySuccess ? <Check size={16} /> : <Share2 size={16} />}
            onClick={copyShareLink}
          >
            {copySuccess ? 'Kopiert!' : 'Del analyse'}
          </Button>
        </div>
      )}

      {!selectedEvent && !loadingEvents && hasSearched && events.length === 0 && !error && (
        <div className="flex justify-center items-center h-full text-gray-500">
          Ingen egendefinerte hendelser funnet for valgt periode og filter.
        </div>
      )}
    </ChartLayout>
  )
}

export default EventExplorer
