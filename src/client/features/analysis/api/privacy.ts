import type { PrivacyRow, QueryStats } from '../model/types.ts'

export interface PrivacyCheckResponse {
  error?: string
  dryRun?: boolean
  data?: PrivacyRow[]
  queryStats?: QueryStats
  generatedSql?: string
}

export const fetchPrivacyCheck = async (params: {
  websiteId?: string
  startDate: Date
  endDate: Date
  dryRun: boolean
}): Promise<PrivacyCheckResponse> => {
  const response = await fetch('/api/bigquery/privacy-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      websiteId: params.websiteId,
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
      dryRun: params.dryRun,
    }),
  })

  if (!response.ok) {
    throw new Error('Kunne ikke hente data')
  }

  return (await response.json()) as PrivacyCheckResponse
}
