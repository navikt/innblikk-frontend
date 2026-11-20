import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import { NavigationType, useLocation, useNavigationType } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { getStoredMetricType, getStoredPeriod } from '../../../shared/lib/utils'

interface RestoreOptions {
  periodParam?: string
  period?: (value: string) => void
  startDate?: (value: Date | undefined) => void
  endDate?: (value: Date | undefined) => void
  paths?: (value: string[]) => void
  pathOperator?: (value: string) => void
  metricType?: (value: string) => void
}

export function useCaptureAnalysisLocation(context?: string) {
  const { key } = useLocation()
  const latestKey = useRef(key)
  const latestContext = useRef(context)
  useLayoutEffect(() => {
    latestKey.current = key
    latestContext.current = context
  }, [key, context])
  return useCallback(() => {
    const captured = latestKey.current
    const capturedContext = latestContext.current
    return () => latestKey.current === captured && latestContext.current === capturedContext
  }, [])
}

export function useRestoreAnalysisContext(options: RestoreOptions) {
  const { search } = useLocation()
  const navigationType = useNavigationType()
  const previous = useRef(search)
  const restore = useEffectEvent((before: URLSearchParams, after: URLSearchParams) => {
    const changed = (...keys: string[]) =>
      keys.some((key) => JSON.stringify(before.getAll(key)) !== JSON.stringify(after.getAll(key)))
    const periodParam = options.periodParam
    if (changed(...(periodParam ? ['period', periodParam] : ['period']))) {
      options.period?.(getStoredPeriod((periodParam && after.get(periodParam)) || after.get('period')))
    }
    if (changed('from', 'startDate')) {
      const value = after.get('from') || after.get('startDate')
      options.startDate?.(value ? parseISO(value) : undefined)
    }
    if (changed('to', 'endDate')) {
      const value = after.get('to') || after.get('endDate')
      options.endDate?.(value ? parseISO(value) : undefined)
    }
    if (changed('urlPath', 'pagePath')) {
      const paths = after.getAll('urlPath')
      options.paths?.(paths.length ? paths : after.getAll('pagePath'))
    }
    if (changed('pathOperator')) options.pathOperator?.(after.get('pathOperator') || 'equals')
    if (changed('metricType')) options.metricType?.(getStoredMetricType(after.get('metricType')))
  })

  useEffect(() => {
    if (previous.current === search) return
    const before = new URLSearchParams(previous.current)
    previous.current = search
    // Controls publish their existing state with replace. Links and Back/Forward
    // restore it instead; replaying our own writes could overwrite a newer edit.
    if (navigationType === NavigationType.Replace) return
    restore(before, new URLSearchParams(search))
  }, [navigationType, search])
}
