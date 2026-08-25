/**
 * Normalize a domain string for comparison purposes.
 * Strips protocol, www prefix, trailing dot, and lowercases.
 * Special case: nav.no is treated as www.nav.no (canonical).
 */
export const normalizeDomain = (domain: string): string => {
  const cleaned = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '')
  return cleaned === 'nav.no' ? 'www.nav.no' : cleaned
}

/**
 * Website ID of the "front page" site to pre-select when nothing else applies
 * (no websiteId/domain URL param, no stored selection). Keyed by environment.
 *
 * IDs are stabler than domains — a site's domain can be renamed/migrated, its Umami
 * website_id cannot. Dev vs prod is decided by which BigQuery project the server is
 * querying (window.__RUNTIME_CONFIG__.GCP_PROJECT_ID), NOT the page hostname —
 * localhost serves dev data, so hostname-based detection would pick the wrong default.
 */
export const DEFAULT_WEBSITE_ID = {
  prod: '35abb2b7-3f97-42ce-931b-cf547d40d967', // www.nav.no
  dev: 'c44a6db3-c974-4316-b433-214f87e80b4d', // www.ansatt.dev.nav.no
} as const
