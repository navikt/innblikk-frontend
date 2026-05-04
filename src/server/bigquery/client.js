import path from 'path'
import { BigQuery } from '@google-cloud/bigquery'

export function createBigQueryClient({ projectId, dirname }) {
  let bigquery
  try {
    const bqConfig = {
      projectId: projectId,
    }

    // Priority order:
    // 1. GCP secret (bigquery-credentials from NAIS)
    // 2. Service account key file path from env (GOOGLE_APPLICATION_CREDENTIALS)
    // 3. Service account JSON from env (UMAMI_BIGQUERY)
    // 4. Local service account key file (./service-account-key.json)

    if (process.env['bigquery-credentials']) {
      try {
        bqConfig.credentials = JSON.parse(process.env['bigquery-credentials'])
        console.log('✓ Using credentials from bigquery-credentials secret (NAIS)')
      } catch (e) {
        console.error('✗ Failed to parse bigquery-credentials:', e.message)
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log(
        '✓ Using service account from GOOGLE_APPLICATION_CREDENTIALS:',
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
      )
      bqConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
    } else if (process.env.UMAMI_BIGQUERY) {
      try {
        bqConfig.credentials = JSON.parse(process.env.UMAMI_BIGQUERY)
        console.log('✓ Using credentials from UMAMI_BIGQUERY env variable')
      } catch (e) {
        console.error('✗ Failed to parse UMAMI_BIGQUERY:', e.message)
      }
    } else {
      // Try local service account key file
      const localKeyPath = path.join(dirname, 'service-account-key.json')
      console.log('✓ Using local service account key file:', localKeyPath)
      bqConfig.keyFilename = localKeyPath
    }

    console.log('Creating BigQuery client with config:', {
      projectId: bqConfig.projectId,
      hasCredentials: !!bqConfig.credentials,
      hasKeyFilename: !!bqConfig.keyFilename,
    })

    bigquery = new BigQuery(bqConfig)

    console.log('✓ BigQuery client initialized successfully')
    console.log('==========================================')
  } catch (error) {
    console.error('==========================================')
    console.error('✗ FAILED TO INITIALIZE BIGQUERY CLIENT')
    console.error('==========================================')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    if (error.code) console.error('Error Code:', error.code)
    if (error.errors) console.error('Error Details:', JSON.stringify(error.errors, null, 2))
    console.error('==========================================')
  }
  return bigquery
}
