import type { QueryStats } from '../../sql/model/types'

// Matches the chart-type tab values ResultsPanel/SqlResultsSection actually understand
// (see CHART_SUGGESTION_MAP in copilotPrompt.js, server-side).
export type CopilotChartSuggestion = 'table' | 'linechart' | 'areachart' | 'barchart' | 'piechart'

export type CopilotToolCall = {
  step: number
  name: string
  args: Record<string, unknown> | null
  result?: Record<string, unknown> | null
}

export type CopilotUsage = {
  promptTokens: number
  responseTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
}

export type CopilotChatResponse = {
  sql: string
  reply: string
  raw: string
  queryStats?: QueryStats | null
  isExpensive?: boolean
  costSuggestion?: string | null
  attempts?: number
  needsClarification?: boolean
  conversationId?: string
  toolCalls?: CopilotToolCall[]
  usage?: CopilotUsage
  systemPrompt?: string
  chartSuggestion?: CopilotChartSuggestion | null
}

// Thrown instead of a plain Error so the caller can still show the last SQL Copilot attempted
// (e.g. after exhausting all retry steps with invalid SQL) — the server's error response already
// includes `sql`/`reply`/`attempts` for exactly this reason (see copilotRoutes.js's 502 branch),
// a plain `throw new Error(message)` would silently drop that data on the floor.
export class CopilotChatError extends Error {
  sql: string
  reply: string
  attempts?: number
  toolCalls?: CopilotToolCall[]
  usage?: CopilotUsage
  systemPrompt?: string

  constructor(
    message: string,
    {
      sql,
      reply,
      attempts,
      toolCalls,
      usage,
      systemPrompt,
    }: {
      sql: string
      reply: string
      attempts?: number
      toolCalls?: CopilotToolCall[]
      usage?: CopilotUsage
      systemPrompt?: string
    },
  ) {
    super(message)
    this.name = 'CopilotChatError'
    this.sql = sql
    this.reply = reply
    this.attempts = attempts
    this.toolCalls = toolCalls
    this.usage = usage
    this.systemPrompt = systemPrompt
  }
}

export async function askCopilot(
  question: string,
  conversationId?: string | null,
  websiteId?: string | null,
): Promise<CopilotChatResponse> {
  const response = await fetch('/api/copilot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, conversationId, websiteId }),
  })

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (response.status === 404) {
      throw new Error('Copilot-API-et er ikke koblet til her (404). Er serveren riktig satt opp lokalt?')
    }
    throw new Error(`Fikk et uventet svar fra serveren (status ${response.status}), ikke JSON.`)
  }

  const data = (await response.json()) as CopilotChatResponse & {
    error?: string
    googleErrorName?: string
    googleErrorStatus?: string
  }

  if (!response.ok) {
    const suffix = data.googleErrorName ? ` (${data.googleErrorName})` : ''
    throw new CopilotChatError((data.error || 'Copilot kunne ikke svare') + suffix, {
      sql: data.sql ?? '',
      reply: data.reply ?? '',
      attempts: data.attempts,
      toolCalls: data.toolCalls,
      usage: data.usage,
      systemPrompt: data.systemPrompt,
    })
  }

  return data
}
