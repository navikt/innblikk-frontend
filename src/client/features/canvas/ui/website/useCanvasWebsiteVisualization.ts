import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Website } from '../../../../shared/types/website.ts'
import { getDateRangeFromPeriod, normalizeUrlToPath } from '../../../../shared/lib/utils.ts'
import type { ClickmapItem } from '../../../clickmap/model/types.ts'
import {
  getClickmapDatasetFromVisualizationMode,
  isVisualizationMode,
  type VisualizationMode,
} from '../../../clickmap/model/visualizationMode.ts'
import { fetchClickmap } from '../../../clickmap/api/clickmapApi.ts'

type WebsiteVisualizationFrame = {
  id: string
  kind: string
  websiteId?: string
  targetUrl?: string
  renderWebsite?: boolean
  isInternalDashboard?: boolean
  visualizationMode?: VisualizationMode
}

type CanvasFrameVisualizationData = {
  requestKey: string
  loading: boolean
  error: string | null
  items: ClickmapItem[]
  websiteId?: string
  path?: string
}

type UseCanvasWebsiteVisualizationParams = {
  frameItems: WebsiteVisualizationFrame[]
  availableWebsites: Website[]
  selectedWebsiteId?: string | null
  selectedWebsiteDomain?: string | null
  canvasConfiguredWebsiteId?: string | null
  period: string
  customStartDate: Date | null
  customEndDate: Date | null
  clickmapEvents: string[]
}

const normalizeDomainForComparison = (value: string): string =>
  value.replace(/^https?:\/\//i, '').replace(/^www\./i, '')

const getFrameVisualizationMode = (
  frame: Pick<WebsiteVisualizationFrame, 'visualizationMode'>,
): VisualizationMode | '' => (isVisualizationMode(frame.visualizationMode) ? frame.visualizationMode : '')

const useCanvasWebsiteVisualization = ({
  frameItems,
  availableWebsites,
  selectedWebsiteId,
  selectedWebsiteDomain,
  canvasConfiguredWebsiteId,
  period,
  customStartDate,
  customEndDate,
  clickmapEvents,
}: UseCanvasWebsiteVisualizationParams) => {
  const [frameVisualizationData, setFrameVisualizationData] = useState<Record<string, CanvasFrameVisualizationData>>({})
  const frameVisualizationDataRef = useRef<Record<string, CanvasFrameVisualizationData>>({})
  const websiteIframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})

  useEffect(() => {
    frameVisualizationDataRef.current = frameVisualizationData
  }, [frameVisualizationData])

  const visualizationWebsiteFrames = useMemo(
    () =>
      frameItems
        .filter((frame) => frame.kind === 'website' && !frame.isInternalDashboard && frame.renderWebsite !== false)
        .map((frame) => ({
          id: frame.id,
          kind: frame.kind,
          websiteId: frame.websiteId,
          targetUrl: frame.targetUrl,
          renderWebsite: frame.renderWebsite,
          isInternalDashboard: frame.isInternalDashboard,
          visualizationMode: frame.visualizationMode,
        })),
    [frameItems],
  )

  const visualizationWebsiteFramesKey = useMemo(
    () => JSON.stringify(visualizationWebsiteFrames),
    [visualizationWebsiteFrames],
  )

  const visualizationWebsiteFramesRef = useRef(visualizationWebsiteFrames)

  useEffect(() => {
    visualizationWebsiteFramesRef.current = visualizationWebsiteFrames
  }, [visualizationWebsiteFrames])

  const sendVisualizationDataToWebsiteFrame = useCallback(
    (
      frame: Pick<
        WebsiteVisualizationFrame,
        'id' | 'kind' | 'isInternalDashboard' | 'renderWebsite' | 'visualizationMode'
      >,
    ) => {
      if (frame.kind !== 'website' || frame.isInternalDashboard || frame.renderWebsite === false) return
      const contentWindow = websiteIframeRefs.current[frame.id]?.contentWindow
      if (!contentWindow) return

      const viewMode = getFrameVisualizationMode(frame)
      const frameData = frameVisualizationData[frame.id]
      const items = viewMode ? (frameData?.items ?? []) : []
      const payloadItems = items.map((item) => ({
        ...item,
        badgeLabel: item.count.toLocaleString('nb-NO'),
      }))

      contentWindow.postMessage(
        {
          type: 'umami-clickmap-data',
          items: payloadItems,
          zeroBadgeLabel: '0',
          viewMode: viewMode || 'clickmap',
          includeUnmatched: viewMode === 'clickmap',
        },
        '*',
      )
    },
    [frameVisualizationData],
  )

  useEffect(() => {
    const websiteFrames = visualizationWebsiteFramesRef.current

    setFrameVisualizationData((current) => {
      const validIds = new Set(websiteFrames.map((frame) => frame.id))
      const next = Object.fromEntries(Object.entries(current).filter(([frameId]) => validIds.has(frameId)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })

    const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
    if (!dateRange) return

    const normalizedSelectedDomain = normalizeDomainForComparison(selectedWebsiteDomain || '')
    const websiteByDomain = new Map<string, string>()
    availableWebsites.forEach((website) => {
      const normalizedDomain = normalizeDomainForComparison(website.domain || '')
      if (normalizedDomain && !websiteByDomain.has(normalizedDomain)) {
        websiteByDomain.set(normalizedDomain, website.id)
      }
    })

    let isActive = true

    const loadVisualizationData = async () => {
      await Promise.all(
        websiteFrames.map(async (frame) => {
          const pagePath = frame.targetUrl ? normalizeUrlToPath(frame.targetUrl) : ''
          if (!pagePath) {
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey: '',
                loading: false,
                error: 'Fant ikke gyldig URL-sti for kortet.',
                items: [],
                path: '',
              },
            }))
            return
          }

          let websiteId = frame.websiteId || selectedWebsiteId || canvasConfiguredWebsiteId || ''
          if (!websiteId && frame.targetUrl) {
            try {
              const targetDomain = normalizeDomainForComparison(new URL(frame.targetUrl).hostname)
              websiteId = websiteByDomain.get(targetDomain) || ''
            } catch {
              // Ignore invalid target URL.
            }
          }
          if (!websiteId && normalizedSelectedDomain) {
            websiteId = websiteByDomain.get(normalizedSelectedDomain) || ''
          }
          if (!websiteId) {
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey: '',
                loading: false,
                error: 'Fant ikke nettsted for URL-en i kortet.',
                items: [],
                websiteId: '',
                path: pagePath,
              },
            }))
            return
          }

          const mode = getFrameVisualizationMode(frame)
          if (!mode) return
          const dataset = getClickmapDatasetFromVisualizationMode(mode)
          const requestKey = JSON.stringify({
            websiteId,
            pagePath,
            period,
            customStartDate: customStartDate?.toISOString() ?? null,
            customEndDate: customEndDate?.toISOString() ?? null,
            mode,
            dataset,
          })

          const existing = frameVisualizationDataRef.current[frame.id]
          const hasCompletedSuccessfulResult =
            existing?.requestKey === requestKey && existing.loading === false && existing.error === null
          if (hasCompletedSuccessfulResult) return

          setFrameVisualizationData((current) => ({
            ...current,
            [frame.id]: {
              requestKey,
              loading: true,
              error: null,
              items: existing?.requestKey === requestKey ? existing.items : [],
              websiteId,
              path: pagePath,
            },
          }))

          try {
            const result = await fetchClickmap({
              websiteId,
              startAt: dateRange.startDate.getTime(),
              endAt: dateRange.endDate.getTime(),
              urlPath: pagePath,
              pathOperator: 'equals',
              eventNames: clickmapEvents,
              limit: 400,
              dataset,
            })

            if (!isActive) return
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey,
                loading: false,
                error: null,
                items: result.data ?? [],
                websiteId,
                path: pagePath,
              },
            }))
          } catch (error) {
            if (!isActive) return
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey,
                loading: false,
                error: error instanceof Error ? error.message : 'Kunne ikke hente visualiseringsdata',
                items: [],
                websiteId,
                path: pagePath,
              },
            }))
          }
        }),
      )
    }

    void loadVisualizationData()

    return () => {
      isActive = false
    }
  }, [
    availableWebsites,
    canvasConfiguredWebsiteId,
    clickmapEvents,
    customEndDate,
    customStartDate,
    period,
    selectedWebsiteDomain,
    selectedWebsiteId,
    visualizationWebsiteFramesKey,
  ])

  useEffect(() => {
    const websiteFrames = visualizationWebsiteFramesRef.current
    websiteFrames.forEach((frame) => {
      sendVisualizationDataToWebsiteFrame(frame)
    })
  }, [frameVisualizationData, sendVisualizationDataToWebsiteFrame, visualizationWebsiteFramesKey])

  const setWebsiteIframeRef = useCallback((frameId: string, node: HTMLIFrameElement | null) => {
    websiteIframeRefs.current[frameId] = node
  }, [])

  const handleWebsiteFrameLoad = useCallback(
    (
      frame: Pick<
        WebsiteVisualizationFrame,
        'id' | 'kind' | 'isInternalDashboard' | 'renderWebsite' | 'visualizationMode'
      >,
    ) => {
      sendVisualizationDataToWebsiteFrame(frame)
    },
    [sendVisualizationDataToWebsiteFrame],
  )

  return {
    frameVisualizationData,
    setWebsiteIframeRef,
    handleWebsiteFrameLoad,
  }
}

export default useCanvasWebsiteVisualization
