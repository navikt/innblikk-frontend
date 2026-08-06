import { Heading } from '@navikt/ds-react'
import { useEffect, useRef } from 'react'
import ChartLayout from '../../analysis/ui/ChartLayoutOriginal.tsx'
import SqlResultsSection from '../../sql/ui/SqlResultsSection'
import QueryErrorDisplay from '../../sql/ui/QueryErrorDisplay'
import { useCopilotChart } from '../hooks/useCopilotChart'
import QuestionStep from './QuestionStep'
import SqlStep from './SqlStep'

export default function CopilotAnalyse() {
  const {
    question,
    setQuestion,
    copiedPrompt,
    copyPrompt,
    openCopilot,

    sql,
    handleSqlChange,
    handleSqlPaste,
    validation,

    estimate,
    estimating,
    costUSD,
    processedGB,
    isExpensive,

    result,
    loading,
    error,
    hasRun,
    needsRun,
    websiteId,
    runQuery,

    prepareLineChartData,
    prepareBarChartData,
    preparePieChartData,
  } = useCopilotChart()

  const resultsRef = useRef<HTMLDivElement>(null)

  // Bring the results into view once the query starts running the first time.
  useEffect(() => {
    if (hasRun) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [hasRun])

  return (
    <ChartLayout
      title="Lag grafer med Copilot"
      description="Spør med egne ord. Copilot hjelper deg videre."
      hideSidebar={true}
    >
      <div className="w-full max-w-3xl space-y-6 py-2">
        <QuestionStep
          question={question}
          copiedPrompt={copiedPrompt}
          onQuestionChange={setQuestion}
          onCopyPrompt={copyPrompt}
          onOpenCopilot={openCopilot}
        />

        <SqlStep
          sql={sql}
          validation={validation}
          estimating={estimating}
          estimate={estimate}
          costUSD={costUSD}
          processedGB={processedGB}
          isExpensive={isExpensive}
          loading={loading}
          hasRun={hasRun}
          needsRun={needsRun}
          onSqlChange={handleSqlChange}
          onSqlPaste={handleSqlPaste}
          onRun={() => {
            void runQuery()
          }}
        />

        {hasRun && (
          <section
            ref={resultsRef}
            className="rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ax-bg-accent-moderate)] text-[var(--ax-text-accent)] font-semibold">
                3
              </span>
              <Heading level="2" size="small">
                Resultatet ditt
              </Heading>
            </div>

            {error && <QueryErrorDisplay error={error} lastProcessedSql={sql} onAddDateFilter={() => {}} />}

            <SqlResultsSection
              result={result}
              loading={loading}
              estimating={estimating}
              error={error}
              queryStats={result?.queryStats ?? estimate}
              query={sql}
              lastProcessedSql={sql}
              websiteId={websiteId}
              copiedMetabase={false}
              onExecuteQuery={runQuery}
              onCopyMetabase={() => {}}
              hideMetabaseTransfer
              showSqlCode={false}
              showJson={false}
              showExecuteButton={false}
              dashboardButtonSize="medium"
              prepareLineChartData={prepareLineChartData}
              prepareBarChartData={prepareBarChartData}
              preparePieChartData={preparePieChartData}
            />
          </section>
        )}
      </div>
    </ChartLayout>
  )
}
