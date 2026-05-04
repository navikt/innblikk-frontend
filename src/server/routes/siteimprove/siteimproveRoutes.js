import express from 'express'
import { authenticateUser } from '../../middleware/authenticateUser.js'

export function createSiteimproveProxyRouter({ SITEIMPROVE_BASE_URL }) {
  const router = express.Router()

  // Proxy all requests to Siteimprove
  router.use('/', authenticateUser, async (req, res) => {
    try {
      const targetUrl = new URL(req.url, SITEIMPROVE_BASE_URL)

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          ...req.headers,
          host: undefined,
        },
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
      })

      const data = await response.text()

      res.status(response.status)
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })

      res.send(data)
    } catch (err) {
      console.error('Siteimprove proxy error:', err)
      res.status(500).send('Proxy error')
    }
  })

  return router
}
