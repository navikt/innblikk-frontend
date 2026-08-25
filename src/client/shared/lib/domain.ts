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
