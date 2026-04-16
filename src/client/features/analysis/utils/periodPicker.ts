import { format } from 'date-fns'

export const formatDateRange = (start?: Date, end?: Date): string => {
  if (!start || !end) return ''
  const sameYear = start.getFullYear() === end.getFullYear()
  if (sameYear) {
    return `${format(start, 'dd.MM')} – ${format(end, 'dd.MM.yyyy')}`
  }
  return `${format(start, 'dd.MM.yyyy')} – ${format(end, 'dd.MM.yyyy')}`
}
