import { useRef, useEffect, useState } from 'react'
import { Box, Button, BodyLong, Heading, HStack, LocalAlert, ReadMore, Textarea, VStack } from '@navikt/ds-react'
import { PaperplaneIcon } from '@navikt/aksel-icons'
import type { KeyboardEvent } from 'react'
import SqlResultsSection from '../../sql/ui/SqlResultsSection'
import { useAssistantChat } from '../hooks/useAssistantChat'

export default function Copilot() {
  const {
    question,
    setQuestion,
    askedQuestion,
    status,
    error,
    sql,
    reply,
    result,
    estimate,
    websiteId,
    ask,
    reset,
    prepareLineChartData,
    prepareBarChartData,
    preparePieChartData,
  } = useAssistantChat()

  const resultsRef = useRef<HTMLDivElement>(null)
  const isBusy = status === 'thinking' || status === 'running'
  const hasAnswer = status === 'done' || status === 'error'
  const [validationError, setValidationError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (hasAnswer) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [hasAnswer])

  const handleSubmit = () => {
    if (isBusy) return
    if (!question.trim()) {
      setValidationError('Skriv et spørsmål før du sender.')
      return
    }
    setValidationError(undefined)
    void ask()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Box background="default" className="min-h-screen w-full">
      <div className="min-h-screen w-full flex flex-col items-center px-4 pt-[16vh] pb-24">
        <div className="w-full max-w-[42rem] flex flex-col gap-10">
          <VStack gap="space-4" align="center">
            <Heading level="1" size="xlarge">
              Copilot
            </Heading>
            <BodyLong size="large" align="center" textColor="subtle">
              Spør om trafikk på nettstedene dine — Copilot lager grafen.
            </BodyLong>
          </VStack>

          <VStack gap="space-12">
            <Textarea
              label="Hva vil du vite?"
              description="F.eks. «Hvor mange besøkte nav.no i går?» eller «vis meg trafikk siste 4 uker»"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value)
                if (validationError) setValidationError(undefined)
              }}
              onKeyDown={handleKeyDown}
              minRows={3}
              maxRows={10}
              readOnly={isBusy}
              error={validationError}
              autoFocus
            />

            <HStack justify="end">
              <Button
                variant="primary"
                size="medium"
                icon={<PaperplaneIcon aria-hidden />}
                iconPosition="right"
                loading={isBusy}
                onClick={handleSubmit}
              >
                Send
              </Button>
            </HStack>

            {isBusy && (
              <BodyLong size="small" textColor="subtle">
                {status === 'thinking' ? 'Copilot tenker...' : 'Kjører spørringen...'}
              </BodyLong>
            )}
          </VStack>

          {hasAnswer && (
            <div ref={resultsRef} className="flex flex-col gap-6">
              <BodyLong size="small" textColor="subtle">
                Du spurte: «{askedQuestion}»
              </BodyLong>

              {reply && (
                <Box background="neutral-soft" borderRadius="8" padding="space-16" className="max-w-[85%]">
                  <BodyLong size="small">{reply}</BodyLong>
                </Box>
              )}

              {status === 'error' && (
                <>
                  <LocalAlert status="error">
                    <LocalAlert.Content>{error}</LocalAlert.Content>
                  </LocalAlert>

                  {sql && (
                    <ReadMore header="Vis SQL" size="small">
                      <pre
                        className="bg-[var(--ax-bg-neutral-soft)] border border-[var(--ax-border-neutral-subtle)] rounded p-3 text-xs font-mono whitespace-pre-wrap"
                        style={{ margin: 0 }}
                      >
                        {sql}
                      </pre>
                    </ReadMore>
                  )}
                </>
              )}

              {status === 'done' && (
                <SqlResultsSection
                  result={result}
                  loading={false}
                  estimating={false}
                  error={null}
                  queryStats={result?.queryStats ?? estimate}
                  query={sql}
                  lastProcessedSql={sql}
                  websiteId={websiteId}
                  copiedMetabase={false}
                  onExecuteQuery={ask}
                  onCopyMetabase={() => {}}
                  hideMetabaseTransfer
                  showSqlCode
                  showJson={false}
                  showExecuteButton={false}
                  showError={false}
                  dashboardButtonSize="medium"
                  prepareLineChartData={prepareLineChartData}
                  prepareBarChartData={prepareBarChartData}
                  preparePieChartData={preparePieChartData}
                />
              )}

              <Button variant="tertiary" size="small" onClick={reset} className="self-start">
                Still et nytt spørsmål
              </Button>
            </div>
          )}
        </div>
      </div>
    </Box>
  )
}
