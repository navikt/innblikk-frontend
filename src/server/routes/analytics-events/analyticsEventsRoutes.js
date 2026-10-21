import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'

import { logger } from '../../logger.js'

const EVENTS_JSON_URL = 'https://github.com/navikt/analytics-types/releases/latest/download/events.json'
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 min — GitHub releases don't change retroactively
const FETCH_TIMEOUT_MS = 10000

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

/**
 * Local fallback for dev and for the window before the first GitHub release
 * with an events.json asset exists: regenerate from the sibling
 * analytics-types checkout if present, else from the installed npm package.
 */
function localEventsJson() {
  const sibling = join(serverRoot, '..', 'analytics-types')
  const generator = join(sibling, 'scripts', 'generate-events-json.mjs')
  if (existsSync(generator)) {
    try {
      execFileSync('node', [generator], { cwd: sibling, stdio: 'pipe' })
      const out = join(sibling, 'dist', 'events.json')
      if (existsSync(out)) {
        logger.info('[analytics-events] Serving locally generated events.json from ../analytics-types')
        return JSON.parse(readFileSync(out, 'utf8'))
      }
    } catch (error) {
      logger.warn({ error: error.message }, '[analytics-events] Local generation failed')
    }
  }
  return null
}

/**
 * Serves the machine-readable event taxonomy from navikt/analytics-types.
 * The upstream artifact is built from the TypeScript source and attached to
 * every GitHub release, so "latest" is whatever version is currently published.
 * Cached in-memory with a TTL; on upstream failure we serve stale cache rather
 * than erroring the page.
 */
export function createAnalyticsEventsRouter() {
  const router = express.Router()

  let cache = null // { fetchedAt: number, payload: object }

  async function getEvents() {
    const now = Date.now()
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return { ...cache, stale: false }
    }

    try {
      const response = await fetch(EVENTS_JSON_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'user-agent': 'innblikk-frontend' },
      })
      if (!response.ok) {
        throw new Error(`GitHub releases returned ${response.status}`)
      }
      const payload = await response.json()
      cache = { fetchedAt: now, payload }
      return { ...cache, stale: false }
    } catch (error) {
      logger.warn({ error: error.message ?? error, url: EVENTS_JSON_URL }, '[analytics-events] Upstream fetch failed')
      if (cache) {
        return { ...cache, stale: true }
      }
      const local = localEventsJson()
      if (local) {
        cache = { fetchedAt: now, payload: local }
        return { ...cache, stale: true }
      }
      throw error
    }
  }

  router.get('/analytics-events', async (_req, res) => {
    try {
      const { payload, stale } = await getEvents()
      res.set('Cache-Control', 'public, max-age=300')
      if (stale) {
        res.set('X-Analytics-Events-Stale', 'true')
      }
      res.json(payload)
    } catch (error) {
      res.status(502).json({
        error: 'Kunne ikke hente hendelsestaksonomien',
        details: error.message,
        source: EVENTS_JSON_URL,
      })
    }
  })

  return router
}
