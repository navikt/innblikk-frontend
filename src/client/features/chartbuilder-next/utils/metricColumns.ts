import type { Parameter, ColumnOption } from '../../../shared/types/chart.ts'
import { FILTER_COLUMNS } from '../../../shared/lib/constants.ts'
import { sanitizeColumnName } from './sanitize.ts'

/** Get available columns for a given metric type */
export const getMetricColumns = (parameters: Parameter[], metric: string): ColumnOption[] => {
  const baseColumns: Record<string, Array<{ label: string; value: string }>> = {
    count: [],
    distinct: [
      { label: 'Hendelses-ID', value: 'event_id' },
      { label: 'Person-ID', value: 'session_id' },
      { label: 'Besøk-ID', value: 'visit_id' },
      { label: 'Nettleser', value: 'browser' },
      { label: 'URL-sti', value: 'url_path' },
      ...Object.values(FILTER_COLUMNS).flatMap((group) => group.columns),
    ],
    sum: [{ label: 'Event Data (numeric)', value: 'event_data' }],
    average: [{ label: 'Event Data (numeric)', value: 'event_data' }],
    median: [],
    min: [{ label: 'Created At', value: 'created_at' }],
    max: [{ label: 'Created At', value: 'created_at' }],
    percentage: [
      { label: 'Besøkende', value: 'session_id' },
      { label: 'Økter', value: 'visit_id' },
      { label: 'Hendelser', value: 'event_id' },
      { label: 'Rader', value: 'alle_rader_prosent' },
    ],
    andel: [
      { label: 'Besøkende (av totale besøkende)', value: 'session_id' },
      { label: 'Økter (av totale økter)', value: 'visit_id' },
      { label: 'Hendelser (av totale hendelser)', value: 'event_id' },
    ],
    bounce_rate: [{ label: 'Besøk-ID', value: 'visit_id' }],
  }

  const cols = [...(baseColumns[metric] || [])]

  // Add numeric parameters to sum, average and median
  if (metric === 'sum' || metric === 'average' || metric === 'median') {
    parameters
      .filter((param) => param.type === 'number')
      .forEach((param) => {
        cols.push({
          label: param.key,
          value: `param_${sanitizeColumnName(param.key)}`,
        })
      })
  }

  // Add all parameters to distinct, min, and max
  if (metric === 'distinct' || metric === 'min' || metric === 'max') {
    parameters.forEach((param) => {
      cols.push({
        label: param.key,
        value: `param_${sanitizeColumnName(param.key)}`,
      })
    })
  }

  return cols
}

/** Get appropriate aggregation function based on parameter data type */
export const getParameterAggregator = (paramType: string): string => {
  switch (paramType) {
    case 'number':
      return 'MAX'
    case 'string':
      return 'ANY_VALUE'
    default:
      return 'ANY_VALUE'
  }
}
