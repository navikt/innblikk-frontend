import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts';

const projectId = getGcpProjectId();
const eventTable = `\`${projectId}.umami_views.event\``;
const sessionTable = `\`${projectId}.umami_views.session\``;

const fieldByCategory: Record<string, string | undefined> = {
    browser: 'browser',
    os: 'os',
    device: 'device',
    screen: 'screen',
    language: 'language',
    country: 'country',
};

export const getUserCompositionSqlTemplate = (category: string): string | undefined => {
    const field = fieldByCategory[category];
    if (!field) return undefined;

    return `
WITH base_query AS (
  SELECT
    ${eventTable}.session_id,
    ${sessionTable}.${field} AS category_value
  FROM ${eventTable}
  LEFT JOIN ${sessionTable}
    ON ${eventTable}.session_id = ${sessionTable}.session_id
  WHERE ${eventTable}.website_id = '{{website_id}}'
    AND ${eventTable}.event_type = 1
    AND ${eventTable}.url_path = [[ {{url_sti}} --]] '/'
    [[AND {{created_at}} ]]
)
SELECT
  COALESCE(NULLIF(base_query.category_value, ''), '(not set)') AS ${field},
  COUNT(DISTINCT base_query.session_id) as Unike_besokende
FROM base_query
GROUP BY ${field}
ORDER BY Unike_besokende DESC
LIMIT 1000
`;
};
