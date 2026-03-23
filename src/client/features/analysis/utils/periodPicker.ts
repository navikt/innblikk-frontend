import { format } from 'date-fns'

export const formatDateRange = (start?: Date, end?: Date): string => {
  if (!start || !end) return ''
  return `${format(start, 'dd.MM.yy')} - ${format(end, 'dd.MM.yy')}`
}
