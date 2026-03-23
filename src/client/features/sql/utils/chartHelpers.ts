import { translateValue } from '../../../shared/lib/translations'
import type { JsonValue, Row } from '../model/types'

// Safely convert a JsonValue to a string without triggering no-base-to-string
const toSafeString = (value: JsonValue | undefined): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

const toNumber = (value: JsonValue | undefined): number => {
  if (typeof value === 'number') return value
  return parseFloat(toSafeString(value)) || 0
}

// Using colorblind-friendly palette with good contrast
const CHART_COLORS = [
  '#0067C5', // Blue (NAV blue)
  '#FF9100', // Orange
  '#06893A', // Green
  '#C30000', // Red
  '#634689', // Purple
  '#A8874C', // Brown/Gold
  '#005B82', // Teal
  '#E18AAA', // Pink
]

export const prepareLineChartData = (data: Row[], includeAverage: boolean = false) => {
  if (!data || data.length === 0) return null

  const keys = Object.keys(data[0] ?? {})
  if (keys.length < 2) return null

  // Check if we have 3 columns - likely x-axis, series grouping, and y-axis
  if (keys.length === 3) {
    const xKey = keys[0]
    const seriesKey = keys[1]
    const yKey = keys[2]

    const seriesMap = new Map<
      string,
      { x: number | Date; y: number; xAxisCalloutData: string; yAxisCalloutData: string }[]
    >()

    data.forEach((row, rowIndex: number) => {
      const rawSeriesValue = row[seriesKey]
      const translatedSeriesValue = translateValue(seriesKey, rawSeriesValue ?? '') as string
      const seriesValue = String(translatedSeriesValue || 'Ukjent')
      if (!seriesMap.has(seriesValue)) {
        seriesMap.set(seriesValue, [])
      }

      const xValue = row[xKey]
      const rawY = row[yKey]
      const yValue = toNumber(rawY)

      let x: number | Date
      if (typeof xValue === 'string' && xValue.match(/^\d{4}-\d{2}-\d{2}/)) {
        const parsedDate = new Date(xValue)
        x = !isNaN(parsedDate.getTime()) ? parsedDate : rowIndex
      } else if (typeof xValue === 'number') {
        x = xValue
      } else {
        const xStr = typeof xValue === 'string' ? xValue : JSON.stringify(xValue)
        const parsedDate = new Date(xStr)
        x = !isNaN(parsedDate.getTime()) ? parsedDate : rowIndex
      }

      const xLabel = typeof xValue === 'string' || typeof xValue === 'number' ? String(xValue) : JSON.stringify(xValue)

      seriesMap.get(seriesValue)!.push({
        x,
        y: yValue,
        xAxisCalloutData: xLabel,
        yAxisCalloutData: String(yValue),
      })
    })

    const lineChartData = Array.from(seriesMap.entries()).map(([seriesName, points], index) => ({
      legend: seriesName,
      data: points,
      color: CHART_COLORS[index % CHART_COLORS.length],
      lineOptions: {
        lineBorderWidth: '2',
      },
    }))

    // Calculate average line across all data points (only if requested)
    if (includeAverage) {
      const allXValues = new Set<number>()
      lineChartData.forEach((series) => {
        series.data.forEach((point) => {
          const xVal = point.x instanceof Date ? point.x.getTime() : Number(point.x)
          allXValues.add(xVal)
        })
      })

      const averagePoints = Array.from(allXValues)
        .sort((a, b) => a - b)
        .map((xVal) => {
          const yValues: number[] = []
          lineChartData.forEach((series) => {
            const point = series.data.find((p) => {
              const pxVal = p.x instanceof Date ? p.x.getTime() : Number(p.x)
              return pxVal === xVal
            })
            if (point) yValues.push(point.y)
          })

          const avgY = yValues.length > 0 ? yValues.reduce((sum, val) => sum + val, 0) / yValues.length : 0

          const originalPoint = lineChartData[0]?.data.find((p) => {
            const pxVal = p.x instanceof Date ? p.x.getTime() : Number(p.x)
            return pxVal === xVal
          })

          return {
            x: new Date(xVal),
            y: avgY,
            xAxisCalloutData: originalPoint?.xAxisCalloutData || String(xVal),
            yAxisCalloutData: avgY.toFixed(2),
          }
        })

      lineChartData.push({
        legend: 'Gjennomsnitt',
        data: averagePoints,
        color: '#262626',
        lineOptions: {
          lineBorderWidth: '2',
        },
      })
    }

    return {
      data: { lineChartData },
      enabledLegendsWrapLines: true,
    }
  }

  // Single line
  const xKey = keys[0]
  const yKey = keys[1]

  const chartPoints = data.map((row, index: number) => {
    const xValue = row[xKey]
    const rawY = row[yKey]
    const yValue = toNumber(rawY)

    let x: number | Date
    if (typeof xValue === 'string' && xValue.match(/^\d{4}-\d{2}-\d{2}/)) {
      x = new Date(xValue)
    } else if (typeof xValue === 'number') {
      x = xValue
    } else {
      x = index
    }

    const xLabel = typeof xValue === 'string' || typeof xValue === 'number' ? String(xValue) : JSON.stringify(xValue)

    return {
      x,
      y: yValue,
      xAxisCalloutData: xLabel,
      yAxisCalloutData: String(yValue),
    }
  })

  const lineChartData = [
    {
      legend: yKey,
      data: chartPoints,
      color: '#0067C5',
      lineOptions: {
        lineBorderWidth: '2',
      },
    },
  ]

  if (includeAverage) {
    const avgY = chartPoints.reduce((sum: number, point) => sum + point.y, 0) / chartPoints.length

    const averageLinePoints = chartPoints.map((point) => ({
      x: point.x,
      y: avgY,
      xAxisCalloutData: point.xAxisCalloutData,
      yAxisCalloutData: avgY.toFixed(2),
    }))

    lineChartData.push({
      legend: 'Gjennomsnitt',
      data: averageLinePoints,
      color: '#262626',
      lineOptions: {
        lineBorderWidth: '2',
      },
    })
  }

  return {
    data: { lineChartData },
    enabledLegendsWrapLines: true,
  }
}

export const prepareBarChartData = (data: Row[]) => {
  if (!data || data.length === 0) return null

  // Only show bar chart if 12 or fewer items
  if (data.length > 12) return null

  const keys = Object.keys(data[0])
  if (keys.length < 2) return null

  const labelKey = keys[0]
  const valueKey = keys[1]

  const total = data.reduce((sum: number, row) => {
    const raw = row[valueKey]
    const value = toNumber(raw)
    return sum + value
  }, 0)

  const barChartData = data.map((row) => {
    const raw = row[valueKey]
    const value = toNumber(raw)
    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0'

    const rawLabel = row[labelKey]
    const translatedLabel = translateValue(labelKey, rawLabel ?? '') as string
    const label = String(translatedLabel || 'Ukjent')

    return {
      x: label,
      y: value,
      xAxisCalloutData: label,
      yAxisCalloutData: `${value} (${percentage}%)`,
      color: '#0067C5',
      legend: label,
    }
  })

  return {
    data: barChartData,
    barWidth: 'auto' as const,
    yAxisTickCount: 5,
    enableReflow: true,
    legendProps: {
      allowFocusOnLegends: true,
      canSelectMultipleLegends: false,
      styles: {
        root: {
          display: 'flex',
          flexWrap: 'wrap',
          rowGap: '8px',
          columnGap: '16px',
          maxWidth: '100%',
        },
        legend: {
          marginRight: 0,
        },
      },
    },
  }
}

export const preparePieChartData = (data: Row[]) => {
  if (!data || data.length === 0) return null

  // Only show pie chart if 12 or fewer items
  if (data.length > 12) return null

  const keys = Object.keys(data[0])
  if (keys.length < 2) return null

  const labelKey = keys[0]
  const valueKey = keys[1]

  const total = data.reduce((sum: number, row) => {
    const raw = row[valueKey]
    const value = toNumber(raw)
    return sum + value
  }, 0)

  const pieChartData = data.map((row) => {
    const raw = row[valueKey]
    const value = toNumber(raw)
    const rawLabel = row[labelKey]
    const translatedLabel = translateValue(labelKey, rawLabel ?? '') as string
    const label = String(translatedLabel || 'Ukjent')

    return {
      y: value,
      x: label,
    }
  })

  return {
    data: pieChartData,
    total,
  }
}
