import type {
  ProjectDto,
  DashboardDto,
  GraphCategoryDto,
  GraphCategoryOrderingEntry,
  GraphDto,
  GraphOrderingEntry,
  QueryDto,
} from '../model/types.ts'
import { requestJson } from '../../../shared/lib/apiClient.ts'

// ── Projects ──

export const fetchProjects = (): Promise<ProjectDto[]> => requestJson<ProjectDto[]>('/api/backend/projects')

export const createProject = (name: string, description?: string): Promise<ProjectDto> =>
  requestJson<ProjectDto>('/api/backend/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  })

export const updateProject = (projectId: number, name: string, description?: string): Promise<ProjectDto> =>
  requestJson<ProjectDto>(`/api/backend/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  })

export const deleteProject = (projectId: number): Promise<void> =>
  requestJson<void>(`/api/backend/projects/${projectId}`, {
    method: 'DELETE',
  })

// ── Dashboards ──

export const fetchDashboards = (projectId: number): Promise<DashboardDto[]> =>
  requestJson<DashboardDto[]>(`/api/backend/projects/${projectId}/dashboards`)

export const createDashboard = (projectId: number, name: string, description?: string): Promise<DashboardDto> =>
  requestJson<DashboardDto>(`/api/backend/projects/${projectId}/dashboards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  })

export const updateDashboard = (
  projectId: number,
  dashboardId: number,
  params: { name: string; projectId?: number; description?: string },
): Promise<DashboardDto> =>
  requestJson<DashboardDto>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

export const deleteDashboard = (projectId: number, dashboardId: number): Promise<void> =>
  requestJson<void>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}`, {
    method: 'DELETE',
  })

// ── Graph Categories ──

export const fetchCategories = (projectId: number, dashboardId: number): Promise<GraphCategoryDto[]> =>
  requestJson<GraphCategoryDto[]>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories`)

export const createCategory = (projectId: number, dashboardId: number, name: string): Promise<GraphCategoryDto> =>
  requestJson<GraphCategoryDto>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const updateCategory = (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  params: { name: string },
): Promise<GraphCategoryDto> =>
  requestJson<GraphCategoryDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )

export const deleteCategory = (projectId: number, dashboardId: number, categoryId: number): Promise<void> =>
  requestJson<void>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}`, {
    method: 'DELETE',
  })

export const updateCategoryOrdering = (
  projectId: number,
  dashboardId: number,
  ordering: GraphCategoryOrderingEntry[],
): Promise<void> =>
  requestJson<void>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/ordering`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ordering),
  })

// ── Graphs ──

export const fetchGraphs = (projectId: number, dashboardId: number, categoryId: number): Promise<GraphDto[]> =>
  requestJson<GraphDto[]>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs`,
  )

export const deleteGraph = (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
): Promise<void> =>
  requestJson<void>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}`,
    {
      method: 'DELETE',
    },
  )

export const updateGraph = (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
  params: { name: string; graphType: string; width?: number },
): Promise<GraphDto> =>
  requestJson<GraphDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )

export const createGraph = (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  params: { name: string; graphType: string; width?: number },
): Promise<GraphDto> =>
  requestJson<GraphDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )

export const updateGraphOrdering = (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  ordering: GraphOrderingEntry[],
): Promise<void> =>
  requestJson<void>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/ordering`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ordering),
    },
  )

// ── Queries ──

export const fetchQueries = (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
): Promise<QueryDto[]> =>
  requestJson<QueryDto[]>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}/queries`,
  )

export const createQuery = (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
  name: string,
  sqlText: string,
): Promise<QueryDto> =>
  requestJson<QueryDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}/queries`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sqlText }),
    },
  )

export const updateQuery = (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
  queryId: number,
  name: string,
  sqlText: string,
): Promise<QueryDto> =>
  requestJson<QueryDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}/queries/${queryId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sqlText }),
    },
  )
