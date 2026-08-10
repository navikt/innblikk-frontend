import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getWebsitesList } from '../bigquery/helpers.js'
import { buildSystemPrompt, parseModelReply } from './copilotPrompt.js'

// Website list rarely changes — cache it for a few minutes instead of hitting
// BigQuery on every chat message.
const WEBSITE_LIST_TTL_MS = 5 * 60 * 1000
let cachedWebsites = null
let cachedAt = 0

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
