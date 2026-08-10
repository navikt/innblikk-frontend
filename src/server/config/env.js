import dotenv from 'dotenv'

// Load .env file BEFORE accessing any process.env values
dotenv.config()

const normalizeBaseUrl = (value) => {
  if (!value) return value
  if (/^https?:\/\//i.test(value)) return value
  return `http://${value}`
}

export const BIGQUERY_TIMEZONE = 'Europe/Oslo'
const defaultDevBackendBaseUrl =
  process.env.NODE_ENV === 'production' ? undefined : 'https://start-umami-backend.intern.dev.nav.no'

export const BACKEND_BASE_URL = normalizeBaseUrl(
  process.env.BACKEND_BASE_URL || process.env.VITE_BACKEND_BASE_URL || defaultDevBackendBaseUrl,
)
export const SITEIMPROVE_BASE_URL = normalizeBaseUrl(
  process.env.SITEIMPROVE_BASE_URL || process.env.VITE_SITEIMPROVE_BASE_URL,
)
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.VITE_GCP_PROJECT_ID
export const BACKEND_WS_HOST = process.env.BACKEND_WS_HOST || undefined

// Gemini Enterprise Agent Platform (formerly "Vertex AI") — used by the experimental /copilot chat.
// Swap the model later via env var; gemini-2.5-flash-lite is the cheapest GA model, good enough for
// generating SQL suggestions without needing a bigger/slower/more expensive model.
export const GEMINI_LOCATION = process.env.GEMINI_LOCATION || 'europe-west4'
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'

// Team Catalog (teamkatalog.nav.no) — used to check ReOps team membership for /reops-internal.
// Team/member data is open within Nav without auth (see https://navikt.github.io/team-catalog),
// so no token/scope is needed here, just network reachability (only resolves from inside Nav).
export const TEAMKATALOG_BASE_URL = process.env.TEAMKATALOG_BASE_URL || 'https://teamkatalog-api.intern.nav.no'

if (!BACKEND_BASE_URL) {
  throw new Error('Missing env var: BACKEND_BASE_URL')
}
if (!SITEIMPROVE_BASE_URL) {
  throw new Error('Missing env var: SITEIMPROVE_BASE_URL')
}
if (!GCP_PROJECT_ID) {
  throw new Error('Missing env var: GCP_PROJECT_ID')
}
