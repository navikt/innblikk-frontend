import { useEffect, useMemo, useState } from 'react'
import { fetchDashboards } from '../../../oversikt/api/oversiktApi.ts'
import { fetchCanvasStorageData } from '../../api/canvasStorageApi.ts'
import type { CanvasShareLoadResult, CanvasShareRouteContext } from '../model/types.ts'

export const useCanvasShareData = (routeContext: CanvasShareRouteContext) => {
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
        const [storageData, dashboards] = await Promise.all([
          fetchCanvasStorageData(routeContext.projectId!, routeContext.dashboardId!),
          fetchDashboards(routeContext.projectId!),
        ])
        if (!isActive) return

        const dashboardTitle =
          dashboards.find((dashboard) => dashboard.id === routeContext.dashboardId)?.name?.trim() || 'Canvas'

        setData({
          frames: storageData.frames,
          categories: storageData.categories,
          dashboardTitle,
        })
      } catch (loadError) {
        if (!isActive) return
        setError(loadError instanceof Error ? loadError.message : 'Kunne ikke laste delingsvisning')
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
