import type { Filter } from '../../../shared/types/chart.ts'

export const defaultPageFilter: Filter = {
  column: 'url_path',
  operator: '=',
  value: '{{url_sti}}',
  interactive: true,
  metabaseParam: true,
}

export const getEventSelection = (filters: Filter[]) => {
  const type = filters.find((filter) => filter.column === 'event_type')
  const names = filters.find((filter) => filter.column === 'event_name')
  const types = type?.multipleValues ?? (type?.value ? [type.value] : [])
  return {
    pageviews: types.includes('1'),
    custom: type ? types.includes('2') : Boolean(names),
    names,
  }
}

export const setEventSelection = (filters: Filter[], pageviews: boolean, custom: boolean, names?: Filter): Filter[] => {
  const next = filters.filter((filter) => !['event_type', 'event_name'].includes(filter.column))
  const types = [...(pageviews ? ['1'] : []), ...(custom ? ['2'] : [])]
  next.push(
    types.length === 0
      ? { column: 'event_type', rawExpression: 'FALSE' }
      : { column: 'event_type', operator: 'IN', value: types[0], multipleValues: types },
  )

  if (custom && names) {
    const updatedNames: Filter = { ...names, rawExpression: undefined }
    if (pageviews && names.value) {
      const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
      const values = names.multipleValues ?? [names.value]
      const condition = names.interactive
        ? `event_name = ${names.value}`
        : names.operator === 'IN'
          ? `event_name IN (${values.map(quote).join(', ')})`
          : names.operator === 'STARTS_WITH'
            ? `STARTS_WITH(event_name, ${quote(names.value)})`
            : names.operator === 'ENDS_WITH'
              ? `ENDS_WITH(event_name, ${quote(names.value)})`
              : names.operator === 'LIKE'
                ? `event_name LIKE ${quote(`%${names.value}%`)}`
                : `event_name ${names.operator ?? '='} ${quote(names.value)}`
      updatedNames.rawExpression = `(event_type = 1 OR (event_type = 2 AND ${condition}))`
    }
    next.push(updatedNames)
  }
  return next
}
