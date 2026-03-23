import type { IVerticalBarChartDataPoint } from '@fluentui/react-charting'
import { ResponsiveContainer, VerticalBarChart } from '@fluentui/react-charting'
import type { DashboardRow } from '../../utils/widgetUtils.ts'
import { extractJsonValue } from '../../utils/widgetUtils.ts'

interface DashboardWidgetBarChartProps {
  data: DashboardRow[]
}

const MAX_CATEGORIES = 12

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  const parsed = parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

const DashboardWidgetBarChart = ({ data }: DashboardWidgetBarChartProps) => {
  const keys = Object.keys(data[0] ?? {})
  if (keys.length < 2) {
    return <div className="text-[var(--ax-text-subtle)]">Trenger minst to kolonner (kategori og verdi)</div>
  }

  const labelKey = keys[0]
  const valueKey = keys[1]

  const points: IVerticalBarChartDataPoint[] = data.map((row) => {
    const rawLabel = extractJsonValue((row as Record<string, unknown>)[labelKey])
    const rawValue = extractJsonValue((row as Record<string, unknown>)[valueKey])
    return {
      x: String(rawLabel ?? 'Ukjent'),
      y: toNumber(rawValue),
    }
  })

  if (points.every((point) => point.y === 0)) {
    return <div className="text-[var(--ax-text-subtle)]">Kunne ikke lage stolpediagram fra dataene</div>
  }

  let displayData = points
  if (points.length > MAX_CATEGORIES) {
    const top = points.slice(0, MAX_CATEGORIES - 1)
    const rest = points.slice(MAX_CATEGORIES - 1)
    const restSum = rest.reduce((sum, point) => sum + point.y, 0)
    displayData = [...top, { x: 'Andre', y: restSum }]
  }

  return (
    <div style={{ width: '100%', height: '350px' }}>
      <ResponsiveContainer>
        <VerticalBarChart
          data={displayData}
          margins={{ left: 50, right: 20, top: 20, bottom: 35 }}
          yAxisTickCount={5}
          barWidth="auto"
        />
      </ResponsiveContainer>
    </div>
  )
}

export default DashboardWidgetBarChart
