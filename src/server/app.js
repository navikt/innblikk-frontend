import express from 'express'
import helmet from 'helmet'

export function createApp({ buildPath }) {
  const app = express()

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled — managed by NAIS ingress / requires tuning for inline scripts
    }),
  )

  app.use(express.json())

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
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
