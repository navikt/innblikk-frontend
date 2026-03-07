import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts';

const projectId = getGcpProjectId();
const eventTable = `\`${projectId}.umami_views.event\``;
const sessionTable = `\`${projectId}.umami_views.session\``;

export const getUserProfilesSqlTemplate = () => `
WITH base_query AS (
  SELECT
    ${eventTable}.session_id,
    ${eventTable}.visit_id,
    ${eventTable}.created_at,
    ${eventTable}.url_path,
    ${sessionTable}.distinct_id,
    ${sessionTable}.country,
    ${sessionTable}.device,
    ${sessionTable}.browser
  FROM ${eventTable}
  LEFT JOIN ${sessionTable}
    ON ${eventTable}.session_id = ${sessionTable}.session_id
  WHERE ${eventTable}.website_id = '{{website_id}}'
    AND ${eventTable}.event_type = 1
    AND ${eventTable}.url_path = [[ {{url_sti}} --]] '/'
    [[AND {{created_at}} ]]
),
users AS (
  SELECT
    COALESCE(NULLIF(distinct_id, ''), session_id) AS bruker_id,
    CASE
      WHEN distinct_id IS NOT NULL AND distinct_id != '' THEN 'cookie'
      ELSE 'session'
    END AS id_type,
    COUNT(DISTINCT session_id) AS sesjoner,
    MAX(created_at) AS sist_sett,
    ANY_VALUE(country) AS land,
    ANY_VALUE(device) AS enhet,
    ANY_VALUE(browser) AS nettleser
  FROM base_query
  GROUP BY bruker_id, id_type
)
SELECT
  bruker_id,
  id_type,
  sesjoner,
  FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', sist_sett, 'Europe/Oslo') AS sist_sett,
  land,
  enhet,
  nettleser
FROM users
ORDER BY sist_sett DESC
LIMIT 1000
`;

