export const hasMultipleValues = (input: string): boolean => /[\n,;]/.test(input)

const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, '')

/**
 * Splits pasted text (one per line, or separated by comma/semicolon) into URL patterns.
 * Full URLs become their path, and are rejected if they belong to another website;
 * anything else is kept exactly as typed, since «slutter med .pdf» must not get a leading slash.
 */
export function parseBulkPatterns(input: string, websiteDomain?: string): { patterns: string[]; invalid: string[] } {
  const entries = input
    .replace(/\r\n?/g, '\n')
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  const site = websiteDomain ? normalizeHost(websiteDomain.replace(/^https?:\/\//, '').split('/')[0]) : null
  const patterns: string[] = []
  const invalid: string[] = []

  for (const entry of entries) {
    if (!/^https?:\/\//i.test(entry)) {
      patterns.push(entry)
      continue
    }
    try {
      const url = new URL(entry)
      const host = normalizeHost(url.hostname)
      if (site && host !== site && !host.endsWith(`.${site}`)) {
        invalid.push(entry)
        continue
      }
      patterns.push(decodeURIComponent(url.pathname))
    } catch {
      invalid.push(entry)
    }
  }

  return { patterns: Array.from(new Set(patterns)), invalid }
}
