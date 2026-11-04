import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { buildNavigationPatternCtes, buildNavigationPatternQuery } from './navigationPatternQuery.js'

vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

// Execute the runtime detection CTEs, not a second detection implementation.
// Only BigQuery scalar syntax is adapted; windows, grouping and predicates are unchanged.
function fixture(sequences, { urlPath = '', pathScope = 'anywhere', endDate = '2026-10-04T00:00:00Z' } = {}) {
  const db = new DatabaseSync(':memory:')
  db.exec(
    'CREATE TABLE events (session_id TEXT, created_at INTEGER, url_path TEXT, website_id TEXT, event_type INTEGER)',
  )
  db.function('REGEXP_REPLACE', (value, pattern, replacement) =>
    value === null ? null : value.replace(new RegExp(pattern, 'g'), replacement),
  )
  db.function('TIMESTAMP', (value) => Date.parse(value) * 1000)
  db.function('TIMESTAMP_DIFF', (end, start) => end - start)
  const insert = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?)')
  for (const [session, sequence] of Object.entries(sequences)) {
    sequence.forEach((value, i) => {
      const event = typeof value === 'string' || value === null ? { path: value } : value
      insert.run(
        session,
        Date.parse(event.at ?? '2026-10-01T12:00:00Z') * 1000 + (event.seconds ?? i * 2) * 1000000,
        event.path,
        event.website ?? 'site',
        event.type ?? 1,
      )
    })
  }
  const query = buildNavigationPatternCtes('test-project')
    .replaceAll('`test-project.umami_views.event`', 'events')
    .replaceAll(/r'([^']*)'/g, "'$1'")
    .replaceAll(/TO_JSON_STRING\(\[([^\]]*)\]\)/g, 'json_array($1)')
    .replaceAll('TIMESTAMP_DIFF(t2, t1, MICROSECOND)', 'TIMESTAMP_DIFF(t2, t1)')
  const params = { websiteId: 'site', startDate: '2026-10-01T00:00:00Z', endDate, urlPath, pathScope }
  const read = (select) =>
    db
      .prepare(`${query} ${select}`)
      .all(params)
      .map((row) => ({ ...row }))
  return {
    patterns: () => read('SELECT * FROM session_patterns ORDER BY session_id, type, pattern_key'),
    occurrences: () => read('SELECT * FROM occurrences ORDER BY session_id, start_step'),
    collapsed: () => read('SELECT * FROM collapsed ORDER BY session_id, step'),
    summary: () =>
      read(`SELECT
      (SELECT COUNT(*) FROM selected_sessions) AS totalSessions,
      (SELECT COUNT(DISTINCT session_id) FROM session_patterns) AS patternSessions,
      (SELECT COUNT(DISTINCT session_id) FROM session_patterns WHERE type != 'quick-return') AS repeatedCycleSessions,
      (SELECT COUNT(*) FROM selected_sessions JOIN ambiguous_sessions USING (session_id)) AS ambiguousSessions`)[0],
    close: () => db.close(),
  }
}

function run(sequences, options, assertion) {
  const data = fixture(sequences, options)
  try {
    assertion(data)
  } finally {
    data.close()
  }
}

describe('navigation pattern runtime SQL detection', () => {
  it('starts at the first normalized matching pageview and only includes later loops involving that page', () => {
    run(
      {
        postAnchor: ['/x', '/y', '//hello/?q=1', '/a', '/b', '/a', '/b', '/a'],
        preAnchor: ['/a', '/b', '/a', '/b', '/a', '/hello', '/c'],
        anchorOnly: ['/x', '/hello'],
        selectedLoopLater: ['/x', '/hello', '/gap', '/a', '/hello', '/a', '/hello', '/a'],
        notSelected: ['/a', '/b', '/a', '/b', '/a'],
      },
      { urlPath: '/hello/', pathScope: 'from-first-visit' },
      (data) => {
        expect(data.summary()).toEqual({
          totalSessions: 4,
          patternSessions: 1,
          repeatedCycleSessions: 1,
          ambiguousSessions: 0,
        })
        expect(data.patterns().filter((pattern) => pattern.type === 'alternation')).toEqual([
          { session_id: 'selectedLoopLater', type: 'alternation', pattern_key: '["/hello","/a"]', repetitions: 2 },
        ])
        expect(
          data
            .collapsed()
            .filter((event) => event.session_id === 'postAnchor')
            .map((event) => event.path),
        ).toEqual(['/hello', '/a', '/b', '/a', '/b', '/a'])
        expect(
          data
            .collapsed()
            .filter((event) => event.session_id === 'preAnchor')
            .map((event) => event.path),
        ).toEqual(['/hello', '/c'])
      },
    )
  })

  it('never resets at returning anchors or removes intervening pages, and cannot expose pre-anchor before context', () => {
    run(
      {
        returning: ['/secret-before', '/hello', '/a', '/hello', '/a', '/hello', '/exit'],
        interrupted: ['/secret-before', '/hello', '/a', '/b', '/extra', '/a', '/b', '/a'],
      },
      { urlPath: '/hello', pathScope: 'from-first-visit' },
      (data) => {
        const repeated = data.occurrences().filter((pattern) => pattern.type === 'alternation')
        expect(repeated).toHaveLength(1)
        expect(repeated[0]).toMatchObject({
          session_id: 'returning',
          start_step: 1,
          end_step: 5,
          repetitions: 2,
          pattern_key: '["/hello","/a"]',
        })
        const events = data.collapsed().filter((event) => event.session_id === 'returning')
        expect(events.find((event) => event.step === repeated[0].start_step - 1)).toBeUndefined()
        expect(events.find((event) => event.step === repeated[0].end_step + 1).path).toBe('/exit')
        expect(data.collapsed().some((event) => event.path === '/secret-before')).toBe(false)
        expect(
          data.patterns().filter((pattern) => pattern.session_id === 'interrupted' && pattern.type === 'alternation'),
        ).toEqual([])
      },
    )
  })

  it('requires the selected page inside the pattern, not just elsewhere in the session', () => {
    run(
      {
        before: ['/a', '/b', '/a', '/b', '/a', '/hello', '/c'],
        after: ['/hello', '/a', '/b', '/a', '/b', '/a'],
        included: ['/a', '//hello/?q=1', '/a', '/hello/', '/a'],
        notSelected: ['/a', '/b', '/a', '/b', '/a'],
      },
      { urlPath: '/hello/', pathScope: 'anywhere' },
      (data) => {
        expect(data.patterns().filter((pattern) => pattern.type === 'alternation')).toEqual([
          { session_id: 'included', type: 'alternation', pattern_key: '["/a","/hello"]', repetitions: 2 },
        ])
        expect(data.patterns().every((pattern) => pattern.session_id === 'included')).toBe(true)
        expect(data.summary()).toEqual({
          totalSessions: 3,
          patternSessions: 1,
          repeatedCycleSessions: 1,
          ambiguousSessions: 0,
        })
        expect(data.collapsed().find((event) => event.session_id === 'included').path).toBe('/a')
      },
    )
  })

  it('includes three- and four-page cycles with the selected page at an intermediate position', () => {
    run(
      {
        triangle: ['/a', '/b', '/hello', '/a', '/b', '/hello', '/a'],
        square: ['/a', '/b', '/c', '/hello', '/a', '/b', '/c', '/hello', '/a'],
      },
      { urlPath: '/hello', pathScope: 'anywhere' },
      (data) => {
        expect(data.patterns()).toEqual([
          { session_id: 'square', type: 'cycle', pattern_key: '["/a","/b","/c","/hello"]', repetitions: 2 },
          { session_id: 'triangle', type: 'cycle', pattern_key: '["/a","/b","/hello"]', repetitions: 2 },
        ])
      },
    )
  })

  it('includes quick returns with the selected page at either position, preserving direction', () => {
    run(
      {
        fromSelected: ['/hello', '/a', '/hello'],
        throughSelected: ['/a', '/hello', '/a'],
        before: ['/a', '/b', '/a', '/hello'],
        after: ['/hello', '/a', '/b', '/a'],
      },
      { urlPath: '/hello', pathScope: 'anywhere' },
      (data) => {
        expect(data.patterns()).toEqual([
          { session_id: 'fromSelected', type: 'quick-return', pattern_key: '["/hello","/a"]', repetitions: 1 },
          { session_id: 'throughSelected', type: 'quick-return', pattern_key: '["/a","/hello"]', repetitions: 1 },
        ])
        expect(data.summary()).toMatchObject({ totalSessions: 4, patternSessions: 2, repeatedCycleSessions: 0 })
      },
    )
  })

  it('displays directed three- and four-page cycles from the selected page, not lexical order', () => {
    run(
      {
        triangle: ['/before', '/c', '/a', '/b', '/c', '/a', '/b', '/c'],
        rotatedLater: ['/c', '/gap', '/b', '/c', '/a', '/b', '/c', '/a', '/b'],
        reverse: ['/c', '/b', '/a', '/c', '/b', '/a', '/c'],
        square: ['/c', '/d', '/a', '/b', '/c', '/d', '/a', '/b', '/c'],
        unrelated: ['/c', '/gap', '/a', '/b', '/a', '/b', '/a'],
      },
      { urlPath: '//c/?q=1', pathScope: 'from-first-visit' },
      (data) => {
        expect(data.patterns().filter((pattern) => pattern.type === 'cycle')).toEqual([
          { session_id: 'reverse', type: 'cycle', pattern_key: '["/c","/b","/a"]', repetitions: 2 },
          { session_id: 'rotatedLater', type: 'cycle', pattern_key: '["/c","/a","/b"]', repetitions: 2 },
          { session_id: 'square', type: 'cycle', pattern_key: '["/c","/d","/a","/b"]', repetitions: 2 },
          { session_id: 'triangle', type: 'cycle', pattern_key: '["/c","/a","/b"]', repetitions: 2 },
        ])
        expect(data.patterns().every((pattern) => JSON.parse(pattern.pattern_key)[0] === '/c')).toBe(true)
        expect(data.patterns().some((pattern) => pattern.session_id === 'unrelated')).toBe(false)
      },
    )
  })

  it('only counts quick returns to the selected page without reversing journeys through it', () => {
    run(
      {
        back: ['/before', '/hello', '/a', '/hello', '/a', '/hello'],
        through: ['/hello', '/gap', '/b', '/hello', '/b'],
        elsewhere: ['/hello', '/a', '/b', '/a'],
      },
      { urlPath: '/hello/', pathScope: 'from-first-visit' },
      (data) => {
        expect(data.patterns().filter((pattern) => pattern.type === 'quick-return')).toEqual([
          { session_id: 'back', type: 'quick-return', pattern_key: '["/hello","/a"]', repetitions: 2 },
        ])
        expect(data.summary()).toMatchObject({ totalSessions: 3, patternSessions: 1, repeatedCycleSessions: 1 })
      },
    )
  })

  it('still excludes sessions with ambiguous timestamps or unknown paths before the anchor', () => {
    run(
      {
        tiedBefore: [{ path: '/x', seconds: 0 }, { path: '/y', seconds: 0 }, '/hello', '/a', '/b', '/a', '/b', '/a'],
        unknownBefore: [null, '/hello', '/a', '/b', '/a', '/b', '/a'],
      },
      { urlPath: '/hello', pathScope: 'from-first-visit' },
      (data) => {
        expect(data.summary()).toEqual({
          totalSessions: 2,
          patternSessions: 0,
          repeatedCycleSessions: 0,
          ambiguousSessions: 1,
        })
        expect(data.collapsed()).toEqual([])
      },
    )
  })

  it('requires two complete rounds and counts each session once with the maximum consecutive rounds', () => {
    run(
      {
        short: ['/a', '/b', '/a', '/b'],
        two: ['/a', '/b', '/a', '/b', '/a'],
        long: ['/a', '/b', '/a', '/b', '/a', '/b', '/a', '/x', '/a', '/b', '/a', '/b', '/a'],
      },
      {},
      (data) => {
        const repeated = data.patterns().filter((p) => p.type === 'alternation')
        expect(repeated.map((p) => [p.session_id, p.repetitions])).toEqual([
          ['long', 3],
          ['two', 2],
        ])
        expect(data.occurrences().filter((p) => p.session_id === 'long' && p.type === 'alternation')).toHaveLength(2)
      },
    )
  })

  it('detects distinct directed 3/4-page cycles, canonicalizing rotations but not reversals', () => {
    run(
      {
        triangle: ['/c', '/a', '/b', '/c', '/a', '/b', '/c'],
        rotated: ['/b', '/c', '/a', '/b', '/c', '/a', '/b'],
        reverse: ['/a', '/c', '/b', '/a', '/c', '/b', '/a'],
        square: ['/d', '/a', '/b', '/c', '/d', '/a', '/b', '/c', '/d'],
        incomplete: ['/a', '/b', '/c', '/a', '/b', '/c'],
        notDistinct: ['/a', '/b', '/a', '/c', '/a', '/b', '/a', '/c', '/a'],
      },
      {},
      (data) => {
        const cycles = data.patterns().filter((p) => p.type === 'cycle')
        expect(cycles.map((p) => [p.session_id, JSON.parse(p.pattern_key), p.repetitions])).toEqual([
          ['reverse', ['/a', '/c', '/b'], 2],
          ['rotated', ['/a', '/b', '/c'], 2],
          ['square', ['/a', '/b', '/c', '/d'], 2],
          ['triangle', ['/a', '/b', '/c'], 2],
        ])
      },
    )
  })

  it('keeps rapid-return orientation and counts occurrences, using B arrival not A departure', () => {
    run(
      {
        forward: [
          { path: '/a', seconds: 0 },
          { path: '/b', seconds: 100 },
          { path: '/a', seconds: 110 },
        ],
        reverse: ['/b', '/a', '/b'],
        slow: [
          { path: '/a', seconds: 0 },
          { path: '/b', seconds: 1 },
          { path: '/a', seconds: 11.001 },
        ],
        repeated: ['/a', '/b', '/a', '/b', '/a'],
        duplicateB: [
          { path: '/a', seconds: 0 },
          { path: '/b', seconds: 1 },
          { path: '/b?again', seconds: 15 },
          { path: '/a', seconds: 16 },
        ],
      },
      {},
      (data) => {
        const quick = data.patterns().filter((p) => p.type === 'quick-return')
        expect(quick.map((p) => [p.session_id, JSON.parse(p.pattern_key), p.repetitions])).toEqual([
          ['forward', ['/a', '/b'], 1],
          ['repeated', ['/a', '/b'], 2],
          ['repeated', ['/b', '/a'], 1],
          ['reverse', ['/b', '/a'], 1],
        ])
      },
    )
  })

  it('normalizes the selected path and retains context and intermediate pages without inventing loops', () => {
    run(
      {
        included: ['/entry', '/a/', '//a?x=1', '/b#x', '/a', '/b', '/a', '/exit'],
        excluded: ['/z', '/y', '/z', '/y', '/z'],
        interrupted: ['/entry', '/a', '/b', '/extra', '/a', '/b', '/a'],
      },
      { urlPath: '/a/?query=ignored', pathScope: 'anywhere' },
      (data) => {
        expect(data.summary().totalSessions).toBe(2)
        const cycles = data.occurrences().filter((p) => p.type === 'alternation')
        expect(cycles).toHaveLength(1)
        expect(cycles[0]).toMatchObject({ start_step: 2, end_step: 6, repetitions: 2 })
        const events = data.collapsed().filter((p) => p.session_id === 'included')
        expect(events.map((p) => p.path)).toEqual(['/entry', '/a', '/b', '/a', '/b', '/a', '/exit'])
        expect(events[1].created_at).toBe(Date.parse('2026-10-01T12:00:02Z') * 1000)
        expect(events.find((p) => p.step === cycles[0].start_step - 1).path).toBe('/entry')
        expect(events.find((p) => p.step === cycles[0].end_step + 1).path).toBe('/exit')
      },
    )
  })

  it('excludes whole ambiguous/unknown-path sessions without inventing order or removing intermediate events', () => {
    run(
      {
        tied: [{ path: '/a', seconds: 0 }, { path: '/b', seconds: 0 }, '/a', '/b', '/a'],
        duplicate: [{ path: '/a', seconds: 0 }, { path: '/a', seconds: 0 }, '/b', '/a', '/b', '/a'],
        unknown: ['/a', '/b', null, '/a', '/b', '/a'],
        unrelated: [{ path: '/a', website: 'other' }],
      },
      {},
      (data) => {
        expect(data.summary()).toEqual({
          totalSessions: 3,
          patternSessions: 0,
          repeatedCycleSessions: 0,
          ambiguousSessions: 2,
        })
        expect(data.patterns()).toEqual([])
      },
    )
  })

  it('observes an exclusive period end, excludes custom events and never silently truncates long sessions', () => {
    run(
      {
        boundary: ['/a', '/b', '/a', '/b', { path: '/a', at: '2026-10-04T00:00:00Z', seconds: 0 }],
        long: Array.from({ length: 201 }, (_, i) => (i % 2 ? '/b' : '/a')),
        custom: ['/a', '/b', '/a', { path: '/b', type: 2 }, '/a'],
      },
      {},
      (data) => {
        expect(data.patterns().filter((p) => p.type === 'alternation')).toEqual([
          { session_id: 'long', type: 'alternation', pattern_key: '["/a","/b"]', repetitions: 100 },
        ])
      },
    )
    run({}, {}, (data) => {
      expect(data.summary()).toEqual({
        totalSessions: 0,
        patternSessions: 0,
        repeatedCycleSessions: 0,
        ambiguousSessions: 0,
      })
    })
  })

  it('aggregates only and exposes exact medians, distinct-session daily/context counts and deterministic IDs', () => {
    const query = buildNavigationPatternQuery('test-project')
    expect(query).toContain('PERCENTILE_CONT(repetitions, 0.5)')
    expect(query).toContain('DATE(started_at, @timezone)')
    expect(query).toContain('COUNT(DISTINCT o.session_id)')
    expect(query).toContain('SHA256(p.pattern_key)')
    expect(query.slice(query.lastIndexOf('SELECT\n      STRUCT('))).not.toContain('session_id AS')
    expect(query).not.toMatch(/\bLIMIT\b|\bTABLESAMPLE\b/i)
  })
})
