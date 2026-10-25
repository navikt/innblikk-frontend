import { useRef, useState } from 'react'
import { Alert, BodyShort, Button, Heading, Modal, Select, TextField } from '@navikt/ds-react'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { WebsiteSelect } from '../../../shared/ui/WebsiteSelect.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import { getGcpProjectId } from '../../sql/utils/formatters'
import QueryErrorDisplay from '../../sql/ui/QueryErrorDisplay'
import SqlResultsSection from '../../sql/ui/SqlResultsSection'
import { SAFETY_LIMIT_OPTIONS, useSqlNextEditor } from '../hooks/useSqlNextEditor'
import type { MonacoEditorInstance } from '../model/types'
import ErDiagramAccordion from './ErDiagramAccordion.tsx'
import SqlBuilderPanel from './SqlBuilderPanel'
import JoinQueryDialog, { type JoinTableId } from './JoinQueryDialog'
import { getSqlQuoteFix } from '../model/sqlQuoteFix'
import { getSqlCommaFix } from '../model/sqlCommaFix'
import { getSqlClauseOrderFix } from '../model/sqlClauseOrderFix'
import { getSqlJoinSuggestion } from '../model/sqlJoins'
import { getGroupBySimplification } from '../model/groupBySimplification'

export default function SqlNextPage() {
  const projectId = getGcpProjectId()
  const editorInstanceRef = useRef<MonacoEditorInstance | null>(null)
  const [joinTableId, setJoinTableId] = useState<JoinTableId | null>(null)

  const {
    query,
    result,
    estimate,
    dryRunError,
    loading,
    estimating,
    error,
    validateError,
    incompleteQueryMessage,
    shareSuccess,
    lastProcessedSql,
    copiedMetabase,
    hasAttemptedFetch,
    oldTableWarning,
    websiteId,
    websiteIds,
    availableWebsites,
    period,
    dateRange,
    urlPath,
    selectedWebsite,
    customVariables,
    customVariableValues,
    hasUrlPathFilter,
    safetyLimit,
    activeLimit,
    explicitLimit,
    isResultLimited,
    isSelectStarOnBigTable,
    isMissingPartitionFilter,
    isHighCost,
    groupByField,
    showConfirmModal,
    pendingQueryEstimate,

    setUrlPath,
    setCustomVariableValues,
    handleQueryChange,
    handleWebsiteIdsChange,
    handleUpgradeTables,
    handleAddDateFilter,
    handleAddGroupBy,
    handleAddWebsiteFilter,
    handleCopyMetabase,
    getExportQuery,
    handlePeriodChange,
    handleStartDateChange,
    handleEndDateChange,
    handleSafetyLimitChange,
    handleConfirmQuery,
    handleCancelQuery,
    executeQuery,
    validateSQL,
    formatSQL,
    shareQuery,

    prepareLineChartData,
    prepareBarChartData,
    preparePieChartData,
  } = useSqlNextEditor()

  const queryError = error ?? dryRunError
  const groupBySimplification =
    estimate && !queryError && !loading && !estimating ? getGroupBySimplification(query) : null
  const commaFix = queryError ? getSqlCommaFix(query) : null
  const clauseOrderFix = queryError ? getSqlClauseOrderFix(query) : null
  const quoteFix = queryError ? getSqlQuoteFix(query) : null
  const joinSuggestion = queryError ? getSqlJoinSuggestion(query, queryError, projectId) : null

  const handleInsertSnippet = (code: string) => {
    const ed = editorInstanceRef.current
    if (ed) {
      const selection = ed.getSelection()
      if (selection) {
        ed.executeEdits('sql-next-insert', [
          {
            range: selection,
            text: code,
            forceMoveMarkers: true,
          },
        ])
        ed.focus()
        return
      }
    }
    handleQueryChange(query ? `${query.trimEnd()}\n${code}` : code)
  }

  return (
    <>
      <PageHeader
        title="SQL-bygger"
        description="Kjør SQL-spørringer mot Innblikk datasettet i BigQuery."
        beta
        compactGutters
      />

      <AppBlock className="pb-12" gutters="compact">
        <div className="flex flex-col gap-4">
          {/* Top Filter Bar (clean, no copy buttons here) */}
          <div className="rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-3.5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[260px]">
                <WebsiteSelect
                  websites={availableWebsites}
                  selectedId={websiteIds[0] ?? null}
                  onSelect={(id) => handleWebsiteIdsChange(id ? [id] : [])}
                  selectedIds={websiteIds}
                  onSelectMultiple={handleWebsiteIdsChange}
                  label="Nettsider eller apper"
                  fullWidth
                  size="small"
                />
              </div>

              <div className="flex-1 min-w-[240px]">
                <PeriodPicker
                  period={period}
                  onPeriodChange={handlePeriodChange}
                  startDate={dateRange.from}
                  onStartDateChange={handleStartDateChange}
                  endDate={dateRange.to}
                  onEndDateChange={handleEndDateChange}
                />
              </div>

              <div className="min-w-[140px]">
                <Select
                  label="Maks rader"
                  size="small"
                  value={activeLimit === null ? 'unlimited' : String(activeLimit)}
                  disabled={loading}
                  onChange={(event) => {
                    void handleSafetyLimitChange(event.target.value === 'unlimited' ? null : Number(event.target.value))
                  }}
                >
                  {activeLimit !== null && !SAFETY_LIMIT_OPTIONS.some((limit) => limit === activeLimit) && (
                    <option value={String(activeLimit)}>{activeLimit}</option>
                  )}
                  {SAFETY_LIMIT_OPTIONS.map((limit) => (
                    <option key={limit} value={String(limit)}>
                      {limit}
                    </option>
                  ))}
                  <option value="unlimited">Ubegrenset</option>
                </Select>
              </div>

              {hasUrlPathFilter && (
                <div className="min-w-[200px]">
                  <TextField
                    label="Sidesti (URL)"
                    size="small"
                    value={urlPath}
                    onChange={(e) => setUrlPath(e.target.value)}
                  />
                </div>
              )}

              {customVariables.map((varName) => (
                <div key={varName} className="min-w-[180px]">
                  <TextField
                    label={varName.replace(/_/g, ' ')}
                    size="small"
                    value={customVariableValues[varName] || ''}
                    onChange={(e) =>
                      setCustomVariableValues((prev) => ({
                        ...prev,
                        [varName]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <BodyShort size="small" className="mt-3">
              Filtrene legges til automatisk når spørringen kjøres. Du trenger ikke legge dem inn manuelt.
            </BodyShort>
          </div>

          {/* Collapsible ER-diagram and table reference */}
          <ErDiagramAccordion projectId={projectId} onOpenJoin={setJoinTableId} onInsertSnippet={handleInsertSnippet} />

          {/* Side-by-side Builder + Results */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            <div className="xl:col-span-6">
              <SqlBuilderPanel
                projectId={projectId}
                selectedWebsiteId={selectedWebsite?.id || websiteId}
                selectedWebsiteIds={websiteIds}
                query={query}
                loading={loading}
                estimating={estimating}
                estimate={estimate}
                dryRunError={dryRunError}
                validateError={validateError}
                incompleteQueryMessage={incompleteQueryMessage}
                oldTableWarning={oldTableWarning}
                shareSuccess={shareSuccess}
                selectedWebsiteSelected={Boolean(selectedWebsite?.id || websiteId)}
                safetyLimit={safetyLimit}
                explicitLimit={explicitLimit}
                isSelectStarOnBigTable={isSelectStarOnBigTable}
                isMissingPartitionFilter={isMissingPartitionFilter}
                isHighCost={isHighCost}
                onQueryChange={handleQueryChange}
                onUpgradeTables={handleUpgradeTables}
                onAddDateFilter={handleAddDateFilter}
                onAddWebsiteFilter={handleAddWebsiteFilter}
                onShare={shareQuery}
                onExecute={executeQuery}
                onValidate={() => void validateSQL()}
                onFormat={formatSQL}
                onOpenJoin={() => setJoinTableId('session')}
                editorInstanceRef={editorInstanceRef}
              />
            </div>

            <div className="xl:col-span-6 min-w-0 flex flex-col gap-3">
              {groupBySimplification && (
                <Alert variant="info" size="small">
                  <div className="flex flex-col items-start gap-3">
                    <BodyShort>
                      <code>{groupBySimplification.fields.join(', ')}</code> er allerede låst til én verdi i WHERE og
                      kan fjernes fra GROUP BY.
                    </BodyShort>
                    <Button
                      size="small"
                      variant="secondary"
                      type="button"
                      onClick={() => handleQueryChange(groupBySimplification.sql)}
                    >
                      Forenkle GROUP BY
                    </Button>
                  </div>
                </Alert>
              )}
              {queryError && (
                <QueryErrorDisplay
                  error={queryError}
                  lastProcessedSql={lastProcessedSql}
                  onAddDateFilter={handleAddDateFilter}
                  groupByField={groupByField}
                  onAddGroupBy={handleAddGroupBy}
                  quoteFixValues={quoteFix?.values}
                  onAddQuotes={quoteFix ? () => handleQueryChange(quoteFix.sql) : undefined}
                  onAddComma={commaFix ? () => handleQueryChange(commaFix) : undefined}
                  onMoveWhere={clauseOrderFix ? () => handleQueryChange(clauseOrderFix) : undefined}
                  joinSuggestion={joinSuggestion}
                  onAddJoin={joinSuggestion ? () => handleQueryChange(joinSuggestion.sql) : undefined}
                />
              )}

              {hasAttemptedFetch && isResultLimited && !queryError && (
                <Alert variant="info" size="small">
                  Viser de første <strong>{activeLimit}</strong> radene for at det skal gå raskt.
                </Alert>
              )}

              {hasAttemptedFetch || queryError ? (
                queryError ? null : (
                  <SqlResultsSection
                    showJson={false}
                    result={result}
                    loading={loading}
                    estimating={estimating}
                    error={error}
                    queryStats={result?.queryStats ?? estimate}
                    query={query}
                    getExportQuery={getExportQuery}
                    lastProcessedSql={lastProcessedSql}
                    websiteId={websiteIds.length === 1 ? websiteIds[0] : undefined}
                    copiedMetabase={copiedMetabase}
                    onExecuteQuery={executeQuery}
                    onCopyMetabase={handleCopyMetabase}
                    prepareLineChartData={prepareLineChartData}
                    prepareBarChartData={prepareBarChartData}
                    preparePieChartData={preparePieChartData}
                  />
                )
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-8 text-center flex flex-col items-center justify-center min-h-[340px] gap-2">
                  <Heading level="2" size="small">
                    Resultater vises her
                  </Heading>
                  <BodyShort size="small" className="text-[var(--ax-text-subtle)] max-w-[360px]">
                    Bygg spørringen til venstre og trykk «Vis resultater» for å se tabell eller graf.
                  </BodyShort>
                </div>
              )}
            </div>
          </div>
        </div>
      </AppBlock>

      {joinTableId && (
        <JoinQueryDialog
          projectId={projectId}
          query={query}
          initialTableId={joinTableId}
          onApply={handleQueryChange}
          onClose={() => setJoinTableId(null)}
        />
      )}

      {/* Confirmation Modal for Large Queries (same safeguard pattern as /grafbygger) */}
      <Modal
        open={showConfirmModal}
        onClose={handleCancelQuery}
        header={{
          heading: 'Bekreft stor spørring',
          closeButton: false,
        }}
      >
        <Modal.Body>
          {pendingQueryEstimate &&
            (() => {
              const gb = Number(pendingQueryEstimate.totalBytesProcessedGB ?? 0)
              const cost = Number(pendingQueryEstimate.estimatedCostUSD ?? NaN) || gb * 0.00625
              let variant: 'info' | 'warning' | 'error' = 'info'
              let message = 'Denne spørringen vil lese en del data.'

              if (gb >= 100) {
                variant = 'error'
                message = 'Dette er en veldig stor spørring!'
              } else if (gb >= 20) {
                variant = 'warning'
                message = 'Dette er en stor spørring.'
              } else if (isSelectStarOnBigTable) {
                variant = 'warning'
                message = 'SELECT * henter alle kolonner fra en stor tabell.'
              }

              return (
                <div className="space-y-4">
                  <Alert variant={variant}>
                    <div className="space-y-2">
                      <p className="font-medium">{message}</p>
                      <p>
                        <strong>Data å prosessere:</strong> {pendingQueryEstimate.totalBytesProcessedGB} GB
                        {cost > 0 && ` • Kostnad: $${cost.toFixed(2)}`}
                      </p>
                      {isSelectStarOnBigTable && (
                        <p className="text-sm">
                          Tips: I BigQuery koster det mer å bruke <code>SELECT *</code> selv med <code>LIMIT</code>.
                          Velg gjerne kun kolonnene du trenger, eller koble på nettside og kortere tidsperiode.
                        </p>
                      )}
                    </div>
                  </Alert>
                  <p>Er du sikker på at du vil kjøre denne spørringen?</p>
                </div>
              )
            })()}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => void handleConfirmQuery()} loading={loading}>
            Ja, kjør spørringen
          </Button>
          <Button variant="secondary" onClick={handleCancelQuery}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
