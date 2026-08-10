import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getWebsitesList } from '../bigquery/helpers.js'
import { buildSystemPrompt, parseModelReply } from './copilotPrompt.js'

// Website list rarely changes — cache it for a few minutes instead of hitting
// BigQuery on every chat message.
const WEBSITE_LIST_TTL_MS = 5 * 60 * 1000
let cachedWebsites = null
let cachedAt = 0

// Gemini API never returns a dollar cost — only token counts. Cost below is an
// ESTIMATE computed from Google's published per-model rate card (AI Studio rates;
// Vertex AI list prices aren't broken out separately and run ~10-20% higher in
// practice). Update this if GEMINI_MODEL changes or Google revises pricing:
// https://ai.google.dev/gemini-api/docs/pricing
const GEMINI_PRICING_USD_PER_MILLION_TOKENS = {
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
}

function estimateCostUsd(model, usageMetadata) {
  const rate = GEMINI_PRICING_USD_PER_MILLION_TOKENS[model]
  if (!rate || !usageMetadata) return null
  const { promptTokenCount = 0, candidatesTokenCount = 0 } = usageMetadata
  const cost = (promptTokenCount / 1e6) * rate.input + (candidatesTokenCount / 1e6) * rate.output
  return Number(cost.toFixed(6))
}

async function getCachedWebsitesList(bigquery, GCP_PROJECT_ID, navIdent) {
  const isStale = !cachedWebsites || Date.now() - cachedAt > WEBSITE_LIST_TTL_MS
  if (isStale) {
    cachedWebsites = await getWebsitesList(bigquery, GCP_PROJECT_ID, navIdent, addAuditLogging)
    cachedAt = Date.now()
  }
  return cachedWebsites
}

export function createCopilotRouter({ bigquery, genai, GCP_PROJECT_ID, GEMINI_MODEL }) {
  const router = express.Router()

  router.post('/api/copilot/chat', async (req, res) => {
    try {
      const { question } = req.body

      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'question is required' })
      }

      if (!genai) {
        return res.status(500).json({ error: 'Gemini client not initialized' })
      }
      if (!requireBigQuery(bigquery, res)) return

      const navIdent = getNavIdent(req)
      const websites = await getCachedWebsitesList(bigquery, GCP_PROJECT_ID, navIdent)
      const systemInstruction = buildSystemPrompt({ websites, projectId: GCP_PROJECT_ID })

      const response = await genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: question,
        config: { systemInstruction },
      })

      const usage = response.usageMetadata
      if (usage) {
        console.log('[Copilot Chat] Token usage:', {
          model: GEMINI_MODEL,
          promptTokens: usage.promptTokenCount,
          responseTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
          estimatedCostUsd: estimateCostUsd(GEMINI_MODEL, usage),
        })
      }

      const text = response.text ?? ''
      const { sql, reply } = parseModelReply(text)

      if (!sql) {
        return res.status(502).json({ error: 'Gemini returned no SQL', raw: text })
      }

      res.json({ sql, reply, raw: text })
    } catch (error) {
      // @google/genai throws ApiError with `.status` (HTTP-ish code) and `.name` for Google API
      // errors (e.g. PERMISSION_DENIED, SERVICE_DISABLED) — log those explicitly since "message"
      // alone is often just a generic wrapper and hides the actual cause (missing IAM role,
      // Vertex/Gemini API not enabled on the project, model not available in the region, etc).
      console.error('[Copilot Chat] Error:', {
        message: error.message,
        name: error.name,
        status: error.status,
      })
      res.status(500).json({
        error: error.message || 'Failed to generate SQL',
        googleErrorName: error.name,
        googleErrorStatus: error.status,
      })
    }
  })

  return router
}
