import express from 'express'
import helmet from 'helmet'
import { logger } from './logger.js'

export function createApp({ buildPath }) {
  const app = express()

  // Security headers
  const defaultHeaders = helmet({
    contentSecurityPolicy: false, // Disabled — managed by NAIS ingress / requires tuning for inline scripts
  })
  const importHeaders = helmet({
    frameguard: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc,
        frameAncestors: [
          "'self'",
          'https://innblikk.ansatt.nav.no',
          'https://innblikk.ansatt.dev.nav.no',
          'http://localhost:*',
          'https://localhost:*',
          'http://127.0.0.1:*',
          'https://127.0.0.1:*',
          'http://[::1]:*',
          'https://[::1]:*',
        ],
      },
    },
  })
  app.use((req, res, next) => (req.path === '/importer-graf' ? importHeaders : defaultHeaders)(req, res, next))

  app.use(express.json())

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught Exception')
  })

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, 'Unhandled Rejection')
  })

  // Set server timeout to 2 minutes for BigQuery queries
  app.use((req, res, next) => {
    req.setTimeout(120000) // 2 minutes
    res.setTimeout(120000) // 2 minutes
    next()
  })

  // Ensure UTF-8 encoding for API JSON responses (fixes Norwegian characters)
  app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    next()
  })

  // Serve built frontend (index handled separately to inject runtime config)
  app.use('/', express.static(buildPath, { index: false }))

  app.use('/robots.txt', function (req, res) {
    res.type('text/plain')
    res.send('User-agent: *\nAllow: /')
  })

  app.get('/isalive', (req, res) => res.send('OK'))
  app.get('/isready', (req, res) => res.send('OK'))

  return app
}
