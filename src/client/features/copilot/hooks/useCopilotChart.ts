import { useState, useEffect, useMemo, useCallback } from 'react'
import * as sqlFormatter from 'sql-formatter'

import type { QueryResult, QueryStats } from '../../sql/model/types'
import { sanitizePlaceholders, extractWebsiteId } from '../../sql/utils/sqlProcessing'
import { prepareLineChartData, prepareBarChartData, preparePieChartData } from '../../sql/utils/chartHelpers'
import { useDebounce } from '../../chartbuilder/hooks/useDebounce'
import { estimateQueryCost, executeQueryApi } from '../api/copilotApi'
import { COPILOT_SKILL_URL, MICROSOFT_COPILOT_URL, EXPENSIVE_COST_USD, EXPENSIVE_GB } from '../model/constants'

type ValidationState = { status: 'idle' | 'valid' | 'invalid'; message: string }

const buildCopilotPrompt = (question: string): string => {
  const trimmed = question.trim()
  return `Jeg jobber med webanalyse og trenger en ferdig SQL-spørring jeg kan kjøre.

Spørsmålet mitt: ${trimmed || '<skriv spørsmålet ditt her>'}

Følg instruksjonene i denne ferdigheten når du lager spørringen:
${COPILOT_SKILL_URL}

Svar med den ferdige SQL-koden i en kodeblokk. Avslutt svaret med denne påminnelsen: «Kopier SQL-en over, gå tilbake til Innblikk og lim den inn i steg 2.»`
}

const estimateCostUSD = (estimate: QueryStats | null): number => {
  if (!estimate) return 0
  const gb = Number(estimate.totalBytesProcessedGB ?? 0)
  const direct = Number(estimate.estimatedCostUSD ?? NaN)
  if (isFinite(direct) && direct > 0) return direct
  return isFinite(gb) ? gb * 0.00625 : 0
}

// Pull the actual SQL out of a pasted Copilot reply (code fence, "SQL" label, trailing reminder).
const extractSqlFromReply = (input: string): string => {
  let text = input.trim()

  const fenceMatch = text.match(/```(?:sql)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // Drop gutter line numbers that paste as their own line (e.g. from Copilot's numbered code blocks).
  text = text
    .split('\n')
    .filter((line) => !/^\s*\d+\s*$/.test(line))
    .join('\n')

  // Drop preamble before the query (e.g. "Copilot said:", "SQL"), but keep leading SQL comments.
  const lines = text.split('\n')
  const startIndex = lines.findIndex((line) => /^\s*(WITH|SELECT)\b/i.test(line))
  if (startIndex > 0) {
    let start = startIndex
    while (start > 0 && /^\s*(--|\/\*)/.test(lines[start - 1])) {
      start -= 1
    }
    text = lines.slice(start).join('\n')
  }

  // Everything after the final statement terminator is prose (e.g. the reminder line).
  const lastSemicolon = text.lastIndexOf(';')
  if (lastSemicolon !== -1) {
    text = text.slice(0, lastSemicolon + 1)
  } else {
    text = text.replace(/Kopier SQL-en over[\s\S]*$/i, '')
  }

  const cleaned = text.trim()
  return cleaned || input.trim()
}

export const useCopilotChart = () => {
  const [question, setQuestion] = useState('')
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const [sql, setSql] = useState('')
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle', message: '' })

  const [estimate, setEstimate] = useState<QueryStats | null>(null)
  const [estimating, setEstimating] = useState(false)

  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)
  const [lastRunSql, setLastRunSql] = useState('')

  const debouncedSql = useDebounce(sql, 600)

  const websiteId = useMemo(() => extractWebsiteId(sql), [sql])

  const promptText = useMemo(() => buildCopilotPrompt(question), [question])

  const costUSD = useMemo(() => estimateCostUSD(estimate), [estimate])
  const processedGB = useMemo(() => Number(estimate?.totalBytesProcessedGB ?? 0), [estimate])
  const isExpensive = useMemo(() => costUSD > EXPENSIVE_COST_USD || processedGB > EXPENSIVE_GB, [costUSD, processedGB])

  const validateSqlText = useCallback((value: string): ValidationState => {
    if (!value.trim()) {
      return { status: 'idle', message: '' }
    }
    const hasCommand = /\b(SELECT|WITH)\b/i.test(value)
    if (!hasCommand) {
      return { status: 'invalid', message: 'Dette ser ikke ut som en SQL-spørring. Lim inn hele koden fra Copilot.' }
    }
    try {
      const { sanitized } = sanitizePlaceholders(value)
      sqlFormatter.format(sanitized)
      return { status: 'valid', message: 'SQL-en ser gyldig ut.' }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ukjent syntaksfeil'
      return { status: 'invalid', message: `SQL-en har en feil: ${message}` }
    }
  }, [])

  // Auto-validate + estimate cost when the pasted SQL settles
  useEffect(() => {
    const nextValidation = validateSqlText(debouncedSql)
    setValidation(nextValidation)

    if (nextValidation.status !== 'valid') {
      setEstimate(null)
      return
    }

    let cancelled = false
    setEstimating(true)
    estimateQueryCost(debouncedSql)
      .then((data) => {
        if (!cancelled) setEstimate(data)
      })
      .catch(() => {
        if (!cancelled) setEstimate(null)
      })
      .finally(() => {
        if (!cancelled) setEstimating(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedSql, validateSqlText])

  const copyPrompt = useCallback(() => {
    void navigator.clipboard.writeText(promptText)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2500)
  }, [promptText])

  const openCopilot = useCallback(() => {
    window.open(MICROSOFT_COPILOT_URL, '_blank', 'noopener,noreferrer')
  }, [])

  const handleSqlChange = useCallback((value: string) => {
    setSql(value)
    setError(null)
  }, [])

  const handleSqlPaste = useCallback((pasted: string) => {
    setSql(extractSqlFromReply(pasted))
    setError(null)
  }, [])

  const runQuery = useCallback(async () => {
    if (!sql.trim()) {
      setValidation({ status: 'invalid', message: 'Lim inn SQL-en fra Copilot først.' })
      return
    }
    const nextValidation = validateSqlText(sql)
    setValidation(nextValidation)
    if (nextValidation.status === 'invalid') return

    setLoading(true)
    setError(null)
    setResult(null)
    setHasRun(true)

    try {
      const data = await executeQueryApi(sql)
      setResult(data)
      setLastRunSql(sql)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Noe gikk galt under kjøringen'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [sql, validateSqlText])

  // Auto-run the first paste when it is valid and cheap – the natural next step.
  useEffect(() => {
    if (hasRun || loading || estimating) return
    if (validation.status !== 'valid' || !estimate || isExpensive) return
    if (!sql.trim()) return
    void runQuery()
  }, [hasRun, loading, estimating, validation.status, estimate, isExpensive, sql, runQuery])

  const getLineChartData = useCallback(
    (includeAverage = false) => {
      if (!result?.data) return null
      return prepareLineChartData(result.data, includeAverage)
    },
    [result],
  )

  const getBarChartData = useCallback(() => {
    if (!result?.data) return null
    return prepareBarChartData(result.data)
  }, [result])

  const getPieChartData = useCallback(() => {
    if (!result?.data) return null
    return preparePieChartData(result.data)
  }, [result])

  // Show the run button before the first run, or whenever the SQL changed since the last run.
  const needsRun = !hasRun || sql.trim() !== lastRunSql.trim()

  return {
    question,
    setQuestion,
    promptText,
    copiedPrompt,
    copyPrompt,
    openCopilot,

    sql,
    handleSqlChange,
    handleSqlPaste,
    validation,

    estimate,
    estimating,
    costUSD,
    processedGB,
    isExpensive,

    result,
    loading,
    error,
    hasRun,
    needsRun,
    websiteId,
    runQuery,

    prepareLineChartData: getLineChartData,
    prepareBarChartData: getBarChartData,
    preparePieChartData: getPieChartData,
  }
}
