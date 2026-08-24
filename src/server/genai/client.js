import { GoogleGenAI } from '@google/genai'
import { logger } from '../logger.js'
import { createGeneratedGenAIClient } from './generatedDataClient.js'
import { hasNoLocalGcpCredentials } from '../gcpCredentials.js'

/**
 * Creates a Gemini Enterprise Agent Platform (formerly "Vertex AI") client.
 *
 * Reuses the same credential resolution as the BigQuery client
 * (see `src/server/bigquery/client.js`) since both talk to the same GCP project:
 * 1. `bigquery-credentials` secret (NAIS)
 * 2. `GOOGLE_APPLICATION_CREDENTIALS` key file path (local dev)
 * 3. Fall back to Application Default Credentials resolved by google-auth-library
 *
 * When none of those are present locally (and NODE_ENV isn't production), returns a generated-data
 * client instead (see `genai/generatedDataClient.js`) — same rationale as the BigQuery generated-data client:
 * lets a contributor without GCP access exercise the whole Copilot feature, including tool
 * calls and cost estimation, without ever making a real (and here, doomed to fail) Gemini call.
 */
export function createGenAIClient({ projectId, location, dirname }) {
  if (process.env.NODE_ENV !== 'production' && hasNoLocalGcpCredentials(dirname)) {
    return createGeneratedGenAIClient({ projectId })
  }

  try {
    const config = { enterprise: true, project: projectId, location }

    if (process.env['bigquery-credentials']) {
      try {
        config.googleAuthOptions = { credentials: JSON.parse(process.env['bigquery-credentials']) }
        logger.info('Gemini client using credentials from bigquery-credentials secret (NAIS)')
      } catch (e) {
        logger.error({ error: e.message }, 'Failed to parse bigquery-credentials for Gemini client')
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      logger.info('Gemini client using service account from GOOGLE_APPLICATION_CREDENTIALS')
      config.googleAuthOptions = { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS }
    }

    const client = new GoogleGenAI(config)
    logger.info({ projectId, location }, 'Gemini client initialized')
    return client
  } catch (error) {
    logger.error({ error: error.message }, 'FAILED TO INITIALIZE GEMINI CLIENT')
    return null
  }
}
