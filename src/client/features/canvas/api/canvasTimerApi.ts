import {
  createCategory,
  createGraph,
  createQuery,
  deleteGraph,
  fetchCategories,
  fetchGraphs,
  fetchQueries,
  updateQuery,
} from '../../oversikt/api/oversiktApi.ts'

const CANVAS_TIMER_DASHBOARD_TOKEN = '[canvas-timer]'
const CANVAS_TIMER_QUERY_NAME = 'canvas-timer'
const CANVAS_TIMER_GRAPH_NAME = 'canvas:timer'

export type CanvasTimerPayload = {
  durationSeconds: number
  startedAt: string
  endsAt: string
  updatedAt: string
  isPaused?: boolean
  pausedRemainingSeconds?: number
}

type CanvasTimerRecord = {
  categoryId: number
  graphId: number
  queryId?: number
  payload: CanvasTimerPayload
}

const hasTimerToken = (description?: string): boolean =>
  (description || '').toLowerCase().split(/\s+/).includes(CANVAS_TIMER_DASHBOARD_TOKEN)

const serializeCanvasTimer = (payload: CanvasTimerPayload): string => {
  const json = JSON.stringify(payload)
  const escaped = json.replace(/'/g, "''")
  return `SELECT '${escaped}' AS canvas_timer`
}

const parseCanvasTimer = (raw: string): CanvasTimerPayload | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_timer\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasTimerPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (!Number.isFinite(parsed.durationSeconds) || Number(parsed.durationSeconds) <= 0) return null
    if (typeof parsed.startedAt !== 'string' || !parsed.startedAt.trim()) return null
    if (typeof parsed.endsAt !== 'string' || !parsed.endsAt.trim()) return null
    if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt.trim()) return null

    const pausedRemainingSeconds = Number(parsed.pausedRemainingSeconds)
    return {
      durationSeconds: Math.max(1, Math.floor(Number(parsed.durationSeconds))),
      startedAt: parsed.startedAt,
      endsAt: parsed.endsAt,
      updatedAt: parsed.updatedAt,
      isPaused: typeof parsed.isPaused === 'boolean' ? parsed.isPaused : undefined,
      pausedRemainingSeconds:
        Number.isFinite(pausedRemainingSeconds) && pausedRemainingSeconds >= 0
          ? Math.floor(pausedRemainingSeconds)
          : undefined,
    }
  } catch {
    return null
  }
}

const listCanvasTimerRecords = async (projectId: number, dashboardId: number): Promise<CanvasTimerRecord[]> => {
  const categories = await fetchCategories(projectId, dashboardId)
  const records: CanvasTimerRecord[] = []

  for (const category of categories) {
    const graphs = await fetchGraphs(projectId, dashboardId, category.id)
    const timerGraphs = graphs.filter(
      (graph) =>
        graph.graphType === 'TEXT' && graph.name === CANVAS_TIMER_GRAPH_NAME && hasTimerToken(graph.description),
    )

    for (const graph of timerGraphs) {
      const queries = await fetchQueries(projectId, dashboardId, category.id, graph.id)
      const timerQuery = queries.find((query) => query.name === CANVAS_TIMER_QUERY_NAME) ?? queries[0]
      const payload = timerQuery ? parseCanvasTimer(timerQuery.sqlText) : null
      if (!payload) continue
      records.push({
        categoryId: category.id,
        graphId: graph.id,
        queryId: timerQuery?.id,
        payload,
      })
    }
  }

  return records
}

const getPrimaryCategoryId = async (projectId: number, dashboardId: number): Promise<number> => {
  const categories = await fetchCategories(projectId, dashboardId)
  if (categories[0]) return categories[0].id
  const created = await createCategory(projectId, dashboardId, 'Fane 1')
  return created.id
}

const pickNewestTimerRecord = (records: CanvasTimerRecord[]): CanvasTimerRecord | null => {
  if (records.length === 0) return null
  return [...records].sort((a, b) => Date.parse(b.payload.updatedAt) - Date.parse(a.payload.updatedAt))[0] ?? null
}

export const fetchCanvasTimer = async (projectId: number, dashboardId: number): Promise<CanvasTimerPayload | null> => {
  const records = await listCanvasTimerRecords(projectId, dashboardId)
  return pickNewestTimerRecord(records)?.payload ?? null
}

const persistCanvasTimerPayload = async (params: {
  projectId: number
  dashboardId: number
  payload: CanvasTimerPayload
}): Promise<CanvasTimerPayload> => {
  const { projectId, dashboardId, payload } = params

  const records = await listCanvasTimerRecords(projectId, dashboardId)
  const newestRecord = pickNewestTimerRecord(records)
  const categoryId = newestRecord?.categoryId ?? (await getPrimaryCategoryId(projectId, dashboardId))

  if (!newestRecord) {
    const createdGraph = await createGraph(projectId, dashboardId, categoryId, {
      name: CANVAS_TIMER_GRAPH_NAME,
      graphType: 'TEXT',
      width: 100,
      description: CANVAS_TIMER_DASHBOARD_TOKEN,
    })
    await createQuery(projectId, dashboardId, categoryId, createdGraph.id, {
      name: CANVAS_TIMER_QUERY_NAME,
      sqlText: serializeCanvasTimer(payload),
    })
  } else if (newestRecord.queryId) {
    await updateQuery(projectId, dashboardId, categoryId, newestRecord.graphId, newestRecord.queryId, {
      name: CANVAS_TIMER_QUERY_NAME,
      sqlText: serializeCanvasTimer(payload),
    })
  } else {
    await createQuery(projectId, dashboardId, categoryId, newestRecord.graphId, {
      name: CANVAS_TIMER_QUERY_NAME,
      sqlText: serializeCanvasTimer(payload),
    })
  }

  return payload
}

const getRunningRemainingSeconds = (payload: CanvasTimerPayload, nowMs: number): number => {
  const endsAtMs = Date.parse(payload.endsAt)
  if (!Number.isFinite(endsAtMs)) return 0
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
}

export const upsertCanvasTimer = async (params: {
  projectId: number
  dashboardId: number
  durationSeconds: number
}): Promise<CanvasTimerPayload> => {
  const { projectId, dashboardId, durationSeconds } = params
  const normalizedDurationSeconds = Math.max(1, Math.floor(durationSeconds))
  const now = new Date()
  const payload: CanvasTimerPayload = {
    durationSeconds: normalizedDurationSeconds,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + normalizedDurationSeconds * 1000).toISOString(),
    updatedAt: now.toISOString(),
    isPaused: false,
  }

  return persistCanvasTimerPayload({ projectId, dashboardId, payload })
}

export const pauseCanvasTimer = async (projectId: number, dashboardId: number): Promise<CanvasTimerPayload | null> => {
  const current = await fetchCanvasTimer(projectId, dashboardId)
  if (!current) return null
  if (current.isPaused) return current

  const now = Date.now()
  const remainingSeconds = getRunningRemainingSeconds(current, now)
  const nextPayload: CanvasTimerPayload = {
    ...current,
    updatedAt: new Date(now).toISOString(),
    isPaused: true,
    pausedRemainingSeconds: remainingSeconds,
  }
  return persistCanvasTimerPayload({ projectId, dashboardId, payload: nextPayload })
}

export const resumeCanvasTimer = async (projectId: number, dashboardId: number): Promise<CanvasTimerPayload | null> => {
  const current = await fetchCanvasTimer(projectId, dashboardId)
  if (!current) return null
  if (!current.isPaused) return current

  const now = Date.now()
  const remainingSeconds = Math.max(0, Math.floor(current.pausedRemainingSeconds ?? 0))
  const nextPayload: CanvasTimerPayload = {
    ...current,
    endsAt: new Date(now + remainingSeconds * 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    isPaused: false,
    pausedRemainingSeconds: undefined,
  }
  return persistCanvasTimerPayload({ projectId, dashboardId, payload: nextPayload })
}

export const adjustCanvasTimer = async (
  projectId: number,
  dashboardId: number,
  deltaSeconds: number,
): Promise<CanvasTimerPayload | null> => {
  const current = await fetchCanvasTimer(projectId, dashboardId)
  if (!current) return null

  const now = Date.now()
  const runningRemaining = getRunningRemainingSeconds(current, now)
  const pausedRemaining = Math.max(0, Math.floor(current.pausedRemainingSeconds ?? 0))
  const baseRemaining = current.isPaused ? pausedRemaining : runningRemaining
  const nextRemaining = Math.max(0, baseRemaining + Math.floor(deltaSeconds))

  const nextPayload: CanvasTimerPayload = {
    ...current,
    durationSeconds: Math.max(1, nextRemaining),
    updatedAt: new Date(now).toISOString(),
    isPaused: current.isPaused,
    pausedRemainingSeconds: current.isPaused ? nextRemaining : undefined,
    endsAt: current.isPaused ? current.endsAt : new Date(now + nextRemaining * 1000).toISOString(),
  }

  return persistCanvasTimerPayload({ projectId, dashboardId, payload: nextPayload })
}

export const clearCanvasTimer = async (projectId: number, dashboardId: number): Promise<void> => {
  const records = await listCanvasTimerRecords(projectId, dashboardId)
  if (records.length === 0) return

  await Promise.all(records.map((record) => deleteGraph(projectId, dashboardId, record.categoryId, record.graphId)))
}
