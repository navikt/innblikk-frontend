import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts';

const projectId = getGcpProjectId();
const eventTable = `\`${projectId}.umami_views.event\``;

export const getRetentionSqlTemplate = () => `
WITH base_events AS (
  SELECT
    ${eventTable}.session_id,
    ${eventTable}.visit_id,
    ${eventTable}.url_path,
    DATE(${eventTable}.created_at, 'Europe/Oslo') AS event_day
  FROM ${eventTable}
  WHERE ${eventTable}.website_id = '{{website_id}}'
    AND ${eventTable}.event_type = 1
    AND ${eventTable}.url_path = [[ {{url_sti}} --]] '/'
    [[AND {{created_at}} ]]
),
first_seen AS (
  SELECT
    session_id,
    MIN(event_day) AS first_day
  FROM base_events
  GROUP BY session_id
),
retention_raw AS (
  SELECT
    DATE_DIFF(e.event_day, f.first_day, DAY) AS day,
    COUNT(DISTINCT e.session_id) AS returning_users
  FROM base_events e
  JOIN first_seen f
    ON e.session_id = f.session_id
  GROUP BY day
),
day0 AS (
  SELECT returning_users AS baseline
  FROM retention_raw
  WHERE day = 0
)
SELECT
  retention_raw.day,
  retention_raw.returning_users,
  ROUND(
    SAFE_DIVIDE(retention_raw.returning_users, (SELECT baseline FROM day0)) * 100,
    1
  ) AS percentage
FROM retention_raw
ORDER BY retention_raw.day ASC
LIMIT 365
`;

