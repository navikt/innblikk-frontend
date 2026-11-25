import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  REPETITION_DETECTION_SQL,
  REPETITION_EVIDENCE_SQL,
  REPETITION_PATH_SQL,
  REPETITION_PATH_FILTER_SQL,
  REPETITION_VOLATILE_PROPERTY_PATTERN,
  buildRepetitionQuery,
} from './repetitionQuery.js'

function detect(events, evidence = false) {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE events (
      event_id TEXT PRIMARY KEY, session_id TEXT, visit_key TEXT, hostname TEXT, page TEXT, event_type INTEGER,
      event_name TEXT, fingerprint TEXT, finding_fingerprint TEXT, duplicate_fingerprint TEXT, target TEXT,
      has_target INTEGER, is_interaction INTEGER, time_us INTEGER
    )`)
    const insert = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    events.forEach((event, index) => {
      const type = event.type ?? 1
      const name = event.name ?? (type === 1 ? '' : 'navigere')
      const target = event.target ?? (type === 1 ? '' : 'Send søknad')
      const fingerprint = JSON.stringify([name, target])
      insert.run(
        `event-${String(index).padStart(3, '0')}`,
        event.session ?? 'session-1',
        event.visit ?? 'visit-1',
        event.hostname ?? 'test.nav.no',
        event.page ?? '/',
        type,
        name,
        fingerprint,
        JSON.stringify([type, name, target]),
        JSON.stringify([type, name, target, event.payload ?? '']),
        target,
        target ? 1 : 0,
        event.interaction ?? (type === 2 ? 1 : 0),
        Math.round(event.time * 1000000),
      )
    })
    return db
      .prepare(
        `WITH RawEvents AS (SELECT * FROM events),
      ${REPETITION_DETECTION_SQL}
      ${
        evidence
          ? `, ExampleEpisodes AS (SELECT * FROM Episodes), ${REPETITION_EVIDENCE_SQL}
             SELECT signal, episode_number, event_id FROM EpisodeEvidence ORDER BY signal, episode_number, event_id`
          : `SELECT signal, session_id, page, target, has_target, start_us, end_us, event_count
             FROM Episodes ORDER BY signal, start_us`
      }`,
      )
      .all()
  } finally {
    db.close()
  }
}

const signal = (events, name) => detect(events).filter((episode) => episode.signal === name)

describe('executed repetition detection SQL', () => {
  it('includes the 30-second pageview threshold but excludes slower sequences', () => {
    expect(signal([{ time: 0 }, { time: 15 }, { time: 30 }], 'pageviews')).toHaveLength(1)
    expect(signal([{ time: 0 }, { time: 15 }, { time: 30.001 }], 'pageviews')).toHaveLength(0)
    expect(signal([{ time: 0 }, { time: 1 }], 'pageviews')).toHaveLength(0)
  })

  it('does not hide intervening pageviews, even on a different hostname', () => {
    for (const other of [{ page: '/other' }, { hostname: 'other.nav.no' }]) {
      expect(signal([{ time: 0 }, { time: 1 }, { time: 2, ...other }, { time: 3 }], 'pageviews')).toHaveLength(0)
    }
  })

  it('selects evidence by episode sequence when intervening pageviews share timestamps', () => {
    const events = ['/a', '/a', '/a', '/b', '/a'].map((page) => ({ page, time: 0 }))
    expect(signal(events, 'pageviews')).toEqual([expect.objectContaining({ event_count: 3 })])
    expect(
      detect(events, true)
        .filter((row) => row.signal === 'pageviews')
        .map((row) => row.event_id),
    ).toEqual(['event-000', 'event-001', 'event-002'])

    events.push({ page: '/a', time: 0 }, { page: '/a', time: 0 })
    const evidence = detect(events, true).filter((row) => row.signal === 'pageviews')
    expect(evidence.filter((row) => row.episode_number === 1).map((row) => row.event_id)).toEqual([
      'event-000',
      'event-001',
      'event-002',
    ])
    expect(evidence.filter((row) => row.episode_number === 2).map((row) => row.event_id)).toEqual([
      'event-004',
      'event-005',
      'event-006',
    ])
  })

  it('does not split pageview sequences on custom events', () => {
    expect(signal([{ time: 0 }, { time: 1, type: 2 }, { time: 2 }, { time: 3 }], 'pageviews')).toHaveLength(1)
  })

  it('does not flag progress through different calculator steps as repeated pageviews', () => {
    const events = ['/aap', '/aap/kalkulator', '/aap/kalkulator/steg/1', '/aap/kalkulator/steg/2'].map(
      (page, index) => ({ page, time: index * 3 }),
    )
    expect(signal(events, 'pageviews')).toEqual([])
  })

  it('uses the entire 5-second window, not just gaps between successive interactions', () => {
    const events = (times) => times.map((time) => ({ time, type: 2 }))
    expect(signal(events([0, 2, 5]), 'interactions')).toHaveLength(1)
    expect(signal(events([0, 2, 5.001]), 'interactions')).toHaveLength(0)
    expect(signal(events([0, 4, 8]), 'interactions')).toHaveLength(0)
    expect(signal(events([0, 1]), 'interactions')).toHaveLength(0)
  })

  it('keeps sessions, pages, hostnames, event names and targets separate', () => {
    for (const difference of [
      { session: 'session-2' },
      { visit: 'visit-2' },
      { page: '/other' },
      { hostname: 'other.nav.no' },
      { name: 'klikk' },
      { target: 'Avbryt' },
    ]) {
      expect(
        signal(
          [
            { time: 0, type: 2 },
            { time: 1, type: 2 },
            { time: 2, type: 2, ...difference },
          ],
          'interactions',
        ),
      ).toHaveLength(0)
    }
  })

  it('does not interpret automatic events as repeated clicks', () => {
    expect(
      signal(
        [0, 1, 2].map((time) => ({ time, type: 2, interaction: 0 })),
        'interactions',
      ),
    ).toHaveLength(0)
  })

  it('retains the lower-confidence missing-target signal', () => {
    expect(
      signal(
        [0, 1, 2].map((time) => ({ time, type: 2, target: '' })),
        'interactions',
      ),
    ).toEqual([expect.objectContaining({ has_target: 0, event_count: 3 })])
  })

  it('merges overlapping windows but separates episodes with no shared events', () => {
    const episodes = signal(
      [0, 1, 2, 3, 10, 11, 12].map((time) => ({ time, type: 2 })),
      'interactions',
    )
    expect(episodes).toEqual([
      expect.objectContaining({ start_us: 0, end_us: 3000000, event_count: 4 }),
      expect.objectContaining({ start_us: 10000000, end_us: 12000000, event_count: 3 }),
    ])
  })

  it('detects duplicates at exactly 100ms, including tied timestamps', () => {
    expect(signal([{ time: 0 }, { time: 0.1 }], 'duplicates')).toHaveLength(1)
    expect(signal([{ time: 0 }, { time: 0.100001 }], 'duplicates')).toHaveLength(0)
    expect(signal([{ time: 0 }, { time: 0 }, { time: 0 }], 'duplicates')).toEqual([
      expect.objectContaining({ event_count: 3, start_us: 0, end_us: 0 }),
    ])
  })

  it('does not call different functional payloads duplicates', () => {
    expect(
      signal(
        [
          { time: 0, payload: 'a' },
          { time: 0.01, payload: 'b' },
        ],
        'duplicates',
      ),
    ).toHaveLength(0)
  })

  it('supports unordered input and overlapping frustration/duplicate signals', () => {
    const episodes = detect([0.1, 0, 0.05].map((time) => ({ time, type: 2 })))
    expect(episodes.map((episode) => episode.signal)).toEqual(['duplicates', 'interactions'])
    expect(episodes.every((episode) => episode.event_count === 3)).toBe(true)
  })

  it('returns no episodes for an empty dataset', () => {
    expect(detect([])).toEqual([])
  })
})

describe('BigQuery source and aggregation', () => {
  it('preserves directory separators for prefixes while keeping exact matching slash-insensitive', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.function('REGEXP_REPLACE', (value, pattern, replacement) =>
        value === null ? null : value.replace(new RegExp(pattern, 'g'), replacement),
      )
      db.function('STARTS_WITH', (value, prefix) => Number(value.startsWith(prefix)))
      db.exec('CREATE TABLE paths (url_path TEXT)')
      const paths = ['/aap/', '/aap/steg/1', '/aap-soknad', '/aap', '/aap//steg/2?test=1', '/aap/#info']
      const insert = db.prepare('INSERT INTO paths VALUES (?)')
      paths.forEach((path) => insert.run(path))
      const query = db.prepare(`
        WITH Normalized AS (SELECT ${REPETITION_PATH_SQL.replace(/r'/g, "'")} AS page FROM paths)
        SELECT page FROM Normalized WHERE ${REPETITION_PATH_FILTER_SQL} ORDER BY page
      `)
      expect(query.all({ urlPath: '/aap/', pathOperator: 'starts-with' }).map((row) => row.page)).toEqual([
        '/aap/',
        '/aap/',
        '/aap/steg/1',
        '/aap/steg/2',
      ])
      expect(query.all({ urlPath: '/aap', pathOperator: 'equals' }).map((row) => row.page)).toEqual([
        '/aap',
        '/aap/',
        '/aap/',
      ])
      expect(query.all({ urlPath: '/aap', pathOperator: 'starts-with' })).toHaveLength(paths.length)
    } finally {
      db.close()
    }
  })

  it('bounds the session partition scan with a look-back before the selected period', () => {
    const sql = buildRepetitionQuery('test-project')
    const sessionQuery = sql.slice(sql.indexOf('SessionIdentities AS'), sql.indexOf('PropertyValues AS'))
    expect(sessionQuery).toContain(
      'created_at BETWEEN TIMESTAMP_SUB(TIMESTAMP(@startDate), INTERVAL 31 DAY) AND TIMESTAMP(@endDate)',
    )
    expect(sessionQuery).toContain('session_id IN (SELECT DISTINCT session_id FROM SourceEvents)')
  })

  it.each(['deviceBrowser', 'deviceViewportHeight', 'originVersion', 'screenWidth'])(
    'ignores volatile metadata in duplicate comparison: %s',
    (key) => expect(new RegExp(REPETITION_VOLATILE_PROPERTY_PATTERN, 'i').test(key)).toBe(true),
  )

  it.each([
    'lenketekst',
    'destinasjon',
    'komponentId',
    'seksjon',
    'beløp',
    'valg',
    'målgruppe',
    'scrollPos',
    'scrollPercent',
    'scrollPercentage',
    'scrollPosition',
    'scrollDepth',
  ])('preserves functional properties in duplicate comparison: %s', (key) =>
    expect(new RegExp(REPETITION_VOLATILE_PROPERTY_PATTERN, 'i').test(key)).toBe(false),
  )

  it.each([1, 2])('requires matching scroll values for duplicate events of type %i', (type) => {
    const payload = (scrollPos, scrollPercent) =>
      JSON.stringify(
        Object.entries({ scrollPos, scrollPercent }).filter(
          ([key]) => !new RegExp(REPETITION_VOLATILE_PROPERTY_PATTERN, 'i').test(key),
        ),
      )
    const first = { time: 0, type, payload: payload(171, 19) }
    expect(signal([first, { time: 0, type, payload: payload(0, 17) }], 'duplicates')).toHaveLength(0)
    expect(signal([first, { time: 0, type, payload: payload(183, 19) }], 'duplicates')).toHaveLength(0)
    expect(signal([first, { time: 0, type, payload: payload(171, 17) }], 'duplicates')).toHaveLength(0)
    expect(signal([first, { time: 0, type, payload: payload(171, 19) }], 'duplicates')).toHaveLength(1)
  })

  it('deduplicates event IDs, aggregates properties before joining, and scopes after detection', () => {
    const sql = buildRepetitionQuery('test-project')
    expect(sql).toContain('PARTITION BY event_id ORDER BY created_at')
    expect(sql).toContain('GROUP BY p.website_event_id, p.created_at')
    expect(sql).toContain('e.created_at = p.created_at')
    expect(sql.indexOf('ScopedEvents AS')).toBeGreaterThan(sql.indexOf('Episodes AS'))
    expect(sql).toContain('COUNT(DISTINCT user_key)')
    expect(sql).toContain('PARTITION BY session_id, visit_key')
    expect(sql).toContain("CONCAT('cookie:', s.details.distinct_id)")
    expect(sql).toContain("CONCAT('fingerprint:', e.session_id)")
    expect(sql).toContain('GROUP BY session_id')
    expect(sql).toContain('LIMIT 100')
    expect(sql).toContain('WHERE largest_rank = 1 OR latest_rank <= 3')
    expect(sql).toContain('QUALIFY example_rank <= 3')
    expect(sql).not.toContain('@interactionEvent')
    expect(sql).toContain('GROUP BY signal, hostname, page, finding_fingerprint, event_name')
    expect(sql).toContain('PARTITION BY signal, hostname, page, finding_fingerprint')
    expect(sql).toContain('WHERE signal_rank <= 100')
    expect(sql).toContain("COUNTIF(signal = 'duplicates') AS duplicates")
    expect(sql).not.toContain('@signal')
    expect(sql).toContain("SELECT 'duplicates', session_id, visit_key, hostname, page, duplicate_fingerprint")
    expect(sql).toContain('r.sequence_number BETWEEN e.start_sequence AND e.end_sequence')
    expect(sql).not.toContain('LIKE @urlPath')
  })
})
