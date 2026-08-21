import express from 'express'
import { authenticateUser } from '../../middleware/authenticateUser.js'
import { loadOasis } from '../../middleware/authUtils.js'
import { logger } from '../../logger.js'

export function createBackendProxyRouter({ BACKEND_BASE_URL }) {
  const router = express.Router()
  const apiBaseUrl = new URL('/api/', BACKEND_BASE_URL)
  logger.info({ apiBaseUrl: apiBaseUrl.toString(), BACKEND_BASE_URL }, '[Backend Proxy] Proxying /api/backend/*')
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
        logger.warn({ error: tokenErr.message ?? tokenErr }, 'Failed to fetch service token, falling back if possible')
      }
    }
    const staticAuthorization =
      staticBackendToken && !req.headers.authorization && !oboToken && !serviceToken
        ? staticBackendToken.toLowerCase().startsWith('bearer ')
          ? staticBackendToken
          : `Bearer ${staticBackendToken}`
        : null

    const authorization =
      (oboToken ? `Bearer ${oboToken}` : undefined) ||
      req.headers.authorization ||
      (serviceToken ? `Bearer ${serviceToken}` : undefined) ||
      staticAuthorization

    // Only true when the static dev-only token (BACKEND_TOKEN) is actually what's being sent —
    // never on the OBO/incoming-token/service-token paths. Used to decide whether to also send
    // X-Dev-Nav-Ident (see below): that header is meaningless (and unused) by the backend on any
    // other auth path, so we don't send it there.
    const usedStaticToken = Boolean(staticAuthorization && authorization === staticAuthorization)

    return { authorization, usedStaticToken }
  }

  // MOCK_NAV_IDENT forwarded as a purely cosmetic log-correlation label — see
  // LocalDevTokenAuthFilter.kt on the backend for why it can no longer be used for anything
  // beyond that (it used to double as an authorization/attribution value; that was a real
  // cross-tenant bypass, fixed backend-side by always using a fixed shared identity instead).
  const devNavIdentLabel = process.env.MOCK_NAV_IDENT || null

  const buildForwardHeaders = (baseHeaders, usedStaticToken) => ({
    ...baseHeaders,
    ...(usedStaticToken && devNavIdentLabel ? { 'x-dev-nav-ident': devNavIdentLabel } : {}),
  })

  const backendFetchJson = async ({ req, targetPath, method = 'GET', body }) => {
    const targetUrl = new URL(targetPath, apiBaseUrl)
    const { authorization, usedStaticToken } = await resolveAuthorizationHeader(req)
    const forwardHeaders = buildForwardHeaders(
      {
        accept: 'application/json',
        authorization,
        'content-type': body ? 'application/json' : undefined,
      },
      usedStaticToken,
    )

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

  // Endpoint for the client to obtain a single-use WS ticket for direct backend WS connections.
  // The BFF calls the backend with an OBO token (server-side), and the backend returns a
  // short-lived ticket. The browser sends this ticket as the first WS message to authenticate.
  router.get('/canvas/ws-ticket', authenticateUser, async (req, res) => {
    try {
      const token = await getOboToken(req)
      if (!token) {
        const serviceToken = await getServiceToken().catch(() => null)
        if (!serviceToken) {
          res.status(503).json({ error: 'Token exchange not available' })
          return
        }
        // For local dev, call backend with service token
        const response = await fetch(`${BACKEND_BASE_URL}/api/canvas/ws-ticket`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceToken}` },
        })
        if (!response.ok) {
          res.status(response.status).json({ error: 'Backend rejected ticket request' })
          return
        }
        const data = await response.json()
        res.json(data)
        return
      }
      const response = await fetch(`${BACKEND_BASE_URL}/api/canvas/ws-ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        res.status(response.status).json({ error: 'Backend rejected ticket request' })
        return
      }
      const data = await response.json()
      res.json(data)
    } catch (err) {
      logger.error({ error: err.message ?? err }, 'Failed to get WS ticket')
      res.status(500).json({ error: 'Failed to obtain WS ticket' })
    }
  })

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
      logger.error({ error: err.message ?? err }, 'Canvas storage endpoint error')
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
      logger.error({ error: err.message ?? err }, 'Canvas presence endpoint error')
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
      logger.error({ error: err.message ?? err }, 'Canvas presence heartbeat error')
      res.status(500).json({
        error: 'Canvas presence heartbeat failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  router.get('/stats', async (req, res) => {
    const targetUrl = new URL('stats', apiBaseUrl)
    try {
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
      const reason = err?.cause?.code || err?.code || (err instanceof Error ? err.message : 'Unknown error')
      logger.error({ targetUrl: targetUrl.toString(), reason }, '[Backend Proxy] GET failed')
      res
        .status(500)
        .json({ error: 'Stats proxy error', details: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.use('/', authenticateUser, async (req, res) => {
    const targetPath = req.url.startsWith('/') ? req.url.slice(1) : req.url
    const targetUrl = new URL(targetPath, apiBaseUrl)

    try {
      // Debug level, not info — this fires on every single proxied request (method + full URL,
      // including query string, which can carry sensitive values). At the default 'info' level
      // (prod default, see logger.js) this is silent; set LOG_LEVEL=debug locally to see it.
      logger.debug({ method: req.method, targetUrl: targetUrl.toString() }, '[Backend Proxy] request')
      const { authorization: resolvedAuthorization, usedStaticToken } = await resolveAuthorizationHeader(req)

      const forwardHeaders = buildForwardHeaders(
        {
          accept: req.headers.accept,
          authorization: resolvedAuthorization,
          'content-type': req.headers['content-type'],
        },
        usedStaticToken,
      )

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
      // Log a single readable line (method + full target URL + concise reason) instead of
      // dumping the full error/stack — ECONNREFUSED etc. otherwise repeats with zero context
      // about which endpoint or backend host is unreachable, which is what actually matters
      // for debugging a "backend not running locally" situation vs. a real bug.
      const reason = err?.cause?.code || err?.code || (err instanceof Error ? err.message : 'Unknown error')
      logger.error({ method: req.method, targetUrl: targetUrl.toString(), reason }, '[Backend Proxy] request failed')
      res.status(500).json({
        error: 'Backend proxy error',
        details: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  return router
}
