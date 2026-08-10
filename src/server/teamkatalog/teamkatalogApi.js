// Stable, single Team Catalog instance — Nav only has one real one (teamkatalog.nav.no).
// The "dev" swagger/API is teamkatalog-team's own test environment, not a mirror of our data —
// always use prod here, no env var needed.
const TEAMKATALOG_BASE_URL = 'https://teamkatalog-api.intern.nav.no'

// Team membership rarely changes — cache each nav-ident's team list for a while
// instead of hitting Team Catalog on every request.
const TEAM_MEMBERSHIP_CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map() // navIdent -> { teams, cachedAt }

/**
 * Fetches the teams a given nav-ident is a member of, from Team Catalog
 * (https://github.com/navikt/team-catalog). Per Team Catalog's own docs, team/member
 * data is openly readable within Nav without authentication — no token needed.
 *
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function getTeamMembership(navIdent) {
  const cached = cache.get(navIdent)
  if (cached && Date.now() - cached.cachedAt < TEAM_MEMBERSHIP_CACHE_TTL_MS) {
    return cached.teams
  }

  // Note: NOT `/team-catalog/member/membership/...` — that `/team-catalog` segment only
  // exists on teamkatalog.nav.no's own frontend BFF proxy path, not the real backend API
  // (confirmed via the Swagger UI's "Try it out", which curls the backend directly).
  const url = `${TEAMKATALOG_BASE_URL}/member/membership/${encodeURIComponent(navIdent)}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Team Catalog API returned ${response.status} for ${navIdent}`)
  }

  const data = await response.json()
  const teams = data.teams ?? []
  cache.set(navIdent, { teams, cachedAt: Date.now() })
  return teams
}
