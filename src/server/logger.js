import dotenv from 'dotenv'
import pino from 'pino'

// ESM hoists all imports — config/env.js's dotenv.config() runs AFTER this module is
// evaluated (server.js imports app.js → logger.js first), so LOG_LEVEL from .env would
// never reach the pino constructor without loading dotenv here too. dotenv.config() is
// idempotent (already-set vars win, later calls are no-ops), so this is safe.
dotenv.config()

// Structured logging for the whole server. LOG_LEVEL controls verbosity:
// - 'info' (default, prod): normal operational logs, warnings, errors — no per-step/tool-call noise.
// - 'debug' (local/troubleshooting): also emits Copilot tool-call traces, token usage,
//   Team Catalog membership lookups, and other fine-grained iteration details. Set via
//   env var, no code change needed.
// Pino levels (low -> high): trace, debug, info, warn, error, fatal.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
})
