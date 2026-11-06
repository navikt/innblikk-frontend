import { normalizeUrlSql } from './helpers.js'

export const REPETITION_VOLATILE_PROPERTY_PATTERN =
  '^(device.*|originversion|scrollpos|scrollposition|scrollpercent|scrollpercentage|scrolldepth|screen|screenwidth|screenheight|viewport|timestamp|time)$'

export const REPETITION_DETECTION_SQL = `
  PageviewSteps AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY session_id, visit_key ORDER BY time_us, event_id) AS sequence_number,
      LAG(page) OVER (PARTITION BY session_id, visit_key ORDER BY time_us, event_id) AS previous_page,
      LAG(hostname) OVER (PARTITION BY session_id, visit_key ORDER BY time_us, event_id) AS previous_hostname,
      LAG(page, 2) OVER (PARTITION BY session_id, visit_key ORDER BY time_us, event_id) AS earlier_page,
      LAG(hostname, 2) OVER (PARTITION BY session_id, visit_key ORDER BY time_us, event_id) AS earlier_hostname,
      LAG(time_us, 2) OVER (PARTITION BY session_id, visit_key ORDER BY time_us, event_id) AS earlier_time
    FROM RawEvents WHERE event_type = 1
  ),
  InteractionSteps AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY session_id, visit_key, hostname, page, fingerprint ORDER BY time_us, event_id
      ) AS sequence_number,
      LAG(time_us, 2) OVER (
        PARTITION BY session_id, visit_key, hostname, page, fingerprint ORDER BY time_us, event_id
      ) AS earlier_time
    FROM RawEvents WHERE event_type = 2 AND is_interaction = 1
  ),
  DuplicateSteps AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY session_id, visit_key, hostname, page, event_type, duplicate_fingerprint ORDER BY time_us, event_id
      ) AS sequence_number,
      LAG(time_us) OVER (
        PARTITION BY session_id, visit_key, hostname, page, event_type, duplicate_fingerprint ORDER BY time_us, event_id
      ) AS earlier_time
    FROM RawEvents
  ),
  CandidateWindows AS (
    SELECT 'pageviews' AS signal, session_id, visit_key, hostname, page,
      '' AS fingerprint, '' AS finding_fingerprint, '' AS event_name, '' AS target, 0 AS has_target,
      sequence_number - 2 AS start_sequence, sequence_number AS end_sequence,
      earlier_time AS start_us, time_us AS end_us
    FROM PageviewSteps
    WHERE page = previous_page AND page = earlier_page
      AND hostname = previous_hostname AND hostname = earlier_hostname
      AND time_us - earlier_time <= 30000000
    UNION ALL
    SELECT 'interactions', session_id, visit_key, hostname, page, fingerprint, finding_fingerprint, event_name, target, has_target,
      sequence_number - 2, sequence_number, earlier_time, time_us
    FROM InteractionSteps WHERE time_us - earlier_time <= 5000000
    UNION ALL
    SELECT 'duplicates', session_id, visit_key, hostname, page, duplicate_fingerprint, finding_fingerprint, event_name, target, has_target,
      sequence_number - 1, sequence_number, earlier_time, time_us
    FROM DuplicateSteps WHERE time_us - earlier_time <= 100000
  ),
  WindowBoundaries AS (
    SELECT *,
      MAX(end_sequence) OVER (
        PARTITION BY signal, session_id, visit_key, hostname, page, fingerprint
        ORDER BY start_sequence, end_sequence ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS previous_end
    FROM CandidateWindows
  ),
  NumberedWindows AS (
    SELECT *,
      SUM(CASE WHEN previous_end IS NULL OR start_sequence > previous_end THEN 1 ELSE 0 END) OVER (
        PARTITION BY signal, session_id, visit_key, hostname, page, fingerprint
        ORDER BY start_sequence, end_sequence ROWS UNBOUNDED PRECEDING
      ) AS episode_number
    FROM WindowBoundaries
  ),
  Episodes AS (
    SELECT signal, session_id, visit_key, hostname, page, fingerprint, finding_fingerprint, event_name,
      MAX(target) AS target, MAX(has_target) AS has_target, episode_number,
      MIN(start_us) AS start_us, MAX(end_us) AS end_us,
      MAX(end_sequence) - MIN(start_sequence) + 1 AS event_count
    FROM NumberedWindows
    GROUP BY signal, session_id, visit_key, hostname, page, fingerprint, finding_fingerprint, event_name, episode_number
  )
`

export function buildRepetitionQuery(projectId) {
  const functionalValue = `CONCAT(LOWER(p.data_key), ':', TO_JSON_STRING(STRUCT(p.string_value, p.number_value, p.date_value)))`
  const cookieIdentity = (time) =>
    `@useCookies AND ${time} >= TIMESTAMP(@cookieStartDate) AND s.details.distinct_id IS NOT NULL`
  const visitorKey = (time, session) => `IF(${cookieIdentity(time)},
    CONCAT('cookie:', s.details.distinct_id), CONCAT('fingerprint:', ${session}))`
  return `
    WITH SourceEvents AS (
      SELECT event_id, session_id, COALESCE(NULLIF(visit_id, ''), CONCAT('unknown:', session_id)) AS visit_key,
        COALESCE(hostname, '') AS hostname,
        ${normalizeUrlSql('url_path')} AS page, event_type,
        COALESCE(event_name, '') AS event_name, created_at
      FROM \`${projectId}.umami.public_website_event\`
      WHERE website_id = @websiteId AND created_at BETWEEN @startDate AND @endDate
        AND session_id IS NOT NULL AND event_id IS NOT NULL AND event_type IN (1, 2)
      QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at) = 1
    ),
    SessionIdentities AS (
      SELECT session_id,
        ARRAY_AGG(STRUCT(NULLIF(TRIM(distinct_id), '') AS distinct_id, device, browser)
          ORDER BY created_at DESC LIMIT 1)[OFFSET(0)] AS details
      FROM \`${projectId}.umami_views.session\`
      WHERE website_id = @websiteId AND session_id IN (SELECT DISTINCT session_id FROM SourceEvents)
      GROUP BY session_id
    ),
    PropertyValues AS (
      SELECT d.website_event_id, d.created_at, p.*, ${functionalValue} AS functional_value
      FROM \`${projectId}.umami_views.event_data\` d
      CROSS JOIN UNNEST(d.event_parameters) p
      WHERE d.website_id = @websiteId AND d.created_at BETWEEN @startDate AND @endDate
        AND NOT REGEXP_CONTAINS(LOWER(p.data_key),
          r'${REPETITION_VOLATILE_PROPERTY_PATTERN}')
    ),
    Properties AS (
      SELECT p.website_event_id, p.created_at,
        MAX(CASE WHEN LOWER(p.data_key) IN ('lenketekst', 'tekst', 'label', 'tittel')
          THEN NULLIF(TRIM(p.string_value), '') END) AS label,
        MAX(CASE WHEN LOWER(p.data_key) IN ('destinasjon', 'url', 'href')
          THEN NULLIF(TRIM(p.string_value), '') END) AS destination,
        MAX(CASE WHEN LOWER(p.data_key) IN ('komponent', 'component', 'komponentid', 'elementid')
          THEN NULLIF(TRIM(p.string_value), '') END) AS component,
        MAX(CASE WHEN LOWER(p.data_key) IN ('seksjon', 'section')
          THEN NULLIF(TRIM(p.string_value), '') END) AS section,
        STRING_AGG(DISTINCT functional_value, '|' ORDER BY functional_value) AS functional_properties
      FROM PropertyValues p
      GROUP BY p.website_event_id, p.created_at
    ),
    RawEvents AS (
      SELECT e.*, UNIX_MICROS(e.created_at) AS time_us,
        ${visitorKey('e.created_at', 'e.session_id')} AS user_key,
        IF(${cookieIdentity('e.created_at')}, 'cookie', 'fingerprint') AS visitor_type,
        TO_JSON_STRING(STRUCT(e.event_name, p.label, p.destination, p.component, p.section)) AS fingerprint,
        TO_JSON_STRING(STRUCT(e.event_type, e.event_name, p.label, p.destination, p.component, p.section)) AS finding_fingerprint,
        TO_JSON_STRING(STRUCT(e.event_type, e.event_name, p.functional_properties)) AS duplicate_fingerprint,
        ARRAY_TO_STRING([p.label, p.destination, p.component, p.section], ' · ') AS target,
        CASE WHEN COALESCE(p.label, p.destination, p.component) IS NOT NULL THEN 1 ELSE 0 END AS has_target,
        CASE WHEN LOWER(e.event_name) IN (
          'navigere', 'klikk', 'click', 'button click', 'knapp klikket', 'lenke klikket',
          'accordion åpnet', 'accordion lukket'
        ) THEN 1 ELSE 0 END AS is_interaction
      FROM SourceEvents e LEFT JOIN Properties p
        ON e.event_id = p.website_event_id AND e.created_at = p.created_at
      LEFT JOIN SessionIdentities s ON e.session_id = s.session_id
    ),
    ${REPETITION_DETECTION_SQL},
    EnrichedEpisodes AS (
      SELECT e.*, ${visitorKey('TIMESTAMP_MICROS(e.start_us)', 'e.session_id')} AS user_key,
        IF(${cookieIdentity('TIMESTAMP_MICROS(e.start_us)')}, 'cookie', 'fingerprint') AS visitor_type,
        COALESCE(s.details.device, '') AS device, COALESCE(s.details.browser, '') AS browser
      FROM Episodes e LEFT JOIN SessionIdentities s ON e.session_id = s.session_id
    ),
    ScopedEvents AS (
      SELECT * FROM RawEvents
      WHERE @urlPath = '' OR (@pathOperator = 'equals' AND page = @urlPath)
        OR (@pathOperator = 'starts-with' AND STARTS_WITH(page, @urlPath))
    ),
    ScopedEpisodes AS (
      SELECT * FROM EnrichedEpisodes
      WHERE @urlPath = '' OR (@pathOperator = 'equals' AND page = @urlPath)
        OR (@pathOperator = 'starts-with' AND STARTS_WITH(page, @urlPath))
    ),
    RankedEpisodes AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY signal, hostname, page, finding_fingerprint
          ORDER BY event_count DESC, start_us DESC, session_id, visit_key, episode_number, fingerprint
        ) AS largest_rank,
        ROW_NUMBER() OVER (
          PARTITION BY signal, hostname, page, finding_fingerprint
          ORDER BY start_us DESC, session_id, visit_key, episode_number, fingerprint
        ) AS latest_rank
      FROM ScopedEpisodes
    ),
    ExampleEpisodes AS (
      SELECT *, IF(largest_rank = 1, 'largest', 'latest') AS example_kind,
        ROW_NUMBER() OVER (
          PARTITION BY signal, hostname, page, finding_fingerprint
          ORDER BY IF(largest_rank = 1, 0, 1), latest_rank
        ) AS example_rank
      FROM RankedEpisodes
      WHERE largest_rank = 1 OR latest_rank <= 3
      QUALIFY example_rank <= 3
    ),
    EvidenceIds AS (
      SELECT e.signal, e.session_id, e.visit_key, e.hostname, e.page, e.fingerprint, e.episode_number,
        ARRAY_AGG(r.event_id ORDER BY r.time_us, r.event_id LIMIT 100) AS event_ids
      FROM ExampleEpisodes e JOIN RawEvents r
        ON e.session_id = r.session_id AND e.visit_key = r.visit_key
        AND e.hostname = r.hostname AND e.page = r.page
        AND r.time_us BETWEEN e.start_us AND e.end_us
        AND (
          (e.signal = 'pageviews' AND r.event_type = 1)
          OR (e.signal = 'interactions' AND r.event_type = 2 AND r.fingerprint = e.fingerprint)
          OR (e.signal = 'duplicates' AND r.duplicate_fingerprint = e.fingerprint)
        )
      GROUP BY e.signal, e.session_id, e.visit_key, e.hostname, e.page, e.fingerprint, e.episode_number
    ),
    ExampleArrays AS (
      SELECT e.signal, e.hostname, e.page, e.finding_fingerprint,
        ARRAY_AGG(STRUCT(TIMESTAMP_MICROS(e.start_us) AS started_at,
          TIMESTAMP_MICROS(e.end_us) AS ended_at, e.event_count,
          e.session_id, IF(STARTS_WITH(e.visit_key, 'unknown:'), '', e.visit_key) AS visit_id,
          e.visitor_type, e.device, e.browser, i.event_ids, e.example_kind,
          (e.end_us - e.start_us) / 1000000.0 AS duration_seconds)
          ORDER BY e.example_rank) AS examples
      FROM ExampleEpisodes e JOIN EvidenceIds i
        ON e.signal = i.signal AND e.session_id = i.session_id AND e.visit_key = i.visit_key
        AND e.hostname = i.hostname AND e.page = i.page AND e.fingerprint = i.fingerprint
        AND e.episode_number = i.episode_number
      GROUP BY e.signal, e.hostname, e.page, e.finding_fingerprint
    ),
    FindingStats AS (
      SELECT signal, hostname, page, finding_fingerprint AS fingerprint, event_name,
        MAX(target) AS target, MAX(has_target) AS has_target,
        COUNT(*) AS episodes, COUNT(DISTINCT user_key) AS affected_visitors,
        MAX(event_count) AS max_repetitions
      FROM ScopedEpisodes
      GROUP BY signal, hostname, page, finding_fingerprint, event_name
    ),
    Findings AS (
      SELECT s.*, x.examples
      FROM FindingStats s JOIN ExampleArrays x
        ON s.signal = x.signal AND s.hostname = x.hostname AND s.page = x.page
        AND s.fingerprint = x.finding_fingerprint
    ),
    Summary AS (
      SELECT COUNT(DISTINCT user_key) AS total_visitors,
        COUNT(DISTINCT TO_JSON_STRING(STRUCT(session_id, visit_key))) AS total_visits,
        COUNT(DISTINCT IF(visitor_type = 'cookie', user_key, NULL)) AS cookie_visitors,
        COUNT(DISTINCT IF(visitor_type = 'fingerprint', user_key, NULL)) AS fingerprint_visitors,
        COUNTIF(STARTS_WITH(visit_key, 'unknown:')) AS events_without_visit,
        COUNT(*) AS total_events,
        COUNTIF(event_type = 2) AS custom_events,
        COUNTIF(event_type = 2 AND is_interaction = 1) AS interaction_events,
        COUNTIF(event_type = 2 AND is_interaction = 1 AND has_target = 1) AS targeted_interaction_events,
        COUNT(*) - COUNT(DISTINCT TO_JSON_STRING(STRUCT(session_id, time_us))) AS tied_timestamps
      FROM ScopedEvents
    )
    SELECT
      (SELECT AS STRUCT * FROM Summary) AS summary,
      (SELECT COUNT(DISTINCT user_key) FROM ScopedEpisodes) AS affected_visitors,
      (SELECT COUNT(*) FROM ScopedEpisodes) AS total_episodes,
      (SELECT COUNT(*) FROM ScopedEpisodes WHERE signal = 'duplicates') AS duplicate_episodes,
      (SELECT COUNT(*) FROM Findings) AS total_findings,
      (SELECT AS STRUCT COUNTIF(signal = 'pageviews') AS pageviews,
        COUNTIF(signal = 'interactions') AS interactions,
        COUNTIF(signal = 'duplicates') AS duplicates FROM Findings) AS signal_findings,
      ARRAY(SELECT AS STRUCT signal, hostname, page, event_name, target, has_target,
        episodes, affected_visitors, max_repetitions, examples
        FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY signal
          ORDER BY affected_visitors DESC, episodes DESC, hostname, page, fingerprint) AS signal_rank
          FROM Findings)
        WHERE signal_rank <= 100
        ORDER BY affected_visitors DESC, episodes DESC,
        signal, hostname, page, fingerprint) AS findings,
      FALSE AS is_generated_data
  `
}

export function buildRepetitionActivityQuery(projectId) {
  return `
    WITH ContextEvents AS (
      SELECT event_id, created_at, event_type, COALESCE(event_name, '') AS event_name,
        url_path, COALESCE(page_title, '') AS page_title, COALESCE(hostname, '') AS hostname,
        event_id IN UNNEST(@highlightedEventIds) AS is_highlighted,
        CASE WHEN created_at < TIMESTAMP(@episodeStart) THEN 'before'
          WHEN created_at > TIMESTAMP(@episodeEnd) THEN 'after' ELSE 'during' END AS phase
      FROM \`${projectId}.umami.public_website_event\`
      WHERE website_id = @websiteId AND session_id = @sessionId
        AND COALESCE(visit_id, '') = @visitId
        AND created_at BETWEEN @contextStart AND @contextEnd
      QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at) = 1
    ),
    RankedContext AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY phase
        ORDER BY IF(phase = 'during' AND is_highlighted, 0, 1),
          IF(phase = 'before', -UNIX_MICROS(created_at), UNIX_MICROS(created_at)), event_id) AS phase_rank
      FROM ContextEvents
    ),
    SelectedEvents AS (
      SELECT * FROM RankedContext WHERE phase_rank <= IF(phase = 'during', 40, 5)
    ),
    ContextProperties AS (
      SELECT d.website_event_id, d.created_at,
        ARRAY_AGG(STRUCT(p.data_key AS key,
          COALESCE(p.string_value, CAST(p.number_value AS STRING), CAST(p.date_value AS STRING), '') AS value)
          ORDER BY p.data_key LIMIT 50) AS properties,
        COUNT(*) AS property_count
      FROM \`${projectId}.umami_views.event_data\` d
      CROSS JOIN UNNEST(d.event_parameters) p
      WHERE d.website_id = @websiteId
        AND d.created_at BETWEEN @contextStart AND @contextEnd
        AND d.website_event_id IN (SELECT event_id FROM SelectedEvents)
        AND p.data_key IS NOT NULL
      GROUP BY d.website_event_id, d.created_at
    )
    SELECT ARRAY(
      SELECT AS STRUCT e.event_id, e.created_at, e.event_type, e.event_name, e.url_path,
        e.page_title, e.hostname, e.phase, e.is_highlighted,
        COALESCE(p.properties, ARRAY<STRUCT<key STRING, value STRING>>[]) AS properties,
        COALESCE(p.property_count, 0) AS property_count
      FROM SelectedEvents e LEFT JOIN ContextProperties p
        ON e.event_id = p.website_event_id AND e.created_at = p.created_at
      ORDER BY e.created_at, e.event_id
    ) AS activity,
    (SELECT COUNT(*) FROM ContextEvents) - (SELECT COUNT(*) FROM SelectedEvents) AS omitted_events,
    FALSE AS is_generated_data
  `
}
