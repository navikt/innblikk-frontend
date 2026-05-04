import type { ProjectDto, DashboardDto, GraphCategoryDto, GraphDto, QueryDto } from '../../../shared/types/backend.ts'
import { requestJson } from '../../../shared/lib/apiClient.ts'

type SaveChartParams = {
  projectName: string
  dashboardName: string
  graphName: string
  queryName: string
  graphType: string
  sqlText: string
  categoryId?: number
}

type SaveChartResult = {
  project: ProjectDto
  dashboard: DashboardDto
  graph: GraphDto
  query: QueryDto
}

const COLUMN_TOO_LONG_RE = /too long for the column/i
const stripTrailingSemicolon = (sql: string): string =>
  sql
    .trim()
    .replace(/;+\s*$/, '')
    .trim()

const findByName = <T extends { name: string }>(items: T[], name: string): T | undefined => {
  const needle = name.trim().toLowerCase()
  return items.find((item) => item.name.trim().toLowerCase() === needle)
}

const compactSqlForStorage = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

export async function fetchProjects(): Promise<ProjectDto[]> {
  return requestJson<ProjectDto[]>('/api/backend/projects')
}

export async function fetchDashboards(projectId: number): Promise<DashboardDto[]> {
  return requestJson<DashboardDto[]>(`/api/backend/projects/${projectId}/dashboards`)
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

export async function fetchCategories(projectId: number, dashboardId: number): Promise<GraphCategoryDto[]> {
  return requestJson<GraphCategoryDto[]>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories`)
}

export async function createCategory(projectId: number, dashboardId: number, name: string): Promise<GraphCategoryDto> {
  return requestJson<GraphCategoryDto>(`/api/backend/projects/${projectId}/dashboards/${dashboardId}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  })
}

export async function saveChartToBackend(params: SaveChartParams): Promise<SaveChartResult> {
  const projects = await fetchProjects()
  const existingProject = findByName(projects, params.projectName)

  const project =
    existingProject ??
    (await requestJson<ProjectDto>('/api/backend/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.projectName.trim(),
        description: 'Opprettet fra Grafbyggeren',
      }),
    }))

  const dashboards = await fetchDashboards(project.id)
  const existingDashboard = findByName(dashboards, params.dashboardName)

  const dashboard =
    existingDashboard ??
    (await requestJson<DashboardDto>(`/api/backend/projects/${project.id}/dashboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.dashboardName.trim(),
        description: 'Opprettet fra Grafbyggeren',
      }),
    }))

  const categories = await fetchCategories(project.id, dashboard.id)
  const resolvedCategory =
    (params.categoryId ? categories.find((category) => category.id === params.categoryId) : null) ??
    categories[0] ??
    (await createCategory(project.id, dashboard.id, 'Fane 1'))

  const graph = await requestJson<GraphDto>(
    `/api/backend/projects/${project.id}/dashboards/${dashboard.id}/categories/${resolvedCategory.id}/graphs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.graphName.trim(),
        graphType: params.graphType.trim(),
      }),
    },
  )

  const normalizedSqlText = stripTrailingSemicolon(params.sqlText)
  const sqlCandidates = Array.from(new Set([normalizedSqlText, compactSqlForStorage(normalizedSqlText)])).filter(
    Boolean,
  )

  let query: QueryDto | null = null

  for (const sqlText of sqlCandidates) {
    try {
      query = await requestJson<QueryDto>(
        `/api/backend/projects/${project.id}/dashboards/${dashboard.id}/categories/${resolvedCategory.id}/graphs/${graph.id}/queries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: params.queryName.trim(),
            sqlText,
          }),
        },
      )
      break
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Failed to create query')
      if (!COLUMN_TOO_LONG_RE.test(error.message)) {
        throw error
      }
    }
  }

  if (!query) {
    const originalLen = normalizedSqlText.length
    const compactLen = compactSqlForStorage(normalizedSqlText).length
    throw new Error(
      `Backend rejected query length (${originalLen} chars; compact ${compactLen}). ` +
        `Please shorten the query or increase backend column size for stored SQL.`,
    )
  }

  return { project, dashboard, graph, query }
}

export type { ProjectDto, DashboardDto, GraphCategoryDto, SaveChartParams, SaveChartResult }
