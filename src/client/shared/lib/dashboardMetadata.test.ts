import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDashboardMetadata,
  deleteDashboard,
  deleteProject,
  fetchDashboards,
  fetchProjects,
  getCachedDashboardProjectId,
  getCachedDashboards,
  getCachedProjects,
  updateDashboard,
  updateProject,
} from './dashboardMetadata.ts'

const teams = [
  { id: 7, name: 'Team innsikt' },
  { id: 8, name: 'Annet team' },
]
const dashboard = { id: 12, projectId: 7, name: 'Besøk' }

describe('shared dashboard metadata', () => {
  beforeEach(() => {
    clearDashboardMetadata()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(Response.json(url.endsWith('/dashboards') ? [dashboard] : teams))),
    )
  })

  afterEach(() => {
    clearDashboardMetadata()
    vi.unstubAllGlobals()
  })

  it('keeps metadata available while refreshing and retains it on network failure', async () => {
    await fetchProjects()
    await fetchDashboards(7)
    expect(getCachedProjects()).toEqual(teams)
    expect(getCachedDashboardProjectId(12)).toBe(7)

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Offline'))
    await expect(fetchDashboards(7)).rejects.toThrow('Offline')
    expect(getCachedDashboards(7)).toEqual([dashboard])
  })

  it('updates renamed teams and moved dashboards without retaining the old owner', async () => {
    await fetchProjects()
    await fetchDashboards(7)
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...teams[0], name: 'Nytt teamnavn' }))
    await updateProject(7, 'Nytt teamnavn')
    expect(getCachedProjects()[0].name).toBe('Nytt teamnavn')

    const moved = { ...dashboard, projectId: 8, name: 'Nytt dashboardnavn' }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(moved))
    await updateDashboard(7, 12, { name: moved.name, projectId: 8 })
    expect(getCachedDashboards(7)).toEqual([])
    expect(getCachedDashboards(8)).toEqual([moved])
    expect(getCachedDashboardProjectId(12)).toBe(8)
  })

  it('removes deleted dashboards and teams from the snapshot', async () => {
    await fetchProjects()
    await fetchDashboards(7)
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteDashboard(7, 12)
    expect(getCachedDashboardProjectId(12)).toBeNull()

    await fetchDashboards(7)
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteProject(7)
    expect(getCachedProjects()).toEqual([teams[1]])
    expect(getCachedDashboards(7)).toEqual([])
  })
})
