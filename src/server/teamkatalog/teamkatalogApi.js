import { logger } from '../logger.js'

// Stable, single Team Catalog instance — Nav only has one real one (teamkatalog.nav.no).
// The "dev" swagger/API is teamkatalog-team's own test environment, not a mirror of our data —
// always use prod here, no env var needed.
//
// NB: `*.intern.nav.no` requires naisdevice/internnett — unreachable from plain local dev,
// in which case every lookup fails closed (callers treat errors as "not a member").
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
  const now = Date.now()

  // Evict stale entries on every call — otherwise this Map grows one entry per distinct
  // navIdent forever in a long-running server process, since entries are only ever checked
  // against the TTL on read, never actively removed.
  for (const [id, entry] of cache) {
    if (now - entry.cachedAt >= TEAM_MEMBERSHIP_CACHE_TTL_MS) cache.delete(id)
  }

  const cached = cache.get(navIdent)
  if (cached) {
    logger.debug({ navIdent, teams: cached.teams.map((t) => t.id) }, '[TeamCatalog] cache hit')
    return cached.teams
  }

  // Note: NOT `/team-catalog/member/membership/...` — that `/team-catalog` segment only
  // exists on teamkatalog.nav.no's own frontend BFF proxy path, not the real backend API
  // (confirmed via the Swagger UI's "Try it out", which curls the backend directly).
  const url = `${TEAMKATALOG_BASE_URL}/member/membership/${encodeURIComponent(navIdent)}`
  let response
  try {
    response = await fetch(url)
  } catch (error) {
    // Typical locally without naisdevice: fetch throws (ENOTFOUND / tunnel 403) before
    // any HTTP status exists — log loudly so a silent "not a member" redirect is debuggable.
    logger.error({ navIdent, url, error: error.message ?? error }, '[TeamCatalog] fetch failed')
    throw error
  }

  if (!response.ok) {
    logger.warn({ navIdent, url, status: response.status }, '[TeamCatalog] non-OK response')
    throw new Error(`Team Catalog API returned ${response.status} for ${navIdent}`)
  }

  const data = await response.json()
  const teams = data.teams ?? []
  logger.debug({ navIdent, teams: teams.map((t) => t.id) }, '[TeamCatalog] membership fetched')
  cache.set(navIdent, { teams, cachedAt: Date.now() })
  return teams
}
