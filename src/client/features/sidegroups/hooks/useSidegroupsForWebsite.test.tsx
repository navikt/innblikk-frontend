import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listSidegroupsMock } = vi.hoisted(() => ({
  listSidegroupsMock: vi.fn(),
}))

vi.mock('../api/sidegroupsApi.ts', () => ({
  listSidegroups: listSidegroupsMock,
}))

import { useSidegroupsForWebsite } from './useSidegroupsForWebsite.ts'

const groups = [
  { id: '1', name: 'A', websiteId: 'site-a', include: ['/a'] },
  { id: '2', name: 'B', websiteId: 'site-b', include: ['/b'] },
]

describe('useSidegroupsForWebsite', () => {
  beforeEach(() => {
    listSidegroupsMock.mockReset()
  })

  it('only exposes groups for the requested website', async () => {
    listSidegroupsMock.mockResolvedValue(groups)
    const { result, rerender } = renderHook(({ websiteId }) => useSidegroupsForWebsite(websiteId), {
      initialProps: { websiteId: 'site-a' },
    })

    await waitFor(() => expect(result.current.sidegroups).toEqual([groups[0]]))

    rerender({ websiteId: 'site-b' })
    expect(result.current.sidegroups).toEqual([])
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.sidegroups).toEqual([groups[1]]))
  })

  it('reports a failed lookup instead of treating it as an empty result', async () => {
    listSidegroupsMock.mockRejectedValue(new Error('unavailable'))
    const { result } = renderHook(() => useSidegroupsForWebsite('site-a'))

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.sidegroups).toEqual([])
    expect(result.current.loading).toBe(false)
  })
})
