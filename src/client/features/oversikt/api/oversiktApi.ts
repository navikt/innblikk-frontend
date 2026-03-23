import type {
  ProjectDto,
  DashboardDto,
  GraphCategoryDto,
  GraphCategoryOrderingEntry,
  GraphDto,
  GraphOrderingEntry,
  QueryDto,
  QueryOrderingEntry,
  GraphType,
} from '../model/types.ts'

const toErrorMessage = (status: number, payload: unknown): string => {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error
    const details = (payload as { details?: unknown }).details
    if (typeof details === 'string' && details.trim()) return details
    if (typeof error === 'string' && error.trim()) return error
  }
  return `Foresporsel feilet (${status})`
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text()
  let payload: unknown = null

  if (text) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = { error: text }
    }
  }

  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, payload))
  }

  return payload as T
}

export async function fetchProjects(): Promise<ProjectDto[]> {
  return requestJson<ProjectDto[]>('/api/backend/projects')
}

export async function createProject(name: string, description?: string): Promise<ProjectDto> {
  return requestJson<ProjectDto>('/api/backend/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.trim(),
      description: description?.trim() || undefined,
    }),
  })
}

export async function fetchDashboards(projectId: number): Promise<DashboardDto[]> {
  return requestJson<DashboardDto[]>(`/api/backend/projects/${projectId}/dashboards`)
}

export async function createDashboard(projectId: number, name: string, description?: string): Promise<DashboardDto> {
  return requestJson<DashboardDto>(`/api/backend/projects/${projectId}/dashboards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.trim(),
      description: description?.trim() || undefined,
    }),
  })
}

export async function updateDashboard(
  projectId: number,
  dashboardId: number,
  params: { name: string; projectId?: number; description?: string },
): Promise<DashboardDto> {
  return requestJson<DashboardDto>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export async function deleteDashboard(projectId: number, dashboardId: number): Promise<void> {
  await requestJson<unknown>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}`, {
    method: 'DELETE',
  })
}

// ── Graph Categories ──

export async function fetchCategories(projectId: number, dashboardId: number): Promise<GraphCategoryDto[]> {
  return requestJson<GraphCategoryDto[]>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories`)
}

export async function createCategory(projectId: number, dashboardId: number, name: string): Promise<GraphCategoryDto> {
  return requestJson<GraphCategoryDto>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function updateCategory(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  params: { name: string },
): Promise<GraphCategoryDto> {
  return requestJson<GraphCategoryDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )
}

export async function deleteCategory(projectId: number, dashboardId: number, categoryId: number): Promise<void> {
  await requestJson<unknown>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}`, {
    method: 'DELETE',
  })
}

export async function updateCategoryOrdering(
  projectId: number,
  dashboardId: number,
  ordering: GraphCategoryOrderingEntry[],
): Promise<void> {
  await requestJson<void>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/ordering`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ordering),
  })
}

// ── Graphs ──

export async function fetchGraphs(projectId: number, dashboardId: number, categoryId: number): Promise<GraphDto[]> {
  return requestJson<GraphDto[]>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs`,
  )
}

export async function fetchQueries(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
): Promise<QueryDto[]> {
  return requestJson<QueryDto[]>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}/queries`,
  )
}

export async function createGraph(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  params: { name: string; graphType: GraphType; width?: number; description?: string },
): Promise<GraphDto> {
  return requestJson<GraphDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )
}

export async function createQuery(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
  params: { name: string; sqlText: string },
): Promise<QueryDto> {
  return requestJson<QueryDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}/queries`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )
}

export async function updateGraph(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
  params: { name: string; graphType: GraphType; width?: number; categoryId?: number; description?: string },
): Promise<GraphDto> {
  return requestJson<GraphDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )
}

export async function updateQuery(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
  queryId: number,
  params: { name: string; sqlText: string },
): Promise<QueryDto> {
  return requestJson<QueryDto>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}/queries/${queryId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )
}

export async function deleteQuery(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
  queryId: number,
): Promise<void> {
  await requestJson<unknown>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}/queries/${queryId}`,
    {
      method: 'DELETE',
    },
  )
}

export async function updateQueryOrdering(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
  ordering: QueryOrderingEntry[],
): Promise<void> {
  await requestJson<void>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}/queries/ordering`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ordering),
    },
  )
}

export async function deleteGraph(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  graphId: number,
): Promise<void> {
  await requestJson<unknown>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graphId}`,
    {
      method: 'DELETE',
    },
  )
}

export async function updateGraphOrdering(
  projectId: number,
  dashboardId: number,
  categoryId: number,
  ordering: GraphOrderingEntry[],
): Promise<void> {
  await requestJson<void>(
    `/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/ordering`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ordering),
    },
  )
}
