import { logger } from '../logger.js'

/**
 * Generated-data BigQuery client — used ONLY when no real GCP credentials are available
 * (i.e. local dev without GOOGLE_APPLICATION_CREDENTIALS / bigquery-credentials secret).
 *
 * Purpose: let a contributor without GCP access (e.g. a designer) run the app fully
 * locally against the real dev backend (see BACKEND_BASE_URL) while still seeing
 * plausible, non-blank charts for the BigQuery-backed analytics widgets — without
 * maintaining a hand-written, route-by-route mock dataset that drifts out of sync
 * with real queries over time.
 *
 * Strategy: instead of mocking each of the ~40 BigQuery-backed endpoints individually,
 * this client inspects the *shape* of the incoming SQL (its SELECT column aliases) and
 * synthesizes deterministic, plausibly-typed rows for whatever columns are actually
 * requested. This means it keeps working as routes/queries change, with zero generated-data
 * maintenance.
 *
 * Security posture: every query that reaches this client is treated as UNTRUSTED input
 * (it may originate from the ad-hoc SQL tool or an LLM-generated Copilot query, not just
 * from our own hand-written route SQL). It is therefore:
 *   1. Never sent to real BigQuery — this client never touches the network.
 *   2. Still validated as a read-only SELECT/WITH statement (same rule as the real
 *      /api/bigquery route — see sqlRoutes.js validateQuery), so the generated-data path can't
 *      be used to smuggle a destructive statement through into some other client that
 *      might one day resolve to a real BigQuery instance.
 *   3. Given a deterministic, capped, clearly-fake cost estimate — so a poorly-prompted
 *      local Copilot query never gets false confidence that it's cheap AND never
 *      actually runs against (and bills) real BigQuery. `isGeneratedData: true` is
 *      attached to every response so a badly-behaving caller can distinguish it from a
 *      real result if needed.
 */

const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/,
  /\bUPDATE\b/,
  /\bDELETE\b/,
  /\bDROP\b/,
  /\bTRUNCATE\b/,
  /\bALTER\b/,
  /\bCREATE\b/,
  /\bMERGE\b/,
  /\bGRANT\b/,
  /\bREVOKE\b/,
  /\bCALL\b/,
  /\bEXECUTE\b/,
  /\bEXEC\b/,
  /\bEXPORT\b/,
  /\bLOAD\b/,
]

/**
 * Same read-only guard as sqlRoutes.validateQuery — duplicated deliberately (not
 * imported) so this file has no dependency on route code and can't accidentally miss
 * a future change to the "real" validator without being obviously out of sync (the
 * duplication itself is a smell we accept in exchange for keeping this generated-data client module
 * fully self-contained and impossible to entangle with production request handling).
 */
function assertReadOnly(rawQuery) {
  const stripped = String(rawQuery || '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()

  if (!stripped) {
    throw generatedDataError('Query is empty after removing comments')
  }

  const upper = stripped.toUpperCase()
  const firstKeyword = upper.match(/^\s*(\w+)/)?.[1]
  if (firstKeyword !== 'SELECT' && firstKeyword !== 'WITH') {
    throw generatedDataError(`Only SELECT queries are allowed. Got: ${firstKeyword || '(unknown)'}`)
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(upper)) {
      throw generatedDataError(`Forbidden SQL keyword detected: ${upper.match(pattern)?.[0]}`)
    }
  }
}

function generatedDataError(message) {
  const err = new Error(message)
  err.code = 'GENERATED_DATA_VALIDATION_ERROR'
  return err
}

/** Small deterministic string hash (FNV-1a), used to seed pseudo-random values from query text. */
function hashString(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Deterministic PRNG (mulberry32) seeded from a hash — same query always yields the same generated rows. */
function seededRandom(seed) {
  let t = seed
  return function () {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const SAMPLE_URLS = ['/', '/soknad', '/dagpenger', '/minside', '/kontakt', '/skjema/nav-004', '/arbeid']
const SAMPLE_LABELS = ['Direkte', 'Søk', 'Sosiale medier', 'E-post', 'Referanse', 'Annonse']
const SAMPLE_DEVICES = ['desktop', 'mobile', 'tablet']
const SAMPLE_BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge']
const SAMPLE_COUNTRIES = ['NO', 'SE', 'DK', 'DE']
const SAMPLE_NAMES = ['Nav.no', 'Dagpenger', 'Foreldrepenger', 'Min side arbeidsgiver']

// Plausible-but-obviously-fake websites — used when the query shape is the
// registered-websites list (`FROM ...public_website`, aliased id/name/domain/...). Coherent
// per row: the same fake site contributes its own name + domain + ids, so the website picker
// and every website-scoped dropdown look structured like the real thing.
// Animal names on .nav.no subdomains: realistic *shape*, zero chance of colliding with a
// real NAV product name — a screenshot with "gaupe.nav.no" can never spark "wait, is that
// a real site?" questions.
const GENERATED_WEBSITES = [
  { name: 'Gaupe', domain: 'gaupe.nav.no' },
  { name: 'Elg', domain: 'elg.nav.no' },
  { name: 'Hubro', domain: 'hubro.nav.no' },
  { name: 'Rev', domain: 'rev.nav.no' },
  { name: 'Lomvi', domain: 'lomvi.nav.no' },
  { name: 'Fjellrev', domain: 'fjellrev.nav.no' },
]

/**
 * Extracts top-level SELECT column aliases from a SQL string, best-effort.
 * Handles `AS alias`, falls back to the trailing bare identifier of an expression.
 * Doesn't need to be a full SQL parser — just needs to find plausible names to type.
 */
function extractSelectAliases(sql) {
  const withoutComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const selectMatch = withoutComments.match(/\bSELECT\b([\s\S]*?)\bFROM\b/i)
  if (!selectMatch) return []

  const columnsBlock = selectMatch[1]

  // Split on top-level commas only (ignore commas inside parens).
  const parts = []
  let depth = 0
  let current = ''
  for (const char of columnsBlock) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current)

  return parts
    .map((part) => {
      const trimmed = part.trim()
      if (trimmed === '*') return 'value'
      const asMatch = trimmed.match(/\bAS\s+([a-zA-Z_][\w]*)\s*$/i)
      if (asMatch) return asMatch[1]
      // Bare column reference like `table.column` or `column`
      const bareMatch = trimmed.match(/([a-zA-Z_][\w]*)\s*$/)
      return bareMatch ? bareMatch[1] : 'value'
    })
    .filter(Boolean)
}

function typedFakeValue(alias, rowIndex, rand, dateRange) {
  const name = alias.toLowerCase()

  if (/(date|time|day|bucket|created|hour|week|month)/.test(name)) {
    const { start, end } = dateRange
    const span = Math.max(end - start, 1)
    const ts = start + Math.floor((span / 14) * rowIndex)
    return { value: new Date(ts).toISOString() }
  }
  if (/(id)$/.test(name) && !/(valid|paid|void)$/.test(name)) {
    return `generated-${name}-${(rowIndex + 1).toString().padStart(2, '0')}`
  }
  if (/(rate|percent|ratio|ctr|conversion|share)/.test(name)) {
    return Math.round(rand() * 10000) / 100 // 0-100.00
  }
  if (/(count|total|sum|visits|visitors|sessions|events|pageviews|hits|users|views)/.test(name)) {
    return Math.floor(rand() * 5000) + 10
  }
  if (/(url|path|referrer|page)/.test(name)) {
    return SAMPLE_URLS[Math.floor(rand() * SAMPLE_URLS.length)]
  }
  if (/(domain|host|site)/.test(name)) {
    return GENERATED_WEBSITES[Math.floor(rand() * GENERATED_WEBSITES.length)].domain
  }
  if (/(name|label|title|channel|source|medium)/.test(name)) {
    return SAMPLE_LABELS[Math.floor(rand() * SAMPLE_LABELS.length)]
  }
  if (/(device)/.test(name)) {
    return SAMPLE_DEVICES[Math.floor(rand() * SAMPLE_DEVICES.length)]
  }
  if (/(browser)/.test(name)) {
    return SAMPLE_BROWSERS[Math.floor(rand() * SAMPLE_BROWSERS.length)]
  }
  if (/(country|region|city)/.test(name)) {
    return SAMPLE_COUNTRIES[Math.floor(rand() * SAMPLE_COUNTRIES.length)]
  }
  if (name === 'value' || /(name)/.test(name)) {
    return SAMPLE_NAMES[Math.floor(rand() * SAMPLE_NAMES.length)]
  }
  // Generic fallback: small integer, deterministic per row.
  return Math.floor(rand() * 100)
}

function resolveDateRange(params) {
  const start = params?.startDate ? Date.parse(params.startDate) : Date.now() - 14 * 24 * 60 * 60 * 1000
  const end = params?.endDate ? Date.parse(params.endDate) : Date.now()
  return {
    start: Number.isFinite(start) ? start : Date.now() - 14 * 24 * 60 * 60 * 1000,
    end: Number.isFinite(end) ? end : Date.now(),
  }
}

function synthesizeRows(query, params) {
  const aliases = extractSelectAliases(query)
  if (aliases.length === 0) return []

  const seed = hashString(query)
  const rand = seededRandom(seed)
  const dateRange = resolveDateRange(params)

  // Registered-websites shape: give each row one coherent fake site (id/name/domain/teamId
  // all belong to the same animal), instead of typing each alias independently — which is
  // what produced gems like name="Annonse", domain="/dagpenger" in the website picker.
  if (/\bpublic_website\b/i.test(query) && aliases.includes('domain') && aliases.includes('name')) {
    return GENERATED_WEBSITES.map((site, i) => {
      const row = {}
      for (const alias of aliases) {
        const a = alias.toLowerCase()
        if (a === 'name') row[alias] = site.name
        else if (a === 'domain') row[alias] = site.domain
        else if (a === 'id' || a === 'websiteid') row[alias] = `generated-site-${site.domain}`
        else if (/(teamid)/.test(a)) row[alias] = `generated-team-${site.domain}`
        else if (/(shareid)/.test(a)) row[alias] = `generated-share-${site.domain}`
        else row[alias] = typedFakeValue(alias, i, rand, dateRange)
      }
      return row
    })
  }

  const rowCount = /GROUP BY|generate_date_array|generate_timestamp_array/i.test(query) ? 14 : 8

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const row = {}
    for (const alias of aliases) {
      row[alias] = typedFakeValue(alias, rowIndex, rand, dateRange)
    }
    return row
  })
}

/** Deterministic, deliberately small fake bytes-processed figure, derived from query text. */
function fakeBytesProcessed(query) {
  const seed = hashString(query)
  // Range: ~5 MB to ~1.5 GB — plausible, never alarming, never a real BigQuery bill.
  return 5 * 1024 * 1024 + (seed % (1.5 * 1024 * 1024 * 1024))
}

function buildFakeJob(query, dryRun) {
  const totalBytesProcessed = fakeBytesProcessed(query)
  const job = {
    metadata: {
      statistics: {
        totalBytesProcessed: String(totalBytesProcessed),
        query: {
          totalBytesBilled: String(totalBytesProcessed),
          cacheHit: false,
        },
      },
    },
    async getQueryResults() {
      if (dryRun) return [[]]
      return [synthesizeRows(query, undefined)]
    },
    // Mirrors @google-cloud/bigquery's Job.getMetadata() ([metadata] tuple) — some routes
    // (e.g. event-properties) read bytes-processed this way instead of via job.metadata.
    async getMetadata() {
      return [job.metadata]
    },
  }
  return job
}

export function createGeneratedBigQueryClient({ proxyBaseUrl, staticToken } = {}) {
  // With proxyBaseUrl + staticToken configured (path A: BACKEND_TOKEN set locally, default
  // BIGQUERY_PROXY_BASE_URL), the generated-data client is upgraded to a passthrough: every query
  // is forwarded to reops-proxy's guarded /bigquery/query endpoint and answered with REAL dev
  // BigQuery data. Synthesis below remains as the fallback when unconfigured or unreachable.
  const useProxy = Boolean(proxyBaseUrl && staticToken)
  logger.warn(
    useProxy
      ? `[BigQuery] No GCP credentials locally — proxying queries to ${proxyBaseUrl} (real dev data, token-guarded). ` +
          'Generated-data synthesis only as fallback if the proxy is unreachable.'
      : '[BigQuery] No GCP credentials found locally — using GENERATED data (deterministic, synthetic, no real BigQuery access). ' +
          'Set GOOGLE_APPLICATION_CREDENTIALS to query real dev BigQuery instead.',
  )

  const authHeader = staticToken?.toLowerCase().startsWith('bearer ') ? staticToken : `Bearer ${staticToken}`

  async function proxyQuery({ query, params, dryRun }) {
    const response = await fetch(new URL('/bigquery/query', proxyBaseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ query, params, dryRun: dryRun === true }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(
        `BigQuery proxy failed (${response.status}): ${body.details || body.error || response.statusText}`,
      )
    }
    return response.json()
  }

  return {
    __isGeneratedDataClient: true,
    // 'proxy' = real dev data via reops-proxy passthrough (BACKEND_TOKEN set),
    // 'generated' = local synthesis (this module's raison d'être).
    // Surfaced to the browser via window.__RUNTIME_CONFIG__.DATA_MODE so the UI can label
    // what the user is looking at (see serveFrontend.js + Header.tsx).
    __dataMode: useProxy ? 'proxy' : 'generated',

    async createQueryJob(config) {
      assertReadOnly(config.query)
      if (useProxy) {
        try {
          const result = await proxyQuery({ query: config.query, params: config.params, dryRun: config.dryRun })
          if (config.dryRun === true) {
            const bytes = String(result.totalBytesProcessed ?? 0)
            const dryRunJob = {
              metadata: {
                statistics: {
                  totalBytesProcessed: bytes,
                  query: { totalBytesBilled: bytes, cacheHit: false },
                },
              },
              async getQueryResults() {
                return [[]]
              },
              async getMetadata() {
                return [dryRunJob.metadata]
              },
            }
            return [dryRunJob]
          }
          const rows = result.data
          return [buildRowsJob(config.query, rows)]
        } catch (err) {
          logger.warn(
            { error: err.message ?? err },
            '[BigQuery] Proxy failed, falling back to generated-data synthesis',
          )
        }
      }
      return [buildFakeJob(config.query, config.dryRun === true)]
    },

    async query(config) {
      assertReadOnly(config.query)
      if (useProxy) {
        try {
          const result = await proxyQuery({ query: config.query, params: config.params })
          return [result.data]
        } catch (err) {
          logger.warn(
            { error: err.message ?? err },
            '[BigQuery] Proxy failed, falling back to generated-data synthesis',
          )
        }
      }
      return [synthesizeRows(config.query, config.params)]
    },
  }
}

function buildRowsJob(query, rows) {
  const job = {
    metadata: {
      statistics: {
        totalBytesProcessed: String(fakeBytesProcessed(query)),
        query: { totalBytesBilled: String(fakeBytesProcessed(query)), cacheHit: false },
      },
    },
    async getQueryResults() {
      return [rows]
    },
    // Mirrors @google-cloud/bigquery's Job.getMetadata() ([metadata] tuple) — some routes
    // (e.g. event-properties) read bytes-processed this way instead of via job.metadata.
    async getMetadata() {
      return [job.metadata]
    },
  }
  return job
}
