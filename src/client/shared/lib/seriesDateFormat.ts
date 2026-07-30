import { format } from 'date-fns'
import { nb } from 'date-fns/locale'

/**
 * Shared time-series granularity, matching the backend `interval` query param
 * (see `buildTimeSeriesBucketSql` in innblikk-frontend/src/server/routes/bigquery/helpers.js).
 */
export type Granularity = 'hour' | 'day' | 'week' | 'month'

/**
 * Formats a chart x-axis tick label for a time-series point.
 *
 * Used by both the traffic analysis chart (`/trafikkanalyse`) and the event
 * explorer chart (`/utforsk-hendelser`) so both render dates the same way.
 */
export const formatSeriesAxisLabel = (date: Date, granularity: Granularity): string => {
  if (granularity === 'hour') {
    return format(date, 'HH:mm')
  }
  if (granularity === 'week') {
    return `Uke ${format(date, 'w', { locale: nb })}`
  }
  if (granularity === 'month') {
    return format(date, 'MMM yyyy', { locale: nb })
  }
  return format(date, 'd. MMM', { locale: nb })
}

/**
 * Formats the hover/callout label for a time-series data point.
 *
 * Day/week/month buckets only ever have day precision (see
 * `buildTimeSeriesBucketSql`), so they're formatted without a time-of-day —
 * showing one would imply precision the data doesn't have. Hour buckets show
 * the local (Europe/Oslo) time explicitly, so the UTC offset is visible
 * rather than left ambiguous.
 */
export const formatSeriesCalloutLabel = (date: Date, granularity: Granularity): string => {
  if (granularity === 'hour') {
    return format(date, "EEE d. MMM yyyy 'kl.' HH:mm", { locale: nb })
  }
  if (granularity === 'week') {
    return `Uke ${format(date, 'w', { locale: nb })} (${format(date, 'd. MMM yyyy', { locale: nb })})`
  }
  if (granularity === 'month') {
    return format(date, 'MMMM yyyy', { locale: nb })
  }
  return format(date, 'EEE d. MMM yyyy', { locale: nb })
}
