/**
 * Shared DTO types for the /api/backend REST endpoints
 * (projects, dashboards, graph categories, graphs, queries).
 */

export type ProjectDto = {
  id: number
  name: string
  description?: string
  updatedAt?: string
}

export type DashboardDto = {
  id: number
  projectId: number
  name: string
  description?: string
  updatedAt?: string
}

export type GraphCategoryDto = {
  id: number
  dashboardId: number
  name: string
  ordering?: number
  updatedAt?: string
}

export type GraphCategoryOrderingEntry = {
  id: number
  ordering: number
}

export type GraphDto = {
  id: number
  categoryId: number
  name: string
  description?: string
  graphType?: string
  width?: number
  ordering?: number
  updatedAt?: string
}

export type GraphOrderingEntry = {
  id: number
  ordering: number
}

export type QueryDto = {
  id: number
  graphId: number
  name: string
  sqlText: string
  ordering?: number
  updatedAt?: string
  version?: number
}

export type QueryOrderingEntry = {
  id: number
  ordering: number
}
