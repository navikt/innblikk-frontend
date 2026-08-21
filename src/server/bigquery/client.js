import path from 'path'
import { BigQuery } from '@google-cloud/bigquery'
import { logger } from '../logger.js'
import { createFixtureBigQueryClient } from './fixtureClient.js'
import { hasNoLocalGcpCredentials } from '../gcpCredentials.js'

export function createBigQueryClient({ projectId, dirname, proxyBaseUrl }) {
  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction && hasNoLocalGcpCredentials(dirname)) {
    return createFixtureBigQueryClient({ proxyBaseUrl, staticToken: process.env.BACKEND_TOKEN })
  }

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
        logger.info('BigQuery client using credentials from bigquery-credentials secret (NAIS)')
      } catch (e) {
        logger.error({ error: e.message }, 'Failed to parse bigquery-credentials')
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      logger.info(
        { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS },
        'BigQuery client using service account from GOOGLE_APPLICATION_CREDENTIALS',
      )
      bqConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
    } else if (process.env.UMAMI_BIGQUERY) {
      try {
        bqConfig.credentials = JSON.parse(process.env.UMAMI_BIGQUERY)
        logger.info('BigQuery client using credentials from UMAMI_BIGQUERY env variable')
      } catch (e) {
        logger.error({ error: e.message }, 'Failed to parse UMAMI_BIGQUERY')
      }
    } else {
      // Try local service account key file
      const localKeyPath = path.join(dirname, 'service-account-key.json')
      logger.info({ localKeyPath }, 'BigQuery client using local service account key file')
      bqConfig.keyFilename = localKeyPath
    }

    logger.info(
      { projectId: bqConfig.projectId, hasCredentials: !!bqConfig.credentials, hasKeyFilename: !!bqConfig.keyFilename },
      'Creating BigQuery client',
    )

    bigquery = new BigQuery(bqConfig)

    logger.info('BigQuery client initialized successfully')
  } catch (error) {
    logger.error(
      { error: error.message, stack: error.stack, code: error.code, errors: error.errors },
      'FAILED TO INITIALIZE BIGQUERY CLIENT',
    )
  }
  return bigquery
}
