import type { QueryStats } from '../../shared/types/queryStats'

export type PatternType = 'alternation' | 'cycle' | 'quick-return'
export type PatternPriority = 'reach' | 'days' | 'repetitions'
export type PatternEstimate = {
  queryStats: QueryStats & { totalBytesProcessed: number }
  requiresConfirmation: boolean
  maximumBytesBilled: string
}

export type NavigationPattern = {
  id: string
  type: PatternType
  pages: string[]
  sessions: number
  share: number
  medianRepetitions: number
  trend: { date: string; sessions: number }[]
  before: { path: string; sessions: number }[]
  after: { path: string; sessions: number }[]
}

export type PatternResult = {
  summary: {
    totalSessions: number
    patternSessions: number
    repeatedCycleSessions: number
    ambiguousSessions: number
  }
  patterns: NavigationPattern[]
  generatedSql: string
  queryStats?: QueryStats
  metadata?: {
    invalidPathSessions: number
    missingSessionEvents: number
    timezone: string
  }
}

export const patternLabels: Record<PatternType, string> = {
  alternation: 'Frem og tilbake',
  cycle: 'Rundgang',
  'quick-return': 'Rask retur',
}

export const patternDescriptions: Record<PatternType, string> = {
  alternation: 'Minst to hele runder mellom de samme to sidene. Ingen tidsgrense.',
  cycle: 'Minst to hele runder via tre eller fire ulike sider. Ingen tidsgrense.',
  'quick-return': 'Tilbake til samme side etter høyst 10 sekunder på siden imellom. Én retur er nok.',
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

export function isPatternEstimate(value: unknown): value is PatternEstimate {
  if (!isRecord(value) || !isRecord(value.queryStats)) return false
  const stats = value.queryStats
  return (
    Number.isSafeInteger(stats.totalBytesProcessed) &&
    isCount(stats.totalBytesProcessed) &&
    (typeof stats.totalBytesProcessedGB === 'string' || typeof stats.totalBytesProcessedGB === 'number') &&
    Number.isFinite(Number(stats.totalBytesProcessedGB)) &&
    Number(stats.totalBytesProcessedGB) >= 0 &&
    (typeof stats.estimatedCostUSD === 'string' || typeof stats.estimatedCostUSD === 'number') &&
    Number.isFinite(Number(stats.estimatedCostUSD)) &&
    Number(stats.estimatedCostUSD) >= 0 &&
    typeof value.requiresConfirmation === 'boolean' &&
    typeof value.maximumBytesBilled === 'string' &&
    /^\d+$/.test(value.maximumBytesBilled)
  )
}

export const patternDays = (pattern: NavigationPattern) =>
  new Set(pattern.trend.filter((day) => day.sessions > 0).map((day) => day.date)).size

export function prioritisePatterns(
  patterns: NavigationPattern[],
  type: PatternType | 'all',
  minimumSessions: number,
  priority: PatternPriority,
): NavigationPattern[] {
  return patterns
    .filter((pattern) => (type === 'all' || pattern.type === type) && pattern.sessions >= minimumSessions)
    .sort((a, b) => {
      const byReach = b.sessions - a.sessions
      const byDays = patternDays(b) - patternDays(a)
      const byRepetition = b.medianRepetitions - a.medianRepetitions
      return (
        (priority === 'days' ? byDays : priority === 'repetitions' ? byRepetition : byReach) ||
        byReach ||
        byDays ||
        byRepetition ||
        a.id.localeCompare(b.id)
      )
    })
}

function isContext(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item) && typeof item.path === 'string' && isCount(item.sessions))
  )
}

function isPattern(value: unknown): value is NavigationPattern {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    (value.type === 'alternation' || value.type === 'cycle' || value.type === 'quick-return') &&
    Array.isArray(value.pages) &&
    value.pages.length >= 2 &&
    value.pages.every((page) => typeof page === 'string' && page.startsWith('/')) &&
    isCount(value.sessions) &&
    isCount(value.share) &&
    value.share <= 1 &&
    isCount(value.medianRepetitions) &&
    Array.isArray(value.trend) &&
    value.trend.every((day) => isRecord(day) && typeof day.date === 'string' && isCount(day.sessions)) &&
    isContext(value.before) &&
    isContext(value.after)
  )
}

export function isPatternResult(value: unknown): value is PatternResult {
  if (!isRecord(value) || !isRecord(value.summary)) return false
  const stats = value.queryStats
  const metadata = value.metadata
  return (
    isCount(value.summary.totalSessions) &&
    isCount(value.summary.patternSessions) &&
    isCount(value.summary.repeatedCycleSessions) &&
    isCount(value.summary.ambiguousSessions) &&
    Array.isArray(value.patterns) &&
    value.patterns.every(isPattern) &&
    typeof value.generatedSql === 'string' &&
    (stats === undefined ||
      (isRecord(stats) &&
        (stats.totalBytesProcessed === undefined || isCount(stats.totalBytesProcessed)) &&
        ['totalBytesProcessedGB', 'estimatedCostUSD'].every(
          (key) => stats[key] === undefined || isCount(stats[key]) || typeof stats[key] === 'string',
        ))) &&
    (metadata === undefined ||
      (isRecord(metadata) &&
        isCount(metadata.invalidPathSessions) &&
        isCount(metadata.missingSessionEvents) &&
        typeof metadata.timezone === 'string'))
  )
}

export function patternSequence(pattern: NavigationPattern): string[] {
  return pattern.type === 'quick-return'
    ? [...pattern.pages, pattern.pages[0]]
    : [...pattern.pages, ...pattern.pages, pattern.pages[0]]
}

export function patternCsv(patterns: NavigationPattern[]): string {
  const quote = (value: string | number) => {
    const text = String(value)
    const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${safeText.replace(/"/g, '""')}"`
  }
  return [
    ['Mønster', 'Sider', 'Økter', 'Andel av analyserte økter', 'Median gjentakelser'],
    ...patterns.map((pattern) => [
      patternLabels[pattern.type],
      patternSequence(pattern).join(' → '),
      pattern.sessions,
      pattern.share,
      pattern.medianRepetitions,
    ]),
  ]
    .map((row) => row.map(quote).join(','))
    .join('\r\n')
}
