export const ENTRANCE_SUMMARY_LABELS = {
  direct: 'Direkte',
  internal: 'Interne sider',
  search: 'Søkemotorer',
  social: 'Sosiale medier',
  external: 'Eksterne nettsider',
} as const

export const SEARCH_ENGINE_SOURCE_KEYWORDS = ['google', 'bing', 'yahoo', 'duckduckgo', 'ecosia', 'qwant'] as const
export const SOCIAL_MEDIA_SOURCE_KEYWORDS = [
  'facebook',
  'twitter',
  'linkedin',
  'instagram',
  'tiktok',
  'snapchat',
] as const

export const normalizeReferrerSource = (value: string) => value.toLowerCase().replace(/^www\./, '')

export const getEntranceSummaryChannel = (rawSource: string, websiteDomain?: string) => {
  const source = normalizeReferrerSource(rawSource)
  const normalizedDomain = websiteDomain ? normalizeReferrerSource(websiteDomain) : ''

  if (source === '(none)') return ENTRANCE_SUMMARY_LABELS.direct
  if (normalizedDomain && source === normalizedDomain) return ENTRANCE_SUMMARY_LABELS.internal
  if (SEARCH_ENGINE_SOURCE_KEYWORDS.some((keyword) => source.includes(keyword))) return ENTRANCE_SUMMARY_LABELS.search
  if (SOCIAL_MEDIA_SOURCE_KEYWORDS.some((keyword) => source.includes(keyword))) return ENTRANCE_SUMMARY_LABELS.social
  return ENTRANCE_SUMMARY_LABELS.external
}

const escapeSqlStringLiteral = (value: string) => value.replace(/'/g, "\\'")

export const getEntranceSummaryChannelCaseSql = (referrerDomainExpr: string, websiteDomain?: string) => {
  const normalizedDomain = websiteDomain ? normalizeReferrerSource(websiteDomain) : ''
  const sourceExpr = `LOWER(REGEXP_REPLACE(COALESCE(${referrerDomainExpr}, '(none)'), r'^www\\\\.', ''))`
  const internalMatch = normalizedDomain ? `${sourceExpr} = '${escapeSqlStringLiteral(normalizedDomain)}'` : 'FALSE'
  const searchMatches = SEARCH_ENGINE_SOURCE_KEYWORDS.map((keyword) => `${sourceExpr} LIKE '%${keyword}%'`).join(
    '\n      OR ',
  )
  const socialMatches = SOCIAL_MEDIA_SOURCE_KEYWORDS.map((keyword) => `${sourceExpr} LIKE '%${keyword}%'`).join(
    '\n      OR ',
  )

  return `CASE
    WHEN ${sourceExpr} = '(none)' THEN '${ENTRANCE_SUMMARY_LABELS.direct}'
    WHEN ${internalMatch} THEN '${ENTRANCE_SUMMARY_LABELS.internal}'
    WHEN ${searchMatches} THEN '${ENTRANCE_SUMMARY_LABELS.search}'
    WHEN ${socialMatches} THEN '${ENTRANCE_SUMMARY_LABELS.social}'
    ELSE '${ENTRANCE_SUMMARY_LABELS.external}'
  END`
}
