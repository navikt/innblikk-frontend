const dateOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}

const dateFormatter = new Intl.DateTimeFormat('nb-NO', { ...dateOptions, timeZone: 'UTC' })
const timestampFormatter = new Intl.DateTimeFormat('nb-NO', {
  ...dateOptions,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Oslo',
})
const datetimeFormatter = new Intl.DateTimeFormat('nb-NO', {
  ...dateOptions,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'UTC',
})

const QUERY_DATE = /^(?<day>\d{4}-\d{2}-\d{2})(?:[T ](?<time>\d{2}:\d{2}:\d{2})(?:\.\d+)?(?<zone>Z|[+-]\d{2}:\d{2})?)?$/

const formatQueryDate = (value: string): string | null => {
  const groups = QUERY_DATE.exec(value)?.groups
  if (!groups) return null
  const { day, time, zone } = groups

  const fields = `${day}T${time ?? '00:00:00'}`
  const calendar = new Date(`${fields}Z`)
  if (!Number.isFinite(calendar.getTime()) || !calendar.toISOString().startsWith(fields)) {
    return null
  }

  if (!time) return dateFormatter.format(calendar)
  if (!zone) return datetimeFormatter.format(calendar)

  const instant = new Date(value.replace(' ', 'T'))
  return Number.isFinite(instant.getTime()) ? timestampFormatter.format(instant) : null
}

const unwrapBigQueryValue = (input: unknown): unknown =>
  input !== null &&
  typeof input === 'object' &&
  !Array.isArray(input) &&
  Object.keys(input).length === 1 &&
  'value' in input
    ? input.value
    : input

/**
 * Formats JSON query values for display, using Norwegian dates and Oslo timestamps.
 * Without column types, dates are recognized by their ISO shape; other objects remain JSON.
 */
export const formatQueryValue = (input: unknown): string => {
  if (input === null || input === undefined) return ''

  const value = unwrapBigQueryValue(input)
  const formattedDate = typeof value === 'string' ? formatQueryDate(value) : null
  if (formattedDate !== null) return formattedDate

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return String(input)
  return JSON.stringify(input)
}
