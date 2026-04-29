import express from 'express'
import { authenticateUser } from '../../middleware/authenticateUser.js'
import { loadOasis } from '../../middleware/authUtils.js'

export function createBackendProxyRouter({ BACKEND_BASE_URL }) {
  const router = express.Router()
  const apiBaseUrl = new URL('/api/', BACKEND_BASE_URL)
  const CANVAS_DASHBOARD_TOKEN = '[canvas]'
  const CANVAS_QUERY_NAME = 'canvas-config'
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

  router.get('/canvas/ws-token', authenticateUser, async (req, res) => {
    try {
      const token = await getOboToken(req)
      if (!token) {
        // Fall back to service token for local dev
        const serviceToken = await getServiceToken().catch(() => null)
        if (serviceToken) {
          res.json({ token: serviceToken })
          return
        }
        res.status(503).json({ error: 'Token exchange not available' })
        return
      }
      res.json({ token })
    } catch (err) {
      console.error('Failed to get WS token:', err)
      res.status(500).json({ error: 'Failed to obtain backend token' })
    }
  })

  // Endpoint for the client to obtain an OBO token for direct backend WS connections.
  // The browser can't set Authorization headers on WebSocket connections, so the client
  // fetches this token via REST and sends it as the first WS message to the backend.
  router.get('/canvas/ws-token', authenticateUser, async (req, res) => {
    try {
      const token = await getOboToken(req)
      if (!token) {
        // Fall back to service token for local dev
        const serviceToken = await getServiceToken().catch(() => null)
        if (serviceToken) {
          res.json({ token: serviceToken })
          return
        }
        res.status(503).json({ error: 'Token exchange not available' })
        return
      }
      res.json({ token })
    } catch (err) {
      console.error('Failed to get WS token:', err)
      res.status(500).json({ error: 'Failed to obtain backend token' })
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
      console.error('Canvas storage endpoint error:', err)
      res.status(500).json({
        error: 'Canvas storage request failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      })
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
