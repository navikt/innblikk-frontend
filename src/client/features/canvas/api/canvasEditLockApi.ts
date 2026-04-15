import {
  createGraph,
  createQuery,
  deleteGraph,
  fetchCategories,
  fetchGraphs,
  fetchQueries,
  updateQuery,
} from '../../oversikt/api/oversiktApi.ts'

const CANVAS_LOCK_DASHBOARD_TOKEN = '[canvas-lock]'
const CANVAS_LOCK_QUERY_NAME = 'canvas-edit-lock'
const LOCK_TTL_MS = 15000

const opQueueByFrame = new Map<number, Promise<unknown>>()

const enqueueOp = <T>(frameGraphId: number, op: () => Promise<T>): Promise<T> => {
  const previous = opQueueByFrame.get(frameGraphId) ?? Promise.resolve()
  const nextTask = async () => {
    try {
      await previous
    } catch {
      // ignore previous errors
    }
    return await op()
  }
  const task = nextTask()
  opQueueByFrame.set(frameGraphId, task)
  return task
}

export type CanvasEditLockPayload = {
  frameGraphId: number
  ownerId: string
  ownerLabel: string
  expiresAt: string
  updatedAt: string
}

export type CanvasEditLockRecord = {
  categoryId: number
  lockGraphId: number
  lockQueryId?: number
  payload: CanvasEditLockPayload
}

const serializeCanvasEditLock = (payload: CanvasEditLockPayload): string => {
  const json = JSON.stringify(payload)
  const escaped = json.replace(/'/g, "''")
  return `SELECT '${escaped}' AS canvas_edit_lock`
}

const parseCanvasEditLock = (raw: string): CanvasEditLockPayload | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_edit_lock\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasEditLockPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (!Number.isFinite(parsed.frameGraphId)) return null
    if (typeof parsed.ownerId !== 'string' || !parsed.ownerId.trim()) return null
    if (typeof parsed.ownerLabel !== 'string' || !parsed.ownerLabel.trim()) return null
    if (typeof parsed.expiresAt !== 'string' || !parsed.expiresAt.trim()) return null
    if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt.trim()) return null
    return {
      frameGraphId: Number(parsed.frameGraphId),
      ownerId: parsed.ownerId.trim(),
      ownerLabel: parsed.ownerLabel.trim(),
      expiresAt: parsed.expiresAt,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

const hasLockToken = (description?: string): boolean =>
  (description || '').toLowerCase().split(/\s+/).includes(CANVAS_LOCK_DASHBOARD_TOKEN)

const buildCanvasLockGraphName = (frameGraphId: number): string => `canvas:lock:${frameGraphId}`.slice(0, 200)

const isNotExpired = (expiresAt: string, nowMs: number): boolean => {
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs
}

const findLockGraphInCategory = async (
  projectId: number,
  dashboardId: number,
  categoryId: number,
  frameGraphId: number,
): Promise<{ id: number; queryId?: number; payload: CanvasEditLockPayload | null } | null> => {
  const lockGraphName = buildCanvasLockGraphName(frameGraphId)
  const graphs = await fetchGraphs(projectId, dashboardId, categoryId)
  const lockGraph = graphs.find((graph) => hasLockToken(graph.description) && graph.name === lockGraphName)
  if (!lockGraph) return null

  const queries = await fetchQueries(projectId, dashboardId, categoryId, lockGraph.id)
  const lockQuery = queries.find((query) => query.name === CANVAS_LOCK_QUERY_NAME) ?? queries[0]
  const payload = lockQuery ? parseCanvasEditLock(lockQuery.sqlText) : null

  return {
    id: lockGraph.id,
    queryId: lockQuery?.id,
    payload,
  }
}

export const listCanvasEditLocks = async (projectId: number, dashboardId: number): Promise<CanvasEditLockRecord[]> => {
  const categories = await fetchCategories(projectId, dashboardId)
  const records: CanvasEditLockRecord[] = []

  for (const category of categories) {
    const graphs = await fetchGraphs(projectId, dashboardId, category.id)
    const lockGraphs = graphs.filter((graph) => graph.graphType === 'TEXT' && hasLockToken(graph.description))
    for (const graph of lockGraphs) {
      const queries = await fetchQueries(projectId, dashboardId, category.id, graph.id)
      const lockQuery = queries.find((query) => query.name === CANVAS_LOCK_QUERY_NAME) ?? queries[0]
      const payload = lockQuery ? parseCanvasEditLock(lockQuery.sqlText) : null
      if (!payload) continue
      records.push({
        categoryId: category.id,
        lockGraphId: graph.id,
        lockQueryId: lockQuery?.id,
        payload,
      })
    }
  }

  return records
}

export const acquireCanvasEditLock = async (params: {
  projectId: number
  dashboardId: number
  categoryId: number
  frameGraphId: number
  ownerId: string
  ownerLabel: string
}): Promise<{ ok: true; record: CanvasEditLockRecord } | { ok: false; lock: CanvasEditLockRecord | null }> => {
  return enqueueOp(params.frameGraphId, async () => {
    try {
      const { projectId, dashboardId, categoryId, frameGraphId, ownerId, ownerLabel } = params
      const now = Date.now()
      const nextPayload: CanvasEditLockPayload = {
        frameGraphId,
        ownerId,
        ownerLabel,
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + LOCK_TTL_MS).toISOString(),
      }

      const existing = await findLockGraphInCategory(projectId, dashboardId, categoryId, frameGraphId)
      if (!existing) {
        const createdGraph = await createGraph(projectId, dashboardId, categoryId, {
          name: buildCanvasLockGraphName(frameGraphId),
          graphType: 'TEXT',
          width: 100,
          description: CANVAS_LOCK_DASHBOARD_TOKEN,
        })
        const createdQuery = await createQuery(projectId, dashboardId, categoryId, createdGraph.id, {
          name: CANVAS_LOCK_QUERY_NAME,
          sqlText: serializeCanvasEditLock(nextPayload),
        })
        return {
          ok: true,
          record: {
            categoryId,
            lockGraphId: createdGraph.id,
            lockQueryId: createdQuery.id,
            payload: nextPayload,
          },
        }
      }

      const existingPayload = existing.payload
      const lockOwnedByCurrentEditor = existingPayload?.ownerId === ownerId
      const lockIsExpired = existingPayload ? !isNotExpired(existingPayload.expiresAt, now) : true
      if (!lockOwnedByCurrentEditor && !lockIsExpired && existingPayload) {
        return {
          ok: false,
          lock: {
            categoryId,
            lockGraphId: existing.id,
            lockQueryId: existing.queryId,
            payload: existingPayload,
          },
        }
      }

      if (existing.queryId) {
        await updateQuery(projectId, dashboardId, categoryId, existing.id, existing.queryId, {
          name: CANVAS_LOCK_QUERY_NAME,
          sqlText: serializeCanvasEditLock(nextPayload),
        })
        return {
          ok: true,
          record: {
            categoryId,
            lockGraphId: existing.id,
            lockQueryId: existing.queryId,
            payload: nextPayload,
          },
        }
      }

      const createdQuery = await createQuery(projectId, dashboardId, categoryId, existing.id, {
        name: CANVAS_LOCK_QUERY_NAME,
        sqlText: serializeCanvasEditLock(nextPayload),
      })

      return {
        ok: true,
        record: {
          categoryId,
          lockGraphId: existing.id,
          lockQueryId: createdQuery.id,
          payload: nextPayload,
        },
      }
    } catch (err) {
      console.warn('acquireCanvasEditLock failed:', err)
      return { ok: false, lock: null }
    }
  })
}

export const releaseCanvasEditLock = async (params: {
  projectId: number
  dashboardId: number
  categoryId: number
  frameGraphId: number
  ownerId: string
}): Promise<void> => {
  return enqueueOp(params.frameGraphId, async () => {
    try {
      const { projectId, dashboardId, categoryId, frameGraphId, ownerId } = params
      const existing = await findLockGraphInCategory(projectId, dashboardId, categoryId, frameGraphId)
      if (!existing) return
      if (existing.payload && existing.payload.ownerId !== ownerId) return
      await deleteGraph(projectId, dashboardId, categoryId, existing.id)
    } catch (err) {
      console.warn('releaseCanvasEditLock failed:', err)
    }
  })
}

export const isCanvasEditLockActive = (payload: CanvasEditLockPayload, nowMs: number = Date.now()): boolean =>
  isNotExpired(payload.expiresAt, nowMs)
