import { useState } from 'react'
import { Switch } from '@navikt/ds-react'
import { LineChart, ResponsiveContainer } from '@fluentui/react-charting'
import type { SeriesPoint, QueryStats } from '../model/types.ts'
import { prepareLineChartData } from '../utils/chartHelpers.ts'
import EventSeriesTrendTable from './EventSeriesTrendTable.tsx'

interface EventSeriesChartProps {
  seriesData: SeriesPoint[]
  selectedEvent: string
  queryStats: QueryStats | null
}

const EventSeriesChart = ({ seriesData, selectedEvent, queryStats }: EventSeriesChartProps) => {
  const [showAverage, setShowAverage] = useState<boolean>(false)
  const [showTrendTable, setShowTrendTable] = useState<boolean>(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-6 -mb-5">
        <Switch checked={showTrendTable} onChange={(e) => setShowTrendTable(e.target.checked)} size="small">
          Vis tabell
        </Switch>
        <Switch checked={showAverage} onChange={(e) => setShowAverage(e.target.checked)} size="small">
          Vis gjennomsnitt
        </Switch>
      </div>
      <div style={{ width: '100%', height: '400px' }}>
        {(() => {
          const chartData = prepareLineChartData(seriesData, selectedEvent, showAverage)
          return chartData ? (
            <ResponsiveContainer>
              <LineChart
                data={chartData.data}
                legendsOverflowText={'Overflow Items'}
                yAxisTickFormat={(d: number | string) => Number(d).toLocaleString('nb-NO')}
                yAxisTickCount={10}
                allowMultipleShapesForPoints={false}
                enablePerfOptimization={true}
                margins={{ left: 50, right: 40, top: 20, bottom: 35 }}
                legendProps={{
                  allowFocusOnLegends: true,
                  styles: {
                    text: { color: 'var(--ax-text-default)' },
                  },
                }}
              />
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Ingen data tilgjengelig for diagram
            </div>
          )
        })()}
      </div>

      {showTrendTable && (
        <EventSeriesTrendTable seriesData={seriesData} selectedEvent={selectedEvent} queryStats={queryStats} />
      )}
    </div>
  )
}

export default EventSeriesChart
