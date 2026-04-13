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

const CANVAS_DOT_VOTING_DASHBOARD_TOKEN = '[canvas-dot-voting]'
const CANVAS_DOT_VOTING_SESSION_QUERY_NAME = 'canvas-dot-voting-session'
const CANVAS_DOT_VOTING_BALLOT_QUERY_NAME = 'canvas-dot-voting-ballot'
const CANVAS_DOT_VOTING_SESSION_GRAPH_NAME = 'canvas:dot-voting:session'
const CANVAS_DOT_VOTING_BALLOT_GRAPH_PREFIX = 'canvas:dot-voting:ballot:'

export type CanvasDotVotingSessionPayload = {
  sessionId: string
  sectionGraphId: number
  durationSeconds: number
  votesPerParticipant: number
  startedAt: string
  endsAt: string
  updatedAt: string
  isPaused?: boolean
  pausedRemainingSeconds?: number
  status?: 'active' | 'ended'
}

export type CanvasDotVotingBallotPayload = {
  sessionId: string
  ownerId: string
  votesByFrameGraphId: Record<string, number>
  updatedAt: string
}

type CanvasDotVotingSessionRecord = {
  categoryId: number
  graphId: number
  queryId?: number
  payload: CanvasDotVotingSessionPayload
}

type CanvasDotVotingBallotRecord = {
  categoryId: number
  graphId: number
  queryId?: number
  payload: CanvasDotVotingBallotPayload
}

const hasDotVotingToken = (description?: string): boolean =>
  (description || '').toLowerCase().split(/\s+/).includes(CANVAS_DOT_VOTING_DASHBOARD_TOKEN)

const serializeCanvasDotVotingSession = (payload: CanvasDotVotingSessionPayload): string => {
  const json = JSON.stringify(payload)
  const escaped = json.replace(/'/g, "''")
  return `SELECT '${escaped}' AS canvas_dot_voting_session`
}

const serializeCanvasDotVotingBallot = (payload: CanvasDotVotingBallotPayload): string => {
  const json = JSON.stringify(payload)
  const escaped = json.replace(/'/g, "''")
  return `SELECT '${escaped}' AS canvas_dot_voting_ballot`
}

const normalizeVotesMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') return {}

  const entries = Object.entries(value as Record<string, unknown>)
  const next: Record<string, number> = {}

  entries.forEach(([frameGraphId, voteCount]) => {
    const numericVoteCount = Number(voteCount)
    const numericFrameGraphId = Number(frameGraphId)
    if (!Number.isFinite(numericFrameGraphId) || numericFrameGraphId <= 0) return
    if (!Number.isFinite(numericVoteCount) || numericVoteCount <= 0) return
    next[String(Math.floor(numericFrameGraphId))] = Math.floor(numericVoteCount)
  })

  return next
}

const parseCanvasDotVotingSession = (raw: string): CanvasDotVotingSessionPayload | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_dot_voting_session\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasDotVotingSessionPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.sessionId !== 'string' || !parsed.sessionId.trim()) return null
    if (!Number.isFinite(parsed.sectionGraphId) || Number(parsed.sectionGraphId) <= 0) return null
    if (!Number.isFinite(parsed.durationSeconds) || Number(parsed.durationSeconds) <= 0) return null
    if (!Number.isFinite(parsed.votesPerParticipant) || Number(parsed.votesPerParticipant) <= 0) return null
    if (typeof parsed.startedAt !== 'string' || !parsed.startedAt.trim()) return null
    if (typeof parsed.endsAt !== 'string' || !parsed.endsAt.trim()) return null
    if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt.trim()) return null

    const pausedRemainingSeconds = Number(parsed.pausedRemainingSeconds)
    return {
      sessionId: parsed.sessionId.trim(),
      sectionGraphId: Math.floor(Number(parsed.sectionGraphId)),
      durationSeconds: Math.max(1, Math.floor(Number(parsed.durationSeconds))),
      votesPerParticipant: Math.max(1, Math.floor(Number(parsed.votesPerParticipant))),
      startedAt: parsed.startedAt,
      endsAt: parsed.endsAt,
      updatedAt: parsed.updatedAt,
      isPaused: typeof parsed.isPaused === 'boolean' ? parsed.isPaused : undefined,
      pausedRemainingSeconds:
        Number.isFinite(pausedRemainingSeconds) && pausedRemainingSeconds >= 0
          ? Math.floor(pausedRemainingSeconds)
          : undefined,
      status: parsed.status === 'ended' ? 'ended' : 'active',
    }
  } catch {
    return null
  }
}

const parseCanvasDotVotingBallot = (raw: string): CanvasDotVotingBallotPayload | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_dot_voting_ballot\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasDotVotingBallotPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.sessionId !== 'string' || !parsed.sessionId.trim()) return null
    if (typeof parsed.ownerId !== 'string' || !parsed.ownerId.trim()) return null
    if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt.trim()) return null

    return {
      sessionId: parsed.sessionId.trim(),
      ownerId: parsed.ownerId.trim(),
      updatedAt: parsed.updatedAt,
      votesByFrameGraphId: normalizeVotesMap(parsed.votesByFrameGraphId),
    }
  } catch {
    return null
  }
}

const getPrimaryCategoryId = async (projectId: number, dashboardId: number): Promise<number> => {
  const categories = await fetchCategories(projectId, dashboardId)
  if (categories[0]) return categories[0].id
  const created = await createCategory(projectId, dashboardId, 'Fane 1')
  return created.id
}

const buildBallotGraphName = (ownerId: string): string =>
  `${CANVAS_DOT_VOTING_BALLOT_GRAPH_PREFIX}${ownerId}`.slice(0, 200)

const listDotVotingGraphs = async (projectId: number, dashboardId: number) => {
  const categories = await fetchCategories(projectId, dashboardId)
  const graphs: Array<{ categoryId: number; graphId: number; name: string }> = []

  for (const category of categories) {
    const categoryId = Number(category?.id)
    if (!Number.isFinite(categoryId)) continue

    const categoryGraphs = await fetchGraphs(projectId, dashboardId, categoryId)
    categoryGraphs
      .filter((graph) => graph.graphType === 'TEXT' && hasDotVotingToken(graph.description))
      .forEach((graph) => {
        graphs.push({
          categoryId,
          graphId: graph.id,
          name: String(graph.name || ''),
        })
      })
  }

  return graphs
}

const listDotVotingRecords = async (
  projectId: number,
  dashboardId: number,
): Promise<{
  sessions: CanvasDotVotingSessionRecord[]
  ballots: CanvasDotVotingBallotRecord[]
}> => {
  const categories = await fetchCategories(projectId, dashboardId)
  const sessions: CanvasDotVotingSessionRecord[] = []
  const ballots: CanvasDotVotingBallotRecord[] = []

  for (const category of categories) {
    const categoryId = Number(category?.id)
    if (!Number.isFinite(categoryId)) continue

    const graphs = await fetchGraphs(projectId, dashboardId, categoryId)
    const dotVotingGraphs = graphs.filter((graph) => graph.graphType === 'TEXT' && hasDotVotingToken(graph.description))

    for (const graph of dotVotingGraphs) {
      const queries = await fetchQueries(projectId, dashboardId, categoryId, graph.id)
      if (queries.length === 0) continue

      if (graph.name === CANVAS_DOT_VOTING_SESSION_GRAPH_NAME) {
        const sessionQuery = queries.find((query) => query.name === CANVAS_DOT_VOTING_SESSION_QUERY_NAME) ?? queries[0]
        const sessionPayload = parseCanvasDotVotingSession(sessionQuery?.sqlText || '')
        if (!sessionPayload) continue
        sessions.push({
          categoryId,
          graphId: graph.id,
          queryId: sessionQuery?.id,
          payload: sessionPayload,
        })
        continue
      }

      if (String(graph.name || '').startsWith(CANVAS_DOT_VOTING_BALLOT_GRAPH_PREFIX)) {
        const ballotQuery = queries.find((query) => query.name === CANVAS_DOT_VOTING_BALLOT_QUERY_NAME) ?? queries[0]
        const ballotPayload = parseCanvasDotVotingBallot(ballotQuery?.sqlText || '')
        if (!ballotPayload) continue
        ballots.push({
          categoryId,
          graphId: graph.id,
          queryId: ballotQuery?.id,
          payload: ballotPayload,
        })
      }
    }
  }

  return { sessions, ballots }
}

const pickNewestSession = (records: CanvasDotVotingSessionRecord[]): CanvasDotVotingSessionRecord | null => {
  if (records.length === 0) return null
  return [...records].sort((a, b) => Date.parse(b.payload.updatedAt) - Date.parse(a.payload.updatedAt))[0] ?? null
}

const persistSessionPayload = async (params: {
  projectId: number
  dashboardId: number
  payload: CanvasDotVotingSessionPayload
}): Promise<CanvasDotVotingSessionPayload> => {
  const { projectId, dashboardId, payload } = params

  const records = await listDotVotingRecords(projectId, dashboardId)
  const newestSessionRecord = pickNewestSession(records.sessions)
  const categoryId = newestSessionRecord?.categoryId ?? (await getPrimaryCategoryId(projectId, dashboardId))
  const sqlText = serializeCanvasDotVotingSession(payload)

  if (!newestSessionRecord) {
    const createdGraph = await createGraph(projectId, dashboardId, categoryId, {
      name: CANVAS_DOT_VOTING_SESSION_GRAPH_NAME,
      graphType: 'TEXT',
      width: 100,
      description: CANVAS_DOT_VOTING_DASHBOARD_TOKEN,
    })
    await createQuery(projectId, dashboardId, categoryId, createdGraph.id, {
      name: CANVAS_DOT_VOTING_SESSION_QUERY_NAME,
      sqlText,
    })
    return payload
  }

  if (newestSessionRecord.queryId) {
    await updateQuery(projectId, dashboardId, categoryId, newestSessionRecord.graphId, newestSessionRecord.queryId, {
      name: CANVAS_DOT_VOTING_SESSION_QUERY_NAME,
      sqlText,
    })
    return payload
  }

  await createQuery(projectId, dashboardId, categoryId, newestSessionRecord.graphId, {
    name: CANVAS_DOT_VOTING_SESSION_QUERY_NAME,
    sqlText,
  })
  return payload
}

const persistBallotPayload = async (params: {
  projectId: number
  dashboardId: number
  ownerId: string
  payload: CanvasDotVotingBallotPayload
}): Promise<CanvasDotVotingBallotPayload> => {
  const { projectId, dashboardId, ownerId, payload } = params
  const normalizedOwnerId = ownerId.trim()
  if (!normalizedOwnerId) return payload

  const records = await listDotVotingRecords(projectId, dashboardId)
  const normalizedBallotGraphName = buildBallotGraphName(normalizedOwnerId)
  const ballotRecord = records.ballots.find((record) => {
    return String(record.payload.ownerId || '').trim() === normalizedOwnerId
  })

  const categoryId = ballotRecord?.categoryId ?? (await getPrimaryCategoryId(projectId, dashboardId))
  const sqlText = serializeCanvasDotVotingBallot(payload)

  if (!ballotRecord) {
    const createdGraph = await createGraph(projectId, dashboardId, categoryId, {
      name: normalizedBallotGraphName,
      graphType: 'TEXT',
      width: 100,
      description: CANVAS_DOT_VOTING_DASHBOARD_TOKEN,
    })
    await createQuery(projectId, dashboardId, categoryId, createdGraph.id, {
      name: CANVAS_DOT_VOTING_BALLOT_QUERY_NAME,
      sqlText,
    })
    return payload
  }

  if (ballotRecord.queryId) {
    await updateQuery(projectId, dashboardId, categoryId, ballotRecord.graphId, ballotRecord.queryId, {
      name: CANVAS_DOT_VOTING_BALLOT_QUERY_NAME,
      sqlText,
    })
    return payload
  }

  await createQuery(projectId, dashboardId, categoryId, ballotRecord.graphId, {
    name: CANVAS_DOT_VOTING_BALLOT_QUERY_NAME,
    sqlText,
  })

  return payload
}

const getRunningRemainingSeconds = (payload: CanvasDotVotingSessionPayload, nowMs: number): number => {
  const endsAtMs = Date.parse(payload.endsAt)
  if (!Number.isFinite(endsAtMs)) return 0
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
}

export const fetchCanvasDotVoting = async (
  projectId: number,
  dashboardId: number,
): Promise<{
  session: CanvasDotVotingSessionPayload | null
  ballots: CanvasDotVotingBallotPayload[]
}> => {
  const records = await listDotVotingRecords(projectId, dashboardId)
  const session = pickNewestSession(records.sessions)?.payload ?? null
  if (!session) {
    return { session: null, ballots: [] }
  }

  const ballots = records.ballots
    .map((record) => record.payload)
    .filter((ballot) => ballot.sessionId === session.sessionId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

  return {
    session,
    ballots,
  }
}

export const startCanvasDotVoting = async (params: {
  projectId: number
  dashboardId: number
  sectionGraphId: number
  durationSeconds: number
  votesPerParticipant: number
}): Promise<CanvasDotVotingSessionPayload> => {
  const { projectId, dashboardId, sectionGraphId, durationSeconds, votesPerParticipant } = params
  const normalizedDurationSeconds = Math.max(1, Math.floor(durationSeconds))
  const normalizedVotesPerParticipant = Math.max(1, Math.floor(votesPerParticipant))
  const now = new Date()
  const sessionId = `dot-voting-${now.getTime()}`

  await clearCanvasDotVoting(projectId, dashboardId)

  const payload: CanvasDotVotingSessionPayload = {
    sessionId,
    sectionGraphId: Math.max(1, Math.floor(sectionGraphId)),
    durationSeconds: normalizedDurationSeconds,
    votesPerParticipant: normalizedVotesPerParticipant,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + normalizedDurationSeconds * 1000).toISOString(),
    updatedAt: now.toISOString(),
    isPaused: false,
    status: 'active',
  }

  return persistSessionPayload({
    projectId,
    dashboardId,
    payload,
  })
}

export const pauseCanvasDotVoting = async (
  projectId: number,
  dashboardId: number,
): Promise<CanvasDotVotingSessionPayload | null> => {
  const current = await fetchCanvasDotVoting(projectId, dashboardId)
  if (!current.session) return null
  if (current.session.isPaused) return current.session

  const now = Date.now()
  const remainingSeconds = getRunningRemainingSeconds(current.session, now)
  const nextPayload: CanvasDotVotingSessionPayload = {
    ...current.session,
    updatedAt: new Date(now).toISOString(),
    isPaused: true,
    pausedRemainingSeconds: remainingSeconds,
  }

  return persistSessionPayload({ projectId, dashboardId, payload: nextPayload })
}

export const resumeCanvasDotVoting = async (
  projectId: number,
  dashboardId: number,
): Promise<CanvasDotVotingSessionPayload | null> => {
  const current = await fetchCanvasDotVoting(projectId, dashboardId)
  if (!current.session) return null
  if (!current.session.isPaused) return current.session

  const now = Date.now()
  const remainingSeconds = Math.max(0, Math.floor(current.session.pausedRemainingSeconds ?? 0))
  const nextPayload: CanvasDotVotingSessionPayload = {
    ...current.session,
    endsAt: new Date(now + remainingSeconds * 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    isPaused: false,
    pausedRemainingSeconds: undefined,
  }

  return persistSessionPayload({ projectId, dashboardId, payload: nextPayload })
}

export const adjustCanvasDotVoting = async (
  projectId: number,
  dashboardId: number,
  deltaSeconds: number,
): Promise<CanvasDotVotingSessionPayload | null> => {
  const current = await fetchCanvasDotVoting(projectId, dashboardId)
  if (!current.session) return null

  const now = Date.now()
  const runningRemaining = getRunningRemainingSeconds(current.session, now)
  const pausedRemaining = Math.max(0, Math.floor(current.session.pausedRemainingSeconds ?? 0))
  const baseRemaining = current.session.isPaused ? pausedRemaining : runningRemaining
  const nextRemaining = Math.max(0, baseRemaining + Math.floor(deltaSeconds))

  const nextPayload: CanvasDotVotingSessionPayload = {
    ...current.session,
    durationSeconds: Math.max(1, nextRemaining),
    updatedAt: new Date(now).toISOString(),
    isPaused: current.session.isPaused,
    pausedRemainingSeconds: current.session.isPaused ? nextRemaining : undefined,
    endsAt: current.session.isPaused ? current.session.endsAt : new Date(now + nextRemaining * 1000).toISOString(),
  }

  return persistSessionPayload({ projectId, dashboardId, payload: nextPayload })
}

export const endCanvasDotVoting = async (
  projectId: number,
  dashboardId: number,
): Promise<CanvasDotVotingSessionPayload | null> => {
  const current = await fetchCanvasDotVoting(projectId, dashboardId)
  if (!current.session) return null

  const nowIso = new Date().toISOString()
  const nextPayload: CanvasDotVotingSessionPayload = {
    ...current.session,
    updatedAt: nowIso,
    endsAt: nowIso,
    isPaused: true,
    pausedRemainingSeconds: 0,
    status: 'ended',
  }

  return persistSessionPayload({ projectId, dashboardId, payload: nextPayload })
}

export const clearCanvasDotVoting = async (projectId: number, dashboardId: number): Promise<void> => {
  const graphs = await listDotVotingGraphs(projectId, dashboardId)
  if (graphs.length === 0) return

  await Promise.all(graphs.map((graph) => deleteGraph(projectId, dashboardId, graph.categoryId, graph.graphId)))
}

export const upsertCanvasDotVotingBallot = async (params: {
  projectId: number
  dashboardId: number
  ownerId: string
  sessionId: string
  votesByFrameGraphId: Record<string, number>
}): Promise<CanvasDotVotingBallotPayload> => {
  const { projectId, dashboardId, ownerId, sessionId, votesByFrameGraphId } = params

  const payload: CanvasDotVotingBallotPayload = {
    ownerId: ownerId.trim(),
    sessionId,
    votesByFrameGraphId: normalizeVotesMap(votesByFrameGraphId),
    updatedAt: new Date().toISOString(),
  }

  return persistBallotPayload({ projectId, dashboardId, ownerId, payload })
}
