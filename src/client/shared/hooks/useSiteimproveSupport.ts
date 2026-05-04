import { useMemo } from 'react'
import teamsData from '../../../data/teamsData.json'

interface TeamData {
  teamName: string
  teamDomain: string
  websiteID?: string
  teamSiteimproveSite: number | false
  supportsMarketing?: boolean
  supportsClickmaps?: boolean
  usesCookies?: boolean
  cookiesEnabledFrom?: string
}

/**
 * Normalize a domain by removing protocol, www, and trailing slashes
 */
function normalizeDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase()
}

function normalizeWebsiteId(websiteId: string): string {
  return websiteId.trim().toLowerCase()
}

function findTeamByWebsiteId(websiteId: string | null | undefined): TeamData | undefined {
  if (!websiteId) return undefined
  const normalizedWebsiteId = normalizeWebsiteId(websiteId)

  return (teamsData as TeamData[]).find((t) => t.websiteID && normalizeWebsiteId(t.websiteID) === normalizedWebsiteId)
}

/**
 * Find a team by domain (exact match only)
 */
function findTeamByDomain(domain: string | null | undefined): TeamData | undefined {
  if (!domain) return undefined

  const normalizedDomain = normalizeDomain(domain)

  return (teamsData as TeamData[]).find((t) => {
    const teamDomain = normalizeDomain(t.teamDomain)
    return teamDomain === normalizedDomain
  })
}

function findTeam(domain: string | null | undefined, websiteId?: string | null): TeamData | undefined {
  return findTeamByWebsiteId(websiteId) ?? findTeamByDomain(domain)
}

/**
 * Check if a domain supports Siteimprove based on teamsData.json
 * @param domain - The domain to check (e.g., "nav.no" or "https://www.nav.no")
 * @returns boolean - true if Siteimprove is supported, false otherwise
 */
export function hasSiteimproveSupport(domain: string | null | undefined, websiteId?: string | null): boolean {
  const team = findTeam(domain, websiteId)
  return team ? team.teamSiteimproveSite !== false : false
}

/**
 * Check if a domain is a dev environment (not production)
 * Dev environments typically have patterns like "-dev." or ".dev." in subdomain
 */
function isDevEnvironment(domain: string | null | undefined): boolean {
  if (!domain) return false
  const normalized = normalizeDomain(domain)
  // Check for common dev environment patterns in domain
  return (
    normalized.includes('-dev.') ||
    normalized.includes('.dev.') || // e.g., aksel.dev.nav.no
    normalized.includes('.dev-') ||
    normalized.includes('-dev-') ||
    normalized.startsWith('dev.') ||
    normalized.startsWith('dev-') ||
    // Also check for patterns at end of subdomain parts
    /\.dev$/i.test(normalized) || // ends with .dev
    /-dev$/i.test(normalized)
  ) // ends with -dev (unlikely but just in case)
}

/**
 * Check if a website name indicates a dev environment
 */
function isDevWebsiteName(name: string | null | undefined): boolean {
  if (!name) return false
  const normalized = name.toLowerCase()
  return (
    normalized.includes(' - dev') ||
    normalized.includes('-dev') ||
    normalized.includes('(dev)') ||
    normalized.endsWith(' dev') ||
    normalized.startsWith('dev ') ||
    normalized.startsWith('dev-')
  )
}

/**
 * Check if a domain supports Marketing Analysis based on teamsData.json
 * @param domain - The domain to check
 * @param websiteName - Optional website name for additional dev environment checking
 * @returns boolean - true if Marketing Analysis is supported (default: true unless explicitly set to false or is dev environment)
 */
export function hasMarketingSupport(
  domain: string | null | undefined,
  websiteName?: string | null,
  websiteId?: string | null,
): boolean {
  // Dev environments don't support marketing analysis
  if (isDevEnvironment(domain)) return false

  // Also check website name for dev patterns
  if (isDevWebsiteName(websiteName)) return false

  const team = findTeam(domain, websiteId)
  // Only show if explicitly set to true in teamsData.json
  return team ? team.supportsMarketing === true : false
}

/**
 * Check if a domain supports Clickmap based on teamsData.json
 * @param domain - The domain to check
 * @returns boolean - true if Clickmap is supported (requires explicit true)
 */
export function hasClickmapSupport(_domain: string | null | undefined, _websiteId?: string | null): boolean {
  return true // TODO: temporarily enabled for all pages
}

/**
 * React hook to check Siteimprove support for a domain
 * @param domain - The domain to check
 * @returns boolean - true if Siteimprove is supported
 */
export function useSiteimproveSupport(domain: string | null | undefined, websiteId?: string | null): boolean {
  return useMemo(() => hasSiteimproveSupport(domain, websiteId), [domain, websiteId])
}

/**
 * Check if a domain uses cookies based on teamsData.json
 * @param domain - The domain to check
 * @returns boolean - true if cookies are used (default: false)
 */
export function hasCookieSupport(domain: string | null | undefined, websiteId?: string | null): boolean {
  const team = findTeam(domain, websiteId)
  return team ? team.usesCookies === true : false
}

/**
 * Get the date when cookies-based distinct_id counting started for a domain.
 * Returns null if not configured.
 */
export function getCookieStartDate(domain: string | null | undefined, websiteId?: string | null): Date | null {
  const team = findTeam(domain, websiteId)
  if (!team?.cookiesEnabledFrom) return null
  const parsed = new Date(`${team.cookiesEnabledFrom}T00:00:00`)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * React hook to check Cookie support for a domain
 * @param domain - The domain to check
 * @returns boolean - true if cookies are used
 */
export function useCookieSupport(domain: string | null | undefined, websiteId?: string | null): boolean {
  return useMemo(() => hasCookieSupport(domain, websiteId), [domain, websiteId])
}

/**
 * React hook to get cookie start date for a domain
 * @param domain - The domain to check
 * @returns Date | null - start date of distinct_id usage
 */
export function useCookieStartDate(domain: string | null | undefined, websiteId?: string | null): Date | null {
  return useMemo(() => getCookieStartDate(domain, websiteId), [domain, websiteId])
}

/**
 * React hook to check Marketing Analysis support for a domain
 * @param domain - The domain to check
 * @param websiteName - Optional website name for dev environment detection
 * @returns boolean - true if Marketing Analysis is supported
 */
export function useMarketingSupport(
  domain: string | null | undefined,
  websiteName?: string | null,
  websiteId?: string | null,
): boolean {
  return useMemo(() => hasMarketingSupport(domain, websiteName, websiteId), [domain, websiteName, websiteId])
}

/**
 * React hook to check Clickmap support for a domain
 * @param domain - The domain to check
 * @returns boolean - true if Clickmap is supported
 */
export function useClickmapSupport(domain: string | null | undefined, websiteId?: string | null): boolean {
  return useMemo(() => hasClickmapSupport(domain, websiteId), [domain, websiteId])
}

export default useSiteimproveSupport
