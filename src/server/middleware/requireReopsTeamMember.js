import { getTeamMembership } from '../teamkatalog/teamkatalogApi.js'
import { REOPS_TEAM_KATALOG_ID } from '../config/reopsTeam.js'
import { logger } from '../logger.js'

/**
 * Blocks access unless the authenticated user is on Team ResearchOps (per Team Catalog).
 *
 * This is the actual security boundary for team-gated experimental routes (e.g. /copilot) —
 * hiding a link in the UI or redirecting client-side is NOT sufficient on its own, since
 * anyone with a valid session/token can call the API directly (curl, etc.), bypassing any
 * client-side route guard entirely. Must run after `authenticateUser` so `req.user` is set.
 */
export async function requireReopsTeamMember(req, res, next) {
  try {
    const navIdent = req.user?.navIdent
    if (!navIdent) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const teams = await getTeamMembership(navIdent)
    const isReopsTeamMember = teams.some((team) => team.id === REOPS_TEAM_KATALOG_ID)

    if (!isReopsTeamMember) {
      return res.status(403).json({ error: 'Denne funksjonen er kun tilgjengelig for Team ResearchOps' })
    }

    next()
  } catch (error) {
    // Fail closed: if Team Catalog is unreachable, don't let the request through.
    logger.error({ error: error.message }, '[requireReopsTeamMember] Error')
    res.status(503).json({ error: 'Kunne ikke verifisere teammedlemskap. Prøv igjen senere.' })
  }
}
