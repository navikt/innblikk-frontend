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
const formatQueryDate = (value: string): string | null => {
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
  return null
}

export const formatQueryValue = (input: unknown): string => {
  if (input === null || input === undefined) return ''
  if (input instanceof Date && Number.isFinite(input.getTime())) return timestampFormatter.format(input)

  const dateValue =
    typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 1 && 'value' in input
      ? input.value
      : input
  const formattedDate = typeof dateValue === 'string' ? formatQueryDate(dateValue) : null
  if (formattedDate !== null) return formattedDate

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return String(input)
  return JSON.stringify(input)
}
