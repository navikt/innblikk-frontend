import dotenv from 'dotenv'

// Load .env file BEFORE accessing any process.env values
dotenv.config()

const normalizeBaseUrl = (value) => {
  if (!value) return value
  if (/^https?:\/\//i.test(value)) return value
  return `http://${value}`
}

export const BIGQUERY_TIMEZONE = 'Europe/Oslo'
// Use the ansatt-facing ingress (not .intern.dev.nav.no) so contributors on
// ansatt-only network access (no naisdevice) can run the frontend locally
// against the real dev backend without any extra network setup.
const defaultDevBackendBaseUrl =
  process.env.NODE_ENV === 'production' ? undefined : 'https://innblikk-backend.ansatt.dev.nav.no'

export const BACKEND_BASE_URL = normalizeBaseUrl(
  process.env.BACKEND_BASE_URL || process.env.VITE_BACKEND_BASE_URL || defaultDevBackendBaseUrl,
)

// Same rationale as BACKEND_BASE_URL/GCP_PROJECT_ID above for GCP_PROJECT_ID: default to the
// real dev value locally so a contributor can `pnpm run server` with zero config.
//
// SITEIMPROVE_BASE_URL has no such default: the dev value is a cluster-internal DNS name
// (reops-proxy.team-researchops.svc.cluster.local, only resolvable inside the Nais cluster),
// there is no known ansatt/intern-reachable equivalent to fall back to. Left unset locally —
// the siteimprove proxy route degrades gracefully per-request instead (see
// siteimproveRoutes.js), same as any other unreachable upstream.
const isProduction = process.env.NODE_ENV === 'production'
const defaultDevGcpProjectId = isProduction ? undefined : 'team-researchops-dev-4396'

export const SITEIMPROVE_BASE_URL = normalizeBaseUrl(
  process.env.SITEIMPROVE_BASE_URL || process.env.VITE_SITEIMPROVE_BASE_URL,
)
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.VITE_GCP_PROJECT_ID || defaultDevGcpProjectId
export const BACKEND_WS_HOST = process.env.BACKEND_WS_HOST || undefined

// Gemini Enterprise Agent Platform (formerly "Vertex AI") — used by the experimental /copilot chat.
// Swap the model later via env var.
//
// Location: europe-west4 (Netherlands) — deliberate choice, confirmed intentional Aug 2026.
// BigQuery data (the actual analytics/traffic data) stays in europe-north1 (Finland) per every
// BigQuery call in this app (see e.g. helpers.js) — only the Gemini model calls (SQL generation
// reasoning, not the underlying analytics data itself) route through Netherlands instead.
// Accepted tradeoff, not an oversight: Copilot doesn't send PII through Gemini (website
// names/domains/aggregate SQL only), and both regions are EU.
//
// Only the Gemini 2.5 family is actually usable via the public Vertex AI API for this project
// (team-researchops-prod-01d6) as of Aug 2026, confirmed via direct REST calls to
// europe-west4-aiplatform.googleapis.com and europe-north1-aiplatform.googleapis.com:
//   - gemini-2.5-flash-lite: works
//   - gemini-2.5-flash: works
//   - gemini-2.0-flash-lite, gemini-3.1-flash-lite, gemini-3-flash-preview, gemini-3.5-flash,
//     gemini-3.6-flash, gemini-3.5-flash-lite: all 404 ("Publisher model ... not found or your
//     project does not have access to it")
// This is NOT the vertexai.allowedModels org policy (effective policy = Allow All, confirmed via
// Console) and NOT a region issue (identical 404 both regions, and the gcp.restrictEndpointUsage
// org policy blocks the global/eu multi-region endpoints anyway, so only regional endpoints are
// usable at all). Being able to "test" a model in the Model Garden Studio playground does NOT
// mean it's available here either — Studio calls Google's internal console backend
// (cloudconsole-pa.clients6.google.com / AiplatformEntityService), a separate code path from the
// public API with its own access rules, decoupled from what's actually granted to this project.
// Bottom line: 3.x-gen models need a Google-side entitlement grant (support ticket/account team),
// not something fixable via Console org policy or API enablement. Using gemini-2.5-flash as the
// default: same access tier as flash-lite but noticeably better reasoning/tool-calling for the
// agent loop, still cheap in absolute terms ($0.30/$2.50 per 1M input/output tokens vs
// $0.10/$0.40 for flash-lite).
export const GEMINI_LOCATION = process.env.GEMINI_LOCATION || 'europe-west4'
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

if (!BACKEND_BASE_URL) {
  throw new Error('Missing env var: BACKEND_BASE_URL')
}
if (!GCP_PROJECT_ID) {
  throw new Error('Missing env var: GCP_PROJECT_ID')
}
// SITEIMPROVE_BASE_URL is intentionally NOT required at boot — see comment above.
// Missing it locally just makes the siteimprove proxy route fail gracefully per-request.
