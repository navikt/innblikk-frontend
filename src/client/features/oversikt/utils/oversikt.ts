import type { SavedChart, GraphType } from '../model/types.ts'

const getHostPrefix = (): string => {
  if (typeof window === 'undefined') return 'server'
  return window.location.hostname.replace(/\./g, '_')
}

const getLastProjectIdKey = (): string => `oversikt_last_project_id_${getHostPrefix()}`
const getLastDashboardIdKey = (): string => `oversikt_last_dashboard_id_${getHostPrefix()}`

export const parseId = (value: string | null): number | null => {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

export const mapGraphTypeToChart = (graphType?: string): SavedChart['type'] => {
  if (graphType === 'LINE') return 'line'
  if (graphType === 'BAR') return 'bar'
  if (graphType === 'PIE') return 'pie'
  if (graphType === 'TABLE') return 'table'
  if (graphType === 'TEXT') return 'text'
  return 'table'
}

export const normalizeGraphType = (graphType?: string): GraphType => {
  if (
    graphType === 'LINE' ||
    graphType === 'BAR' ||
    graphType === 'PIE' ||
    graphType === 'TABLE' ||
    graphType === 'TEXT'
  ) {
    return graphType
  }
  return 'TABLE'
}

export const getLastOversiktProjectId = (): number | null => {
  if (typeof window === 'undefined') return null
  return parseId(window.localStorage.getItem(getLastProjectIdKey()))
}

export const getLastOversiktDashboardId = (): number | null => {
  if (typeof window === 'undefined') return null
  return parseId(window.localStorage.getItem(getLastDashboardIdKey()))
}

export const saveLastOversiktProjectId = (projectId: number | null) => {
  if (typeof window === 'undefined') return
  if (projectId) {
    window.localStorage.setItem(getLastProjectIdKey(), String(projectId))
  } else {
    window.localStorage.removeItem(getLastProjectIdKey())
  }
}

export const saveLastOversiktDashboardId = (dashboardId: number | null) => {
  if (typeof window === 'undefined') return
  if (dashboardId) {
    window.localStorage.setItem(getLastDashboardIdKey(), String(dashboardId))
  } else {
    window.localStorage.removeItem(getLastDashboardIdKey())
  }
}
