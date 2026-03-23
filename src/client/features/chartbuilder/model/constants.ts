import type { DateFormat, MetricOption } from '../../../shared/types/chart.ts'

export const DATE_FORMATS: DateFormat[] = [
  {
    label: 'År',
    value: 'year',
    format: '%Y',
  },
  {
    label: 'Måned',
    value: 'month',
    format: '%Y-%m',
  },
  {
    label: 'Uke',
    value: 'week',
    format: '%Y-%U',
  },
  {
    label: 'Dag',
    value: 'day',
    format: '%Y-%m-%d',
  },
  {
    label: 'Time',
    value: 'hour',
    format: '%Y-%m-%d %H:00',
  },
  {
    label: 'Minutt',
    value: 'minute',
    format: '%Y-%m-%d %H:%M',
  },
]

export const METRICS: MetricOption[] = [
  { label: 'Antall rader', value: 'count' },
  { label: 'Antall unike verdier', value: 'distinct' },
  { label: 'Antall rader hvor', value: 'count_where' },
  { label: 'Sum av verdier', value: 'sum' },
  { label: 'Gjennomsnitt', value: 'average' },
  { label: 'Median', value: 'median' },
  { label: 'Andel av resultatene (%)', value: 'percentage' },
  { label: 'Andel av totalen (%)', value: 'andel' },
  { label: 'Fluktrate (%)', value: 'bounce_rate' },
]

export const SESSION_COLUMNS = [
  'browser',
  'os',
  'device',
  'screen',
  'language',
  'country',
  'subdivision1',
  'city',
] as const
