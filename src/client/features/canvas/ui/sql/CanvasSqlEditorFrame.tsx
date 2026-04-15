import { Alert, Button, Tabs } from '@navikt/ds-react'
import Editor from '@monaco-editor/react'
import { useCallback, useState } from 'react'
import { ResultsPanel } from '../../../chartbuilder'
import { estimateQueryCost, executeQueryApi } from '../../../sql/api/sqlApi.ts'
import type { QueryResult, QueryStats } from '../../../sql/model/types'
import { prepareBarChartData, prepareLineChartData, preparePieChartData } from '../../../sql/utils/chartHelpers'
import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'

type CanvasSqlEditorFrameProps = {
  id: string
  sqlQuery?: string
  websiteId?: string
  isLockedByOther?: boolean
  lockOwnerLabel?: string | null
  onChange: (id: string, nextValue: string) => void
  onBlur: (id: string) => void
}

const CanvasSqlEditorFrame = ({
  id,
  sqlQuery,
  websiteId,
  isLockedByOther = false,
  lockOwnerLabel = null,
  onChange,
  onBlur,
}: CanvasSqlEditorFrameProps) => {
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false)
  const [lastProcessedSql, setLastProcessedSql] = useState('')
  const [dryRunEstimate, setDryRunEstimate] = useState<QueryStats | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [activeTab, setActiveTab] = useState<'sql' | 'resultat'>('sql')

  const handleExecuteQuery = useCallback(async () => {
    const trimmedSql = (sqlQuery || '').trim()
    if (!trimmedSql) {
      setError('Legg inn SQL før du kjører spørring.')
      setHasAttemptedFetch(true)
      return
    }

    setLoading(true)
    setError(null)
    setHasAttemptedFetch(true)
    setLastProcessedSql(trimmedSql)

    try {
      const data = await executeQueryApi(trimmedSql)
      setResult(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Query failed'
      setError(message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [sqlQuery])

  const handleDryRun = useCallback(async () => {
    const trimmedSql = (sqlQuery || '').trim()
    if (!trimmedSql) {
      setError('Legg inn SQL før du kjører dry run.')
      return
    }

    setEstimating(true)
    setError(null)
    setLastProcessedSql(trimmedSql)

    try {
      const estimate = await estimateQueryCost(trimmedSql)
      setDryRunEstimate(estimate)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Dry run failed'
      setError(message)
      setDryRunEstimate(null)
    } finally {
      setEstimating(false)
    }
  }, [sqlQuery])

  const getLineChartData = useCallback(
    (includeAverage: boolean = false) => {
      if (!result?.data) return null
      return prepareLineChartData(result.data, includeAverage)
    },
    [result?.data],
  )

  const getBarChartData = useCallback(() => {
    if (!result?.data) return null
    return prepareBarChartData(result.data)
  }, [result?.data])

  const getPieChartData = useCallback(() => {
    if (!result?.data) return null
    return preparePieChartData(result.data)
  }, [result?.data])

  const dryRunGb = Number(dryRunEstimate?.totalBytesProcessedGB ?? NaN)
  const dryRunBytes = Number(dryRunEstimate?.totalBytesProcessed ?? NaN)
  const dryRunCost = Number(dryRunEstimate?.estimatedCostUSD ?? NaN)

  return (
    <div className="relative h-full overflow-hidden p-2">
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value as 'sql' | 'resultat')}
        className="flex h-full min-h-0 flex-col"
      >
        <Tabs.List>
          <Tabs.Tab value="sql" label="SQL" />
          <Tabs.Tab value="resultat" label="Resultat" />
        </Tabs.List>
        <Tabs.Panel value="sql" className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col gap-2 pt-2">
            {error && !hasAttemptedFetch && (
              <Alert variant="error" size="small">
                {error}
              </Alert>
            )}
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2">
              <Editor
                height="100%"
                defaultLanguage="sql"
                value={sqlQuery || ''}
                onChange={(value) => onChange(id, value || '')}
                onMount={(editor) => {
                  editor.onDidBlurEditorText(() => onBlur(id))
                }}
                theme="vs-dark"
                options={{
                  readOnly: isLockedByOther,
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  fixedOverflowWidgets: true,
                  stickyScroll: { enabled: false },
                  lineNumbersMinChars: 4,
                  glyphMargin: false,
                }}
              />
            </div>
          </div>
        </Tabs.Panel>
        <Tabs.Panel value="resultat" className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col gap-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="xsmall"
                onClick={() => void handleExecuteQuery()}
                loading={loading}
                disabled={isLockedByOther}
              >
                Vis resultater
              </Button>
              <Button
                size="xsmall"
                variant="secondary"
                onClick={() => void handleDryRun()}
                loading={estimating}
                disabled={isLockedByOther}
              >
                Prøvekjøring
              </Button>
            </div>
            <div className="min-h-0 h-full overflow-auto rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2">
              {dryRunEstimate && (
                <Alert variant="info" size="small" className="mb-3">
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold">Prøvekjøring fullført</div>
                    {Number.isFinite(dryRunGb) && dryRunGb >= 0 ? (
                      <div>Datamengde: {dryRunGb.toFixed(2)} GB</div>
                    ) : Number.isFinite(dryRunBytes) && dryRunBytes >= 0 ? (
                      <div>Datamengde: {dryRunBytes.toLocaleString('nb-NO')} bytes</div>
                    ) : null}
                    {Number.isFinite(dryRunCost) && dryRunCost >= 0 ? (
                      <div>Estimert kostnad: ${dryRunCost.toFixed(2)} USD</div>
                    ) : null}
                    {dryRunEstimate.cacheHit ? <div>Resultat er cachet (ingen kostnad).</div> : null}
                    <div className="pt-1">
                      <Button size="xsmall" variant="tertiary" onClick={() => setDryRunEstimate(null)}>
                        Skjul
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}
              {hasAttemptedFetch ? (
                <ResultsPanel
                  result={result}
                  loading={loading}
                  error={error}
                  queryStats={result?.queryStats}
                  lastAction="run"
                  showLoadingMessage={loading}
                  executeQuery={() => void handleExecuteQuery()}
                  handleRetry={() => void handleExecuteQuery()}
                  prepareLineChartData={getLineChartData}
                  prepareBarChartData={getBarChartData}
                  preparePieChartData={getPieChartData}
                  sql={lastProcessedSql || sqlQuery || ''}
                  showSqlCode={true}
                  showEditButton={false}
                  showSqlMetabaseActions={false}
                  showCost={true}
                  showDownloadReadMore={false}
                  compactTableActions={true}
                  hideTableFooter={true}
                  compactTableTitle="Resultater"
                  websiteId={websiteId}
                />
              ) : (
                <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-[var(--ax-text-subtle)]">
                  Kjør spørring for å vise resultater og grafer.
                </div>
              )}
            </div>
          </div>
        </Tabs.Panel>
      </Tabs>
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} />}
    </div>
  )
}

export default CanvasSqlEditorFrame
