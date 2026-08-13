import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

import { createApp } from './src/server/app.js'
import { registerFrontend } from './src/server/frontend/serveFrontend.js'
import { createBigQueryClient } from './src/server/bigquery/client.js'
import { createBigQueryRouter } from './src/server/routes/bigquery/index.js'
import { createBackendProxyRouter } from './src/server/routes/backend/backendRoutes.js'
import { createSiteimproveProxyRouter } from './src/server/routes/siteimprove/siteimproveRoutes.js'
import { createUserRouter } from './src/server/routes/user/userRoutes.js'
import { createClickmapPreviewRouter } from './src/server/routes/clickmap/clickmapPreviewRoutes.js'
import { createCopilotRouter } from './src/server/routes/copilot/copilotRoutes.js'
import { createGenAIClient } from './src/server/genai/client.js'
import { authenticateUser } from './src/server/middleware/authenticateUser.js'
import { requireReopsTeamMember } from './src/server/middleware/requireReopsTeamMember.js'

import {
  BIGQUERY_TIMEZONE,
  BACKEND_BASE_URL,
  BACKEND_WS_HOST,
  SITEIMPROVE_BASE_URL,
  GCP_PROJECT_ID,
  GEMINI_LOCATION,
  GEMINI_MODEL,
} from './src/server/config/env.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const buildPath = path.resolve(__dirname, 'dist')

const app = createApp({ buildPath })

// Initialize BigQuery client
const bigquery = createBigQueryClient({ projectId: GCP_PROJECT_ID, dirname: __dirname })

// Initialize Gemini client (experimental /copilot chat)
const genai = createGenAIClient({ projectId: GCP_PROJECT_ID, location: GEMINI_LOCATION })

// Apply authentication middleware to all /api/bigquery routes (except /api/user/me which has its own handling)
app.use('/api/bigquery', authenticateUser)

// Copilot chat (experimental, Team ResearchOps only) — this is the actual security boundary,
// not just the client-side route guard on /copilot (which is UX only and never sufficient on
// its own — anyone with a valid session could otherwise call this API directly).
// (router paths already include /api/copilot, mounted at root like the BigQuery router below)
app.use('/api/copilot', authenticateUser, requireReopsTeamMember)
app.use(createCopilotRouter({ bigquery, genai, GCP_PROJECT_ID, GEMINI_MODEL }))

// Siteimprove proxy
app.use('/api/siteimprove', createSiteimproveProxyRouter({ SITEIMPROVE_BASE_URL }))

// User routes
app.use('/api/user', createUserRouter({ BACKEND_BASE_URL }))

// Backend proxy (Project/Dashboard/Graph/Query APIs)
app.use('/api/backend', createBackendProxyRouter({ BACKEND_BASE_URL }))

// BigQuery routes (router paths already include /api/bigquery)
app.use(createBigQueryRouter({ bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE }))

// Clickmap preview
app.use('/api', createClickmapPreviewRouter())

// Serve index.html with injected runtime config
registerFrontend(app, { buildPath, GCP_PROJECT_ID, BACKEND_WS_HOST })

const isProduction = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT) || (isProduction ? 8080 : 8081)

const httpServer = http.createServer(app)

httpServer.listen(port, () => {
  console.log(`Listening on port ${port}`)
  console.log('Server timeout set to 2 minutes')
})

// Set server timeout to 2 minutes
httpServer.timeout = 120000
httpServer.keepAliveTimeout = 125000 // Slightly longer than timeout
httpServer.headersTimeout = 130000 // Slightly longer than keepAliveTimeout
