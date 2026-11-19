import { describe, expect, it } from 'vitest'
import { parseRepetitionResult } from './repetition'

const response = () => ({
  summary: {
    total_visitors: '10',
    total_visits: 12,
    cookie_visitors: 8,
    fingerprint_visitors: 2,
    events_without_visit: 0,
    total_events: 30,
    custom_events: 10,
    interaction_events: 5,
    targeted_interaction_events: 3,
    tied_timestamps: 2,
  },
  affected_visitors: 1,
  total_episodes: 1,
  duplicate_episodes: 0,
  total_findings: 1,
  signal_findings: { pageviews: '0', interactions: 1, duplicates: 0 },
  is_generated_data: false,
  generatedSql: 'SELECT 1',
  queryStats: { totalBytesProcessedGB: '0.2', estimatedCostUSD: '0.001' },
  findings: [
    {
      signal: 'interactions',
      hostname: 'test.nav.no',
      page: '/',
      event_name: 'navigere',
      target: '',
      has_target: 0,
      episodes: 1,
      affected_visitors: 1,
      max_repetitions: 3,
      examples: [
        {
          started_at: { value: '2026-10-01T10:00:00Z' },
          ended_at: '2026-10-01T10:00:03Z',
          event_count: 3,
          duration_seconds: 3,
          session_id: 'fingerprint-1',
          visit_id: 'visit-1',
          visitor_type: 'cookie',
          device: 'mobile',
          browser: 'safari',
          event_ids: ['event-1', 'event-2', 'event-3'],
          example_kind: 'largest',
        },
      ],
    },
  ],
})

describe('parseRepetitionResult', () => {
  it('parses BigQuery numeric strings and timestamp wrappers without losing zero values', () => {
    const parsed = parseRepetitionResult(response())
    expect(parsed.summary.totalVisitors).toBe(10)
    expect(parsed.duplicateEpisodes).toBe(0)
    expect(parsed.signalFindings).toEqual({ pageviews: 0, interactions: 1, duplicates: 0 })
    expect(parsed.findings[0].hasTarget).toBe(false)
    expect(parsed.findings[0].examples[0].startedAt).toBe('2026-10-01T10:00:00Z')
    expect(parsed.queryStats?.totalBytesProcessedGB).toBe(0.2)
    expect(parsed.findings[0].examples[0].eventIds).toEqual(['event-1', 'event-2', 'event-3'])
  })

  it('accepts empty results and explicitly labelled generated data', () => {
    expect(parseRepetitionResult({ ...response(), findings: [], is_generated_data: true })).toMatchObject({
      findings: [],
      isGeneratedData: true,
    })
  })

  it.each([null, {}, { ...response(), findings: null }, { ...response(), is_generated_data: 1 }])(
    'rejects malformed response shapes',
    (value) => {
      expect(() => parseRepetitionResult(value)).toThrow()
    },
  )

  it.each([null, '', 'not-a-number', -1, Infinity])('rejects invalid counts: %s', (value) => {
    const data = response()
    expect(() => parseRepetitionResult({ ...data, affected_visitors: value })).toThrow()
  })

  it('rejects examples without a known kind', () => {
    const data = response()
    Object.assign(data.findings[0].examples[0], { example_kind: 'other' })
    expect(() => parseRepetitionResult(data)).toThrow()
  })

  it('rejects unknown signals and malformed example timestamps', () => {
    const data = response()
    expect(() => parseRepetitionResult({ ...data, findings: [{ ...data.findings[0], signal: 'unknown' }] })).toThrow()
    data.findings[0].examples[0].ended_at = 'not-a-date'
    expect(() => parseRepetitionResult(data)).toThrow()
  })
})
