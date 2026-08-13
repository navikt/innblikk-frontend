import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  BodyLong,
  BodyShort,
  Chat,
  Heading,
  HStack,
  Link,
  LocalAlert,
  ReadMore,
  Textarea,
  VStack,
} from '@navikt/ds-react'
import { PaperplaneIcon } from '@navikt/aksel-icons'
import type { KeyboardEvent } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import SqlResultsSection from '../../sql/ui/SqlResultsSection'
import { extractWebsiteId } from '../../sql/utils/sqlProcessing'
import { prepareLineChartData, prepareBarChartData, preparePieChartData } from '../../sql/utils/chartHelpers'
import { getFeatureFlag, type FeatureFlags } from '../../../shared/lib/featureFlags'
import { useAssistantChat, type AssistantTurn } from '../hooks/useAssistantChat'

// Renders links from Copilot's markdown replies (e.g. a website's domain from resolve_website)
// as an Aksel `Link` instead of a bare, unstyled `<a>` — matches the app's link styling
// (`aksel-link` class) instead of react-markdown's default plain anchor. Opens in a new tab
// since these are external site domains, not in-app navigation — leaving the chat conversation
// to follow a link would lose the user's place.
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <Link href={href} inlineText target="_blank" rel="noopener noreferrer">
      {children}
    </Link>
  ),
}

// Copilot's replies (explanations, clarifying questions from ask_user) come back as markdown —
// render them properly instead of dumping raw "- item, - item" text as one long unbroken line.
// `prose-sm` (Tailwind Typography, already used elsewhere in the app) gives sane default
// spacing for lists/headings/bold without us hand-rolling markdown CSS.
const CopilotReply = ({ text }: { text: string }) => (
  <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  </div>
)

const sqlReadMore = (sql: string) =>
  sql && (
    <ReadMore header="Vis SQL" size="small">
      <pre
        className="bg-[var(--ax-bg-neutral-soft)] border border-[var(--ax-border-neutral-subtle)] rounded p-3 text-xs font-mono whitespace-pre-wrap"
        style={{ margin: 0 }}
      >
        {sql}
      </pre>
    </ReadMore>
  )

// Reactive to /profil's "Vis tekniske detaljer" checkbox without a page reload — same
// `featureFlagsChange` event pattern used elsewhere (see UserProfile.tsx, Header.tsx).
const useShowTechnicalDetails = (): boolean => {
  const [value, setValue] = useState(() => getFeatureFlag('copilot_show_technical_details'))

  useEffect(() => {
    const handleChange = (e: Event) => {
      setValue((e as CustomEvent<FeatureFlags>).detail.copilot_show_technical_details)
    }
    window.addEventListener('featureFlagsChange', handleChange)
    return () => window.removeEventListener('featureFlagsChange', handleChange)
  }, [])

  return value
}

// Per-message token/cost estimate + a chronological list of every tool Gemini called this turn
// (resolve_website, dry_run_query, ...) — only ever rendered when the user has opted into
// "Vis tekniske detaljer" on /profil (Team ResearchOps-only setting, see UserProfile.tsx).
// Purely diagnostic/debugging info, not meant for the default experience. Deliberately NOT a
// `Chat.Bubble` — this isn't a message from Copilot, it's metadata about one, so it renders as
// a plain, slightly muted block instead of pretending to be part of the conversation.
const TechnicalDetails = ({ turn }: { turn: AssistantTurn }) => {
  if (!turn.usage && turn.toolCalls.length === 0) return null

  return (
    <div className="max-w-[85%]">
      <VStack gap="space-8">
        {turn.usage && (
          <BodyShort size="small" textColor="subtle" className="font-mono">
            {turn.usage.promptTokens.toLocaleString('nb-NO')} inn · {turn.usage.responseTokens.toLocaleString('nb-NO')}{' '}
            ut
            {turn.usage.estimatedCostUsd !== null && ` · ~$${turn.usage.estimatedCostUsd.toFixed(4)}`}
          </BodyShort>
        )}
        {turn.toolCalls.length > 0 && (
          <ReadMore header={`Verktøybruk (${turn.toolCalls.length})`} size="small">
            <VStack gap="space-8">
              {turn.toolCalls.map((call, index) => (
                <div key={index} className="text-xs font-mono">
                  <div>
                    <span className="font-semibold">{call.name}</span>
                    {call.args && <span className="text-[var(--ax-text-subtle)]"> {JSON.stringify(call.args)}</span>}
                  </div>
                  {call.result && (
                    <div className="text-[var(--ax-text-subtle)] pl-4">→ {JSON.stringify(call.result)}</div>
                  )}
                </div>
              ))}
            </VStack>
          </ReadMore>
        )}
      </VStack>
    </div>
  )
}

// If the result is a single row with a single column, it's a KPI-style number
// ("hvor mange besøkte X i går") — show it as a big stat instead of a chart.
const getSingleValue = (turn: AssistantTurn) => {
  const rows = turn.result?.data
  if (!rows || rows.length !== 1) return null
  const [row] = rows
  const keys = Object.keys(row)
  if (keys.length !== 1) return null
  const value = row[keys[0]]
  if (typeof value !== 'number' && typeof value !== 'string') return null
  return { label: keys[0], value }
}

function TurnBubbles({ turn, onConfirmRun }: { turn: AssistantTurn; onConfirmRun: (id: string) => void }) {
  const processedGB = Number(turn.estimate?.totalBytesProcessedGB ?? 0)
  const costUSD = Number(turn.estimate?.estimatedCostUSD ?? 0)
  const websiteId = extractWebsiteId(turn.sql)
  const singleValue = getSingleValue(turn)
  const showTechnicalDetails = useShowTechnicalDetails()

  // Actual execution stats once the query has run, falling back to the dry-run estimate if the
  // real query result somehow didn't come back with its own stats (shouldn't normally happen).
  // Only used for the KPI ("single value") display path — SqlResultsSection handles this itself
  // via its own `showCost` prop for the chart path.
  const queryCostStats = turn.result?.queryStats ?? turn.estimate
  const queryCost = queryCostStats
    ? {
        gb: Number(queryCostStats.totalBytesProcessedGB ?? 0).toFixed(2),
        usd: Number(queryCostStats.estimatedCostUSD ?? 0).toFixed(4),
      }
    : null

  return (
    <>
      <Chat name="Deg" position="right" size="small" data-color="brand-beige">
        <Chat.Bubble>{turn.question}</Chat.Bubble>
      </Chat>

      {/* A single `<Chat>` group for the whole assistant turn — deliberately NOT two separate
          conditional `<Chat>` blocks (one for thinking/running, one for reply/confirm/error/done).
          `turn.reply` gets set in the same update that happens right before status flips away
          from "running", so both used to be true simultaneously for a frame: a "thinking/running"
          bubble stacked ABOVE the reply bubble. The moment status left thinking/running, that top
          bubble unmounted and the reply bubble (previously second) jumped up to first position —
          looked exactly like two bubbles swapping places. Fix: one persistent "primary" bubble
          that morphs its content in place (thinking placeholder -> reply text, same DOM node,
          never removed) followed by a secondary bubble for running/confirm/error/done — nothing
          ever needs to shift position since bubbles only ever get replaced in-place or appended
          after, never removed from above another bubble. */}
      {(turn.status === 'thinking' ||
        turn.status === 'running' ||
        turn.reply ||
        turn.status === 'confirm' ||
        turn.status === 'error' ||
        turn.status === 'done') && (
        <Chat name="Copilot" size="small" data-color="brand-blue">
          <Chat.Bubble>
            {turn.reply ? <CopilotReply text={turn.reply} /> : turn.status === 'thinking' ? 'Copilot tenker...' : ''}
          </Chat.Bubble>

          {turn.status === 'running' && <Chat.Bubble>Kjører spørringen...</Chat.Bubble>}

          {turn.status === 'confirm' && (
            <Chat.Bubble>
              <VStack gap="space-12">
                <LocalAlert status="warning">
                  <LocalAlert.Content>
                    Denne spørringen er dyr å kjøre — anslått {processedGB.toFixed(1)} GB / ${costUSD.toFixed(2)}. Vil
                    du kjøre den likevel?
                  </LocalAlert.Content>
                </LocalAlert>
                {turn.costSuggestion && (
                  <BodyLong size="small" textColor="subtle">
                    Forslag fra Copilot: {turn.costSuggestion}
                  </BodyLong>
                )}
                {sqlReadMore(turn.sql)}
                <Button variant="primary" size="small" onClick={() => onConfirmRun(turn.id)} className="self-start">
                  Kjør spørringen likevel
                </Button>
              </VStack>
            </Chat.Bubble>
          )}

          {turn.status === 'error' && (
            <Chat.Bubble>
              <VStack gap="space-12">
                <LocalAlert status="error">
                  <LocalAlert.Content>{turn.error}</LocalAlert.Content>
                </LocalAlert>
                {sqlReadMore(turn.sql)}
              </VStack>
            </Chat.Bubble>
          )}

          {turn.status === 'done' && singleValue && (
            <Chat.Bubble>
              <VStack gap="space-12">
                <div>
                  <div className="text-4xl font-bold text-[var(--ax-text-default)]">
                    {typeof singleValue.value === 'number'
                      ? singleValue.value.toLocaleString('nb-NO')
                      : singleValue.value}
                  </div>
                  <div className="text-sm text-[var(--ax-text-subtle)] mt-1">{singleValue.label}</div>
                </div>
                {showTechnicalDetails && queryCost && (
                  <BodyShort size="small" textColor="subtle" className="font-mono">
                    {queryCost.gb} GB · ~${queryCost.usd}
                  </BodyShort>
                )}
                {sqlReadMore(turn.sql)}
              </VStack>
            </Chat.Bubble>
          )}
        </Chat>
      )}

      {/* Deliberately NOT a `Chat.Bubble` — Aksel's `.aksel-chat` caps at max-width: 40.75rem and
          `.aksel-chat__bubble` is `width: fit-content`, both fighting a wide chart/table that
          wants to use the full thread width. Rendering it as a plain full-width block below the
          bubble group (same treatment as TechnicalDetails) sidesteps that entirely instead of
          fighting Aksel's own chat-bubble CSS with overrides.
          `min-w-0` + `overflow-x-auto` matter here: flex items default to `min-width: auto`,
          which means a wide table/chart's intrinsic content width can silently stretch every
          flex ancestor (this block, the turns list, the thread container) past their `max-w`
          cap instead of respecting it — visible as the whole chat area "pushing outwards"
          whenever a wide result appeared. Capping this block's own width and scrolling
          internally keeps every ancestor's width stable regardless of result width. */}
      {turn.status === 'done' && !singleValue && (
        <div className="w-full min-w-0 max-w-full overflow-x-auto">
          <SqlResultsSection
            result={turn.result}
            loading={false}
            estimating={false}
            error={null}
            queryStats={turn.result?.queryStats ?? turn.estimate}
            query={turn.sql}
            lastProcessedSql={turn.sql}
            websiteId={websiteId}
            copiedMetabase={false}
            onExecuteQuery={async () => {}}
            onCopyMetabase={() => {}}
            hideMetabaseTransfer
            showSqlCode
            showJson={false}
            showExecuteButton={false}
            showError={false}
            showCost={showTechnicalDetails}
            initialTab={turn.chartSuggestion ?? undefined}
            dashboardButtonSize="medium"
            prepareLineChartData={(includeAverage = false) =>
              turn.result?.data ? prepareLineChartData(turn.result.data, includeAverage) : null
            }
            prepareBarChartData={() => (turn.result?.data ? prepareBarChartData(turn.result.data) : null)}
            preparePieChartData={() => (turn.result?.data ? preparePieChartData(turn.result.data) : null)}
          />
        </div>
      )}

      {showTechnicalDetails && <TechnicalDetails turn={turn} />}
    </>
  )
}

export default function Copilot() {
  const { question, setQuestion, turns, isBusy, ask, confirmRun, startNewConversation, systemPrompt } =
    useAssistantChat()

  const bottomRef = useRef<HTMLDivElement>(null)
  const hasStarted = turns.length > 0
  const [validationError, setValidationError] = useState<string | undefined>(undefined)
  const showTechnicalDetails = useShowTechnicalDetails()

  // Sum of every turn's usage so far — the per-bubble figures (see TechnicalDetails) are
  // per-question, this is "what has this whole conversation cost so far".
  const conversationTotals = turns.reduce(
    (acc, turn) => {
      if (!turn.usage) return acc
      return {
        promptTokens: acc.promptTokens + turn.usage.promptTokens,
        responseTokens: acc.responseTokens + turn.usage.responseTokens,
        estimatedCostUsd: acc.estimatedCostUsd + (turn.usage.estimatedCostUsd ?? 0),
      }
    },
    { promptTokens: 0, responseTokens: 0, estimatedCostUsd: 0 },
  )

  useEffect(() => {
    if (hasStarted) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [hasStarted, turns])

  const handleSubmit = () => {
    if (isBusy) return
    if (!question.trim()) {
      setValidationError('Skriv et spørsmål før du sender.')
      return
    }
    setValidationError(undefined)
    setQuestion('')
    void ask()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Box background="default" className="flex h-screen w-full flex-col overflow-hidden">
      {/* Message thread — same max-w as the composer below, deliberately. Charts/tables render
          full-width relative to THIS container (see the "Deliberately NOT a `Chat.Bubble`"
          comment in TurnBubbles), not wider than it — a chat thread and its input field having
          different widths looks broken. */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[48rem] flex-col px-4 py-8">
          {showTechnicalDetails && systemPrompt && (
            <ReadMore header="Vis systemprompt" size="small" className="mb-4 self-start">
              <pre
                className="bg-[var(--ax-bg-neutral-soft)] border border-[var(--ax-border-neutral-subtle)] rounded p-3 text-xs font-mono whitespace-pre-wrap"
                style={{ margin: 0 }}
              >
                {systemPrompt}
              </pre>
            </ReadMore>
          )}
          {!hasStarted ? (
            <div className="flex flex-1 flex-col items-center justify-end gap-2 text-center">
              <Heading level="1" size="xlarge">
                Copilot
              </Heading>
              <BodyLong size="large" align="center" textColor="subtle">
                Spør om trafikk på nettstedene dine — Copilot lager grafen.
              </BodyLong>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-6">
              {turns.map((turn) => (
                <TurnBubbles key={turn.id} turn={turn} onConfirmRun={confirmRun} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer — centered mid-screen until the first message, then docks to the bottom */}
      <Box
        background="default"
        borderWidth="0"
        className={hasStarted ? 'border-t border-[var(--ax-border-neutral-subtle)]' : ''}
      >
        <div className="mx-auto w-full max-w-[48rem] px-4 py-4">
          <VStack gap="space-8">
            <div className="relative">
              <Textarea
                label="Hva vil du vite?"
                hideLabel
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value)
                  if (validationError) setValidationError(undefined)
                }}
                onKeyDown={handleKeyDown}
                minRows={2}
                maxRows={8}
                // Manual resize + content-based auto-grow are mutually exclusive by design in
                // Aksel's TextareaAutosize (utils/components/textarea-autosize/TextareaAutoSize.tsx):
                // the moment a user drags the native resize handle, the browser writes an inline
                // `height` style, which the component's ResizeObserver treats as "user resized
                // manually" and permanently stops auto-growing with new content from then on
                // (until the component remounts, e.g. "Ny samtale"). This is intentional — once a
                // user picks their own height, we respect it instead of fighting them — but it
                // means auto-grow-while-typing only lasts until the first manual drag. Known
                // tradeoff, not a bug.
                resize="vertical"
                readOnly={isBusy}
                error={validationError}
                autoFocus
                className="pr-14"
              />
              <Button
                variant="primary"
                size="small"
                icon={<PaperplaneIcon aria-hidden />}
                loading={isBusy}
                onClick={handleSubmit}
                className="absolute bottom-2 right-2 rounded-full"
                aria-label="Send spørsmål"
              />
            </div>

            {!hasStarted && (
              <BodyLong size="small" textColor="subtle">
                F.eks. «Hvor mange besøkte nav.no i går?» eller «vis daglig trafikk de siste 7 dager for aksel»
              </BodyLong>
            )}

            {hasStarted && (
              <HStack gap="space-8" align="center">
                <Button variant="tertiary" size="small" onClick={startNewConversation} className="self-start">
                  Ny samtale
                </Button>
                {showTechnicalDetails &&
                  (conversationTotals.promptTokens > 0 || conversationTotals.responseTokens > 0) && (
                    <BodyShort size="small" textColor="subtle" className="font-mono">
                      Totalt: {conversationTotals.promptTokens.toLocaleString('nb-NO')} inn ·{' '}
                      {conversationTotals.responseTokens.toLocaleString('nb-NO')} ut · ~$
                      {conversationTotals.estimatedCostUsd.toFixed(4)}
                    </BodyShort>
                  )}
              </HStack>
            )}
          </VStack>
        </div>
      </Box>

      {/* Shrinks to 0 once the conversation starts, pulling the composer down to the bottom */}
      <div aria-hidden style={{ flexGrow: hasStarted ? 0 : 1, transition: 'flex-grow 450ms ease' }} />
    </Box>
  )
}
