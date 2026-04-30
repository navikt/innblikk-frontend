import express from 'express'
import { authenticateUser } from '../../middleware/authenticateUser.js'
import { loadOasis } from '../../middleware/authUtils.js'

export function createBackendProxyRouter({ BACKEND_BASE_URL }) {
  const router = express.Router()
  const apiBaseUrl = new URL('/api/', BACKEND_BASE_URL)
  const CANVAS_DASHBOARD_TOKEN = '[canvas]'
  const CANVAS_QUERY_NAME = 'canvas-config'
  const CANVAS_PRESENCE_DASHBOARD_TOKEN = '[canvas-presence]'
  const CANVAS_PRESENCE_QUERY_NAME = 'canvas-presence'
  const CANVAS_PRESENCE_GRAPH_PREFIX = 'canvas:presence:'
  const CANVAS_PRESENCE_TTL_MS = 60000
  const isLocalDev = process.env.NODE_ENV !== 'production'
  const isLocalBackend = ['localhost', '127.0.0.1', '::1'].includes(apiBaseUrl.hostname)
  const staticBackendToken = process.env.BACKEND_TOKEN || null
  const backendAppName = process.env.BACKEND_APP_NAME || null
  const backendClientId = process.env.BACKEND_CLIENT_ID || process.env.START_UMAMI_BACKEND_CLIENT_ID || null
  const naisCluster = process.env.NAIS_CLUSTER_NAME || null
  const naisNamespace = process.env.NAIS_NAMESPACE || null
  const backendServiceName = backendAppName || apiBaseUrl.hostname.split('.')[0] || null
  const derivedNaisOboScope =
    naisCluster && naisNamespace && backendServiceName
      ? `api://${naisCluster}.${naisNamespace}.${backendServiceName}/.default`
      : null

  const tokenUrl =
    process.env.BACKEND_TOKEN_URL ||
    (isLocalDev ? 'http://localhost:8080/issueissue/token' : null) ||
    (isLocalBackend ? new URL('/issueissue/token', BACKEND_BASE_URL).toString() : null)
  const tokenUrls = (() => {
    if (!tokenUrl) return []
    const urls = [tokenUrl]
    if (isLocalDev && tokenUrl.startsWith('http://localhost:')) {
      urls.push(tokenUrl.replace('http://localhost:', 'http://host.docker.internal:'))
    }
    return [...new Set(urls)]
  })()
  const usesLocalIssueissueTokenUrl = tokenUrl?.includes('/issueissue/token')
  const tokenClientId = process.env.BACKEND_TOKEN_CLIENT_ID || (usesLocalIssueissueTokenUrl ? 'start-umami' : null)
  const tokenClientSecret = process.env.BACKEND_TOKEN_CLIENT_SECRET || (usesLocalIssueissueTokenUrl ? 'unused' : null)
  const tokenAudience = process.env.BACKEND_TOKEN_AUDIENCE || (usesLocalIssueissueTokenUrl ? 'start-umami' : null)
  const oboScope =
    process.env.BACKEND_OBO_SCOPE ||
    (backendClientId ? `api://${backendClientId}/.default` : null) ||
    derivedNaisOboScope

  let cachedToken = null
  let cachedTokenExpiresAt = 0

  const getServiceToken = async () => {
    const now = Date.now()
    if (cachedToken && cachedTokenExpiresAt > now + 10000) {
      return cachedToken
    }

    if (!tokenUrls.length || !tokenClientId || !tokenClientSecret || !tokenAudience) return null

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: tokenClientId,
      client_secret: tokenClientSecret,
      audience: tokenAudience,
    })

    let lastError = null
    let payload = null
    for (const url of tokenUrls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        })
        payload = await response.json()
        if (!response.ok || !payload?.access_token) {
          throw new Error(`Failed to fetch backend token (${response.status}) from ${url}`)
        }
        break
      } catch (err) {
        lastError = err
      }
    }
    if (!payload?.access_token) {
      throw lastError || new Error('Failed to fetch backend token')
    }

    const expiresIn = Number(payload.expires_in ?? 60)
    cachedToken = String(payload.access_token)
    cachedTokenExpiresAt = Date.now() + Math.max(expiresIn - 10, 5) * 1000
    return cachedToken
  }

  const getOboToken = async (req) => {
    if (!oboScope) return null

    const { oasis } = await loadOasis()
    if (
      !oasis ||
      typeof oasis.requestOboToken !== 'function' ||
      typeof oasis.getToken !== 'function' ||
      typeof oasis.validateToken !== 'function'
    )
      return null

    const userToken = oasis.getToken(req)
    if (!userToken) return null

    const validation = await oasis.validateToken(userToken)
    if (!validation.ok) return null

    const result = await oasis.requestOboToken(userToken, oboScope)
    if (!result.ok || !result.token) throw new Error('Failed to exchange OBO token for backend')

    return result.token
  }

  const resolveAuthorizationHeader = async (req) => {
    const oboToken = await getOboToken(req)
    let serviceToken = null
    if (!req.headers.authorization && !oboToken) {
      try {
        serviceToken = await getServiceToken()
      } catch (tokenErr) {
        console.warn('Failed to fetch service token, falling back if possible:', tokenErr)
      }
    }
    const staticAuthorization =
      staticBackendToken && !req.headers.authorization && !oboToken && !serviceToken
        ? staticBackendToken.toLowerCase().startsWith('bearer ')
          ? staticBackendToken
          : `Bearer ${staticBackendToken}`
        : null

    return (
      (oboToken ? `Bearer ${oboToken}` : undefined) ||
      req.headers.authorization ||
      (serviceToken ? `Bearer ${serviceToken}` : undefined) ||
      staticAuthorization
    )
  }

  const backendFetchJson = async ({ req, targetPath, method = 'GET', body }) => {
    const targetUrl = new URL(targetPath, apiBaseUrl)
    const authorization = await resolveAuthorizationHeader(req)
    const forwardHeaders = {
      accept: 'application/json',
      authorization,
      'content-type': body ? 'application/json' : undefined,
    }

    const response = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
    }
    if (!response.ok) {
      const details =
        (payload && typeof payload === 'object' && payload.details) ||
        (payload && typeof payload === 'object' && payload.error) ||
        response.statusText
      throw new Error(`Backend request failed (${response.status}): ${String(details || 'unknown')}`)
    }
    return payload
  }

  const isCanvasStorageGraph = (description) =>
    String(description || '')
      .toLowerCase()
      .split(/\s+/)
      .includes(CANVAS_DASHBOARD_TOKEN)

  const hasCanvasPresenceToken = (description) =>
    String(description || '')
      .toLowerCase()
      .split(/\s+/)
      .includes(CANVAS_PRESENCE_DASHBOARD_TOKEN)

  const buildCanvasPresenceGraphName = (clientId) => `${CANVAS_PRESENCE_GRAPH_PREFIX}${clientId}`.slice(0, 200)

  const serializeCanvasPresence = (payload) => {
    const json = JSON.stringify(payload)
    const escaped = json.replace(/'/g, "''").replace(/;/g, '\\u003B')
    return `SELECT '${escaped}' AS canvas_presence`
  }

  const parseCanvasPresence = (raw) => {
    if (!raw || typeof raw !== 'string') return null
    const trimmed = raw.trim()
    const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_presence\s*;?\s*$/i)
    const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed

    try {
      const parsed = JSON.parse(jsonCandidate)
      if (!parsed || typeof parsed !== 'object') return null
      if (typeof parsed.clientId !== 'string' || !parsed.clientId.trim()) return null
      if (typeof parsed.ownerId !== 'string' || !parsed.ownerId.trim()) return null
      if (typeof parsed.ownerLabel !== 'string' || !parsed.ownerLabel.trim()) return null
      if (typeof parsed.expiresAt !== 'string' || !parsed.expiresAt.trim()) return null
      if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt.trim()) return null
      return {
        clientId: parsed.clientId.trim(),
        ownerId: parsed.ownerId.trim(),
        ownerLabel: parsed.ownerLabel.trim(),
        expiresAt: parsed.expiresAt,
        updatedAt: parsed.updatedAt,
      }
    } catch {
      return null
    }
  }

  const getPrimaryCanvasCategoryId = async ({ req, projectId, dashboardId }) => {
    const categories = await backendFetchJson({
      req,
      targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories`,
    })
    if (Array.isArray(categories) && categories[0]?.id) return Number(categories[0].id)
    const created = await backendFetchJson({
      req,
      targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories`,
      method: 'POST',
      body: { name: 'Fane 1' },
    })
    return Number(created?.id)
  }

  router.get('/canvas/storage', authenticateUser, async (req, res) => {
    try {
      const projectId = Number(req.query.projectId)
      const dashboardId = Number(req.query.dashboardId)
      if (!Number.isFinite(projectId) || !Number.isFinite(dashboardId)) {
        res.status(400).json({ error: 'projectId and dashboardId are required query parameters' })
        return
      }

      const categories = await backendFetchJson({
        req,
        targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories`,
      })
      if (!Array.isArray(categories)) {
        res.json({ categories: [], entries: [] })
        return
      }

      const entries = []
      for (const category of categories) {
        if (!category || !Number.isFinite(category.id)) continue
        const graphs = await backendFetchJson({
          req,
          targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${category.id}/graphs`,
        })
        if (!Array.isArray(graphs)) continue

        const storageGraphs = graphs.filter(
          (graph) => graph && graph.graphType === 'TEXT' && isCanvasStorageGraph(graph.description),
        )
        for (const graph of storageGraphs) {
          if (!graph || !Number.isFinite(graph.id)) continue
          const queries = await backendFetchJson({
            req,
            targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${category.id}/graphs/${graph.id}/queries`,
          })
          if (!Array.isArray(queries)) continue
          const configQuery = queries.find((query) => query?.name === CANVAS_QUERY_NAME) || queries[0] || null
          if (!configQuery) continue
          entries.push({
            categoryId: category.id,
            graph,
            query: configQuery,
          })
        }
      }

      res.json({
        categories,
        entries,
      })
    } catch (err) {
      console.error('Canvas storage endpoint error:', err)
      res.status(500).json({
        error: 'Canvas storage request failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  router.get('/canvas/presence', authenticateUser, async (req, res) => {
    try {
      const projectId = Number(req.query.projectId)
      const dashboardId = Number(req.query.dashboardId)
      if (!Number.isFinite(projectId) || !Number.isFinite(dashboardId)) {
        res.status(400).json({ error: 'projectId and dashboardId are required query parameters' })
        return
      }

      const categoryId = await getPrimaryCanvasCategoryId({ req, projectId, dashboardId })
      if (!Number.isFinite(categoryId)) {
        res.json({ participants: [] })
        return
      }

      const graphs = await backendFetchJson({
        req,
        targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs`,
      })

      const nowMs = Date.now()
      const participantsByClientId = new Map()
      const presenceGraphs = Array.isArray(graphs)
        ? graphs.filter(
            (graph) =>
              graph &&
              graph.graphType === 'TEXT' &&
              hasCanvasPresenceToken(graph.description) &&
              String(graph.name || '').startsWith(CANVAS_PRESENCE_GRAPH_PREFIX),
          )
        : []

      for (const graph of presenceGraphs) {
        if (!graph?.id) continue
        const queries = await backendFetchJson({
          req,
          targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${graph.id}/queries`,
        })
        if (!Array.isArray(queries) || queries.length === 0) continue
        const presenceQuery =
          queries.find((query) => String(query?.name || '') === CANVAS_PRESENCE_QUERY_NAME) || queries[0]
        const payload = parseCanvasPresence(presenceQuery?.sqlText || '')
        if (!payload) continue
        const expiresAtMs = Date.parse(payload.expiresAt)
        if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) continue

        const existing = participantsByClientId.get(payload.clientId)
        if (!existing || Date.parse(existing.updatedAt) < Date.parse(payload.updatedAt)) {
          participantsByClientId.set(payload.clientId, payload)
        }
      }

      const participants = [...participantsByClientId.values()]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((participant) => ({
          clientId: participant.clientId,
          ownerId: participant.ownerId,
          ownerLabel: participant.ownerLabel,
          updatedAt: participant.updatedAt,
          expiresAt: participant.expiresAt,
        }))

      res.json({ participants })
    } catch (err) {
      console.error('Canvas presence endpoint error:', err)
      res.status(500).json({
        error: 'Canvas presence request failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  router.post('/canvas/presence/heartbeat', authenticateUser, async (req, res) => {
    try {
      const projectId = Number(req.body?.projectId)
      const dashboardId = Number(req.body?.dashboardId)
      const clientId = String(req.body?.clientId || '').trim()
      const ownerId = String(req.body?.ownerId || '').trim()
      const ownerLabel = String(req.body?.ownerLabel || '').trim()

      if (!Number.isFinite(projectId) || !Number.isFinite(dashboardId) || !clientId || !ownerId || !ownerLabel) {
        res.status(400).json({ error: 'projectId, dashboardId, clientId, ownerId and ownerLabel are required' })
        return
      }

      const categoryId = await getPrimaryCanvasCategoryId({ req, projectId, dashboardId })
      if (!Number.isFinite(categoryId)) {
        res.status(500).json({ error: 'Could not resolve canvas category for presence' })
        return
      }

      const graphName = buildCanvasPresenceGraphName(clientId)
      const nowMs = Date.now()
      const payload = {
        clientId,
        ownerId,
        ownerLabel,
        updatedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + CANVAS_PRESENCE_TTL_MS).toISOString(),
      }
      const sqlText = serializeCanvasPresence(payload)

      const graphs = await backendFetchJson({
        req,
        targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs`,
      })
      const existingGraph = Array.isArray(graphs)
        ? graphs.find(
            (graph) =>
              graph &&
              graph.graphType === 'TEXT' &&
              hasCanvasPresenceToken(graph.description) &&
              String(graph.name || '') === graphName,
          )
        : null

      if (!existingGraph) {
        const createdGraph = await backendFetchJson({
          req,
          targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs`,
          method: 'POST',
          body: {
            name: graphName,
            graphType: 'TEXT',
            width: 100,
            description: CANVAS_PRESENCE_DASHBOARD_TOKEN,
          },
        })

        await backendFetchJson({
          req,
          targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${createdGraph.id}/queries`,
          method: 'POST',
          body: {
            name: CANVAS_PRESENCE_QUERY_NAME,
            sqlText,
          },
        })

        res.json({ ok: true, participant: payload })
        return
      }

      const queries = await backendFetchJson({
        req,
        targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${existingGraph.id}/queries`,
      })
      const existingQuery = Array.isArray(queries)
        ? queries.find((query) => String(query?.name || '') === CANVAS_PRESENCE_QUERY_NAME) || queries[0]
        : null

      if (existingQuery?.id) {
        await backendFetchJson({
          req,
          targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${existingGraph.id}/queries/${existingQuery.id}`,
          method: 'PUT',
          body: {
            name: CANVAS_PRESENCE_QUERY_NAME,
            sqlText,
          },
        })
      } else {
        await backendFetchJson({
          req,
          targetPath: `projects/${projectId}/dashboards/${dashboardId}/categories/${categoryId}/graphs/${existingGraph.id}/queries`,
          method: 'POST',
          body: {
            name: CANVAS_PRESENCE_QUERY_NAME,
            sqlText,
          },
        })
      }

      res.json({ ok: true, participant: payload })
    } catch (err) {
      console.error('Canvas presence heartbeat error:', err)
      res.status(500).json({
        error: 'Canvas presence heartbeat failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  router.get('/stats', async (req, res) => {
    try {
      const targetUrl = new URL('stats', apiBaseUrl)
      const response = await fetch(targetUrl, { headers: { accept: 'application/json' } })
      const text = await response.text()
      let payload = null
      if (text) {
        try {
          payload = JSON.parse(text)
        } catch {
          payload = null
        }
      }
      if (!response.ok) {
        res.status(response.status).json({ error: 'Stats request failed' })
        return
      }
      res.json(payload)
    } catch (err) {
      console.error('Stats proxy error:', err)
      res
        .status(500)
        .json({ error: 'Stats proxy error', details: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.use('/', authenticateUser, async (req, res) => {
    try {
      const targetPath = req.url.startsWith('/') ? req.url.slice(1) : req.url
      const targetUrl = new URL(targetPath, apiBaseUrl)
      const resolvedAuthorization = await resolveAuthorizationHeader(req)

      const forwardHeaders = {
        accept: req.headers.accept,
        authorization: resolvedAuthorization,
        'content-type': req.headers['content-type'],
      }

      const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: hasBody ? JSON.stringify(req.body) : undefined,
      })

      const data = await response.text()

      res.status(response.status)
      const hopByHopHeaders = new Set([
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
        // Avoid conflicts when Express re-calculates payload length on res.send(data)
        'content-length',
      ])
      response.headers.forEach((value, key) => {
        if (!hopByHopHeaders.has(key.toLowerCase())) {
          res.setHeader(key, value)
        }
      })
      res.send(data)
    } catch (err) {
      console.error('Backend proxy error:', err)
      res.status(500).json({
        error: 'Backend proxy error',
        details: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  return router
}
