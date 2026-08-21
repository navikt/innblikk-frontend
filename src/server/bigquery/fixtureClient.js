import { logger } from '../logger.js'

/**
 * Fixture BigQuery client — used ONLY when no real GCP credentials are available
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
 * requested. This means it keeps working as routes/queries change, with zero fixture
 * maintenance.
 *
 * Security posture: every query that reaches this client is treated as UNTRUSTED input
 * (it may originate from the ad-hoc SQL tool or an LLM-generated Copilot query, not just
 * from our own hand-written route SQL). It is therefore:
 *   1. Never sent to real BigQuery — this client never touches the network.
 *   2. Still validated as a read-only SELECT/WITH statement (same rule as the real
 *      /api/bigquery route — see sqlRoutes.js validateQuery), so the fixture path can't
 *      be used to smuggle a destructive statement through into some other client that
 *      might one day resolve to a real BigQuery instance.
 *   3. Given a deterministic, capped, clearly-fake cost estimate — so a poorly-prompted
 *      local Copilot query never gets false confidence that it's cheap AND never
 *      actually runs against (and bills) real BigQuery. `isFixtureData: true` is
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
 * duplication itself is a smell we accept in exchange for keeping this fixture module
 * fully self-contained and impossible to entangle with production request handling).
 */
function assertReadOnly(rawQuery) {
  const stripped = String(rawQuery || '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()

  if (!stripped) {
    throw fixtureError('Query is empty after removing comments')
  }

  const upper = stripped.toUpperCase()
  const firstKeyword = upper.match(/^\s*(\w+)/)?.[1]
  if (firstKeyword !== 'SELECT' && firstKeyword !== 'WITH') {
    throw fixtureError(`Only SELECT queries are allowed. Got: ${firstKeyword || '(unknown)'}`)
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(upper)) {
      throw fixtureError(`Forbidden SQL keyword detected: ${upper.match(pattern)?.[0]}`)
    }
  }
}

function fixtureError(message) {
  const err = new Error(message)
  err.code = 'FIXTURE_VALIDATION_ERROR'
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

/** Deterministic PRNG (mulberry32) seeded from a hash — same query always yields the same fixture. */
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
    return `fixture-${name}-${(rowIndex + 1).toString().padStart(2, '0')}`
  }
  if (/(rate|percent|ratio|ctr|conversion|share)/.test(name)) {
    return Math.round(rand() * 10000) / 100 // 0-100.00
  }
  if (/(count|total|sum|visits|visitors|sessions|events|pageviews|hits|users|views)/.test(name)) {
    return Math.floor(rand() * 5000) + 10
  }
  if (/(url|path|referrer|domain|page)/.test(name)) {
    return SAMPLE_URLS[Math.floor(rand() * SAMPLE_URLS.length)]
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
  return {
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
  }
}

export function createFixtureBigQueryClient() {
  logger.warn(
    '[BigQuery] No GCP credentials found locally — using FIXTURE data (deterministic, synthetic, no real BigQuery access). ' +
      'Set GOOGLE_APPLICATION_CREDENTIALS to query real dev BigQuery instead.',
  )

  return {
    __isFixtureClient: true,

    async createQueryJob(config) {
      assertReadOnly(config.query)
      const job = buildFakeJob(config.query, config.dryRun === true)
      return [job]
    },

    async query(config) {
      assertReadOnly(config.query)
      return [synthesizeRows(config.query, config.params)]
    },
  }
}
