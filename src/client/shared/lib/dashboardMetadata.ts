import type { DashboardDto, ProjectDto } from '../types/backend.ts'
import { requestJson } from './apiClient.ts'

// Session-only metadata shared by the dashboard browser and detail page. Reads
// still refresh from the server; this snapshot makes known destinations instant.
let projects: ProjectDto[] = []
const dashboardsByProject = new Map<number, DashboardDto[]>()

export const getCachedProjects = () => projects
export const getCachedDashboards = (projectId: number | null) =>
  projectId ? (dashboardsByProject.get(projectId) ?? []) : []

export function getCachedDashboardProjectId(dashboardId: number | null): number | null {
  if (!dashboardId) return null
  for (const [projectId, dashboards] of dashboardsByProject) {
    if (dashboards.some((dashboard) => dashboard.id === dashboardId)) return projectId
  }
  return null
}

export function clearDashboardMetadata() {
  projects = []
  dashboardsByProject.clear()
}

export async function fetchProjects(): Promise<ProjectDto[]> {
  const items = await requestJson<ProjectDto[]>('/api/backend/projects')
  projects = items
  for (const projectId of dashboardsByProject.keys()) {
    if (!items.some((project) => project.id === projectId)) dashboardsByProject.delete(projectId)
  }
  return items
}

export async function fetchDashboards(projectId: number): Promise<DashboardDto[]> {
  const items = await requestJson<DashboardDto[]>(`/api/backend/projects/${projectId}/dashboards`)
  // A dashboard can move between teams. Never leave its old owner cached.
  const ids = new Set(items.map((dashboard) => dashboard.id))
  for (const [otherProjectId, dashboards] of dashboardsByProject) {
    if (otherProjectId !== projectId) {
      dashboardsByProject.set(
        otherProjectId,
        dashboards.filter((dashboard) => !ids.has(dashboard.id)),
      )
    }
  }
  dashboardsByProject.set(projectId, items)
  return items
}

export async function createProject(name: string, description?: string): Promise<ProjectDto> {
  const project = await requestJson<ProjectDto>('/api/backend/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), description: description?.trim() || undefined }),
  })
  projects = [...projects, project]
  return project
}

export async function updateProject(projectId: number, name: string, description?: string): Promise<ProjectDto> {
  const project = await requestJson<ProjectDto>(`/api/backend/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  })
  projects = projects.map((item) => (item.id === projectId ? project : item))
  return project
}

export async function deleteProject(projectId: number): Promise<void> {
  await requestJson<void>(`/api/backend/projects/${projectId}`, { method: 'DELETE' })
  projects = projects.filter((project) => project.id !== projectId)
  dashboardsByProject.delete(projectId)
}

function rememberDashboard(dashboard: DashboardDto) {
  for (const [projectId, dashboards] of dashboardsByProject) {
    dashboardsByProject.set(
      projectId,
      dashboards.filter((item) => item.id !== dashboard.id),
    )
  }
  dashboardsByProject.set(dashboard.projectId, [...getCachedDashboards(dashboard.projectId), dashboard])
}

export async function createDashboard(projectId: number, name: string, description?: string): Promise<DashboardDto> {
  const dashboard = await requestJson<DashboardDto>(`/api/backend/projects/${projectId}/dashboards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), description: description?.trim() || undefined }),
  })
  rememberDashboard(dashboard)
  return dashboard
}

export async function updateDashboard(
  projectId: number,
  dashboardId: number,
  params: { name: string; projectId?: number; description?: string },
): Promise<DashboardDto> {
  const dashboard = await requestJson<DashboardDto>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  rememberDashboard(dashboard)
  return dashboard
}

export async function deleteDashboard(projectId: number, dashboardId: number): Promise<void> {
  await requestJson<void>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}`, { method: 'DELETE' })
  dashboardsByProject.set(
    projectId,
    getCachedDashboards(projectId).filter((dashboard) => dashboard.id !== dashboardId),
  )
}
