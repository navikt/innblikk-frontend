/**
 * Enriches the analytics session so we can answer "who uses Innblikk" without
 * ever seeing who anyone is:
 *
 * - `visitorId`: server-issued HMAC-SHA256(navIdent, secret + current
 *   quarter) when logged in — stable within the quarter, rotates every ~90
 *   days, joinable across apps that compute it the same way. Falls back to a
 *   random UUID in a 90-day cookie when no key is configured (local dev).
 *   Nothing about the person is derivable from either form.
 * - `team_id` / `team_navn`: the user's team from Team Catalog, resolved
 *   server-side from the logged-in nav-ident (`/api/user/team-context`).
 *   Team affiliation is not PII; the nav-ident itself never leaves the server.
 *   UUID survives renames; name is whatever the team calls itself there —
 *   used as-is in per-team usage breakdowns.
 *
 * Both go out via `identify(id, data)` on the tracking script → `visitorId`
 * becomes `distinct_id`, `teamer` lands in session_data.
 *
 * Runs at most once per browser session; fails silent on any error —
 * analytics enrichment is never worth breaking the app.
 */

const SESSION_KEY = 'innblikk_team_context_sent'
const VISITOR_COOKIE = 'innblikk_vid'
const VISITOR_COOKIE_DAYS = 90

// sporing-dev.js loads `defer` and installs window.sporing only after a
// readystatechange tick — identifyTeamContext() runs on app mount and will
// usually win that race, making `window.sporing?.identify(...)` silently no-op.
// Poll briefly for the API instead of giving up on the first undefined.
const SPORING_WAIT_TIMEOUT_MS = 5000
const SPORING_POLL_INTERVAL_MS = 100

function getVisitorId(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]+)`))
  if (match) return match[1]

  const id = crypto.randomUUID()
  const maxAge = VISITOR_COOKIE_DAYS * 24 * 60 * 60
  document.cookie = `${VISITOR_COOKIE}=${id}; max-age=${maxAge}; path=/; samesite=lax`
  return id
}

async function waitForSporing(): Promise<NonNullable<typeof window.sporing> | null> {
  const deadline = Date.now() + SPORING_WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (typeof window.sporing?.identify === 'function') return window.sporing
    await new Promise((resolve) => setTimeout(resolve, SPORING_POLL_INTERVAL_MS))
  }
  return null
}

export async function identifyTeamContext(): Promise<void> {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return

    const response = await fetch('/api/user/team-context')
    if (!response.ok) return
    const data = (await response.json()) as {
      teams?: { id: string; name: string }[]
      personId?: string
    }

    const sporing = await waitForSporing()
    if (!sporing) return // script never loaded (blocked, slow) — retry next page load

    // Only mark sent once we can actually identify — a failed fetch or a missing
    // script must not permanently suppress the call for the rest of the session.
    sessionStorage.setItem(SESSION_KEY, '1')

    // Server-issued HMAC(navident + quarter) when available (stable across
    // apps, rotates quarterly); random 90-day cookie UUID otherwise (local dev).
    const visitorId = data.personId ?? getVisitorId()

    // First team = primary (Team Catalog has no ordering guarantee, but most
    // Nav employees are on exactly one team). Keep the stable UUID (joins,
    // survives renames) and the team name as teams themselves present it —
    // no sluggifying; what they write in Team Catalog is what shows in reports.
    const primary = data.teams?.[0]
    const sessionData = primary
      ? {
          team_id: primary.id,
          team_navn: primary.name,
          ...(data.teams!.length > 1 ? { teamer: data.teams!.map((t) => t.name) } : {}),
        }
      : undefined

    sporing.identify(visitorId, sessionData)
  } catch {
    // best-effort only
  }
}
