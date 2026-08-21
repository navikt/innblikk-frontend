import express from 'express'

import { createDiagnosisRouter } from './diagnosisRoutes.js'
import { createSqlRouter } from './sqlRoutes.js'
import { createEventRouter } from './eventRoutes.js'
import { createTrafficRouter } from './trafficRoutes.js'
import { createWebsiteRoutes } from './websiteRoutes.js'
import { createJourneyRoutes } from './journeyRoutes.js'
import { createFunnelRoutes } from './funnelRoutes.js'
import { createRetentionRoutes } from './retentionRoutes.js'
import { createGoalCompletionRoutes } from './goalCompletionRoutes.js'
import { createCompositionRoutes } from './compositionRoutes.js'
import { createPrivacyRoutes } from './privacyRoutes.js'
import { createUserProfileRoutes } from './userProfileRoutes.js'

export function createBigQueryRouter({ bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE, BIGQUERY_PROXY_BASE_URL }) {
  const router = express.Router()

  router.use(createDiagnosisRouter({ bigquery, GCP_PROJECT_ID }))
  router.use(createSqlRouter({ bigquery }))
  router.use(createEventRouter({ bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE }))
  router.use(createTrafficRouter({ bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE }))
  router.use(createWebsiteRoutes({ bigquery, GCP_PROJECT_ID, BIGQUERY_PROXY_BASE_URL }))
  router.use(createJourneyRoutes({ bigquery, GCP_PROJECT_ID }))
  router.use(createFunnelRoutes({ bigquery, GCP_PROJECT_ID }))
  router.use(createRetentionRoutes({ bigquery, GCP_PROJECT_ID }))
  router.use(createGoalCompletionRoutes({ bigquery, GCP_PROJECT_ID }))
  router.use(createCompositionRoutes({ bigquery, GCP_PROJECT_ID }))
  router.use(createPrivacyRoutes({ bigquery, GCP_PROJECT_ID }))
  router.use(createUserProfileRoutes({ bigquery, GCP_PROJECT_ID }))

  return router
}
