import { Heading, Button, Loader } from '@navikt/ds-react'
import { ArrowLeft } from 'lucide-react'
import type { SeriesPoint, EventProperty, ParameterValue, LatestEvent, QueryStats } from '../model/types.ts'
import EventSeriesChart from './EventSeriesChart.tsx'
import EventPropertiesSection from './EventPropertiesSection.tsx'

interface EventDetailViewProps {
  selectedEvent: string
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
  onBack: () => void
  onDrilldown: (parameterName: string | null) => void
  onFetchValues: () => void
}

const EventDetailView = ({
  selectedEvent,
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
  onBack,
  onDrilldown,
  onFetchValues,
}: EventDetailViewProps) => (
  <div className="space-y-6">
    <div className="flex items-center gap-4 mb-4">
      <Button variant="tertiary" size="small" icon={<ArrowLeft aria-hidden />} onClick={onBack}>
        Alle hendelser
      </Button>
    </div>

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
            onDrilldown={onDrilldown}
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
