import type { QueryStats } from '../../sql/model/types'

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
}

// Thrown instead of a plain Error so the caller can still show the last SQL Copilot attempted
// (e.g. after exhausting all retry steps with invalid SQL) — the server's error response already
// includes `sql`/`reply`/`attempts` for exactly this reason (see copilotRoutes.js's 502 branch),
// a plain `throw new Error(message)` would silently drop that data on the floor.
export class CopilotChatError extends Error {
  sql: string
  reply: string
  attempts?: number

  constructor(message: string, { sql, reply, attempts }: { sql: string; reply: string; attempts?: number }) {
    super(message)
    this.name = 'CopilotChatError'
    this.sql = sql
    this.reply = reply
    this.attempts = attempts
  }
}

export async function askCopilot(question: string, conversationId?: string | null): Promise<CopilotChatResponse> {
  const response = await fetch('/api/copilot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, conversationId }),
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
    })
  }

  return data
}
