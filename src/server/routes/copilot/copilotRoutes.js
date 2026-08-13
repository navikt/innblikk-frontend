import express from 'express'
import { randomUUID } from 'node:crypto'
import { Type, createPartFromFunctionResponse } from '@google/genai'
import Fuse from 'fuse.js'
import { addAuditLogging } from '../../bigquery/audit.js'
import { requireBigQuery, getNavIdent, getWebsitesList, getDryRunStats } from '../bigquery/helpers.js'
import { validateQuery } from '../bigquery/sqlRoutes.js'
import { buildSystemPrompt, parseModelReply, linkifyBareDomains } from './copilotPrompt.js'
import { logger } from '../../logger.js'

// Website list rarely changes — cache it for a few minutes instead of hitting
// BigQuery on every chat message. Keyed per navIdent (not a single global cache): every
// BigQuery job elsewhere in this app gets the caller's nav_ident attached via addAuditLogging
// (job label + SQL comment) — that's the actual audit trail. A single global cache would mean
// only whichever user's request happens to trigger the refresh gets a labeled job; every other
// user hitting Copilot within the TTL would be served cached data with zero BigQuery job run
// for them at all, making their usage invisible in BigQuery's query history. Per-navIdent
// keying costs a little duplicate work (same list fetched once per active user instead of once
// globally) but guarantees every distinct user gets at least one real, audit-labeled job per
// TTL window — matching how every other route in this app already behaves.
const WEBSITE_LIST_TTL_MS = 5 * 60 * 1000
const websiteListCache = new Map()

// Copilot auto-executes whatever SQL Gemini generates — no human reviews it first (unlike
// /grafbygger-copilot, where a person pastes/edits the SQL before running). Keep the sanity
// threshold tight and require explicit confirmation above it.
const COPILOT_MAX_COST_USD = 0.5

// Bounded agent loop. Each "step" is either a tool-call round trip (resolve_website,
// dry_run_query) or a final-answer attempt. Capped to keep latency/cost predictable —
// a typical turn is resolve_website -> dry_run_query (maybe twice) -> final answer, 3-4 steps.
const MAX_STEPS = 6

// In-memory conversation store so follow-up questions ("hva med forrige uke da?") keep the
// full chat history/context instead of starting from scratch every message. Keyed by a
// client-generated conversationId. Deliberately NOT persisted anywhere durable — this is an
// experimental, unadvertised feature (see routes.tsx), a pod restart or scale-out losing
// in-flight conversations is an acceptable tradeoff for the simplicity this buys us.
const CONVERSATION_TTL_MS = 30 * 60 * 1000
const conversations = new Map()

// Gemini API never returns a dollar cost — only token counts. Cost below is an
// ESTIMATE computed from Google's published per-model rate card (confirmed live at
// https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing as of Aug
// 2026). Using the "Non-global" tier rate, since GEMINI_LOCATION is a specific region
// (europe-north1, see env.js) rather than the Global multi-region endpoint — non-global is
// ~10% pricier per token than Global. Update this if GEMINI_MODEL or GEMINI_LOCATION changes,
// or Google revises pricing.
const GEMINI_PRICING_USD_PER_MILLION_TOKENS = {
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
}

// Function-calling tools Gemini can use instead of us regex-guessing SQL out of prose (that's
// exactly what caused a real bug: a plain-text clarifying question with no code fence got
// treated as SQL and failed validation with "Only SELECT queries are allowed. Got: HVILKET").
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'resolve_website',
        description:
          'Fuzzy-search website_id(s) matching a domain or website name fragment the user mentioned ' +
          '(typo-tolerant — a slightly misspelled domain/name will still match). Always call this ' +
          'before writing SQL that filters by website_id — several websites can share the same ' +
          'domain, so a website_id must never be guessed from memory. Results are ranked best-match ' +
          'first with a relevance score. IMPORTANT: every website domain in this system ends in ' +
          '\'.nav.no\', so fuzzy-matching e.g. "nav.no" alone will surface many unrelated subdomains ' +
          "with similar-looking scores — a small score gap between results does NOT mean they're " +
          "equally good candidates when a match's domain literally, exactly equals the user's stated " +
          'domain. Results with `exactMatch: true` are deterministic, code-verified full-domain ' +
          'matches, ranked above the rest. If there is EXACTLY ONE `exactMatch` result, treat it as ' +
          'the definitive answer and use it directly. If there is MORE THAN ONE `exactMatch` result ' +
          '(this happens in practice — several unrelated internal apps sometimes share the same ' +
          "domain value as data-quality noise, not because they're actually the same site): first try " +
          "to pick the one whose NAME most plausibly matches what the user meant (e.g. a name that's " +
          'literally "Nav.no ..." is a far better match for a plain "nav.no" question than an unrelated ' +
          'internal tool name that just happens to share the domain value) — only fall back to ' +
          'ask_user, listing just the tied exactMatch candidates (not the full fuzzy list), if none of ' +
          'them is clearly the better name match. ' +
          "If there's no exactMatch at all, don't reflexively fall back to ask_user just because a " +
          'domain is shared — be willing to pick the most plausible candidate yourself (e.g. default ' +
          "to the production site over a '- dev'/'- test' variant unless the user said otherwise, or a " +
          'name that clearly reads as what the user meant) and proceed. Your final answer is always ' +
          'required to state which website you assumed, so a reasonable guess that gets disclosed and ' +
          'can be corrected is preferable to stopping to ask. Only use ask_user (listing EVERY relevant ' +
          'match, not a hand-picked subset) when there is genuinely no sensible default to fall back on.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'Domain or website name fragment, e.g. "aksel.nav.no" or "arbeidsgiver"',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'dry_run_query',
        description:
          'Validates and cost-estimates a candidate BigQuery SQL query WITHOUT executing it. Always ' +
          'call this before giving your final answer. On failure, fix the SQL based on the returned ' +
          'error and call this again — do not give up after one failed attempt.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            sql: {
              type: Type.STRING,
              description: 'A single BigQuery SELECT or WITH ... SELECT statement with fully-qualified table names.',
            },
          },
          required: ['sql'],
        },
      },
      {
        name: 'ask_user',
        description:
          'Call this — instead of writing plain text with no SQL — when you need more information from ' +
          'the user to answer correctly (e.g. resolve_website matched more than one website, or the ' +
          'question itself is too vague to write a correct query). Never guess silently.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            question: {
              type: Type.STRING,
              description:
                'The clarifying question to show the user, in Norwegian, formatted as Markdown. ' +
                'If listing multiple website matches or options, list ALL of them as a Markdown ' +
                'bullet list (one "- Name" per line), never a comma-separated sentence and never a ' +
                'truncated "e.g. X, Y or Z" sample of just a few — show every candidate returned.',
            },
          },
          required: ['question'],
        },
      },
    ],
  },
]

function estimateCostUsd(model, usageMetadata) {
  const rate = GEMINI_PRICING_USD_PER_MILLION_TOKENS[model]
  if (!rate || !usageMetadata) return null
  const { promptTokenCount = 0, candidatesTokenCount = 0 } = usageMetadata
  const cost = (promptTokenCount / 1e6) * rate.input + (candidatesTokenCount / 1e6) * rate.output
  return Number(cost.toFixed(6))
}

async function getCachedWebsitesList(bigquery, GCP_PROJECT_ID, navIdent) {
  const now = Date.now()

  // Evict stale entries on every call — otherwise this Map grows one entry per distinct
  // navIdent forever, unlike the old single global cache (mirrors the same sweep-on-access
  // pattern already used for `conversations` below).
  for (const [id, entry] of websiteListCache) {
    if (now - entry.cachedAt > WEBSITE_LIST_TTL_MS) websiteListCache.delete(id)
  }

  const cached = websiteListCache.get(navIdent)
  if (cached) return cached.websites

  const websites = await getWebsitesList(bigquery, GCP_PROJECT_ID, navIdent, addAuditLogging)
  websiteListCache.set(navIdent, { websites, cachedAt: now })
  return websites
}

function getOrCreateChat({ conversationId, systemInstruction, genai, GEMINI_MODEL }) {
  const now = Date.now()
  for (const [id, session] of conversations) {
    if (now - session.lastUsedAt > CONVERSATION_TTL_MS) conversations.delete(id)
  }

  const existing = conversationId ? conversations.get(conversationId) : null
  if (existing) {
    existing.lastUsedAt = now
    return { chat: existing.chat, id: conversationId }
  }

  const id = conversationId || randomUUID()
  const chat = genai.chats.create({ model: GEMINI_MODEL, config: { systemInstruction, tools: TOOLS } })
  conversations.set(id, { chat, lastUsedAt: now })
  return { chat, id }
}

// Handlers for the tools Gemini can call. Each returns a plain object that becomes the
// function response fed back to the model — never throws, errors are returned as data so
// the model can react to them instead of the whole request blowing up.
//
// Fuzzy-matched (typo-tolerant) against both domain and name, ranked best-match-first via
// fuse.js's relevance score — lets the model reason about confidence (one clear best match vs.
// several close scores) instead of getting an unranked list or a single silently-picked "best"
// guess. threshold 0.4 is fuse.js's own recommended middle ground between "exact" (0) and
// "match anything" (1) — loose enough to survive a typo, tight enough not to return noise.
function resolveWebsiteTool(websites, args) {
  const query = String(args?.query ?? '').trim()
  if (!query) return { matches: [] }

  // Every domain in this app ends in `.nav.no` — fuzzy edit-distance scoring alone can't tell
  // "nav.no" (the literal main domain) apart from "arbeidsplassen.nav.no" or any other
  // subdomain that merely contains "nav.no" as a substring, since they're all a similarly small
  // edit distance away. So: check for exact (case-insensitive) full-domain matches FIRST,
  // deterministically in code — never leave "is this actually THE domain, not just A domain
  // that contains this text" up to the model interpreting a fuzzy score.
  //
  // IMPORTANT: use `.filter()`, not `.find()` — in real data, multiple UNRELATED websites can
  // share the literal same domain value (e.g. several internal apps all have `domain: nav.no`
  // in Umami, apparently a data-quality artifact rather than them actually being served from
  // that domain). `.find()` would silently return only the first one and hide that a genuine
  // tie exists. When there's exactly ONE exact match, it's unambiguous — flag it `exactMatch:
  // true` and the model can use it directly. When there are SEVERAL exact matches, that's real
  // ambiguity in the underlying data, not something fuzzy-search or scoring can resolve — surface
  // all of them (each still flagged `exactMatch: true`, since each genuinely, literally matches
  // the domain) so the model/ask_user can present just that tied subset instead of falling back
  // to the full noisy fuzzy list.
  const normalizedQuery = query.toLowerCase()
  const exactMatches = websites.filter((w) => w.domain?.toLowerCase() === normalizedQuery)
  const exactMatchIds = new Set(exactMatches.map((w) => w.id))

  const fuse = new Fuse(websites, { keys: ['domain', 'name'], threshold: 0.4, includeScore: true })
  const fuzzyMatches = fuse
    .search(query)
    .slice(0, 20)
    .map(({ item, score }) => ({ website_id: item.id, name: item.name, domain: item.domain, score }))

  if (exactMatches.length > 0) {
    const exactMatchEntries = exactMatches.map((w) => ({
      website_id: w.id,
      name: w.name,
      domain: w.domain,
      score: 0,
      exactMatch: true,
    }))
    const rest = fuzzyMatches.filter((m) => !exactMatchIds.has(m.website_id))
    return { matches: [...exactMatchEntries, ...rest] }
  }

  return { matches: fuzzyMatches }
}

async function dryRunQueryTool(bigquery, navIdent, args) {
  const sql = String(args?.sql ?? '')
  if (!sql.trim()) return { valid: false, error: 'No SQL provided' }

  const validation = validateQuery(sql)
  if (!validation.valid) return { valid: false, error: validation.error }

  const queryStats = await getDryRunStats(bigquery, { query: sql, navIdent, analysisType: 'Copilot' }, addAuditLogging)
  if (!queryStats) {
    return {
      valid: false,
      error: 'Dry run failed against BigQuery — likely an invalid column/table reference or a syntax error.',
    }
  }

  return {
    valid: true,
    totalBytesProcessedGB: queryStats.totalBytesProcessedGB,
    estimatedCostUSD: queryStats.estimatedCostUSD,
  }
}

export function createCopilotRouter({ bigquery, genai, GCP_PROJECT_ID, GEMINI_MODEL }) {
  const router = express.Router()

  router.post('/api/copilot/chat', async (req, res) => {
    try {
      const { question, conversationId: incomingConversationId } = req.body

      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'question is required' })
      }

      if (!genai) {
        return res.status(500).json({ error: 'Gemini client not initialized' })
      }
      if (!requireBigQuery(bigquery, res)) return

      const navIdent = getNavIdent(req)
      const websites = await getCachedWebsitesList(bigquery, GCP_PROJECT_ID, navIdent)
      const systemInstruction = buildSystemPrompt({ projectId: GCP_PROJECT_ID, maxCostUsd: COPILOT_MAX_COST_USD })

      const { chat, id: conversationId } = getOrCreateChat({
        conversationId: incomingConversationId,
        systemInstruction,
        genai,
        GEMINI_MODEL,
      })

      let message = question
      let lastSql = ''
      let lastReply = ''
      let lastText = ''
      let lastFailureReason = ''

      // Accumulated across every step of the agent loop (not just the final step) — a turn
      // typically involves several tool-call round trips before a final answer, and the UI's
      // "show technical details" toggle (see UserProfile.tsx) wants the true total cost/usage
      // of the whole turn, plus a chronological list of every tool Gemini actually called.
      const toolCallLog = []
      const aggregatedUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 }

      const recordUsage = (usage) => {
        if (!usage) return
        aggregatedUsage.promptTokens += usage.promptTokenCount ?? 0
        aggregatedUsage.responseTokens += usage.candidatesTokenCount ?? 0
        aggregatedUsage.totalTokens += usage.totalTokenCount ?? 0
      }

      const buildUsagePayload = () => ({
        ...aggregatedUsage,
        estimatedCostUsd: estimateCostUsd(GEMINI_MODEL, {
          promptTokenCount: aggregatedUsage.promptTokens,
          candidatesTokenCount: aggregatedUsage.responseTokens,
        }),
      })

      for (let step = 1; step <= MAX_STEPS; step++) {
        const response = await chat.sendMessage({ message })

        const usage = response.usageMetadata
        recordUsage(usage)
        if (usage) {
          logger.debug(
            {
              step,
              model: GEMINI_MODEL,
              promptTokens: usage.promptTokenCount,
              responseTokens: usage.candidatesTokenCount,
              totalTokens: usage.totalTokenCount,
              estimatedCostUsd: estimateCostUsd(GEMINI_MODEL, usage),
            },
            'Copilot token usage',
          )
        }

        const calls = response.functionCalls
        if (calls && calls.length > 0) {
          const askUserCall = calls.find((call) => call.name === 'ask_user')
          if (askUserCall) {
            const clarifyingQuestion = linkifyBareDomains(String(askUserCall.args?.question ?? '').trim())
            return res.json({
              sql: '',
              reply: clarifyingQuestion || 'Kan du presisere spørsmålet ditt?',
              raw: '',
              queryStats: null,
              isExpensive: false,
              attempts: step,
              needsClarification: true,
              conversationId,
              toolCalls: toolCallLog,
              usage: buildUsagePayload(),
              systemPrompt: systemInstruction,
            })
          }

          const responseParts = []
          for (const call of calls) {
            logger.debug({ step, tool: call.name, args: call.args }, 'Copilot tool call')
            let result
            if (call.name === 'resolve_website') {
              result = resolveWebsiteTool(websites, call.args)
            } else if (call.name === 'dry_run_query') {
              result = await dryRunQueryTool(bigquery, navIdent, call.args)
            } else {
              result = { error: `Unknown tool: ${call.name}` }
            }
            toolCallLog.push({ step, name: call.name, args: call.args ?? null, result })
            responseParts.push(createPartFromFunctionResponse(call.id, call.name, result))
          }

          message = responseParts
          continue
        }

        // No function call — this is meant to be the final answer.
        const text = response.text ?? ''
        const { sql, reply: parsedReply, chartSuggestion } = parseModelReply(text)
        const reply = linkifyBareDomains(parsedReply)
        lastSql = sql
        lastReply = reply
        lastText = text

        if (!sql) {
          // Model gave plain text with no SQL and didn't call ask_user — treat it as a
          // clarifying question anyway rather than force-retrying (same bug class as before:
          // never hand free-form prose to the SQL validator).
          return res.json({
            sql: '',
            reply: reply || text,
            raw: text,
            queryStats: null,
            isExpensive: false,
            attempts: step,
            needsClarification: true,
            conversationId,
            toolCalls: toolCallLog,
            usage: buildUsagePayload(),
            systemPrompt: systemInstruction,
          })
        }

        // Defense in depth: the model should have already validated this via dry_run_query,
        // but never trust generated SQL as-is — re-validate + dry-run server-side regardless.
        const validation = validateQuery(sql)
        if (!validation.valid) {
          logger.warn({ step, error: validation.error }, 'Copilot final SQL failed validation')
          lastFailureReason = `Copilot genererte ugyldig SQL: ${validation.error}`
          message = `SQL-en i det endelige svaret ditt er ugyldig: ${validation.error}. Bruk dry_run_query for å teste en rettet spørring, og gi først et endelig svar når den er gyldig.`
          continue
        }

        const queryStats = await getDryRunStats(
          bigquery,
          { query: sql, navIdent, analysisType: 'Copilot' },
          addAuditLogging,
        )

        if (!queryStats && step < MAX_STEPS) {
          logger.warn({ step }, 'Copilot final dry run failed, asking Gemini to retry')
          lastFailureReason = 'Spørringen feilet i en test-kjøring mot BigQuery'
          message =
            'Spørringen i det endelige svaret ditt feilet i en test-kjøring mot BigQuery. Bruk dry_run_query for å teste en rettet spørring før du svarer endelig igjen.'
          continue
        }

        const estimatedCostUSD = queryStats ? Number(queryStats.estimatedCostUSD) : null
        const isExpensive = estimatedCostUSD !== null && estimatedCostUSD > COPILOT_MAX_COST_USD

        // If it's too expensive to just auto-run, ask Gemini itself for a one-line suggestion
        // on how to narrow the question down — cheaper than blindly asking the user to guess.
        let costSuggestion = null
        if (isExpensive) {
          try {
            const suggestionResponse = await chat.sendMessage({
              message: `Denne spørringen skanner ca. ${queryStats.totalBytesProcessedGB} GB og koster omtrent $${queryStats.estimatedCostUSD} å kjøre — over grensen vår på $${COPILOT_MAX_COST_USD}. Foreslå i ÉN kort setning (norsk, ingen SQL) en konkret måte brukeren kan snevre inn spørsmålet for å gjøre det billigere (f.eks. kortere tidsperiode, én bestemt side, færre dimensjoner).`,
            })
            costSuggestion = linkifyBareDomains(suggestionResponse.text?.trim() || null)
          } catch (suggestionError) {
            logger.warn({ error: suggestionError.message }, 'Copilot failed to get cost-narrowing suggestion')
          }
        }

        return res.json({
          sql,
          reply,
          raw: text,
          queryStats,
          isExpensive,
          costSuggestion,
          attempts: step,
          conversationId,
          toolCalls: toolCallLog,
          usage: buildUsagePayload(),
          systemPrompt: systemInstruction,
          chartSuggestion,
        })
      }

      // Exhausted all steps without a valid, runnable final answer.
      return res.status(502).json({
        error: lastFailureReason || 'Copilot klarte ikke lage en gyldig SQL-spørring etter flere forsøk.',
        sql: lastSql,
        reply: lastReply,
        raw: lastText,
        attempts: MAX_STEPS,
        conversationId,
        toolCalls: toolCallLog,
        usage: buildUsagePayload(),
        systemPrompt: systemInstruction,
      })
    } catch (error) {
      // @google/genai throws ApiError with `.status` (HTTP-ish code) and `.name` for Google API
      // errors (e.g. PERMISSION_DENIED, SERVICE_DISABLED) — log those explicitly since "message"
      // alone is often just a generic wrapper and hides the actual cause (missing IAM role,
      // Vertex/Gemini API not enabled on the project, model not available in the region, etc).
      logger.error({ message: error.message, name: error.name, status: error.status }, 'Copilot chat error')
      res.status(500).json({
        error: error.message || 'Failed to generate SQL',
        googleErrorName: error.name,
        googleErrorStatus: error.status,
      })
    }
  })

  return router
}
