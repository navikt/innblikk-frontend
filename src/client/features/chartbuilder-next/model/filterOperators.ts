/** Prefer path prefixes for pages and substring matching for URL parameters. */
export const getDefaultFilterOperator = (column: string): string =>
  column === 'url_path' ? 'STARTS_WITH' : column === 'url_query' ? 'LIKE' : '='
