import { trackEvent } from '../../../shared/lib/trackEvent.ts'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button, Alert, Loader } from '@navikt/ds-react'
import { CheckmarkIcon, PaperplaneIcon } from '@navikt/aksel-icons'
import { Events, type KopierLenkeProperties } from '@navikt/analytics-types'
import ChartLayout from '../../analysis/ui/ChartLayout.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import UrlPathFilter from '../../analysis/ui/UrlPathFilter.tsx'
import { useEventExplorer } from '../hooks/useEventExplorer.ts'
import { copyToClipboard } from '../utils/clipboard.ts'
import EventList from './EventList.tsx'
import EventDetailView from './EventDetailView.tsx'
import { SqlViewer } from '../../chartbuilder-next'
import { EVENT_DETAIL_PATH, EVENT_LIST_PATH, EVENT_PARAMETER_PATH } from '../utils/navigation.ts'

const EventExplorer = () => {
  const { pathname, search, hash } = useLocation()
  const params = new URLSearchParams(search)
  const event = params.get('event')
  const parameter = params.get('parameter')
  let destination: string | null = null

  if (pathname.endsWith('/')) {
    destination = pathname.replace(/\/+$/, '')
  } else if (pathname === EVENT_LIST_PATH && event) {
    destination = EVENT_DETAIL_PATH
    params.delete('parameter')
  } else if (pathname !== EVENT_LIST_PATH && !event) {
    destination = EVENT_LIST_PATH
    params.delete('event')
    params.delete('parameter')
  } else if (pathname === EVENT_PARAMETER_PATH && !parameter) {
    destination = EVENT_DETAIL_PATH
    params.delete('parameter')
  }

  if (destination) {
    const query = params.toString()
    return <Navigate to={`${destination}${query ? `?${query}` : ''}${hash}`} replace />
  }

  return <EventExplorerContent />
}

const EventExplorerContent = () => {
  const {
    selectedWebsite,
    setSelectedWebsite,
    urlPaths,
    setUrlPaths,
    pathOperator,
    setPathOperator,
    selectedEvent,
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
    parameterValuesQueryStats,
    fetchAllParameterValues,
  } = useEventExplorer()

  const [copySuccess, setCopySuccess] = useState<boolean>(false)

  const copyShareLink = async () => {
    const success = await copyToClipboard(window.location.href)
    if (success) {
      const properties: KopierLenkeProperties = { seksjon: 'event-explorer' }
      trackEvent(Events.KOPIER_LENKE, properties)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  return (
    <ChartLayout
      title="Egendefinerte hendelser"
      description="Utforsk egendefinerte hendelser."
      currentPage="event-explorer"
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={<WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />}
      filters={
        <>
          <UrlPathFilter
            urlPaths={urlPaths}
            onUrlPathsChange={setUrlPaths}
            pathOperator={pathOperator}
            onPathOperatorChange={setPathOperator}
            selectedWebsiteDomain={selectedWebsite?.domain}
            selectedWebsiteId={selectedWebsite?.id}
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
          period={period}
        />
      )}
      {!selectedEvent && generatedSql && <SqlViewer sql={generatedSql} seksjon="event-explorer" />}

      {selectedEvent && (
        <EventDetailView
          selectedEvent={selectedEvent}
          period={period}
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
          onFetchValues={fetchAllParameterValues}
        />
      )}

      {!loadingEvents && (selectedEvent || (hasSearched && events.length > 0)) && (
        <div className="flex justify-end mt-8">
          <Button
            size="small"
            variant="secondary"
            icon={copySuccess ? <CheckmarkIcon fontSize="1rem" /> : <PaperplaneIcon fontSize="1rem" />}
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
