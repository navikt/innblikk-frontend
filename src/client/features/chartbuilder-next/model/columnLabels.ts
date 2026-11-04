/** User-facing URL names for the next chart builder; SQL keys remain unchanged. */
export const CHART_COLUMN_LABELS: Record<string, string> = {
  url_path: 'Side (URL)',
  url_query: 'Parameter (URL)',
  url_fullpath: 'Side og parametere (URL)',
  referrer_domain: 'Referrer (domene)',
  referrer_path: 'Referrer (side)',
  referrer_query: 'Referrer (parameter)',
  referrer_fullpath: 'Referrer (side og parametere)',
}

export const getChartColumnLabel = (column: string, fallback = column): string =>
  CHART_COLUMN_LABELS[column] ?? fallback
