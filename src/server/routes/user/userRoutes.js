import express from 'express'
import { createHmac } from 'node:crypto'
import { authenticateUser } from '../../middleware/authenticateUser.js'
import { getTeamMembership } from '../../teamkatalog/teamkatalogApi.js'
import { REOPS_TEAM_KATALOG_ID } from '../../config/reopsTeam.js'
import { logger } from '../../logger.js'

/**
 * Pseudonymous analytics person id: HMAC-SHA256(navIdent, secret + quarter).
 * Quarter buckets (e.g. "2026-Q2") rotate the id every ~90 days — same input
 * within a quarter → same id (stable, cross-app joinable), new quarter → new
 * id (forced re-anonymization). Key comes from ANALYTICS_IDENTITY_KEY; absent
 * in local dev → null (client falls back to a random cookie UUID).
 */
export function computePersonId(navIdent) {
  const key = process.env.ANALYTICS_IDENTITY_KEY
  if (!key) return null
  const now = new Date()
  const quarter = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`
  return createHmac('sha256', `${key}:${quarter}`).update(navIdent.toLowerCase()).digest('hex')
}

export function createUserRouter({ BACKEND_BASE_URL }) {
  const router = express.Router()

  router.get('/me', async (req, res) => {
    try {
      // Try to import @navikt/oasis - it's optional locally but required in NAIS
      let oasis
      try {
        oasis = await import('@navikt/oasis')
      } catch (importError) {
        if (process.env.MOCK_NAV_IDENT) {
          return res.json({
            navIdent: process.env.MOCK_NAV_IDENT,
            name: 'Mock User',
            email: 'mock.user@nav.no',
            authenticated: true,
            message: `Vellykket autentisert som ${process.env.MOCK_NAV_IDENT} (MOCK)`,
          })
        }

        return res.status(503).json({
          error: 'Authentication not available in local dev',
          message: 'Deploy to NAIS to test authentication',
          details: importError.message,
        })
      }

      if (process.env.MOCK_NAV_IDENT) {
        return res.json({
          navIdent: process.env.MOCK_NAV_IDENT,
          name: 'Mock User',
          email: 'mock.user@nav.no',
          authenticated: true,
          message: `Vellykket autentisert som ${process.env.MOCK_NAV_IDENT} (MOCK)`,
        })
      }

      const { getToken, validateToken, parseAzureUserToken } = oasis

      // Extract token from request
      const token = getToken(req)

      if (!token) {
        return res.status(401).json({ error: 'No authentication token provided' })
      }

      // Validate the token
      const validation = await validateToken(token)

      if (!validation.ok) {
        return res.status(401).json({
          error: 'Invalid token',
          details: validation.error?.message || 'Token validation failed',
        })
      }

      // Parse the Azure token to get user information
      const parsed = parseAzureUserToken(token)

      if (!parsed.ok) {
        return res.status(500).json({ error: 'Failed to parse token' })
      }

      // Return user information
      // Format name as "Firstname Lastname" (Norwegian convention)
      // Azure returns "Lastname, Firstname" so we need to reverse it
      let name = parsed.name || ''

      // Fix potential encoding issues (UTF-8 bytes interpreted as Latin-1)
      if (name.includes('Ã')) {
        try {
          name = Buffer.from(name, 'latin1').toString('utf-8')
        } catch {
          // Keep original if fixing fails
          logger.warn({ name }, '[Auth] Failed to fix encoding for name')
        }
      }

      const nameParts = name.split(', ')
      const formattedName =
        nameParts.length === 2
          ? `${nameParts[1]} ${nameParts[0]}` // Firstname Lastname
          : name // Fallback to original if format is unexpected

      res.json({
        navIdent: parsed.NAVident,
        name: formattedName,
        email: parsed.preferred_username,
        authenticated: true,
        message: `Vellykket autentisert som ${parsed.NAVident}`,
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, 'Authentication error')
      res.status(500).json({
        error: 'Authentication failed',
        details: error.message,
      })
    }
  })

  // Whether the logged-in user is on Team ResearchOps (Team Catalog), used to reveal
  // internal-only tooling (see /reops-internal). Fails closed (false) on any error so a
  // Team Catalog outage just hides the feature instead of breaking the app.
  router.get('/reops-team-membership', authenticateUser, async (req, res) => {
    try {
      const navIdent = req.user?.navIdent
      if (!navIdent) {
        return res.json({ isReopsTeamMember: false })
      }

      const teams = await getTeamMembership(navIdent)
      const isReopsTeamMember = teams.some((team) => team.id === REOPS_TEAM_KATALOG_ID)

      if (!isReopsTeamMember) {
        logger.debug(
          { navIdent, teamIds: teams.map((t) => t.id), expected: REOPS_TEAM_KATALOG_ID },
          '[Team membership] not a member of Team ResearchOps',
        )
      }

      res.json({ isReopsTeamMember })
    } catch (error) {
      logger.error(
        { navIdent: req.user?.navIdent, error: error.message },
        '[Team membership] Error — failing closed (isReopsTeamMember: false)',
      )
      res.json({ isReopsTeamMember: false })
    }
  })

  // Analytics self-identification context: the user's team(s) plus a
  // pseudonymous person id. Sent to the tracking script via
  // `identify(personId, { team_id, team_navn })` → lands as distinct_id +
  // session_data in BigQuery. Lets us filter out our own team's traffic,
  // count distinct teams using the app, and join the same (pseudonymous)
  // person across apps — without the nav-ident ever leaving the server.
  //
  // personId = HMAC-SHA256(navIdent, key + current-quarter). The quarter salt
  // (e.g. "2026-Q2") makes ids stable within ~90 days and rotate on quarter
  // boundaries, matching the client cookie's retention rhythm. Without
  // ANALYTICS_IDENTITY_KEY (local dev) personId is omitted and the client
  // falls back to a random cookie UUID.
  router.get('/team-context', authenticateUser, async (req, res) => {
    try {
      const navIdent = req.user?.navIdent
      if (!navIdent) {
        return res.json({ teams: [] })
      }

      const memberships = await getTeamMembership(navIdent)
      const personId = computePersonId(navIdent)
      res.json({ teams: memberships.map((t) => ({ id: t.id, name: t.name })), ...(personId ? { personId } : {}) })
    } catch (error) {
      logger.warn({ error: error.message ?? error }, '[Team context] lookup failed — returning empty')
      res.json({ teams: [] })
    }
  })

  router.get('/projects', async (req, res) => {
    try {
      const backendUrl = new URL('/api/projects', BACKEND_BASE_URL).toString()

      logger.info({ backendUrl }, '[Test] Fetching projects from')

      const response = await fetch(backendUrl)

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      logger.info('[Test] Successfully fetched projects from backend')

      res.json({
        success: true,
        message: 'Successfully connected to backend',
        data: data,
        backendUrl: backendUrl,
      })
    } catch (error) {
      logger.error({ error: error.message ?? error }, '[Test] Failed to fetch projects')
      res.status(500).json({
        success: false,
        error: 'Failed to fetch projects from backend',
        details: error.message,
      })
    }
  })

  return router
}
