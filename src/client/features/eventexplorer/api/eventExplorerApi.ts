import {
  parseEventsResponse,
  parseSeriesResponse,
  parsePropertiesResponse,
  parseParameterValuesResponse,
  parseLatestEventsResponse,
} from '../utils/parsers'
import type {
  EventsResponse,
  SeriesResponse,
  PropertiesResponse,
  ParameterValuesResponse,
  LatestEventsResponse,
} from '../model/types'

export interface FetchEventsParams {
  websiteId: string
  startAt: number
  endAt: number
  urlPath?: string
  pathOperator?: string
}

export interface FetchEventSeriesParams {
  websiteId: string
  eventName: string
  interval: string
  startAt: number
  endAt: number
  urlPath?: string
  pathOperator?: string
}

export interface FetchEventPropertiesParams {
  websiteId: string
  eventName: string
  includeParams: boolean
  startAt: number
  endAt: number
  urlPath?: string
  pathOperator?: string
}

export interface FetchParameterValuesParams {
  websiteId: string
  eventName: string
  parameterName: string
  startAt: number
  endAt: number
  urlPath?: string
  pathOperator?: string
}

export interface FetchLatestEventsParams {
  websiteId: string
  eventName: string
  startAt: number
  endAt: number
  limit: number
  urlPath?: string
  pathOperator?: string
}

export const fetchEvents = async (params: FetchEventsParams): Promise<EventsResponse> => {
  const searchParams = new URLSearchParams({
    startAt: params.startAt.toString(),
    endAt: params.endAt.toString(),
  })
  if (params.urlPath) {
    searchParams.append('urlPath', params.urlPath)
    searchParams.append('pathOperator', params.pathOperator || 'equals')
  }

  const response = await fetch(`/api/bigquery/websites/${params.websiteId}/events?${searchParams.toString()}`)
  if (!response.ok) throw new Error('Failed to fetch events')

  const result = (await response.json()) as unknown
  return parseEventsResponse(result)
}

export const fetchEventSeries = async (params: FetchEventSeriesParams): Promise<SeriesResponse> => {
  const searchParams = new URLSearchParams({
    eventName: params.eventName,
    interval: params.interval,
    startAt: params.startAt.toString(),
    endAt: params.endAt.toString(),
  })
  if (params.urlPath) {
    searchParams.append('urlPath', params.urlPath)
    searchParams.append('pathOperator', params.pathOperator || 'equals')
  }

  const response = await fetch(`/api/bigquery/websites/${params.websiteId}/event-series?${searchParams.toString()}`)
  if (!response.ok) throw new Error('Failed to fetch event series')

  const result = (await response.json()) as unknown
  return parseSeriesResponse(result)
}

export const fetchEventProperties = async (params: FetchEventPropertiesParams): Promise<PropertiesResponse> => {
  const searchParams = new URLSearchParams({
    eventName: params.eventName,
    includeParams: params.includeParams.toString(),
    startAt: params.startAt.toString(),
    endAt: params.endAt.toString(),
  })
  if (params.urlPath) {
    searchParams.append('urlPath', params.urlPath)
    searchParams.append('pathOperator', params.pathOperator || 'equals')
  }

  const response = await fetch(`/api/bigquery/websites/${params.websiteId}/event-properties?${searchParams.toString()}`)
  if (!response.ok) throw new Error('Failed to fetch event properties')

  const result = (await response.json()) as unknown
  return parsePropertiesResponse(result)
}

export const fetchParameterValues = async (params: FetchParameterValuesParams): Promise<ParameterValuesResponse> => {
  const searchParams = new URLSearchParams({
    eventName: params.eventName,
    parameterName: params.parameterName,
    startAt: params.startAt.toString(),
    endAt: params.endAt.toString(),
  })
  if (params.urlPath) {
    searchParams.append('urlPath', params.urlPath)
    searchParams.append('pathOperator', params.pathOperator || 'equals')
  }

  const response = await fetch(
    `/api/bigquery/websites/${params.websiteId}/event-parameter-values?${searchParams.toString()}`,
  )
  if (!response.ok) throw new Error(`Failed to fetch values for ${params.parameterName}`)

  const result = (await response.json()) as unknown
  return parseParameterValuesResponse(result)
}

export const fetchLatestEvents = async (params: FetchLatestEventsParams): Promise<LatestEventsResponse> => {
  const searchParams = new URLSearchParams({
    eventName: params.eventName,
    startAt: params.startAt.toString(),
    endAt: params.endAt.toString(),
    limit: params.limit.toString(),
  })
  if (params.urlPath) {
    searchParams.append('urlPath', params.urlPath)
    searchParams.append('pathOperator', params.pathOperator || 'equals')
  }

  const response = await fetch(`/api/bigquery/websites/${params.websiteId}/event-latest?${searchParams.toString()}`)
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Failed to fetch latest events:', errorText)
    throw new Error('Failed to fetch latest events')
  }

  const result = (await response.json()) as unknown
  return parseLatestEventsResponse(result)
}
