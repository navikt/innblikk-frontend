import { normalizeUrlSql } from './helpers.js'

// Only bounded lookahead is materialized; long runs are measured with gaps-and-islands,
// never by accumulating an unbounded per-session event array.
export function buildNavigationPatternCtes(projectId) {
  const pages = (columns) => `TO_JSON_STRING([${columns.join(', ')}])`
  const selectedPath = normalizeUrlSql('@urlPath')
  const cycleCandidates = [2, 3, 4].map((size) => {
    const columns = Array.from({ length: size }, (_, i) => `p${i}`)
    const distinct = columns.flatMap((column, i) => columns.slice(i + 1).map((other) => `${column} != ${other}`))
    const rotations = columns.map(
      (column, i) =>
        `WHEN (@pathScope = 'from-first-visit' AND ${column} = ${selectedPath})
           OR (@pathScope = 'anywhere' AND ${columns
             .filter((_, j) => i !== j)
             .map((other) => `${column} < ${other}`)
             .join(' AND ')})
         THEN ${pages([...columns.slice(i), ...columns.slice(0, i)])}`,
    )
    return `SELECT session_id, step, created_at, ${size} AS size,
        '${size === 2 ? 'alternation' : 'cycle'}' AS type,
        CASE ${rotations.join('\n')} END AS pattern_key
      FROM lookahead
      WHERE p${size} = p0 AND ${distinct.join(' AND ')}
        AND (@urlPath = '' OR ${selectedPath} IN (${columns.join(', ')}))`
  })

  return `
    WITH raw_events AS (
      SELECT session_id, created_at, ${normalizeUrlSql('url_path')} AS path
      FROM \`${projectId}.umami_views.event\`
      WHERE website_id = @websiteId
        AND created_at >= TIMESTAMP(@startDate)
        AND created_at < TIMESTAMP(@endDate)
        AND event_type = 1
    ),
    timestamp_counts AS (
      SELECT session_id, created_at, COUNT(*) AS events
      FROM raw_events WHERE session_id IS NOT NULL
      GROUP BY session_id, created_at
    ),
    ambiguous_sessions AS (
      SELECT DISTINCT session_id FROM timestamp_counts WHERE events > 1
    ),
    selected_sessions AS (
      SELECT session_id,
        MAX(CASE WHEN path IS NULL THEN 1 ELSE 0 END) AS invalid_path,
        MIN(CASE WHEN path = ${normalizeUrlSql('@urlPath')} THEN created_at END) AS first_visit
      FROM raw_events
      WHERE session_id IS NOT NULL
      GROUP BY session_id
      HAVING @urlPath = '' OR MAX(CASE WHEN path = ${normalizeUrlSql('@urlPath')} THEN 1 ELSE 0 END) = 1
    ),
    ordered_events AS (
      SELECT e.*,
        LAG(path) OVER (PARTITION BY e.session_id ORDER BY created_at) AS previous_path
      FROM raw_events e
      JOIN selected_sessions s ON e.session_id = s.session_id
      LEFT JOIN ambiguous_sessions a ON e.session_id = a.session_id
      WHERE a.session_id IS NULL AND s.invalid_path = 0
        AND (@pathScope = 'anywhere' OR e.created_at >= s.first_visit)
    ),
    collapsed AS (
      SELECT session_id, created_at, path,
        ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) AS step
      FROM ordered_events
      WHERE previous_path IS NULL OR path != previous_path
    ),
    lookahead AS (
      SELECT *,
        path AS p0,
        ${Array.from({ length: 4 }, (_, i) => `LEAD(path, ${i + 1}) OVER w AS p${i + 1}`).join(',\n')},
        LEAD(created_at, 1) OVER w AS t1,
        LEAD(created_at, 2) OVER w AS t2
      FROM collapsed
      WINDOW w AS (PARTITION BY session_id ORDER BY step)
    ),
    cycle_candidates AS (
      ${cycleCandidates.join('\nUNION ALL\n')}
    ),
    island_steps AS (
      SELECT *,
        step - ROW_NUMBER() OVER (
          PARTITION BY session_id, pattern_key ORDER BY step
        ) AS island
      FROM cycle_candidates
    ),
    cycle_runs AS (
      SELECT session_id, type, pattern_key, size, island,
        MIN(step) AS start_step, MAX(step) + size AS end_step,
        MIN(created_at) AS started_at,
        CAST(FLOOR((COUNT(*) + size - 1) / size) AS INT64) AS repetitions
      FROM island_steps
      GROUP BY session_id, type, pattern_key, size, island
      HAVING COUNT(*) >= size + 1
    ),
    quick_returns AS (
      SELECT session_id, 'quick-return' AS type, ${pages(['p0', 'p1'])} AS pattern_key,
        step AS start_step, step + 2 AS end_step, created_at AS started_at,
        COUNT(*) OVER (PARTITION BY session_id, p0, p1) AS repetitions
      FROM lookahead
      WHERE p0 = p2 AND p0 != p1
        AND (@urlPath = '' OR ${selectedPath} IN (p0, p1))
        AND (@pathScope = 'anywhere' OR p0 = ${selectedPath})
        AND TIMESTAMP_DIFF(t2, t1, MICROSECOND) <= 10000000
    ),
    occurrences AS (
      SELECT session_id, type, pattern_key, start_step, end_step, started_at, repetitions
      FROM cycle_runs
      UNION ALL
      SELECT * FROM quick_returns
    ),
    session_patterns AS (
      SELECT session_id, type, pattern_key, MAX(repetitions) AS repetitions
      FROM occurrences
      GROUP BY session_id, type, pattern_key
    )`
}

export function buildNavigationPatternQuery(projectId) {
  return `${buildNavigationPatternCtes(projectId)},
    medians AS (
      SELECT *, PERCENTILE_CONT(repetitions, 0.5) OVER (
        PARTITION BY type, pattern_key
      ) AS median_repetitions
      FROM session_patterns
    ),
    pattern_totals AS (
      SELECT type, pattern_key, COUNT(*) AS sessions,
        MAX(median_repetitions) AS medianRepetitions
      FROM medians GROUP BY type, pattern_key
    ),
    daily_counts AS (
      SELECT type, pattern_key, DATE(started_at, @timezone) AS date,
        COUNT(DISTINCT session_id) AS sessions
      FROM occurrences GROUP BY type, pattern_key, date
    ),
    trends AS (
      SELECT type, pattern_key,
        ARRAY_AGG(STRUCT(CAST(date AS STRING) AS date, sessions) ORDER BY date) AS trend
      FROM daily_counts GROUP BY type, pattern_key
    ),
    context_counts AS (
      SELECT o.type, o.pattern_key, 'before' AS side, c.path,
        COUNT(DISTINCT o.session_id) AS sessions
      FROM occurrences o JOIN collapsed c
        ON o.session_id = c.session_id AND c.step = o.start_step - 1
      GROUP BY o.type, o.pattern_key, c.path
      UNION ALL
      SELECT o.type, o.pattern_key, 'after' AS side, c.path,
        COUNT(DISTINCT o.session_id) AS sessions
      FROM occurrences o JOIN collapsed c
        ON o.session_id = c.session_id AND c.step = o.end_step + 1
      GROUP BY o.type, o.pattern_key, c.path
    ),
    contexts AS (
      SELECT type, pattern_key, side,
        ARRAY_AGG(STRUCT(path, sessions) ORDER BY sessions DESC, path) AS paths
      FROM context_counts GROUP BY type, pattern_key, side
    )
    SELECT
      STRUCT(
        (SELECT COUNT(*) FROM selected_sessions) AS totalSessions,
        (SELECT COUNT(DISTINCT session_id) FROM session_patterns) AS patternSessions,
        (SELECT COUNT(DISTINCT session_id) FROM session_patterns
          WHERE type != 'quick-return') AS repeatedCycleSessions,
        (SELECT COUNT(*) FROM selected_sessions s JOIN ambiguous_sessions a
          ON s.session_id = a.session_id) AS ambiguousSessions
      ) AS summary,
      (SELECT COUNT(*) FROM selected_sessions WHERE invalid_path = 1) AS invalidPathSessions,
      (SELECT COUNT(*) FROM raw_events WHERE session_id IS NULL) AS missingSessionEvents,
      ARRAY(
        SELECT AS STRUCT
          CONCAT(p.type, ':', TO_HEX(SHA256(p.pattern_key))) AS id,
          p.type, JSON_VALUE_ARRAY(p.pattern_key) AS pages, p.sessions,
          SAFE_DIVIDE(p.sessions, (SELECT COUNT(*) FROM selected_sessions)) AS share,
          p.medianRepetitions, t.trend,
          IFNULL(b.paths, []) AS before, IFNULL(a.paths, []) AS after
        FROM pattern_totals p
        JOIN trends t USING (type, pattern_key)
        LEFT JOIN contexts b ON p.type = b.type AND p.pattern_key = b.pattern_key AND b.side = 'before'
        LEFT JOIN contexts a ON p.type = a.type AND p.pattern_key = a.pattern_key AND a.side = 'after'
        ORDER BY p.sessions DESC, p.type, p.pattern_key
      ) AS patterns`
}
