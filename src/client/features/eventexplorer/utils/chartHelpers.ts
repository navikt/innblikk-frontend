import type { ILineChartProps } from '@fluentui/react-charting'
import type { SeriesPoint } from '../model/types'

export const prepareLineChartData = (
  seriesData: SeriesPoint[],
  selectedEvent: string,
  includeAverage: boolean = false,
): ILineChartProps | null => {
  if (!seriesData.length) return null

  const dataPoints = seriesData.map((item) => ({
    x: new Date(item.time),
    y: item.count,
  }))

  const lineChartData: {
    legend: string
    data: { x: Date; y: number }[]
    color: string
    lineOptions?: { lineBorderWidth: number }
  }[] = [
    {
      legend: selectedEvent,
      data: dataPoints,
      color: '#0067c5',
    },
  ]

  // Add average line if requested
  if (includeAverage && dataPoints.length > 0) {
    const sum = dataPoints.reduce((acc, point) => acc + point.y, 0)
    const average = sum / dataPoints.length

    lineChartData.push({
      legend: 'Gjennomsnitt',
      data: dataPoints.map((point) => ({
        x: point.x,
        y: average,
      })),
      color: '#ff6b6b',
      lineOptions: {
        lineBorderWidth: 2,
      },
    })
  }

  return {
    data: {
      lineChartData,
    },
  }
}
