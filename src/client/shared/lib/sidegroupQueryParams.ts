import type { Sidegroup } from '../../features/sidegroups/model/types.ts'

/**
 * Builds the `&sidegroupInclude=...&sidegroupExclude=...` query string fragment
 * used by BigQuery routes to filter by a sidegruppe's match rules server-side.
 */
export const buildSidegroupQueryParams = (sidegroup: Sidegroup | null | undefined): string => {
  if (!sidegroup) return ''
  const fields: Array<[string, string[] | undefined]> = [
    ['sidegroupInclude', sidegroup.include],
    ['sidegroupExclude', sidegroup.exclude],
    ['sidegroupExact', sidegroup.exact],
    ['sidegroupStartWith', sidegroup.startWith],
    ['sidegroupEndWith', sidegroup.endWith],
  ]
  return fields
    .flatMap(([key, values]) => (values ?? []).map((value) => `&${key}=${encodeURIComponent(value)}`))
    .join('')
}
