import { useCallback, useState } from 'react'
import { extractWebsiteId } from '../../sql/utils/sqlProcessing'
import { prepareLineChartData, prepareBarChartData, preparePieChartData } from '../../sql/utils/chartHelpers'
import { estimateQueryCost, executeQueryApi } from '../../sql/api/sqlApi'
import { askCopilot } from '../api/copilotChatApi'
import type { QueryResult, QueryStats } from '../../sql/model/types'

export type AssistantStatus = 'idle' | 'thinking' | 'running' | 'done' | 'error'

/**
 * Drives the /copilot chat: a question goes to Gemini (which returns a BigQuery SQL
 * query using the schema + website list injected server-side), the query runs
 * automatically, and the result is rendered — no intermediate "review the SQL" step.
 */
export const useAssistantChat = () => {
  const [question, setQuestion] = useState('')
  const [askedQuestion, setAskedQuestion] = useState('')
  const [status, setStatus] = useState<AssistantStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const [sql, setSql] = useState('')
  const [reply, setReply] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [estimate, setEstimate] = useState<QueryStats | null>(null)

  const websiteId = extractWebsiteId(sql)

  const ask = useCallback(async () => {
    const trimmed = question.trim()
    if (!trimmed || status === 'thinking' || status === 'running') return

    setAskedQuestion(trimmed)
    setStatus('thinking')
    setError(null)
    setSql('')
    setReply('')
    setResult(null)
    setEstimate(null)

    try {
      const { sql: generatedSql, reply: generatedReply } = await askCopilot(trimmed)
      setSql(generatedSql)
      setReply(generatedReply)
      setStatus('running')

      void estimateQueryCost(generatedSql)
        .then(setEstimate)
        .catch(() => setEstimate(null))

      const data = await executeQueryApi(generatedSql)
      setResult(data)
      setStatus('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Noe gikk galt'
      setError(message)
      setStatus('error')
    }
  }, [question, status])

  const reset = useCallback(() => {
    setQuestion('')
    setAskedQuestion('')
    setStatus('idle')
    setError(null)
    setSql('')
    setReply('')
    setResult(null)
    setEstimate(null)
  }, [])

  return {
    question,
    setQuestion,
    askedQuestion,
    status,
    error,
    sql,
    reply,
    result,
    estimate,
    websiteId,
    ask,
    reset,

    prepareLineChartData: (includeAverage = false) =>
      result?.data ? prepareLineChartData(result.data, includeAverage) : null,
    prepareBarChartData: () => (result?.data ? prepareBarChartData(result.data) : null),
    preparePieChartData: () => (result?.data ? preparePieChartData(result.data) : null),
  }
}
