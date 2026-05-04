import { useState, useCallback } from 'react'
import type { IChartProps } from '@fluentui/react-charting'
import type { Website } from '../../../shared/types/chart'
import type { JourneyData, JourneyNode, JourneyLink, QueryStats } from '../model'
import { getDateRangeFromPeriod, normalizeUrlToPath } from '../../../shared/lib/utils'
import { format } from 'date-fns'
import { buildAppliedFilterKey } from '../utils'

export function useJourneyData(
  selectedWebsite: Website | null,
  period: string,
  customStartDate: Date | undefined,
  customEndDate: Date | undefined,
  limit: number,
  journeyDirection: string,
) {
  const [data, setData] = useState<IChartProps | null>(null)
  const [rawData, setRawData] = useState<JourneyData | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [isUpdating, setIsUpdating] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)
  const [generatedSql, setGeneratedSql] = useState<string | null>(null)
  const [lastAppliedFilterKey, setLastAppliedFilterKey] = useState<string | null>(null)
  const [reverseVisualOrder, setReverseVisualOrder] = useState<boolean>(false)

  const fetchData = useCallback(
    async (startUrl: string, steps: number, preserveData = false, customSteps?: number) => {
      if (!selectedWebsite) return

      const normalizedStartUrl = normalizeUrlToPath(startUrl)
      if (!normalizedStartUrl) return

      const stepsToFetch = customSteps ?? steps
      const appliedFilterKey = buildAppliedFilterKey(
        selectedWebsite.id,
        normalizedStartUrl,
        period,
        customStartDate,
        customEndDate,
        stepsToFetch,
        limit,
        journeyDirection,
      )

      if (preserveData) {
        setIsUpdating(true)
      } else {
        setLoading(true)
        setData(null)
        setRawData(null)
      }

      setError(null)

      const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
      if (!dateRange) {
        setError('Vennligst velg en gyldig periode.')
        setLoading(false)
        setIsUpdating(false)
        return
      }
      const { startDate, endDate } = dateRange

      try {
        const response = await fetch('/api/bigquery/journeys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            websiteId: selectedWebsite.id,
            startUrl: normalizedStartUrl,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            steps: stepsToFetch,
            limit,
            direction: journeyDirection,
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch user journeys: ${response.status} ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text()
          throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`)
        }

        const result: {
          nodes?: JourneyNode[]
          links?: JourneyLink[]
          generatedSql?: string
          queryStats?: QueryStats
        } = await response.json()

        if (result.queryStats) {
          setQueryStats(result.queryStats)
        }
        if (result.generatedSql) {
          setGeneratedSql(result.generatedSql)
        }

        const nodes: JourneyNode[] = Array.isArray(result.nodes) ? result.nodes : []
        const links: JourneyLink[] = Array.isArray(result.links) ? result.links : []

        const styledLinks = links.map((link) => ({
          ...link,
          color: link.color ?? '#666666',
        }))

        setRawData({ nodes, links: styledLinks })
        setData({
          chartTitle: 'Brukerreiser',
          SankeyChartData: { nodes, links: styledLinks },
        } as IChartProps)

        setReverseVisualOrder(journeyDirection === 'backward')

        const newParams = new URLSearchParams(window.location.search)
        newParams.set('period', period)
        newParams.set('steps', stepsToFetch.toString())
        newParams.set('limit', limit.toString())
        newParams.set('direction', journeyDirection)
        newParams.set('urlPath', normalizedStartUrl)
        newParams.delete('startUrl')
        if (period === 'custom' && customStartDate && customEndDate) {
          newParams.set('from', format(customStartDate, 'yyyy-MM-dd'))
          newParams.set('to', format(customEndDate, 'yyyy-MM-dd'))
        } else {
          newParams.delete('from')
          newParams.delete('to')
        }

        window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`)
        setLastAppliedFilterKey(appliedFilterKey)
      } catch {
        setError('Kunne ikke laste brukerreiser. Prøv igjen senere.')
      } finally {
        setLoading(false)
        setIsUpdating(false)
      }
    },
    [selectedWebsite, period, customStartDate, customEndDate, limit, journeyDirection],
  )

  return {
    data,
    rawData,
    loading,
    isUpdating,
    error,
    queryStats,
    generatedSql,
    lastAppliedFilterKey,
    reverseVisualOrder,
    fetchData,
  }
}
