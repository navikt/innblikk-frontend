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
export const formatQueryValue = (input: unknown): string => {
  const value =
    input !== null &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    Object.keys(input).length === 1 &&
    'value' in input
      ? input.value
      : input

  if (value === null || value === undefined) return ''
  if (value instanceof Date && Number.isFinite(value.getTime())) return timestampFormatter.format(value)
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value)
    if (match) {
      const [, day, hour, minute, second, zone] = match
      const date = new Date(`${day}T00:00:00Z`)
      const validDay = Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
      if (validDay && hour === undefined) return dateFormatter.format(date)
      if (validDay && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60) {
        const timestamp = new Date(`${value.replace(' ', 'T')}${zone ? '' : 'Z'}`)
        if (Number.isFinite(timestamp.getTime())) {
          return (zone ? timestampFormatter : datetimeFormatter).format(timestamp)
        }
      }
    }
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
