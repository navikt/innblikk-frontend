import type { QueryStats, DiagnosisResponse, DiagnosisHistoryResponse } from '../model/types.ts'
import { isRecord, isDiagnosisData, isHistoryData } from './typeGuards.ts'

export const parseQueryStats = (value: unknown): QueryStats | null => {
  if (!isRecord(value)) return null
  const totalBytesProcessedGB =
    typeof value.totalBytesProcessedGB === 'number' ? value.totalBytesProcessedGB : undefined
  const estimatedCostUSD = typeof value.estimatedCostUSD === 'number' ? value.estimatedCostUSD : undefined
  return totalBytesProcessedGB !== undefined || estimatedCostUSD !== undefined
    ? { totalBytesProcessedGB, estimatedCostUSD }
    : null
}

export const parseDiagnosisResponse = (value: unknown): DiagnosisResponse => {
  if (!isRecord(value)) return {}
  const error = typeof value.error === 'string' ? value.error : undefined
  const data = Array.isArray(value.data) ? value.data.filter(isDiagnosisData) : undefined
  const queryStats = parseQueryStats(value.queryStats)
  return { error, data, queryStats: queryStats ?? undefined }
}

export const parseDiagnosisHistoryResponse = (value: unknown): DiagnosisHistoryResponse => {
  if (!isRecord(value)) return {}
  const history = Array.isArray(value.history) ? value.history.filter(isHistoryData) : undefined
  const lastEventAt =
    value.lastEventAt === null || typeof value.lastEventAt === 'string' ? value.lastEventAt : undefined
  const queryStats = parseQueryStats(value.queryStats)
  return { history, lastEventAt, queryStats: queryStats ?? undefined }
}
