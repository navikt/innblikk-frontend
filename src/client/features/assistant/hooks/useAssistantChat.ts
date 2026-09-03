import { useCallback, useState } from 'react'
import { executeQueryApi } from '../../sql/api/sqlApi'
import { getFromLocalStorage, SELECTED_WEBSITE_CACHE_KEY } from '../../../shared/lib/localStorage'
import { DEFAULT_WEBSITE_ID } from '../../../shared/lib/domain'
import { getGcpProjectId } from '../../../shared/lib/runtimeConfig'
import type { Website } from '../../../shared/types/website'
import {
  askCopilot,
  CopilotChatError,
  type CopilotToolCall,
  type CopilotUsage,
  type CopilotChartSuggestion,
} from '../api/copilotChatApi'
import type { QueryResult, QueryStats } from '../../sql/model/types'

export type AssistantStatus = 'thinking' | 'running' | 'confirm' | 'clarify' | 'done' | 'error'

export type AssistantTurn = {
  id: string
  question: string
  status: AssistantStatus
  error: string | null
  sql: string
  reply: string
  result: QueryResult | null
  estimate: QueryStats | null
  attempts: number
  costSuggestion: string | null
  toolCalls: CopilotToolCall[]
  usage: CopilotUsage | null
  chartSuggestion: CopilotChartSuggestion | null
}

// Copilot auto-executes Gemini's SQL without a human reviewing it first — keep the sanity
// threshold tight (mirrors the server-side check in copilotRoutes.js) and require explicit
// confirmation above it instead of silently running an expensive query.
const COPILOT_MAX_COST_USD = 0.5

// The website the user "currently works with" — mirrors the resolution order WebsitePicker
// uses on /trafikkanalyse & co (explicit ?websiteId= URL param → last selection persisted in
// localStorage → the environment's default front page). Sent along with every chat message so
// the agent can weight this website instead of having to resolve one from scratch.
const getPreselectedWebsiteId = (): string => {
  const urlParams = new URLSearchParams(window.location.search)
  const websiteIdFromUrl = urlParams.get('websiteId')
  if (websiteIdFromUrl) return websiteIdFromUrl

  const cachedWebsite = getFromLocalStorage<Website>(SELECTED_WEBSITE_CACHE_KEY)
  if (cachedWebsite?.id) return cachedWebsite.id

  return getGcpProjectId().includes('-dev-') ? DEFAULT_WEBSITE_ID.dev : DEFAULT_WEBSITE_ID.prod
}

const newTurn = (question: string): AssistantTurn => ({
  id: crypto.randomUUID(),
  question,
  status: 'thinking',
  error: null,
  sql: '',
  reply: '',
  result: null,
  estimate: null,
  attempts: 1,
  costSuggestion: null,
  toolCalls: [],
  usage: null,
  chartSuggestion: null,
})

/**
 * Drives the /copilot chat: each question is a turn in a running conversation with Gemini
 * (the server keeps the actual chat session + history, keyed by `conversationId`, so follow-up
 * questions like "hva med forrige uke da?" have full context) — the query runs automatically
 * unless it's ambiguous (Gemini asks a clarifying question instead of SQL) or too expensive
 * (the user must explicitly confirm).
 */
export const useAssistantChat = () => {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<AssistantTurn[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  // The system prompt is fixed per conversation (bar the timestamp baked in at request time) —
  // grabbed once from whichever response returns it first, not stored per-turn.
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)

  const updateTurn = useCallback((id: string, patch: Partial<AssistantTurn>) => {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)))
  }, [])

  const isBusy = turns.some((turn) => turn.status === 'thinking' || turn.status === 'running')

  const ask = useCallback(async () => {
    const trimmed = question.trim()
    if (!trimmed || isBusy) return

    const turn = newTurn(trimmed)
    setTurns((prev) => [...prev, turn])

    try {
      const response = await askCopilot(trimmed, conversationId, getPreselectedWebsiteId())
      if (response.conversationId) setConversationId(response.conversationId)
      if (response.systemPrompt) setSystemPrompt(response.systemPrompt)

      updateTurn(turn.id, {
        sql: response.sql,
        reply: response.reply,
        estimate: response.queryStats ?? null,
        attempts: response.attempts ?? 1,
        costSuggestion: response.costSuggestion ?? null,
        toolCalls: response.toolCalls ?? [],
        usage: response.usage ?? null,
        chartSuggestion: response.chartSuggestion ?? null,
      })

      // Gemini asked a clarifying question instead of writing SQL (e.g. ambiguous domain) —
      // nothing to run. The user's next message continues the same conversation.
      if (response.needsClarification || !response.sql) {
        updateTurn(turn.id, { status: 'clarify' })
        return
      }

      // Server already validated + dry-ran the SQL. Above the sanity threshold, stop and let
      // the user confirm before we actually execute it — never auto-run an expensive query.
      const costUSD =
        response.queryStats?.estimatedCostUSD !== undefined ? Number(response.queryStats.estimatedCostUSD) : null
      if (response.isExpensive || (costUSD !== null && costUSD > COPILOT_MAX_COST_USD)) {
        updateTurn(turn.id, { status: 'confirm' })
        return
      }

      updateTurn(turn.id, { status: 'running' })
      const data = await executeQueryApi(response.sql)
      updateTurn(turn.id, { result: data, status: 'done' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Noe gikk galt'
      // On a hard failure (e.g. exhausted all retry steps with still-invalid SQL), the server
      // still sends back the last SQL/explanation Copilot attempted — surface it so the user
      // can see what was tried and test/fix it themselves, instead of just an error with no
      // context (see CopilotChatError: a plain Error would silently drop this data).
      if (err instanceof CopilotChatError) {
        if (err.systemPrompt) setSystemPrompt(err.systemPrompt)
        updateTurn(turn.id, {
          error: message,
          status: 'error',
          sql: err.sql,
          reply: err.reply,
          attempts: err.attempts ?? turn.attempts,
          toolCalls: err.toolCalls ?? [],
          usage: err.usage ?? null,
        })
      } else {
        updateTurn(turn.id, { error: message, status: 'error' })
      }
    }
  }, [question, isBusy, conversationId, updateTurn])

  // Runs a turn's pending query after the user explicitly confirms an expensive one.
  const confirmRun = useCallback(
    async (turnId: string) => {
      const turn = turns.find((t) => t.id === turnId)
      if (!turn || turn.status !== 'confirm' || !turn.sql) return

      updateTurn(turnId, { status: 'running', error: null })

      try {
        const data = await executeQueryApi(turn.sql)
        updateTurn(turnId, { result: data, status: 'done' })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Noe gikk galt'
        updateTurn(turnId, { error: message, status: 'error' })
      }
    },
    [turns, updateTurn],
  )

  // Re-runs a turn's query (e.g. after it failed) without asking Gemini anything new.
  const retryTurn = useCallback(
    async (turnId: string) => {
      const turn = turns.find((t) => t.id === turnId)
      if (!turn || !turn.sql) return

      updateTurn(turnId, { status: 'running', error: null })

      try {
        const data = await executeQueryApi(turn.sql)
        updateTurn(turnId, { result: data, status: 'done' })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Noe gikk galt'
        updateTurn(turnId, { error: message, status: 'error' })
      }
    },
    [turns, updateTurn],
  )

  // Starts a brand new conversation — drops both the visible history and the server-side
  // Gemini chat session/context.
  const startNewConversation = useCallback(() => {
    setTurns([])
    setConversationId(null)
    setQuestion('')
    setSystemPrompt(null)
  }, [])

  return {
    question,
    setQuestion,
    turns,
    isBusy,
    ask,
    confirmRun,
    retryTurn,
    startNewConversation,
    systemPrompt,
  }
}
