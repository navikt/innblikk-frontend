import { describe, expect, it } from 'vitest'
import {
  isPatternResult,
  isPatternEstimate,
  prioritisePatterns,
  patternDays,
  patternCsv,
  patternSequence,
  type NavigationPattern,
  type PatternResult,
} from './model'

export const pattern: NavigationPattern = {
  id: 'alternation-1',
  type: 'alternation',
  pages: ['/oversikt', '/soknad'],
  sessions: 12,
  share: 0.12,
  medianRepetitions: 2,
  trend: [{ date: '2026-10-28', sessions: 12 }],
  before: [{ path: '/', sessions: 8 }],
  after: [{ path: '/hjelp', sessions: 3 }],
}

export const result: PatternResult = {
  summary: { totalSessions: 100, patternSessions: 15, repeatedCycleSessions: 12, ambiguousSessions: 2 },
  patterns: [pattern, { ...pattern, id: 'return-1', type: 'quick-return', sessions: 8, share: 0.08 }],
  generatedSql: 'SELECT 1',
  queryStats: { totalBytesProcessedGB: '0.02', estimatedCostUSD: '0.0001' },
}

describe('navigation pattern response', () => {
  it('accepts aggregate results and explicit empty results', () => {
    expect(isPatternResult(result)).toBe(true)
    expect(isPatternResult({ ...result, patterns: [] })).toBe(true)
  })

  it.each([
    null,
    {},
    { ...result, summary: {} },
    { ...result, patterns: [{}] },
    { ...result, patterns: [{ ...pattern, share: 12 }] },
    { ...result, patterns: [{ ...pattern, sessions: -1 }] },
    { ...result, patterns: [{ ...pattern, before: null }] },
    { ...result, patterns: [{ ...pattern, pages: [] }] },
    { ...result, patterns: [{ ...pattern, pages: ['https://example.com', '/'] }] },
    { ...result, patterns: [{ ...pattern, type: 'unknown' }] },
  ])('rejects malformed or misleading results: %j', (value) => {
    expect(isPatternResult(value)).toBe(false)
  })
})

describe('pattern presentation', () => {
  it('illustrates two complete rounds for repeated patterns', () => {
    expect(patternSequence(pattern)).toEqual(['/oversikt', '/soknad', '/oversikt', '/soknad', '/oversikt'])
    expect(patternSequence({ ...pattern, type: 'cycle', pages: ['/a', '/b', '/c'] })).toEqual([
      '/a',
      '/b',
      '/c',
      '/a',
      '/b',
      '/c',
      '/a',
    ])
  })

  it('illustrates only one return for a quick return', () => {
    expect(patternSequence({ ...pattern, type: 'quick-return' })).toEqual(['/oversikt', '/soknad', '/oversikt'])
  })

  it('exports session counts, fractional shares and safely escaped paths', () => {
    const csv = patternCsv([{ ...pattern, pages: ['/a,"quoted"', '/b'] }])
    expect(csv).toContain('"Økter"')
    expect(csv).toContain('"12","0.12","2"')
    expect(csv).toContain('/a,""quoted""')
    expect(csv.split('\r\n')).toHaveLength(2)
  })

  it('prioritises reach or recurrence explicitly without mutating the source or inventing significance', () => {
    const recurring = {
      ...pattern,
      id: 'recurring',
      type: 'cycle' as const,
      sessions: 6,
      pages: ['/a', '/b', '/c'],
      trend: [
        { date: '2026-10-28', sessions: 2 },
        { date: '2026-10-29', sessions: 2 },
        { date: '2026-10-30', sessions: 2 },
      ],
    }
    const inputs = [recurring, pattern]
    expect(prioritisePatterns(inputs, 'all', 1, 'reach')[0].id).toBe(pattern.id)
    expect(prioritisePatterns(inputs, 'all', 1, 'days')[0].id).toBe('recurring')
    expect(prioritisePatterns(inputs, 'cycle', 1, 'reach')).toEqual([recurring])
    expect(prioritisePatterns(inputs, 'cycle', 10, 'reach')).toEqual([])
    expect(inputs[0].id).toBe('recurring')
    expect(
      patternDays({
        ...recurring,
        trend: [...recurring.trend, recurring.trend[0], { date: '2026-10-31', sessions: 0 }],
      }),
    ).toBe(3)
  })

  it('requires a valid, explicit cost estimate before execution', () => {
    const quote = {
      queryStats: { totalBytesProcessed: 123, totalBytesProcessedGB: '0.00', estimatedCostUSD: '0.000' },
      requiresConfirmation: false,
      maximumBytesBilled: '500000',
    }
    expect(isPatternEstimate(quote)).toBe(true)
    expect(isPatternEstimate({ ...quote, queryStats: {} })).toBe(false)
    expect(isPatternEstimate({ ...quote, queryStats: { ...quote.queryStats, totalBytesProcessed: -1 } })).toBe(false)
    expect(isPatternEstimate({ ...quote, queryStats: { ...quote.queryStats, estimatedCostUSD: 'unknown' } })).toBe(
      false,
    )
    expect(isPatternEstimate({ ...quote, requiresConfirmation: undefined })).toBe(false)
  })
})
