import express from 'express'
import { loadOasis } from '../../middleware/authUtils.js'
import { requireReopsTeamMember } from '../../middleware/requireReopsTeamMember.js'
import { logger } from '../../logger.js'
import { getAllActiveTeams } from '../../teamkatalog/teamkatalogApi.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const UPSTREAM_TIMEOUT_MS = 15000

function noCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
}

/**
 * RFC 7807-shaped sanitized error. Only `detail` carries (Norwegian, static) text —
 * upstream internals never reach the browser.
 */
function problem(res, status, title, detail) {
  noCache(res)
  return res
    .status(status)
    .type('application/problem+json')
    .send(JSON.stringify({ type: 'about:blank', status, title, detail }))
}

const TITLES = {
  400: 'Ugyldig forespørsel',
  401: 'Ikke autentisert',
  403: 'Ikke tilgang',
  502: 'Tjenesten er utilgjengelig',
  503: 'Tjenesten er utilgjengelig',
  504: 'Tjenesten svarte ikke i tide',
}

function sanitizedError(res, status, detail) {
  return problem(res, status, TITLES[status] ?? 'Feil', detail)
}

/**
 * Strict authentication for the website-management BFF.
 *
 * Deliberately does NOT reuse `authenticateUser`: that middleware falls back to
 * MOCK_NAV_IDENT / a LOCAL_DEV pseudo-user when no real token is present, which would
 * open a mutation path without a validated Azure token. Here a missing or invalid
 * token — or a token that doesn't parse to a real NAV ident — is always a 401.
 */
async function requireValidatedAzureUser(req, res, next) {
  try {
    const { oasis } = await loadOasis()
    if (!oasis || typeof oasis.getToken !== 'function' || typeof oasis.validateToken !== 'function') {
      logger.warn('[Website management] @navikt/oasis unavailable — cannot validate token, rejecting request')
      return sanitizedError(res, 401, 'Ingen gyldig autentiseringstoken')
    }

    const userToken = oasis.getToken(req)
    if (!userToken) {
      return sanitizedError(res, 401, 'Ingen autentiseringstoken')
    }

    const validation = await oasis.validateToken(userToken)
    if (!validation.ok) {
      return sanitizedError(res, 401, 'Ugyldig token')
    }

    if (typeof oasis.parseAzureUserToken !== 'function') {
      return sanitizedError(res, 401, 'Ugyldig token')
    }
    const parsed = oasis.parseAzureUserToken(userToken)
    if (!parsed.ok || typeof parsed.NAVident !== 'string' || !/^[a-z][0-9]{6}$/i.test(parsed.NAVident)) {
      logger.warn('[Website management] Token parsed without NAVident — rejecting')
      return sanitizedError(res, 401, 'Ugyldig token')
    }

    req.user = { navIdent: parsed.NAVident.toUpperCase() }
    req.websiteManagementUserToken = userToken
    next()
  } catch (error) {
    logger.error({ error: error.message }, '[Website management] Authentication error')
    return sanitizedError(res, 401, 'Ugyldig token')
  }
}

/**
 * CSRF protection for browser mutations. State-changing requests must carry the
 * `x-requested-with: XMLHttpRequest` custom header (which forces a CORS preflight from
 * any cross-origin page, so its presence proves same-origin intent) and, when an
 * Origin/Referer header is present, it must match the request's own host.
 */
function requireSameOriginMutation(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next()

  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return sanitizedError(res, 403, 'Ugyldig forespørsel')
  }

  const source = req.headers.origin || req.headers.referer
  if (source) {
    try {
      if (new URL(source).host !== req.headers.host) {
        logger.warn({ source, host: req.headers.host }, '[Website management] Cross-origin mutation blocked')
        return sanitizedError(res, 403, 'Ugyldig forespørsel')
      }
    } catch {
      return sanitizedError(res, 403, 'Ugyldig forespørsel')
    }
  }

  next()
}

function isValidBody(body) {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
}

export function createWebsiteManagementRouter({
  WEBSITE_MANAGEMENT_BASE_URL,
  WEBSITE_MANAGEMENT_OBO_SCOPE,
  // Fail closed: self-service (non-ReOps users) only works where explicitly enabled (dev).
  WEBSITE_SELF_SERVICE_ENABLED = false,
}) {
  const router = express.Router()

  router.use((req, res, next) => {
    noCache(res)
    next()
  })
  router.use(requireValidatedAzureUser)
  router.use(requireSameOriginMutation)

  // Self-service is not live yet. Where it is disabled (prod) the whole management API is
  // limited to Team ResearchOps, verified against Team Catalog on every request. Where it is
  // enabled (dev) only the cross-team listing (scope=all) and hard delete stay ReOps-only —
  // team ownership of mine-scope operations is enforced by the upstream service.
  router.use((req, res, next) => {
    if (!WEBSITE_SELF_SERVICE_ENABLED || (req.method === 'GET' && req.query.scope === 'all')) {
      return requireReopsTeamMember(req, res, () => {
        req.isReopsTeamMember = true
        next()
      })
    }
    next()
  })

  const unavailable = (res) => sanitizedError(res, 503, 'Nettsideadministrasjon er ikke tilgjengelig i dette miljøet')

  const exchangeOboToken = async (req) => {
    if (!WEBSITE_MANAGEMENT_OBO_SCOPE) return null
    try {
      const { oasis } = await loadOasis()
      if (!oasis || typeof oasis.requestOboToken !== 'function') return null
      const result = await oasis.requestOboToken(req.websiteManagementUserToken, WEBSITE_MANAGEMENT_OBO_SCOPE)
      if (!result.ok || !result.token) {
        logger.warn('[Website management] OBO token exchange failed')
        return null
      }
      return result.token
    } catch (error) {
      logger.error({ error: error.message }, '[Website management] OBO token exchange threw')
      return null
    }
  }

  /**
   * Performs the upstream call to reops-clean-to-enriched. Only the freshly exchanged
   * OBO token is forwarded — never the incoming browser authorization header, and no
   * client-supplied actor/team headers. Errors and timeouts are sanitized; upstream
   * ProblemDetail bodies pass through only status/title/detail (no internals). The only
   * upstream response header forwarded is Location, rewritten to the BFF path so the
   * browser never sees an internal (or external) redirect target.
   */
  const callUpstream = async (req, res, { method, suffix, body, confirmWebsiteId }) => {
    if (!WEBSITE_MANAGEMENT_BASE_URL) return unavailable(res)

    const oboToken = await exchangeOboToken(req)
    if (!oboToken) return unavailable(res)

    const headers = {
      accept: 'application/json',
      authorization: `Bearer ${oboToken}`,
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (confirmWebsiteId) headers['x-confirm-website-id'] = confirmWebsiteId

    let response
    try {
      response = await fetch(new URL(`/api/manage/websites${suffix}`, WEBSITE_MANAGEMENT_BASE_URL), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
    } catch (error) {
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      logger.error(
        { method, reason: error?.cause?.code || error?.name || 'unknown' },
        '[Website management] Upstream request failed',
      )
      return sanitizedError(
        res,
        isTimeout ? 504 : 502,
        isTimeout ? 'Tjenesten svarte ikke i tide. Prøv igjen.' : 'Kunne ikke nå nettsidetjenesten. Prøv igjen senere.',
      )
    }

    noCache(res)
    res.status(response.status)

    // Header allowlist: only Location, and only rewritten onto the BFF mount path —
    // never forward an internal service URL (or a redirect to an unrelated origin).
    const location = response.headers.get('location')
    if (location) {
      const rewritten = location.replace(/^.*\/api\/manage\/websites/, '/api/website-management')
      if (rewritten.startsWith('/api/website-management')) {
        res.setHeader('Location', rewritten)
      }
    }

    if (response.status === 204) return res.end()

    let parsed
    try {
      const raw = await response.text()
      if (!raw) return res.end()
      parsed = JSON.parse(raw)
    } catch (error) {
      logger.error({ method, status: response.status, reason: error?.name }, '[Website management] Bad upstream body')
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      return sanitizedError(
        res,
        isTimeout ? 504 : 502,
        isTimeout ? 'Tjenesten svarte ikke i tide. Prøv igjen.' : 'Ugyldig svar fra nettsidetjenesten',
      )
    }

    if (!response.ok) {
      // The service answers ProblemDetail with Norwegian end-user detail text; pass only
      // status/title/detail through so the UI can show it, never internals/stacktraces.
      return problem(
        res,
        response.status,
        typeof parsed?.title === 'string' ? parsed.title : 'Feil',
        typeof parsed?.detail === 'string' ? parsed.detail : 'Noe gikk galt',
      )
    }

    return res.json(parsed)
  }

  const validateWebsiteIdParam = (req, res) => {
    const { websiteId } = req.params
    if (!UUID_PATTERN.test(websiteId)) {
      sanitizedError(res, 400, 'Ugyldig nettside-ID')
      return null
    }
    return websiteId
  }

  router.get('/context', (req, res) => callUpstream(req, res, { method: 'GET', suffix: '/context' }))

  // Team names/ids are openly readable in Team Catalog, so any validated user may list them.
  router.get('/teams', async (req, res) => {
    try {
      return res.json(await getAllActiveTeams())
    } catch {
      return sanitizedError(res, 502, 'Kunne ikke hente teamliste fra Teamkatalogen')
    }
  })

  router.get('/', (req, res) => {
    const includeDeleted = req.query.includeDeleted === 'true'
    const scopeParam = req.query.scope

    if (scopeParam === 'all') {
      if (!req.isReopsTeamMember) {
        return sanitizedError(res, 403, 'Denne funksjonen er kun tilgjengelig for Team ResearchOps')
      }
      return callUpstream(req, res, {
        method: 'GET',
        // No trailing slash: Spring @GetMapping on the base path doesn't implicitly match it.
        suffix: `?scope=all${includeDeleted ? '&includeDeleted=true' : ''}`,
      })
    }

    if (scopeParam !== undefined && scopeParam !== 'mine') {
      return sanitizedError(res, 400, 'Ugyldig scope')
    }

    return callUpstream(req, res, { method: 'GET', suffix: includeDeleted ? '?includeDeleted=true' : '' })
  })

  router.get('/:websiteId', (req, res) => {
    const websiteId = validateWebsiteIdParam(req, res)
    if (!websiteId) return
    return callUpstream(req, res, { method: 'GET', suffix: `/${websiteId}` })
  })

  router.post('/', (req, res) => {
    if (!isValidBody(req.body)) return sanitizedError(res, 400, 'Ugyldig forespørselsdata')
    const { name, domain, ownerTeamId } = req.body
    return callUpstream(req, res, { method: 'POST', suffix: '', body: { name, domain, ownerTeamId } })
  })

  router.put('/:websiteId', (req, res) => {
    const websiteId = validateWebsiteIdParam(req, res)
    if (!websiteId) return
    if (!isValidBody(req.body)) return sanitizedError(res, 400, 'Ugyldig forespørselsdata')
    const { name, domain, ownerTeamId } = req.body
    return callUpstream(req, res, { method: 'PUT', suffix: `/${websiteId}`, body: { name, domain, ownerTeamId } })
  })

  router.delete('/:websiteId', (req, res) => {
    const websiteId = validateWebsiteIdParam(req, res)
    if (!websiteId) return
    return callUpstream(req, res, { method: 'DELETE', suffix: `/${websiteId}` })
  })

  // Hard delete: strictly PG-only on the service side. The entire route is behind
  // requireReopsTeamMember, and the client must echo the exact website UUID in the
  // confirmation header — the BFF checks equality itself before forwarding (the service
  // checks it again).
  router.delete('/:websiteId/registration', requireReopsTeamMember, (req, res) => {
    const websiteId = validateWebsiteIdParam(req, res)
    if (!websiteId) return
    const confirmWebsiteId = req.headers['x-confirm-website-id']
    if (
      typeof confirmWebsiteId !== 'string' ||
      !UUID_PATTERN.test(confirmWebsiteId) ||
      confirmWebsiteId.toLowerCase() !== websiteId.toLowerCase()
    ) {
      return sanitizedError(res, 400, 'Bekreftelsen må inneholde nøyaktig nettsidens ID')
    }
    return callUpstream(req, res, {
      method: 'DELETE',
      suffix: `/${websiteId}/registration`,
      confirmWebsiteId,
    })
  })

  return router
}
