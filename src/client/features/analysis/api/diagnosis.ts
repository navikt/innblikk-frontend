import type { DiagnosisResponse, DiagnosisHistoryResponse } from '../model/types.ts'
import { parseDiagnosisResponse, parseDiagnosisHistoryResponse } from '../utils/diagnosisParsers.ts'

export const fetchDiagnosisData = async (startDate: Date, endDate: Date): Promise<DiagnosisResponse> => {
  const response = await fetch('/api/bigquery/diagnosis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }),
  })

  if (!response.ok) {
    throw new Error('Kunne ikke hente data')
  }

  const resultPayload = (await response.json()) as unknown
  return parseDiagnosisResponse(resultPayload)
}

export const fetchDiagnosisHistory = async (websiteId: string): Promise<DiagnosisHistoryResponse> => {
  const response = await fetch('/api/bigquery/diagnosis-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ websiteId }),
  })

  if (!response.ok) {
    throw new Error('Failed to fetch history')
  }

  const resultPayload = (await response.json()) as unknown
  return parseDiagnosisHistoryResponse(resultPayload)
}
