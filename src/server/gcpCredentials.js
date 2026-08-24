import fs from 'fs'
import path from 'path'

/**
 * True when none of the supported local GCP credential sources are present.
 * Shared by `bigquery/client.js` and `genai/client.js` so "do we have real GCP access
 * locally" is a single source of truth, not two copies that can drift — both clients fall
 * back to generated data under the same condition (see their respective generatedDataClient.js).
 */
export function hasNoLocalGcpCredentials(dirname) {
  if (process.env['bigquery-credentials']) return false
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return false
  if (process.env.UMAMI_BIGQUERY) return false
  const localKeyPath = path.join(dirname, 'service-account-key.json')
  if (fs.existsSync(localKeyPath)) return false
  return true
}
