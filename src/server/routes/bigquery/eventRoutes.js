import express from 'express'
import { addAuditLogging } from '../../bigquery/audit.js'
import { MAX_BYTES_BILLED } from './helpers.js'

export function createEventRouter({ bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE }) {
  const router = express.Router()

  // Get events for a website from BigQuery
  router.get('/api/bigquery/websites/:websiteId/events', async (req, res) => {
    try {
      const { websiteId } = req.params

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const { startAt, endAt, urlPath, pathOperator } = req.query

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      const params = {
        websiteId: websiteId,
        startDate: startDate,
        endDate: endDate,
      }

      let urlFilter = ''
      if (urlPath) {
        if (pathOperator === 'starts-with') {
          urlFilter = `AND LOWER(url_path) LIKE @urlPathPattern`
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          urlFilter = `AND (
                      url_path = @urlPath 
                      OR url_path = @urlPathSlash 
                      OR url_path LIKE @urlPathQuery
                  )`
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      const query = `
              SELECT event_name, COUNT(*) as count
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\`
              WHERE website_id = @websiteId
                AND created_at BETWEEN @startDate AND @endDate
                AND event_name IS NOT NULL
              ${urlFilter}
              GROUP BY event_name
              ORDER BY count DESC
          `

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Hendelsesutforsker',
        ),
      )

      const [rows] = await job.getQueryResults()
      const events = rows.map((row) => ({
        name: row.event_name,
        count: parseInt(row.count),
      }))

      // Get dry run stats
      let queryStats = null
      try {
        // Get NAV ident from authenticated user for audit logging

        const [dryRunJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: query,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            'Hendelsesutforsker',
          ),
        )

        const stats = dryRunJob.metadata.statistics
        const bytesProcessed = parseInt(stats.totalBytesProcessed)
        const gbProcessed = (bytesProcessed / 1024 ** 3).toFixed(1)
        const estimatedCostUSD = ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3)

        queryStats = {
          totalBytesProcessed: bytesProcessed,
          totalBytesProcessedGB: gbProcessed,
          estimatedCostUSD: estimatedCostUSD,
        }
      } catch (dryRunError) {
        console.log('[Events] Dry run failed:', dryRunError.message)
      }

      res.json({ events, queryStats })
    } catch (error) {
      console.error('BigQuery events error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch events',
      })
    }
  })

  // Get event properties/parameters for a website from BigQuery
  router.get('/api/bigquery/websites/:websiteId/event-properties', async (req, res) => {
    try {
      const { websiteId } = req.params

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const { startAt, endAt, includeParams, eventName, urlPath, pathOperator } = req.query

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()
      const withParams = includeParams === 'true'

      console.log(
        `[Event Properties] Query: ${withParams ? 'EXPENSIVE (with params)' : 'CHEAP (events only)'} - includeParams=${includeParams} eventName=${eventName} urlPath=${urlPath}`,
      )

      const params = {
        websiteId: websiteId,
        startDate: startDate,
        endDate: endDate,
      }

      let urlFilter = ''
      if (urlPath) {
        if (pathOperator === 'starts-with') {
          urlFilter = `AND LOWER(e.url_path) LIKE @urlPathPattern`
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          urlFilter = `AND (
                      e.url_path = @urlPath 
                      OR e.url_path = @urlPathSlash 
                      OR e.url_path LIKE @urlPathQuery
                  )`
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      let eventFilter = ''
      if (eventName) {
        eventFilter = `AND e.event_name = @eventName`
        params.eventName = eventName
      }

      // Query depends on whether we need parameters or not
      const query = withParams
        ? `
              SELECT
                  e.event_name,
                  p.data_key,
                  COUNT(*) AS total,
                  p.data_type,
                  CASE
                      WHEN p.data_type = 1 THEN 'number'
                      WHEN p.data_type = 2 THEN 'string'
                      WHEN p.data_type = 3 THEN 'boolean'
                      WHEN p.data_type = 4 THEN 'date'
                      ELSE 'string'
                  END AS type
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
              JOIN \`${GCP_PROJECT_ID}.umami_views.event_data\` d
                  ON e.event_id = d.website_event_id
                  AND e.website_id = d.website_id
                  AND e.created_at = d.created_at
                  AND d.website_id = @websiteId
                  AND d.created_at BETWEEN @startDate AND @endDate
              CROSS JOIN UNNEST(d.event_parameters) AS p
              WHERE e.website_id = @websiteId
              AND e.created_at BETWEEN @startDate AND @endDate
              AND e.event_name IS NOT NULL
              AND p.data_key IS NOT NULL
              ${urlFilter}
              ${eventFilter}
              GROUP BY
                  e.event_name,
                  p.data_key,
                  p.data_type
              ORDER BY
                  e.event_name,
                  p.data_key
          `
        : `
              SELECT 
                  event_name,
                  COUNT(*) AS total
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
              WHERE website_id = @websiteId
              AND created_at BETWEEN @startDate AND @endDate
              AND event_name IS NOT NULL
              ${urlFilter}
              ${eventFilter}
              GROUP BY event_name
              ORDER BY event_name
          `

      // Dry run to estimate bytes processed
      let estimatedBytes = '0'
      try {
        // Get NAV ident from authenticated user for audit logging
        const navIdent = req.user?.navIdent || 'UNKNOWN'

        const [dryRunJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: query,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            'Hendelsesutforsker',
          ),
        )

        const dryRunMetadata = dryRunJob.metadata
        estimatedBytes = dryRunMetadata.statistics?.totalBytesProcessed || '0'
        const estimatedGb = (Number(estimatedBytes) / 1024 ** 3).toFixed(2)
        console.log(`[Event Properties] Estimated bytes: ${estimatedGb} GB`)
      } catch (dryRunError) {
        console.warn('[Event Properties] Dry run failed:', dryRunError.message)
      }

      // Actual query execution
      // Get NAV ident from authenticated user for audit logging

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Hendelsesutforsker',
        ),
      )

      const [rows] = await job.getQueryResults()

      // Get job statistics for bytes processed from metadata
      const [metadata] = await job.getMetadata()
      const bytesProcessed = metadata.statistics?.totalBytesProcessed || estimatedBytes
      const gbProcessed = (Number(bytesProcessed) / 1024 ** 3).toFixed(2)

      // Format the response based on query type
      const properties = withParams
        ? rows.map((row) => ({
            eventName: row.event_name,
            propertyName: row.data_key,
            total: parseInt(row.total),
            type: row.type,
          }))
        : rows.map((row) => ({
            eventName: row.event_name,
            propertyName: null, // No parameters in simple query
            total: parseInt(row.total),
            type: 'string',
          }))

      res.json({
        properties,
        gbProcessed,
        estimatedGbProcessed: (Number(estimatedBytes) / 1024 ** 3).toFixed(2),
        includeParams: withParams,
      })
    } catch (error) {
      console.error('BigQuery event properties error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch event properties',
      })
    }
  })

  // Get event series data (time series)
  router.get('/api/bigquery/websites/:websiteId/event-series', async (req, res) => {
    try {
      const { websiteId } = req.params

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const { startAt, endAt, eventName, urlPath, interval = 'day', pathOperator } = req.query

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      const params = {
        websiteId: websiteId,
        startDate: startDate,
        endDate: endDate,
      }

      let urlFilter = ''
      if (urlPath) {
        if (pathOperator === 'starts-with') {
          urlFilter = `AND LOWER(url_path) LIKE @urlPathPattern`
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          urlFilter = `AND (
                      url_path = @urlPath 
                      OR url_path = @urlPathSlash 
                      OR url_path LIKE @urlPathQuery
                  )`
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      let eventFilter = ''
      if (eventName) {
        eventFilter = `AND event_name = @eventName`
        params.eventName = eventName
      }

      // Determine time truncation based on interval
      let timeTrunc = 'DAY'
      if (interval === 'hour') timeTrunc = 'HOUR'
      if (interval === 'week') timeTrunc = 'WEEK'
      if (interval === 'month') timeTrunc = 'MONTH'
      const intervalStep = timeTrunc

      const query = `
              WITH buckets AS (
                  SELECT bucket_time AS time
                  FROM UNNEST(
                      GENERATE_TIMESTAMP_ARRAY(
                          TIMESTAMP_TRUNC(TIMESTAMP(@startDate), ${timeTrunc}, '${BIGQUERY_TIMEZONE}'),
                          TIMESTAMP_TRUNC(TIMESTAMP(@endDate), ${timeTrunc}, '${BIGQUERY_TIMEZONE}'),
                          INTERVAL 1 ${intervalStep}
                      )
                  ) AS bucket_time
              ),
              counts AS (
                  SELECT
                      TIMESTAMP_TRUNC(created_at, ${timeTrunc}, '${BIGQUERY_TIMEZONE}') as time,
                      COUNT(*) as count
                  FROM \`${GCP_PROJECT_ID}.umami.public_website_event\`
                  WHERE website_id = @websiteId
                  AND created_at BETWEEN @startDate AND @endDate
                  AND event_name IS NOT NULL
                  ${urlFilter}
                  ${eventFilter}
                  GROUP BY 1
              )
              SELECT
                  buckets.time,
                  COALESCE(counts.count, 0) as count
              FROM buckets
              LEFT JOIN counts ON buckets.time = counts.time
              ORDER BY buckets.time
          `

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Hendelsesutforsker',
        ),
      )

      const [rows] = await job.getQueryResults()

      const data = rows.map((row) => ({
        time: row.time.value,
        count: parseInt(row.count),
      }))

      res.json({
        data,
      })
    } catch (error) {
      console.error('BigQuery event series error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch event series',
      })
    }
  })

  // Get date range for a website from BigQuery
  router.get('/api/bigquery/websites/:websiteId/daterange', async (req, res) => {
    try {
      const { websiteId } = req.params

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const query = `
              SELECT 
                  MIN(created_at) as mindate,
                  MAX(created_at) as maxdate
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\`
              WHERE website_id = @websiteId
          `

      // Get NAV ident from authenticated user for audit logging

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: {
              websiteId: websiteId,
            },
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Datovelger',
        ),
      )

      const [rows] = await job.getQueryResults()

      if (rows.length > 0 && rows[0].mindate) {
        res.json({
          mindate: rows[0].mindate.value,
          maxdate: rows[0].maxdate.value,
        })
      } else {
        res.json({
          mindate: null,
          maxdate: null,
        })
      }
    } catch (error) {
      console.error('BigQuery daterange error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch date range',
      })
    }
  })

  // Get values for a specific event parameter
  router.get('/api/bigquery/websites/:websiteId/event-parameter-values', async (req, res) => {
    try {
      const { websiteId } = req.params

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const { startAt, endAt, eventName, parameterName, urlPath, pathOperator } = req.query

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      const params = {
        websiteId,
        startDate,
        endDate,
        eventName,
        parameterName,
      }

      let urlFilter = ''
      if (urlPath) {
        if (pathOperator === 'starts-with') {
          urlFilter = `AND LOWER(e.url_path) LIKE @urlPathPattern`
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          urlFilter = `AND (
                      e.url_path = @urlPath 
                      OR e.url_path = @urlPathSlash 
                      OR e.url_path LIKE @urlPathQuery
                  )`
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      const query = `
              SELECT
                  p.string_value,
                  COUNT(*) as count
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
              JOIN \`${GCP_PROJECT_ID}.umami_views.event_data\` d
                  ON e.event_id = d.website_event_id
                  AND e.website_id = d.website_id
                  AND e.created_at = d.created_at
              CROSS JOIN UNNEST(d.event_parameters) AS p
              WHERE e.website_id = @websiteId
              AND e.created_at BETWEEN @startDate AND @endDate
              AND e.event_name = @eventName
              AND p.data_key = @parameterName
              ${urlFilter}
              GROUP BY 1
              ORDER BY 2 DESC
              LIMIT 100
          `

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Hendelsesutforsker',
        ),
      )

      const [rows] = await job.getQueryResults()

      const values = rows.map((row) => ({
        value: row.string_value,
        count: parseInt(row.count),
      }))

      // Get dry run stats
      let queryStats = null
      try {
        // Get NAV ident from authenticated user for audit logging

        const [dryRunJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: query,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            'Hendelsesutforsker',
          ),
        )

        const stats = dryRunJob.metadata.statistics
        const bytesProcessed = parseInt(stats.totalBytesProcessed)
        const gbProcessed = (bytesProcessed / 1024 ** 3).toFixed(1)
        const estimatedCostUSD = ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3)

        queryStats = {
          totalBytesProcessedGB: gbProcessed,
          estimatedCostUSD: estimatedCostUSD,
        }
      } catch (dryRunError) {
        console.log('[Event Parameter Values] Dry run failed:', dryRunError.message)
      }

      res.json({
        values,
        queryStats,
      })
    } catch (error) {
      console.error('BigQuery event parameter values error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch event parameter values',
      })
    }
  })

  // Get latest N events with all parameter values
  router.get('/api/bigquery/websites/:websiteId/event-latest', async (req, res) => {
    try {
      const { websiteId } = req.params

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const { startAt, endAt, eventName, urlPath, limit = '20', pathOperator } = req.query

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      const startDate = startAt
        ? new Date(parseInt(startAt)).toISOString()
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = endAt ? new Date(parseInt(endAt)).toISOString() : new Date().toISOString()

      const params = {
        websiteId,
        startDate,
        endDate,
        eventName,
        limit: parseInt(limit),
      }

      let urlFilter = ''
      if (urlPath) {
        if (pathOperator === 'starts-with') {
          urlFilter = `AND LOWER(e.url_path) LIKE @urlPathPattern`
          params.urlPathPattern = urlPath.toLowerCase() + '%'
        } else {
          urlFilter = `AND (
                      e.url_path = @urlPath 
                      OR e.url_path = @urlPathSlash 
                      OR e.url_path LIKE @urlPathQuery
                  )`
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      const query = `
              SELECT
                  e.event_id,
                  e.created_at,
                  ARRAY_AGG(STRUCT(p.data_key, p.string_value) ORDER BY p.data_key) as parameters
              FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
              JOIN \`${GCP_PROJECT_ID}.umami_views.event_data\` d
                  ON e.event_id = d.website_event_id
                  AND e.website_id = d.website_id
                  AND e.created_at = d.created_at
              LEFT JOIN UNNEST(d.event_parameters) AS p
              WHERE e.website_id = @websiteId
              AND e.created_at BETWEEN @startDate AND @endDate
              AND e.event_name = @eventName
              ${urlFilter}
              GROUP BY e.event_id, e.created_at
              ORDER BY e.created_at DESC
              LIMIT @limit
          `

      console.log('[Latest Events] Query params:', params)
      console.log('[Latest Events] URL filter:', urlFilter)

      const [job] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: query,
            location: 'europe-north1',
            params: params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Hendelsesutforsker',
        ),
      )

      const [rows] = await job.getQueryResults()

      console.log(`[Latest Events] Found ${rows.length} events`)
      if (rows.length > 0) {
        console.log('[Latest Events] First row sample:', JSON.stringify(rows[0], null, 2))
      }

      const events = rows.map((row) => {
        const properties = {}
        if (row.parameters) {
          row.parameters.forEach((param) => {
            if (param.data_key && param.string_value) {
              properties[param.data_key] = param.string_value
            }
          })
        }

        return {
          website_event_id: row.event_id,
          created_at: row.created_at.value,
          properties,
        }
      })

      // Get dry run stats
      let queryStats = null
      try {
        // Get NAV ident from authenticated user for audit logging

        const [dryRunJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: query,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            'Hendelsesutforsker',
          ),
        )

        const stats = dryRunJob.metadata.statistics
        const bytesProcessed = parseInt(stats.totalBytesProcessed)
        const gbProcessed = (bytesProcessed / 1024 ** 3).toFixed(1)
        const estimatedCostUSD = ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3)

        queryStats = {
          totalBytesProcessedGB: gbProcessed,
          estimatedCostUSD: estimatedCostUSD,
        }
      } catch (dryRunError) {
        console.log('[Latest Events] Dry run failed:', dryRunError.message)
      }

      console.log(`[Latest Events] Returning ${events.length} events`)
      res.json({ events, queryStats })
    } catch (error) {
      console.error('BigQuery latest events error:', error)
      res.status(500).json({
        error: error.message || 'Failed to fetch latest events',
      })
    }
  })

  // Get event journeys (sequences of events)
  router.post('/api/bigquery/event-journeys', async (req, res) => {
    try {
      const { websiteId, startDate, endDate, urlPath, minEvents = 1, eventFilter, maxEventsPerSession = 200 } = req.body

      if (!bigquery) {
        return res.status(500).json({
          error: 'BigQuery client not initialized',
        })
      }

      // Get NAV ident from authenticated user for audit logging
      const navIdent = req.user?.navIdent || 'UNKNOWN'

      const params = {
        websiteId,
        startDate,
        endDate,
        minEvents: parseInt(minEvents),
        maxEventsPerSession: Math.max(1, Math.min(parseInt(maxEventsPerSession) || 200, 1000)),
      }

      let urlFilter = ''
      if (urlPath && urlPath !== '') {
        if (urlPath.includes('*')) {
          urlFilter = `AND e.url_path LIKE @urlPathLike`
          params.urlPathLike = urlPath.replace(/\*/g, '%')
        } else {
          urlFilter = `AND (
                      e.url_path = @urlPath 
                      OR e.url_path = @urlPathSlash 
                      OR e.url_path LIKE @urlPathQuery
                  )`
          params.urlPath = urlPath
          params.urlPathSlash = urlPath.endsWith('/') ? urlPath : urlPath + '/'
          params.urlPathQuery = urlPath + '?%'
        }
      }

      if (eventFilter && Array.isArray(eventFilter) && eventFilter.length > 0) {
        // We want sessions that include THESE events.
        // Filter at the session aggregation level or pre-filter?
        // Let's filter in the HAVING clause of SessionPaths to ensure the path contains the event
        params.eventFilterList = eventFilter
      }

      // 1. Join with event_data to get properties
      // 2. Aggregate properties into a string per event
      // 3. Create the path array
      const query = `
              WITH EventProps AS (
                  SELECT
                      e.event_id,
                      e.session_id,
                      e.event_name,
                      e.created_at,
                      -- Aggregate ALL properties into a string for grouping
                      -- Exclude variable properties like scrollPos, screen that don't provide meaningful info
                      STRING_AGG(
                          CASE 
                              WHEN LOWER(p.data_key) IN ('scrollpos', 'screen', 'screenwidth', 'screenheight', 'viewport', 'timestamp', 'time', 'scrolldepth') THEN NULL
                              ELSE CONCAT(
                                  p.data_key,
                                  ': ',
                                  REPLACE(SUBSTR(COALESCE(p.string_value, CAST(p.number_value AS STRING), CAST(p.date_value AS STRING)), 1, 200), '||', ' ')
                              )
                          END, 
                          '||' ORDER BY CASE WHEN p.data_key IN ('lenketekst', 'tittel') THEN 0 ELSE 1 END, p.data_key LIMIT 25
                      ) as props_str
                  FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
                  LEFT JOIN \`${GCP_PROJECT_ID}.umami_views.event_data\` d
                      ON e.event_id = d.website_event_id
                      AND e.website_id = d.website_id
                      AND e.created_at = d.created_at
                  LEFT JOIN UNNEST(d.event_parameters) AS p
                  WHERE e.website_id = @websiteId
                  AND e.created_at BETWEEN @startDate AND @endDate
                  AND e.event_name IS NOT NULL
                  ${urlFilter}
                  GROUP BY 1, 2, 3, 4
              ),
              -- Filter out consecutive identical events (same name and same functional properties)
              DedupedEvents AS (
                  SELECT 
                      *,
                      LAG(event_name) OVER (PARTITION BY session_id ORDER BY created_at, CASE WHEN props_str LIKE '%destinasjon:%' THEN 1 ELSE 0 END, event_name, props_str) as prev_event_name,
                      LAG(props_str) OVER (PARTITION BY session_id ORDER BY created_at, CASE WHEN props_str LIKE '%destinasjon:%' THEN 1 ELSE 0 END, event_name, props_str) as prev_props_str
                  FROM EventProps
              ),
              CleanedEvents AS (
                  SELECT *
                  FROM DedupedEvents
                  WHERE 
                      -- Keep if it's the first event (prev is null)
                      prev_event_name IS NULL 
                      -- Or if it's different from the previous event
                      OR event_name != prev_event_name
                      -- Or if properties are different (handling NULLs safely)
                      OR IFNULL(props_str, '') != IFNULL(prev_props_str, '')
              ),
              RankedEvents AS (
                  SELECT
                      *,
                      ROW_NUMBER() OVER (
                          PARTITION BY session_id
                          ORDER BY created_at, CASE WHEN props_str LIKE '%destinasjon:%' THEN 1 ELSE 0 END, event_name, props_str
                      ) as event_order
                  FROM CleanedEvents
              ),
              SessionPaths AS (
                  SELECT
                      session_id,
                      -- Create an array of "EventName (props)" ordered by time
                      ARRAY_AGG(
                          IF(props_str IS NOT NULL, CONCAT(event_name, ': ', props_str), event_name)
                          ORDER BY created_at, CASE WHEN props_str LIKE '%destinasjon:%' THEN 1 ELSE 0 END, event_name, props_str
                      ) as path,
                      -- Also aggregate raw event names for filtering
                      ARRAY_AGG(event_name) as event_names
                  FROM RankedEvents
                  WHERE event_order <= @maxEventsPerSession
                  GROUP BY session_id
                  HAVING ARRAY_LENGTH(path) >= @minEvents
                  ${
                    eventFilter && Array.isArray(eventFilter) && eventFilter.length > 0
                      ? `AND EXISTS(SELECT 1 FROM UNNEST(event_names) AS n WHERE n IN UNNEST(@eventFilterList))`
                      : ''
                  }
              ),
              PathCounts AS (
                  SELECT
                      path,
                      COUNT(*) as count
                  FROM SessionPaths
                  GROUP BY path
              )
              SELECT
                  TO_JSON_STRING(path) as path_json,
                  count
              FROM PathCounts
              ORDER BY count DESC
              LIMIT 100
          `

      // Secondary query for high-level stats (Bounces, Navigation without events)
      const statsQuery = `
              WITH TargetVisits AS (
                  SELECT 
                      e.session_id, 
                      MIN(e.created_at) as visit_time
                  FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
                  WHERE e.website_id = @websiteId
                  AND e.created_at BETWEEN @startDate AND @endDate
                  AND e.event_name IS NULL -- Pageview
                  ${urlFilter}
                  GROUP BY e.session_id
              ),
              Interactions AS (
                  SELECT DISTINCT e.session_id
                  FROM \`${GCP_PROJECT_ID}.umami.public_website_event\` e
                  WHERE e.website_id = @websiteId
                  AND e.created_at BETWEEN @startDate AND @endDate
                  AND e.event_name IS NOT NULL -- Events
                  ${urlFilter}
              ),
              Navigation AS (
                  SELECT DISTINCT t.session_id
                  FROM TargetVisits t
                  JOIN \`${GCP_PROJECT_ID}.umami.public_website_event\` later
                      ON t.session_id = later.session_id
                      AND later.created_at BETWEEN @startDate AND @endDate
                      AND later.created_at > t.visit_time
                      AND later.event_name IS NULL
              )
              SELECT
                  COUNT(DISTINCT t.session_id) as total_sessions,
                  COUNT(DISTINCT i.session_id) as sessions_with_events,
                  COUNT(DISTINCT CASE WHEN i.session_id IS NULL AND n.session_id IS NOT NULL THEN t.session_id END) as sessions_no_events_navigated,
                  COUNT(DISTINCT CASE WHEN i.session_id IS NULL AND n.session_id IS NULL THEN t.session_id END) as sessions_no_events_bounced
              FROM TargetVisits t
              LEFT JOIN Interactions i ON t.session_id = i.session_id
              LEFT JOIN Navigation n ON t.session_id = n.session_id
          `

      // Get dry run stats first
      let queryStats = null
      try {
        // Get NAV ident from authenticated user for audit logging

        const [dryRunJob] = await bigquery.createQueryJob(
          addAuditLogging(
            {
              query: query,
              location: 'europe-north1',
              params: params,
              dryRun: true,
            },
            navIdent,
            'Hendelsesflyt',
          ),
        )

        const stats = dryRunJob.metadata.statistics
        const bytesProcessed = parseInt(stats.totalBytesProcessed)
        const gbProcessed = (bytesProcessed / 1024 ** 3).toFixed(2)
        const estimatedCostUSD = ((bytesProcessed / 1024 ** 4) * 6.25).toFixed(3)

        queryStats = {
          totalBytesProcessedGB: gbProcessed,
          estimatedCostUSD: estimatedCostUSD,
        }
      } catch (dryRunError) {
        console.log('[Event Journeys] Dry run failed:', dryRunError.message)
      }

      const [journeyJob] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Hendelsesflyt',
        ),
      )
      const [journeyRows] = await journeyJob.getQueryResults()

      const [statsJob] = await bigquery.createQueryJob(
        addAuditLogging(
          {
            query: statsQuery,
            location: 'europe-north1',
            params,
            maximumBytesBilled: MAX_BYTES_BILLED,
          },
          navIdent,
          'Hendelsesflyt',
        ),
      )
      const [statsRows] = await statsJob.getQueryResults()
      const journeyStats = statsRows[0] || {}

      const journeys = journeyRows.map((row) => ({
        path: JSON.parse(row.path_json),
        count: row.count,
      }))

      res.json({
        journeys,
        journeyStats,
        queryStats,
      })
    } catch (error) {
      console.error('[Event Journeys] ERROR:', error.message)
      if (error.errors) {
        console.error('[Event Journeys] BigQuery errors:', JSON.stringify(error.errors, null, 2))
      }
      res.status(500).json({
        error: error.message || 'Failed to fetch event journeys',
      })
    }
  })

  return router
}
