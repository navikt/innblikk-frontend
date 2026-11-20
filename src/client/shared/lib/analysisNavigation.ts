export const SHARED_PARAMS = [
  'urlPath',
  'pagePath',
  'period',
  'startDate',
  'endDate',
  'from',
  'to',
  'websiteId',
  'domain',
  'pathOperator',
  'metricType',
]

export const preserveSharedAnalysisParams = (href: string, search: string): string => {
  const currentParams = new URLSearchParams(search)
  const target = new URL(href, 'https://innblikk.invalid')
  const preservedParams = new URLSearchParams()

  SHARED_PARAMS.forEach((param) => {
    currentParams.getAll(param).forEach((value) => {
      // A sidegroup is report-specific; its operator is meaningless without its ID.
      if (value && !(param === 'pathOperator' && value === 'sidegroup')) preservedParams.append(param, value)
    })
  })

  // Explicit destination values win; preserve repeated values in both sources.
  const targetKeys = new Set(target.searchParams.keys())
  targetKeys.forEach((key) => {
    preservedParams.delete(key)
    target.searchParams.getAll(key).forEach((value) => preservedParams.append(key, value))
  })

  const queryString = preservedParams.toString()
  return `${target.pathname}${queryString ? `?${queryString}` : ''}${target.hash}`
}
