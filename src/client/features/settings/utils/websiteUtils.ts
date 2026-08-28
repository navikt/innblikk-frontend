import type { Website, GroupedWebsite } from '../model'
import { PROD_TEAM_ID } from '../model'

/**
 * Remove " - dev" or " - prod" suffix (handling different dash types: hyphen, en-dash, em-dash)
 * Also handle variations in whitespace
 */
export function getBaseName(name: string): string {
  return name.replace(/\s*[-–—]\s*(dev|prod)\s*$/i, '').trim()
}

/**
 * Check if a website belongs to the production team
 */
export function isProd(website: Website): boolean {
  return website.teamId === PROD_TEAM_ID
}

/**
 * Group websites by base name (removing environment suffixes)
 */
export function groupWebsites(websites: Website[]): GroupedWebsite[] {
  const groups = new Map<string, GroupedWebsite>()

  websites.forEach((website) => {
    const baseName = getBaseName(website.name)

    if (!groups.has(baseName)) {
      groups.set(baseName, {
        baseName,
        domain: website.domain,
        createdAt: website.createdAt,
        updatedAt: website.updatedAt,
      })
    }

    const group = groups.get(baseName)!

    if (isProd(website)) {
      group.prod = website
      // Prefer prod domain and dates
      group.domain = website.domain
      group.createdAt = website.createdAt
      group.updatedAt = website.updatedAt
    } else {
      group.dev = website
      // Only use dev domain/dates if no prod
      if (!group.prod) {
        group.domain = website.domain
        group.createdAt = website.createdAt
        group.updatedAt = website.updatedAt
      }
    }
  })

  // Sort by base name, but feature Nav.no first
  return Array.from(groups.values()).sort((a, b) => {
    const aIsFeatured = a.baseName.trim().toLowerCase() === 'nav.no'
    const bIsFeatured = b.baseName.trim().toLowerCase() === 'nav.no'

    if (aIsFeatured && !bIsFeatured) return -1
    if (!aIsFeatured && bIsFeatured) return 1

    return a.baseName.localeCompare(b.baseName, 'nb')
  })
}

/**
 * Format a date string or object to Norwegian format
 */
export function formatDate(createdAt: string | { value: string } | null | undefined): string {
  if (!createdAt) return 'Ukjent dato'

  let dateStr: string
  if (typeof createdAt === 'object' && 'value' in createdAt) {
    dateStr = createdAt.value
  } else {
    dateStr = createdAt
  }

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'Ugyldig dato'

  return date.toLocaleDateString('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
