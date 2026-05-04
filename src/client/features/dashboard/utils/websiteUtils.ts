import type { EventParam, EventProperty, Website } from '../model/types.ts'

export const API_TIMEOUT_MS = 120000 // timeout

export const timeoutPromise = (ms: number) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`))
    }, ms)
  })
}

export const calculateMaxDaysAvailable = (website: Website): number => {
  const endDate = new Date()
  const startDate = website.createdAt ? new Date(website.createdAt) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)

  const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
  let totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (Number.isNaN(totalDays) || totalDays < 1) {
    totalDays = 1
  }

  return totalDays
}

export const getDateRange = (daysToFetch: number) => {
  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - daysToFetch)

  return {
    startDate,
    endDate,
    startAt: startDate.getTime(),
    endAt: endDate.getTime(),
  }
}

export const buildEventParams = (properties: EventProperty[]) => {
  const eventMap = new Map<string, string[]>()

  properties.forEach((prop) => {
    if (!eventMap.has(prop.eventName)) {
      eventMap.set(prop.eventName, [])
    }
    if (prop.propertyName && !eventMap.get(prop.eventName)!.includes(prop.propertyName)) {
      eventMap.get(prop.eventName)!.push(prop.propertyName)
    }
  })

  const eventNames = Array.from(eventMap.keys())
  const paramsByEvent: EventParam[] = []

  eventMap.forEach((props, eventName) => {
    props.forEach((prop) => {
      paramsByEvent.push({
        key: `${eventName}.${prop}`,
        type: 'string',
      })
    })
  })

  return { eventNames, paramsByEvent }
}
