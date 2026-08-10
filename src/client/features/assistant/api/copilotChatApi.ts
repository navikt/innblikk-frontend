export type CopilotChatResponse = {
  sql: string
  reply: string
  raw: string
}

export async function askCopilot(question: string): Promise<CopilotChatResponse> {
  const response = await fetch('/api/copilot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
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
    throw new Error((data.error || 'Copilot kunne ikke svare') + suffix)
  }

  return data
}
