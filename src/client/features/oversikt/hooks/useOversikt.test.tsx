import { act, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDashboards, fetchProjects } from '../../projectmanager/api/backendApi.ts'
import { clearDashboardMetadata } from '../../../shared/lib/dashboardMetadata.ts'
import DashboardLayout from '../../dashboard/ui/DashboardLayout.tsx'
import { useOversikt } from './useOversikt.ts'

vi.mock('../../sidegroups/hooks/useSidegroupsForWebsite.ts', () => ({
  useSidegroupsForWebsite: () => ({ sidegroups: [], loading: false, error: null }),
}))

const teams = [
  { id: 1, name: 'Første team' },
  { id: 7, name: 'Team innsikt' },
]
const dashboards = [{ id: 12, projectId: 7, name: 'Besøk', description: 'Trafikk for teamet' }]

function renderDetail(onRender: (names: Array<string | undefined>) => void = () => {}) {
  function Detail() {
    const { selectedDashboard, selectedProject } = useOversikt()
    onRender([selectedProject?.name, selectedDashboard?.name])
    return (
      <DashboardLayout
        title={selectedDashboard?.name ?? 'Dashboard'}
        description={selectedDashboard?.description}
        team={selectedDashboard ? (selectedProject ?? undefined) : undefined}
        breadcrumbsLoading={!selectedDashboard || !selectedProject}
        showKontaktSection={false}
      >
        Grafer
      </DashboardLayout>
    )
  }

  return render(
    <MemoryRouter initialEntries={['/dashboard/12']}>
      <Routes>
        <Route path="/dashboard/:dashboardId" element={<Detail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('dashboard metadata handoff', () => {
  beforeEach(() => {
    clearDashboardMetadata()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearDashboardMetadata()
  })

  it('renders known names on the very first frame and keeps them throughout a slow background refresh', async () => {
    const fetch = vi.fn((url: string) => {
      if (url === '/api/backend/projects') return Promise.resolve(Response.json(teams))
      if (url === '/api/backend/projects/7/dashboards') return Promise.resolve(Response.json(dashboards))
      return Promise.resolve(Response.json([]))
    })
    vi.stubGlobal('fetch', fetch)

    // Same API used by the browser before its dashboard links become available.
    await fetchProjects()
    await fetchDashboards(1)
    await fetchDashboards(7)
    fetch.mockClear()

    let finishRefresh!: () => void
    const refresh = new Promise<void>((resolve) => {
      finishRefresh = resolve
    })
    fetch.mockImplementation(async (url: string) => {
      await refresh
      if (url === '/api/backend/projects') return Response.json(teams)
      if (url === '/api/backend/projects/7/dashboards') return Response.json(dashboards)
      return Response.json([])
    })

    const renders: Array<Array<string | undefined>> = []
    renderDetail((names) => renders.push(names))

    expect(renders[0]).toEqual(['Team innsikt', 'Besøk'])
    expect(screen.getByRole('heading', { name: 'Besøk' })).toBeVisible()
    expect(screen.getByText('Trafikk for teamet')).toBeVisible()
    const breadcrumb = screen.getByRole('navigation', { name: 'Brødsmulesti' })
    expect(
      within(breadcrumb)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Dashboard', 'Team innsikt', 'Besøk'])
    expect(screen.queryByTestId('dashboard-breadcrumb-placeholder')).not.toBeInTheDocument()

    await act(async () => {
      finishRefresh()
      await refresh
    })
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/backend/projects', undefined))
    expect(renders.every(([team, dashboard]) => team === 'Team innsikt' && dashboard === 'Besøk')).toBe(true)
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/dashboards')).map(([url]) => url)).toEqual([
      '/api/backend/projects/7/dashboards',
    ])
  })

  it('reserves breadcrumb space for cold links and reuses the owner lookup response', async () => {
    let finishProjects!: () => void
    const projectsReady = new Promise<void>((resolve) => {
      finishProjects = resolve
    })
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/backend/projects') {
        await projectsReady
        return Response.json(teams)
      }
      if (url === '/api/backend/projects/7/dashboards') return Response.json(dashboards)
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetch)
    renderDetail()

    expect(screen.getByTestId('dashboard-breadcrumb-placeholder')).toHaveClass('h-6')
    expect(screen.queryByRole('navigation', { name: 'Brødsmulesti' })).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboardvisning')).not.toBeInTheDocument()

    await act(async () => {
      finishProjects()
      await projectsReady
    })
    await screen.findByRole('heading', { name: 'Besøk' })
    expect(screen.queryByTestId('dashboard-breadcrumb-placeholder')).not.toBeInTheDocument()
    expect(fetch.mock.calls.filter(([url]) => url === '/api/backend/projects/7/dashboards')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Team innsikt' })).toHaveAttribute('href', '/dashboard?projectId=7')
  })
})
