import { useEffect, useMemo, useState } from 'react'
import { fetchDashboards } from '../../../oversikt/api/oversiktApi.ts'
import { fetchWebsites } from '../../../../shared/api/websiteApi.ts'
import { getStoredPeriod } from '../../../../shared/lib/utils.ts'
import { fetchCanvasStorageData } from '../../api/canvasStorageApi.ts'
import {
  extractCanvasCustomEndDateFromDescription,
  extractCanvasCustomStartDateFromDescription,
  extractCanvasPeriodFromDescription,
  extractCanvasWebsiteIdFromDescription,
} from '../../utils/canvasUtils.ts'
import type { CanvasShareLoadResult, CanvasShareRouteContext } from '../model/types.ts'

type UseCanvasShareDataResult = {
  data: CanvasShareLoadResult | null
  error: string | null
  isLoading: boolean
  activeCategoryId: number | null
}

export const useCanvasShareData = (routeContext: CanvasShareRouteContext): UseCanvasShareDataResult => {
  const [data, setData] = useState<CanvasShareLoadResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (routeContext.projectId === null || routeContext.dashboardId === null) {
      setData(null)
      setError(null)
      setIsLoading(false)
      return
    }

    let isActive = true
    setIsLoading(true)
    setError(null)

    void (async () => {
      try {
        const [storageData, dashboards, availableWebsites] = await Promise.all([
          fetchCanvasStorageData(routeContext.projectId!, routeContext.dashboardId!),
          fetchDashboards(routeContext.projectId!),
          fetchWebsites(),
        ])
        if (!isActive) return

        const dashboard = dashboards.find((item) => item.id === routeContext.dashboardId)
        const dashboardTitle = dashboard?.name?.trim() || 'Canvas'
        const dashboardDescription = dashboard?.description
        const configuredPeriod = extractCanvasPeriodFromDescription(dashboardDescription)
        const defaultCustomStartDate = extractCanvasCustomStartDateFromDescription(dashboardDescription)
        const defaultCustomEndDate = extractCanvasCustomEndDateFromDescription(dashboardDescription)
        const defaultPeriod = getStoredPeriod(configuredPeriod)
        const canvasConfiguredWebsiteId = extractCanvasWebsiteIdFromDescription(dashboardDescription)

        setData({
          frames: storageData.frames,
          categories: storageData.categories,
          dashboardTitle,
          defaultPeriod,
          defaultCustomStartDate,
          defaultCustomEndDate,
          canvasConfiguredWebsiteId,
          availableWebsites,
        })
      } catch (loadError) {
        if (!isActive) return
        setError(loadError instanceof Error ? loadError.message : 'Kunne ikke laste artikkelvisning')
        setData(null)
      } finally {
        if (isActive) setIsLoading(false)
      }
    })()

    return () => {
      isActive = false
    }
  }, [routeContext.dashboardId, routeContext.projectId])

  const activeCategoryId = useMemo(() => {
    if (!data) return null
    const requested = routeContext.categoryId
    if (requested !== null && data.categories.some((category) => category.id === requested)) return requested
    return data.categories[0]?.id ?? null
  }, [data, routeContext.categoryId])

  return {
    data,
    error,
    isLoading,
    activeCategoryId,
  }
}
