import { logger } from '../logger.js'

/**
 * Generated-data Gemini/Copilot client — used ONLY when no real GCP credentials are available
 * (mirrors `bigquery/generatedDataClient.js`'s rationale exactly: let a contributor without GCP
 * access run the whole app locally, including experimental/unreleased features, without
 * ever touching real Gemini/Vertex AI).
 *
 * Unlike the BigQuery generated-data client, this doesn't need to synthesize a shape from arbitrary
 * SQL — Copilot's own system prompt (`copilotPrompt.js`) already dictates an exact, narrow
 * output format (1-3 sentences, then a single ```sql fenced block referencing
 * `{projectId}.umami_views.*`, literal TIMESTAMP bounds, no dynamic NOW()). So this generated-data client
 * just always returns one deterministic, valid, cheap "final answer" in that exact shape —
 * never any tool call, never a clarifying question — which is enough to exercise the whole
 * request/response cycle end-to-end (chat UI, SQL panel, cost estimate, chart suggestion) with
 * something that renders fully instead of erroring out.
 *
 * The returned SQL is always cheap: it queries the BigQuery generated-data client's synthetic data
 * (see `bigquery/generatedDataClient.js`), which never scans real data and never processes more than
 * ~1.5GB (worst case ~$0.01) — comfortably under Copilot's own `COPILOT_MAX_COST_USD` (0.5)
 * cost-guard threshold, so the "too expensive, let me suggest a narrower query" branch is
 * never exercised by this generated-data client (acceptable: that branch only ever calls the real BigQuery
 * dry-run/cost-estimate path anyway, which is already generated-data-backed and independently guarded
 * — see `bigquery/generatedDataClient.js`'s own doc comment on treating all input as untrusted).
 */
export function createGeneratedGenAIClient({ projectId }) {
  logger.warn(
    '[Copilot] No GCP credentials found locally — using GENERATED Gemini responses (deterministic, ' +
      'no real Gemini/Vertex AI call). Set GOOGLE_APPLICATION_CREDENTIALS to use real Copilot instead.',
  )

  return {
    __isGeneratedDataClient: true,

    chats: {
      create() {
        return {
          async sendMessage({ message }) {
            const questionText = Array.isArray(message)
              ? '(oppfølging etter et verktøykall)'
              : String(message ?? '').trim()

            const now = new Date()
            const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            const formatOslo = (d) =>
              d.toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(' ', ' ').slice(0, 19)

            const sql = [
              `SELECT COUNT(DISTINCT s.distinct_id) AS unike_besokende`,
              `FROM \`${projectId}.umami_views.session\` AS s`,
              `WHERE s.website_id = 'generated-website-01'`,
              `  AND s.created_at >= TIMESTAMP('${formatOslo(start)}', 'Europe/Oslo')`,
              `  AND s.created_at <  TIMESTAMP('${formatOslo(now)}', 'Europe/Oslo')`,
            ].join('\n')

            const reply = [
              `_(Generert svar — ingen ekte Gemini-kall gjort, se GENERATED_MODE i loggene.)_`,
              '',
              `Spørsmålet ditt («${questionText.slice(0, 160)}») ville normalt gått til Gemini for å generere en SQL-spørring. Siden det ikke er noen GCP-legitimasjon tilgjengelig lokalt, viser dette en fast eksempel-spørring i stedet — antall unike besøkende på et generert nettsted de siste 30 dagene.`,
            ].join('\n')

            const text = `${reply}\n\n\`\`\`sql\n${sql}\n\`\`\``

            return {
              text,
              functionCalls: [],
              usageMetadata: {
                promptTokenCount: 0,
                candidatesTokenCount: 0,
                totalTokenCount: 0,
              },
            }
          },
        }
      },
    },
  }
}
