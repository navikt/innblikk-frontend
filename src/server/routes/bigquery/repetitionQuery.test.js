import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  REPETITION_DETECTION_SQL,
  REPETITION_VOLATILE_PROPERTY_PATTERN,
  buildRepetitionQuery,
} from './repetitionQuery.js'

function detect(events) {
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
      SELECT signal, session_id, page, target, has_target, start_us, end_us, event_count
      FROM Episodes ORDER BY signal, start_us`,
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
  it.each([
    'deviceBrowser',
    'deviceViewportHeight',
    'originVersion',
    'scrollPos',
    'scrollPercent',
    'scrollPercentage',
    'scrollPosition',
    'scrollDepth',
    'screenWidth',
  ])('ignores volatile metadata in duplicate comparison: %s', (key) =>
    expect(new RegExp(REPETITION_VOLATILE_PROPERTY_PATTERN, 'i').test(key)).toBe(true),
  )

  it.each(['lenketekst', 'destinasjon', 'komponentId', 'seksjon', 'beløp', 'valg', 'målgruppe'])(
    'preserves functional properties in duplicate comparison: %s',
    (key) => expect(new RegExp(REPETITION_VOLATILE_PROPERTY_PATTERN, 'i').test(key)).toBe(false),
  )

  it('deduplicates event IDs, aggregates properties before joining, and scopes after detection', () => {
    const sql = buildRepetitionQuery('test-project')
    expect(sql).toContain('PARTITION BY event_id ORDER BY created_at')
    expect(sql).toContain('GROUP BY p.website_event_id, p.created_at')
    expect(sql).toContain('e.created_at = p.created_at')
    expect(sql.indexOf('WHERE @urlPath')).toBeGreaterThan(sql.indexOf('Episodes AS'))
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
    expect(sql).toContain("e.signal = 'duplicates' AND r.duplicate_fingerprint = e.fingerprint")
    expect(sql).not.toContain('LIKE @urlPath')
  })
})
