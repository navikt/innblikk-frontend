import type { FunnelResultRow } from '../../funnel/model/types'
import { extractJsonValue, isRecord } from './widgetUtils'

export const FUNNEL_CHART_MARKER = '/* @chart funnel */'

export const hasFunnelChartMarker = (sql = ''): boolean =>
  /^\s*(?:(?:WITH|SELECT)\b\s*)?\/\*\s*@chart\s+funnel\s*\*\//i.test(sql)

const readNumber = (value: unknown): number | null => {
  const raw = extractJsonValue(value)
  if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) return null
  const number = Number(raw)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

export const getDashboardFunnel = (rows: unknown): { steps: FunnelResultRow[]; ordered: boolean } | null => {
  if (!Array.isArray(rows) || rows.length < 2 || !rows.every(isRecord)) return null

  const first = rows[0]
  const columns =
    'step_number' in first && 'step' in first && 'count' in first
      ? { order: 'step_number', label: 'step', count: 'count' }
      : 'step' in first && 'url' in first && 'count' in first
        ? { order: 'step', label: 'url', count: 'count' }
        : 'name' in first && 'value' in first
          ? { order: null, label: 'name', count: 'value' }
          : null
  if (!columns) return null

  const steps: FunnelResultRow[] = []
  for (const [index, row] of rows.entries()) {
    const step = columns.order ? readNumber(row[columns.order]) : index
    const count = readNumber(row[columns.count])
    const label = extractJsonValue(row[columns.label])
    if (step === null || count === null || typeof label !== 'string' || !label.trim()) return null
    steps.push({ step, url: label, count })
  }

  steps.sort((left, right) => left.step - right.step)
  const firstStep = steps[0].step
  if (
    steps.some((step, index) => step.step !== firstStep + index || (index > 0 && step.count > steps[index - 1].count))
  ) {
    return null
  }

  return {
    steps: steps.map((step, index) => ({ ...step, step: index })),
    ordered: columns.order !== null,
  }
}
