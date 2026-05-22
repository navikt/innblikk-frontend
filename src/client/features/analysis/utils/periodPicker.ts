import { format } from 'date-fns'
import { nb } from 'date-fns/locale'

const formatDay = (date: Date, includeYear: boolean): string => {
  if (includeYear) {
    return format(date, 'd. MMM yyyy', { locale: nb })
  }
  return format(date, 'd. MMM', { locale: nb })
}

export const formatDateRange = (start?: Date, end?: Date): string => {
  if (!start || !end) return ''
  const sameYear = start.getFullYear() === end.getFullYear()
  if (sameYear) {
    return `${formatDay(start, false)} – ${formatDay(end, true)}`
  }
  return `${formatDay(start, true)} – ${formatDay(end, true)}`
}
