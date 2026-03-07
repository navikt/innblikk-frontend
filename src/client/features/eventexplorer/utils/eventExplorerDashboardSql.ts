import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts';

const projectId = getGcpProjectId();
const eventTable = `\`${projectId}.umami_views.event\``;

const escapeSqlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "''");

export const getEventListSqlTemplate = () => `
WITH base_query AS (
  SELECT
    ${eventTable}.event_name
  FROM ${eventTable}
  WHERE ${eventTable}.website_id = '{{website_id}}'
    AND ${eventTable}.event_type = 2
    AND ${eventTable}.url_path = [[ {{url_sti}} --]] '/'
    [[AND {{created_at}} ]]
    AND ${eventTable}.event_name IS NOT NULL
)
SELECT
  base_query.event_name AS hendelsesnavn,
  COUNT(*) AS Antall
FROM base_query
GROUP BY hendelsesnavn
ORDER BY Antall DESC
LIMIT 1000
`;

export const getEventSeriesSqlTemplate = (eventName: string) => `
WITH base_query AS (
  SELECT
    ${eventTable}.created_at
  FROM ${eventTable}
  WHERE ${eventTable}.website_id = '{{website_id}}'
    AND ${eventTable}.event_type = 2
    AND ${eventTable}.event_name = '${escapeSqlString(eventName)}'
    AND ${eventTable}.url_path = [[ {{url_sti}} --]] '/'
    [[AND {{created_at}} ]]
)
SELECT
  DATE(base_query.created_at, 'Europe/Oslo') AS dato,
  COUNT(*) AS Antall
FROM base_query
GROUP BY dato
ORDER BY dato ASC
LIMIT 1000
`;

