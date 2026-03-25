import { getGcpProjectId } from '../../../shared/lib/runtimeConfig.ts'
import { getEntranceSummaryChannelCaseSql } from './entranceSummaryChannels'

const projectId = getGcpProjectId()
const eventTable = `\`${projectId}.umami_views.event\``

const baseQuery = `
WITH base_query AS (
  SELECT
    ${eventTable}.*
  FROM ${eventTable}
  WHERE ${eventTable}.website_id = '{{website_id}}'
    AND ${eventTable}.event_type = 1
    AND ${eventTable}.url_path = [[ {{url_sti}} --]] '/'
    [[AND {{created_at}} ]]
)`

export const getTrafficSeriesSqlTemplate = () => `
${baseQuery}
SELECT
  DATE(base_query.created_at, 'Europe/Oslo') AS dato,
  COUNT(DISTINCT base_query.session_id) as Unike_besokende
FROM base_query
GROUP BY dato
ORDER BY dato ASC
LIMIT 1000
`

export const getIncludedPagesSqlTemplate = () => `
${baseQuery}
SELECT
  COUNT(DISTINCT base_query.session_id) as Unike_besokende,
  base_query.url_path as URL_sti
FROM base_query
GROUP BY base_query.url_path
ORDER BY Unike_besokende DESC
LIMIT 1000
`

export const getExitsSqlTemplate = () => `
WITH base_query AS (
  SELECT
    ${eventTable}.session_id,
    ${eventTable}.visit_id,
    ${eventTable}.url_path,
    ${eventTable}.created_at,
    LEAD(${eventTable}.url_path) OVER (
      PARTITION BY ${eventTable}.session_id
      ORDER BY ${eventTable}.created_at
    ) AS next_page
  FROM ${eventTable}
  WHERE ${eventTable}.website_id = '{{website_id}}'
    AND ${eventTable}.event_type = 1
    [[AND {{created_at}} ]]
)
SELECT
  COUNT(DISTINCT session_id) as Unike_besokende,
  COALESCE(next_page, '(exit)') as URL_sti
FROM base_query
WHERE url_path = [[ {{url_sti}} --]] '/'
GROUP BY URL_sti
ORDER BY Unike_besokende DESC
LIMIT 1000
`

export const getCombinedEntrancesSqlTemplate = () => `
${baseQuery}
SELECT
  COUNT(DISTINCT base_query.session_id) as Unike_besokende,
  CASE
    WHEN base_query.referrer_path IS NOT NULL AND base_query.referrer_path != '' THEN base_query.referrer_path
    WHEN base_query.referrer_domain IS NOT NULL AND base_query.referrer_domain != '' THEN base_query.referrer_domain
    ELSE '(none)'
  END AS Inngang
FROM base_query
GROUP BY Inngang
ORDER BY Unike_besokende DESC
LIMIT 1000
`

export const getExternalSourcesSqlTemplate = () => `
${baseQuery}
SELECT
  COUNT(DISTINCT base_query.session_id) as Unike_besokende,
  COALESCE(NULLIF(base_query.referrer_domain, ''), '(none)') AS Navn
FROM base_query
GROUP BY Navn
ORDER BY Unike_besokende DESC
LIMIT 1000
`

export const getEntranceSummarySqlTemplate = (websiteDomain?: string) => `
${baseQuery}
SELECT
  COUNT(DISTINCT base_query.session_id) as Unike_besokende,
  ${getEntranceSummaryChannelCaseSql('base_query.referrer_domain', websiteDomain)} AS Navn
FROM base_query
GROUP BY Navn
ORDER BY Unike_besokende DESC
LIMIT 1000
`

type MarketingDimension = 'source' | 'medium' | 'campaign' | 'content' | 'term' | 'referrer' | 'query'

const marketingDimensionExpr: Record<MarketingDimension, string> = {
  source:
    "COALESCE(NULLIF(REGEXP_EXTRACT(base_query.url_query, r'(?:^|[?&])utm_source=([^&]*)'), ''), NULLIF(base_query.referrer_domain, ''), '(none)')",
  medium: "COALESCE(NULLIF(REGEXP_EXTRACT(base_query.url_query, r'(?:^|[?&])utm_medium=([^&]*)'), ''), '(none)')",
  campaign: "COALESCE(NULLIF(REGEXP_EXTRACT(base_query.url_query, r'(?:^|[?&])utm_campaign=([^&]*)'), ''), '(none)')",
  content: "COALESCE(NULLIF(REGEXP_EXTRACT(base_query.url_query, r'(?:^|[?&])utm_content=([^&]*)'), ''), '(none)')",
  term: "COALESCE(NULLIF(REGEXP_EXTRACT(base_query.url_query, r'(?:^|[?&])utm_term=([^&]*)'), ''), '(none)')",
  referrer: "COALESCE(NULLIF(base_query.referrer_domain, ''), '(none)')",
  query: "COALESCE(NULLIF(base_query.url_query, ''), '(none)')",
}

export const getMarketingSqlTemplate = (dimension: MarketingDimension, label = 'Navn') => `
${baseQuery}
SELECT
  COUNT(DISTINCT base_query.session_id) as Unike_besokende,
  ${marketingDimensionExpr[dimension]} AS ${label}
FROM base_query
GROUP BY ${label}
ORDER BY Unike_besokende DESC
LIMIT 1000
`
