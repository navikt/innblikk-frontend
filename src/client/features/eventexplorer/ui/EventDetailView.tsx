import { Heading, Loader } from '@navikt/ds-react'
import type { SeriesPoint, EventProperty, ParameterValue, LatestEvent, QueryStats } from '../model/types.ts'
import EventSeriesChart from './EventSeriesChart.tsx'
import EventPropertiesSection from './EventPropertiesSection.tsx'

interface EventDetailViewProps {
  selectedEvent: string
  period: string
  seriesData: SeriesPoint[]
  propertiesData: EventProperty[]
  loadingData: boolean
  error: string | null
  queryStats: QueryStats | null
  allParameterValues: Record<string, ParameterValue[]>
  loadingValues: boolean
  hasLoadedValues: boolean
  latestEvents: LatestEvent[]
  selectedParameterForDrilldown: string | null
  parameterValuesQueryStats: QueryStats | null
  onFetchValues: () => void
}

const EventDetailView = ({
  selectedEvent,
  period,
  seriesData,
  propertiesData,
  loadingData,
  error,
  queryStats,
  allParameterValues,
  loadingValues,
  hasLoadedValues,
  latestEvents,
  selectedParameterForDrilldown,
  parameterValuesQueryStats,
  onFetchValues,
}: EventDetailViewProps) => (
  <div className="space-y-6">
    <Heading level="2" size="medium">
      Hendelse: {selectedEvent}
    </Heading>

    {loadingData && (
      <div className="flex justify-center items-center h-64">
        <Loader size="xlarge" title="Henter data..." />
      </div>
    )}

    {!loadingData && seriesData.length > 0 && (
      <div className="flex flex-col gap-8">
        <EventSeriesChart seriesData={seriesData} selectedEvent={selectedEvent} queryStats={queryStats} />

        <div>
          <EventPropertiesSection
            propertiesData={propertiesData}
            allParameterValues={allParameterValues}
            loadingValues={loadingValues}
            hasLoadedValues={hasLoadedValues}
            latestEvents={latestEvents}
            selectedParameterForDrilldown={selectedParameterForDrilldown}
            parameterValuesQueryStats={parameterValuesQueryStats}
            selectedEvent={selectedEvent}
            period={period}
            onFetchValues={onFetchValues}
          />
        </div>
      </div>
    )}

    {!loadingData && !seriesData.length && !error && (
      <div className="flex justify-center items-center h-full text-gray-500">
        Ingen data funnet for denne hendelsen.
      </div>
    )}
  </div>
)

export default EventDetailView
