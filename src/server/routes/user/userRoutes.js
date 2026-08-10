import express from 'express'
import { authenticateUser } from '../../middleware/authenticateUser.js'
import { getTeamMembership } from '../../teamkatalog/teamkatalogApi.js'
import { REOPS_TEAM_KATALOG_ID } from '../../config/reopsTeam.js'

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
          console.warn('[Auth] Failed to fix encoding for name:', name)
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
      console.error('Authentication error:', error)
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

      res.json({ isReopsTeamMember })
    } catch (error) {
      console.error('[Team membership] Error:', error.message)
      res.json({ isReopsTeamMember: false })
    }
  })

  router.get('/projects', async (req, res) => {
    try {
      const backendUrl = new URL('/api/projects', BACKEND_BASE_URL).toString()

      console.log('[Test] Fetching projects from:', backendUrl)

      const response = await fetch(backendUrl)

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      console.log('[Test] Successfully fetched projects from backend')

      res.json({
        success: true,
        message: 'Successfully connected to backend',
        data: data,
        backendUrl: backendUrl,
      })
    } catch (error) {
      console.error('[Test] Failed to fetch projects:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch projects from backend',
        details: error.message,
      })
    }
  })

  return router
}
