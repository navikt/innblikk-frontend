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

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

const formatQueryDate = (value: string): string | null => {
  let formatter: Intl.DateTimeFormat
  let date: Date
  if (DATE.test(value)) {
    formatter = dateFormatter
    date = new Date(`${value}T00:00:00Z`)
  } else if (DATETIME.test(value)) {
    formatter = datetimeFormatter
    date = new Date(`${value}Z`)
  } else if (TIMESTAMP.test(value)) {
    formatter = timestampFormatter
    date = new Date(value)
  } else {
    return null
  }

  const calendarValue = DATE.test(value) ? `${value}T00:00:00` : value.slice(0, 19)
  const calendarDate = new Date(`${calendarValue}Z`)
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 19) !== calendarValue) {
    return null
  }

  return Number.isFinite(date.getTime()) ? formatter.format(date) : null
}

const unwrapQueryDate = (input: unknown): unknown =>
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

  const dateValue = unwrapQueryDate(input)
  const formattedDate = typeof dateValue === 'string' ? formatQueryDate(dateValue) : null
  if (formattedDate !== null) return formattedDate

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return String(input)
  return JSON.stringify(input)
}
