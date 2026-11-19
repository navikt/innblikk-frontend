import { act, renderHook, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'
import { fetchCanvasStorageData, type CanvasStorageData } from '../api/canvasStorageApi.ts'
import type { CanvasConnection, CanvasFrame } from '../model/types.ts'
import { useCanvasDashboardData } from './useCanvasDashboardData.ts'

vi.mock('../api/canvasStorageApi.ts', () => ({ fetchCanvasStorageData: vi.fn() }))

const data: CanvasStorageData = {
  categories: [
    { id: 1, dashboardId: 10, name: 'Første' },
    { id: 2, dashboardId: 10, name: 'Andre' },
    { id: 3, dashboardId: 10, name: 'Tredje' },
  ],
  frames: [],
  connections: [],
}
const localFrame: CanvasFrame = {
  id: 'local',
  kind: 'text',
  label: 'Ulagret',
  textContent: 'Behold meg',
  x: 0,
  y: 0,
  refreshNonce: 0,
}

function setup(
  search = '?projectId=7&dashboardId=10&categoryId=2&other=keep#notes',
  mode: 'checking' | 'existing' = 'existing',
) {
  const beforeApply = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/canvas${search}`]}>{children}</MemoryRouter>
  )
  const hook = renderHook(
    ({ mode }) => {
      const location = useLocation()
      const navigate = useNavigate()
      const rawCategory = new URLSearchParams(location.search).get('categoryId')
      const [categories, setCategories] = useState<GraphCategoryDto[]>([])
      const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
      const [frames, setFrames] = useState<CanvasFrame[]>([])
      const [connections, setConnections] = useState<CanvasConnection[]>([])
      const [error, setError] = useState<string | null>(null)
      const loading = useCanvasDashboardData({
        projectId: 7,
        dashboardId: 10,
        mode,
        requestedCategoryId: rawCategory === null ? null : Number(rawCategory),
        categories,
        activeCategoryId,
        setCategories,
        setActiveCategoryId,
        setFrames,
        setConnections,
        setError,
        onBeforeApplyRemoteData: beforeApply,
      })
      return {
        location,
        navigate,
        activeCategoryId,
        setActiveCategoryId,
        frames,
        setFrames,
        connections,
        setConnections,
        setCategories,
        loading,
        error,
      }
    },
    { wrapper, initialProps: { mode } },
  )
  return { ...hook, beforeApply }
}

describe('canvas hydration and tab routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchCanvasStorageData).mockResolvedValue(data)
  })

  it('preserves the requested tab while checking and loading, including a newer request during loading', async () => {
    let finish!: (value: CanvasStorageData) => void
    vi.mocked(fetchCanvasStorageData).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { result, rerender } = setup(undefined, 'checking')
    expect(result.current.location.search).toContain('categoryId=2')
    expect(fetchCanvasStorageData).not.toHaveBeenCalled()
    rerender({ mode: 'existing' })
    expect(result.current.loading).toBe(true)
    expect(result.current.location.search).toContain('categoryId=2')

    await act(async () => {
      await result.current.navigate('/canvas?projectId=7&dashboardId=10&categoryId=3&other=keep#notes')
    })
    await act(async () => {
      finish(data)
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCategoryId).toBe(3)
    expect(result.current.location.search).toContain('categoryId=3')
    expect(fetchCanvasStorageData).toHaveBeenCalledTimes(1)
  })

  it('changes tabs and restores browser history without rehydrating or losing local frames and connections', async () => {
    const { result, beforeApply } = setup()
    await waitFor(() => expect(result.current.activeCategoryId).toBe(2))
    act(() => {
      result.current.setFrames([localFrame])
      result.current.setConnections([{ id: 'local-connection', fromFrameId: localFrame.id }])
      result.current.setActiveCategoryId(3)
    })
    await waitFor(() => expect(result.current.location.search).toContain('categoryId=3'))
    expect(result.current.location.search).toContain('other=keep')
    expect(result.current.location.hash).toBe('#notes')

    await act(async () => {
      await result.current.navigate('/canvas?projectId=7&dashboardId=10&other=keep#notes')
    })
    expect(result.current.activeCategoryId).toBe(1)
    expect(result.current.location.search).not.toContain('categoryId')
    await act(async () => {
      await result.current.navigate(-1)
    })
    expect(result.current.activeCategoryId).toBe(3)
    expect(result.current.frames).toEqual([localFrame])
    expect(result.current.connections).toEqual([{ id: 'local-connection', fromFrameId: localFrame.id }])
    expect(fetchCanvasStorageData).toHaveBeenCalledTimes(1)
    expect(beforeApply).toHaveBeenCalledTimes(1)
  })

  it('normalizes invalid tabs only after loading and falls back when a tab is removed', async () => {
    const { result } = setup('?projectId=7&dashboardId=10&categoryId=999')
    await waitFor(() => expect(result.current.activeCategoryId).toBe(1))
    expect(result.current.location.search).not.toContain('categoryId')
    act(() => result.current.setActiveCategoryId(2))
    await waitFor(() => expect(result.current.location.search).toContain('categoryId=2'))
    act(() => result.current.setCategories([data.categories[0]]))
    await waitFor(() => expect(result.current.activeCategoryId).toBe(1))
    expect(result.current.location.search).not.toContain('categoryId')
    expect(fetchCanvasStorageData).toHaveBeenCalledTimes(1)
  })

  it('does not erase a deep-linked tab when hydration fails', async () => {
    vi.mocked(fetchCanvasStorageData).mockRejectedValueOnce(new Error('Offline'))
    const { result, beforeApply } = setup()
    await waitFor(() => expect(result.current.error).toBe('Offline'))
    expect(result.current.location.search).toContain('categoryId=2')
    expect(beforeApply).not.toHaveBeenCalled()
  })
})
