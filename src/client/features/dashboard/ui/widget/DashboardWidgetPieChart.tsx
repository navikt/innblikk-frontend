import { PieChart, ResponsiveContainer } from '@fluentui/react-charting'
import type { DashboardRow } from '../../utils/widgetUtils.ts'
import { extractJsonValue } from '../../utils/widgetUtils.ts'

interface DashboardWidgetPieChartProps {
  data: DashboardRow[]
}

const MAX_CATEGORIES = 12
const PIE_COLORS = ['#4F6DDC', '#D8008F', '#2D9DA3', '#8A6FC2', '#B35E00', '#00907C', '#6B7280', '#B13F6B']

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  const parsed = parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

const DashboardWidgetPieChart = ({ data }: DashboardWidgetPieChartProps) => {
  const keys = Object.keys(data[0] ?? {})
  if (keys.length < 2) {
    return <div className="text-[var(--ax-text-subtle)]">Trenger minst to kolonner (kategori og verdi)</div>
  }

  const labelKey = keys[0]
  const valueKey = keys[1]

  const slices = data.map((row, index) => {
    const rawLabel = extractJsonValue((row as Record<string, unknown>)[labelKey])
    const rawValue = extractJsonValue((row as Record<string, unknown>)[valueKey])
    const label = String(rawLabel ?? 'Ukjent')
    return {
      x: label,
      y: toNumber(rawValue),
      color: PIE_COLORS[index % PIE_COLORS.length],
      legend: label,
      xAxisCalloutData: label,
    }
  })

  if (slices.every((slice) => slice.y === 0)) {
    return <div className="text-[var(--ax-text-subtle)]">Kunne ikke lage sektordiagram fra dataene</div>
  }

  let displayData = slices
  if (slices.length > MAX_CATEGORIES) {
    const top = slices.slice(0, MAX_CATEGORIES - 1)
    const rest = slices.slice(MAX_CATEGORIES - 1)
    const restSum = rest.reduce((sum, slice) => sum + slice.y, 0)
    displayData = [...top, { x: 'Andre', y: restSum, color: '#6B7280', legend: 'Andre', xAxisCalloutData: 'Andre' }]
  }

  const total = displayData.reduce((sum, item) => sum + item.y, 0)

  return (
    <div className="w-full md:grid md:h-[350px] md:grid-cols-[minmax(170px,200px)_minmax(0,1fr)] md:items-center md:gap-0">
      <style>{`
                .dashboard-pie-chart text[class*="pieLabel"],
                .dashboard-pie-chart g[class*="arc"] text {
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
                .dashboard-pie-chart path {
                    cursor: pointer !important;
                }
            `}</style>
      <div className="dashboard-pie-chart md:order-2" style={{ width: '100%', height: '350px' }}>
        <ResponsiveContainer>
          <PieChart data={displayData} chartTitle="" />
        </ResponsiveContainer>
      </div>
      <div
        className="mt-2 space-y-1 md:order-1 md:mt-0 md:max-h-[350px] md:overflow-auto"
        role="list"
        aria-label="Sektordiagram forklaring"
      >
        {displayData.map((item, index) => {
          const pct = total > 0 ? ((item.y / total) * 100).toFixed(1) : '0.0'
          return (
            <div
              key={`${item.x}-${index}`}
              role="listitem"
              className="flex items-start gap-2 rounded px-1 py-1 text-sm text-[var(--ax-text-default)]"
            >
              <span className="min-w-0 break-words leading-tight">
                {item.x}
                <span className="ml-2 whitespace-nowrap tabular-nums text-[var(--ax-text-subtle)]">{pct}%</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DashboardWidgetPieChart
