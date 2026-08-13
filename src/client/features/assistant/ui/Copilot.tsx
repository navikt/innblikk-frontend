import { useEffect, useRef, useState } from 'react'
import { Box, Button, BodyLong, Chat, Heading, Link, LocalAlert, ReadMore, Textarea, VStack } from '@navikt/ds-react'
import { PaperplaneIcon } from '@navikt/aksel-icons'
import type { KeyboardEvent } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import SqlResultsSection from '../../sql/ui/SqlResultsSection'
import { extractWebsiteId } from '../../sql/utils/sqlProcessing'
import { prepareLineChartData, prepareBarChartData, preparePieChartData } from '../../sql/utils/chartHelpers'
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

  return (
    <>
      <Chat name="Deg" position="right" size="small" data-color="brand-beige">
        <Chat.Bubble>{turn.question}</Chat.Bubble>
      </Chat>

      {(turn.status === 'thinking' || turn.status === 'running') && (
        <Chat name="Copilot" size="small" data-color="brand-blue">
          <Chat.Bubble>{turn.status === 'thinking' ? 'Copilot tenker...' : 'Kjører spørringen...'}</Chat.Bubble>
        </Chat>
      )}

      {(turn.reply || turn.status === 'confirm' || turn.status === 'error' || turn.status === 'done') && (
        <Chat name="Copilot" size="small" data-color="brand-blue">
          {turn.reply && <Chat.Bubble>{<CopilotReply text={turn.reply} />}</Chat.Bubble>}

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

          {turn.status === 'done' && (
            <Chat.Bubble>
              {singleValue ? (
                <VStack gap="space-12">
                  <div>
                    <div className="text-4xl font-bold text-[var(--ax-text-default)]">
                      {typeof singleValue.value === 'number'
                        ? singleValue.value.toLocaleString('nb-NO')
                        : singleValue.value}
                    </div>
                    <div className="text-sm text-[var(--ax-text-subtle)] mt-1">{singleValue.label}</div>
                  </div>
                  {sqlReadMore(turn.sql)}
                </VStack>
              ) : (
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
                  dashboardButtonSize="medium"
                  prepareLineChartData={(includeAverage = false) =>
                    turn.result?.data ? prepareLineChartData(turn.result.data, includeAverage) : null
                  }
                  prepareBarChartData={() => (turn.result?.data ? prepareBarChartData(turn.result.data) : null)}
                  preparePieChartData={() => (turn.result?.data ? preparePieChartData(turn.result.data) : null)}
                />
              )}
            </Chat.Bubble>
          )}
        </Chat>
      )}
    </>
  )
}

export default function Copilot() {
  const { question, setQuestion, turns, isBusy, ask, confirmRun, startNewConversation } = useAssistantChat()

  const bottomRef = useRef<HTMLDivElement>(null)
  const hasStarted = turns.length > 0
  const [validationError, setValidationError] = useState<string | undefined>(undefined)

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
      {/* Message thread */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full w-full max-w-[48rem] flex-col px-4 py-8">
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
            <div className="flex flex-col gap-6">
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
                F.eks. «Hvor mange besøkte nav.no i går?» eller «vis meg trafikk siste 4 uker»
              </BodyLong>
            )}

            {hasStarted && (
              <Button variant="tertiary" size="small" onClick={startNewConversation} className="self-start">
                Ny samtale
              </Button>
            )}
          </VStack>
        </div>
      </Box>

      {/* Shrinks to 0 once the conversation starts, pulling the composer down to the bottom */}
      <div aria-hidden style={{ flexGrow: hasStarted ? 0 : 1, transition: 'flex-grow 450ms ease' }} />
    </Box>
  )
}
