import pino from 'pino'

// Structured logging for the whole server. LOG_LEVEL controls verbosity:
// - 'info' (default, prod): normal operational logs, warnings, errors — no per-step/tool-call noise.
// - 'debug' (local/troubleshooting): also emits Copilot tool-call traces, token usage, and
//   other fine-grained iteration details. Set via env var, no code change needed.
// Pino levels (low -> high): trace, debug, info, warn, error, fatal.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
})
