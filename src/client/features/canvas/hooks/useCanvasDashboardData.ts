import { useEffect, useEffectEvent, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useLocation } from 'react-router-dom'
import { useReplaceSearchParams } from '../../../shared/hooks/useReplaceSearchParams.ts'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'
import { fetchCanvasStorageData, type CanvasStorageData } from '../api/canvasStorageApi.ts'
import type { CanvasConnection, CanvasFrame } from '../model/types.ts'

interface CanvasDashboardDataOptions {
  projectId: number | null
  dashboardId: number | null
  mode: 'checking' | 'existing' | 'create'
  requestedCategoryId: number | null
  categories: GraphCategoryDto[]
  activeCategoryId: number | null
  setCategories: Dispatch<SetStateAction<GraphCategoryDto[]>>
  setActiveCategoryId: Dispatch<SetStateAction<number | null>>
  setFrames: Dispatch<SetStateAction<CanvasFrame[]>>
  setConnections: Dispatch<SetStateAction<CanvasConnection[]>>
  setError: Dispatch<SetStateAction<string | null>>
  onBeforeApplyRemoteData: () => void
}

/** Hydrate a canvas once per identity; tab navigation only changes its selection. */
export function useCanvasDashboardData({
  projectId,
  dashboardId,
  mode,
  requestedCategoryId,
  categories,
  activeCategoryId,
  setCategories,
  setActiveCategoryId,
  setFrames,
  setConnections,
  setError,
  onBeforeApplyRemoteData,
}: CanvasDashboardDataOptions) {
  const { search } = useLocation()
  const replaceSearchParams = useReplaceSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const previousRequestedCategory = useRef(requestedCategoryId)

  // Read the latest requested tab when loading finishes, without making tab
  // changes a reason to fetch and replace frames/connections again.
  const applyInitialData = useEffectEvent((data: CanvasStorageData) => {
    setCategories(data.categories)
    setActiveCategoryId(
      data.categories.some((category) => category.id === requestedCategoryId)
        ? requestedCategoryId
        : (data.categories[0]?.id ?? null),
    )
    onBeforeApplyRemoteData()
    setFrames(data.frames)
    setConnections(data.connections)
  })

  useEffect(() => {
    setIsReady(false)
    if (projectId === null || dashboardId === null || mode === 'create') {
      setFrames((current) => (current.length ? [] : current))
      setConnections((current) => (current.length ? [] : current))
      setCategories([])
      setActiveCategoryId(null)
      setIsLoading(false)
      return
    }
    if (mode !== 'existing') return

    let active = true
    setIsLoading(true)
    setError(null)
    void fetchCanvasStorageData(projectId, dashboardId)
      .then((data) => {
        if (!active) return
        applyInitialData(data)
        setIsReady(true)
      })
      .catch((error: unknown) => {
        if (active) setError(error instanceof Error ? error.message : 'Kunne ikke laste canvas-data')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, dashboardId, mode, setFrames, setConnections, setCategories, setActiveCategoryId, setError])

  useEffect(() => {
    // Empty initial state is not a user selection. Preserve incoming categoryId
    // until the categories have actually loaded, including on request failure.
    if (!isReady) return

    const firstCategoryId = categories[0]?.id ?? null
    const requestedChanged = previousRequestedCategory.current !== requestedCategoryId
    previousRequestedCategory.current = requestedCategoryId
    const nextActiveId = requestedChanged
      ? categories.some((category) => category.id === requestedCategoryId)
        ? requestedCategoryId
        : firstCategoryId
      : categories.some((category) => category.id === activeCategoryId)
        ? activeCategoryId
        : firstCategoryId

    if (nextActiveId !== activeCategoryId) {
      setActiveCategoryId(nextActiveId)
      return
    }

    const canonicalId = activeCategoryId !== firstCategoryId ? activeCategoryId : null
    const params = new URLSearchParams(search)
    const canonicalValue = canonicalId === null ? null : String(canonicalId)
    if (params.get('categoryId') === canonicalValue) return
    if (canonicalValue) params.set('categoryId', canonicalValue)
    else params.delete('categoryId')
    replaceSearchParams(params)
  }, [isReady, categories, activeCategoryId, requestedCategoryId, search, replaceSearchParams, setActiveCategoryId])

  return isLoading
}
