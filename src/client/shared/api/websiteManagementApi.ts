/**
 * Client for the website-management BFF (/api/website-management), which forwards to
 * reops-clean-to-enriched's internal /api/manage/websites API with an Azure OBO token.
 *
 * The BFF requires the `x-requested-with` custom header on all mutations as CSRF
 * protection — same-origin browser fetches below always set it.
 */

export interface WebsiteRegistration {
  websiteId: string
  name: string
  domain: string
  ownerTeamId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface WebsiteManagementTeam {
  id: string
  name: string
}

export interface WebsiteManagementContext {
  teams: WebsiteManagementTeam[]
  isReopsTeamMember: boolean
}

export interface WebsiteInput {
  name: string
  domain: string
  ownerTeamId: string | null
}

/** Thrown when the management feature is not available (e.g. local dev without a target). */
export class WebsiteManagementUnavailableError extends Error {
  constructor(message = 'Nettsideadministrasjon er ikke tilgjengelig i dette miljøet') {
    super(message)
    this.name = 'WebsiteManagementUnavailableError'
  }
}

/** Error with the service's Norwegian user-facing detail message (ProblemDetail). */
export class WebsiteManagementApiError extends Error {
  readonly status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'WebsiteManagementApiError'
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isMutation = init.method !== undefined && init.method !== 'GET'
  const response = await fetch(`/api/website-management${path}`, {
    ...init,
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(isMutation ? { 'x-requested-with': 'XMLHttpRequest' } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string
      error?: string
    } | null
    const message = payload?.detail || payload?.error || `Noe gikk galt (${response.status})`
    if (response.status === 503) throw new WebsiteManagementUnavailableError(message)
    throw new WebsiteManagementApiError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function fetchManagementContext(): Promise<WebsiteManagementContext> {
  return request<WebsiteManagementContext>('/context')
}

export function fetchManagedWebsites(
  options: { scope?: 'mine' | 'all'; includeDeleted?: boolean } = {},
): Promise<WebsiteRegistration[]> {
  const params = new URLSearchParams()
  if (options.scope) params.set('scope', options.scope)
  if (options.includeDeleted) params.set('includeDeleted', 'true')
  const query = params.toString()
  return request<WebsiteRegistration[]>(`/${query ? `?${query}` : ''}`)
}

export function createManagedWebsite(input: WebsiteInput): Promise<WebsiteRegistration> {
  return request<WebsiteRegistration>('/', { method: 'POST', body: JSON.stringify(input) })
}

export function updateManagedWebsite(websiteId: string, input: WebsiteInput): Promise<WebsiteRegistration> {
  return request<WebsiteRegistration>(`/${websiteId}`, { method: 'PUT', body: JSON.stringify(input) })
}

/** Soft delete: stops ingestion; historical analytics data is kept. */
export function softDeleteManagedWebsite(websiteId: string): Promise<void> {
  return request<void>(`/${websiteId}`, { method: 'DELETE' })
}

/**
 * Hard delete (ReOps only). Removes ONLY the Postgres registration — no Kafka/BigQuery
 * events, no session or analytics data. The exact website UUID must be echoed in the
 * confirmation header; the service rejects mismatches.
 */
export function hardDeleteManagedWebsite(websiteId: string, confirmWebsiteId: string): Promise<void> {
  return request<void>(`/${websiteId}/registration`, {
    method: 'DELETE',
    headers: { 'x-confirm-website-id': confirmWebsiteId },
  })
}
