import type { ClickmapResponse } from '../model/types'

export interface FetchClickmapParams {
  websiteId: string
  startAt: number
  endAt: number
  urlPath?: string
  pathOperator?: string
  eventNames?: string[]
  limit?: number
}

export const fetchClickmap = async (params: FetchClickmapParams): Promise<ClickmapResponse> => {
  const searchParams = new URLSearchParams({
    startAt: params.startAt.toString(),
    endAt: params.endAt.toString(),
    limit: (params.limit ?? 300).toString(),
  })

  const eventNames =
    params.eventNames && params.eventNames.length > 0 ? params.eventNames : ['navigere', 'accordion åpnet']
  eventNames.forEach((eventName) => searchParams.append('eventName', eventName))

  if (params.urlPath) {
    searchParams.set('urlPath', params.urlPath)
    searchParams.set('pathOperator', params.pathOperator || 'equals')
  }

  const response = await fetch(`/api/bigquery/websites/${params.websiteId}/clickmap?${searchParams.toString()}`)
  if (!response.ok) {
    throw new Error('Kunne ikke hente klikk-kartdata')
  }

  return (await response.json()) as ClickmapResponse
}
