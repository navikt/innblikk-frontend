export const EVENT_LIST_PATH = '/utforsk-hendelser'
export const EVENT_DETAIL_PATH = `${EVENT_LIST_PATH}/hendelse`
export const EVENT_PARAMETER_PATH = `${EVENT_DETAIL_PATH}/parameter`

export function eventDestination(search: string, hash: string, event: string, parameter?: string, period?: string) {
  const params = new URLSearchParams(search)
  if (!params.has('period') && period) params.set('period', period)
  params.set('event', event)
  params.delete('parameter')
  if (parameter) params.set('parameter', parameter)
  return `${parameter ? EVENT_PARAMETER_PATH : EVENT_DETAIL_PATH}?${params.toString()}${hash}`
}
