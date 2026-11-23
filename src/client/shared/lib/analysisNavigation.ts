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
]

export const preserveSharedAnalysisParams = (href: string, search: string): string => {
  const currentParams = new URLSearchParams(search)
  const preservedParams = new URLSearchParams()

  SHARED_PARAMS.forEach((param) => {
    currentParams.getAll(param).forEach((value) => {
      if (value) preservedParams.append(param, value)
    })
  })

  const queryString = preservedParams.toString()
  return queryString ? `${href}?${queryString}` : href
}
