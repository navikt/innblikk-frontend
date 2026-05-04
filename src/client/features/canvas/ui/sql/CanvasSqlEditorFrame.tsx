import { Alert, Button, Tabs, TextField } from '@navikt/ds-react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { useCallback, useEffect, useRef, useState } from 'react'
import { endOfWeek, startOfWeek, subDays, subWeeks } from 'date-fns'
import * as sqlFormatter from 'sql-formatter'
import { ResultsPanel } from '../../../chartbuilder'
import PeriodPicker from '../../../analysis/ui/PeriodPicker.tsx'
import { estimateQueryCost, executeQueryApi } from '../../../sql/api/sqlApi.ts'
import type { QueryResult, QueryStats } from '../../../sql/model/types'
import { prepareBarChartData, prepareLineChartData, preparePieChartData } from '../../../sql/utils/chartHelpers'
import { applyUrlFiltersToSql, restorePlaceholders, sanitizePlaceholders } from '../../../sql/utils/sqlProcessing.ts'
import type { CanvasCodeLanguage } from '../../model/types.ts'
import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'

type CanvasSqlEditorFrameProps = {
  id: string
  sqlQuery?: string
  websiteId?: string
  showResultTab?: boolean
  showTabs?: boolean
  showFormatButton?: boolean
  showEditorContainerBorder?: boolean
  codeLanguage?: CanvasCodeLanguage
  usePlainCodeStyle?: boolean
  usePresentationEditorFont?: boolean
  sqlTabLabel?: string
  isInteractionLocked?: boolean
  isLockedByOther?: boolean
  lockOwnerLabel?: string | null
  onChange: (id: string, nextValue: string) => void
  onPersist: (id: string, nextValue?: string) => Promise<void> | void
  onStartEditing?: (id: string) => void
  onBlur?: (id: string, nextValue?: string) => void
}

const CanvasSqlEditorFrame = ({
  id,
  sqlQuery,
  websiteId,
  showResultTab = true,
  showTabs = true,
  showFormatButton = true,
  showEditorContainerBorder = true,
  codeLanguage = 'sql',
  usePlainCodeStyle = false,
  usePresentationEditorFont = false,
  sqlTabLabel = 'SQL',
  isInteractionLocked = false,
  isLockedByOther = false,
  lockOwnerLabel = null,
  onChange,
  onPersist,
  onStartEditing,
  onBlur,
}: CanvasSqlEditorFrameProps) => {
  const isEditorReadOnly = isInteractionLocked || isLockedByOther
  const latestSqlRef = useRef(sqlQuery || '')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false)
  const [lastProcessedSql, setLastProcessedSql] = useState('')
  const [dryRunEstimate, setDryRunEstimate] = useState<QueryStats | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [activeTab, setActiveTab] = useState<'sql' | 'resultat'>('sql')
  const [formatSuccess, setFormatSuccess] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>(() => {
    const now = new Date()
    return {
      from: subDays(now, 6),
      to: now,
    }
  })
  const [period, setPeriod] = useState<string>('last_7_days')
  const [urlPath, setUrlPath] = useState('/')
  const hasMetabaseDateFilter = /\[\[\s*AND\s*\{\{created_at\}\}\s*\]\]/i.test(sqlQuery || '')
  const hasUrlPathFilter =
    /\[\[\s*\{\{url_sti\}\}\s*--\s*\]\]\s*'\/'/i.test(sqlQuery || '') ||
    /\[\[\s*AND\s*\{\{url_sti\}\}\s*\]\]/i.test(sqlQuery || '') ||
    /\[\[\s*\{\{url_path\}\}\s*--\s*\]\]\s*'\/'/i.test(sqlQuery || '') ||
    /\[\[\s*AND\s*\{\{url_path\}\}\s*\]\]/i.test(sqlQuery || '') ||
    /\{\{\s*url_(?:sti|path)\s*\}\}/i.test(sqlQuery || '')

  useEffect(() => {
    latestSqlRef.current = sqlQuery || ''
  }, [sqlQuery])

  const handlePeriodChange = useCallback((newPeriod: string) => {
    setPeriod(newPeriod)
    const now = new Date()
    let newFrom: Date | undefined
    let newTo: Date | undefined

    if (newPeriod === 'today') {
      newFrom = now
      newTo = now
    } else if (newPeriod === 'yesterday') {
      newFrom = subDays(now, 1)
      newTo = subDays(now, 1)
    } else if (newPeriod === 'this_week') {
      newFrom = startOfWeek(now, { weekStartsOn: 1 })
      newTo = now
    } else if (newPeriod === 'last_7_days') {
      newFrom = subDays(now, 6)
      newTo = now
    } else if (newPeriod === 'last_week') {
      const lastWeekDate = subWeeks(now, 1)
      newFrom = startOfWeek(lastWeekDate, { weekStartsOn: 1 })
      newTo = endOfWeek(lastWeekDate, { weekStartsOn: 1 })
    } else if (newPeriod === 'last_28_days') {
      newFrom = subDays(now, 27)
      newTo = now
    } else if (newPeriod === 'current_month') {
      newFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
      newTo = now
    } else if (newPeriod === 'last_month') {
      newFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      newTo = new Date(now.getFullYear(), now.getMonth(), 0)
    }

    if (newFrom && newTo) {
      setDateRange({ from: newFrom, to: newTo })
    }
  }, [])

  const getProcessedSql = useCallback(
    (sqlInput: string) => {
      return applyUrlFiltersToSql(sqlInput, {
        websiteIdState: websiteId || '',
        selectedWebsite: null,
        urlPathFromUrl: null,
        urlPath,
        pathOperatorFromUrl: null,
        dateRange,
        customVariables: [],
        customVariableValues: {},
      })
    },
    [dateRange, urlPath, websiteId],
  )

  const handleExecuteQuery = useCallback(async () => {
    const trimmedSql = (latestSqlRef.current || '').trim()
    if (!trimmedSql) {
      setError('Legg inn SQL før du kjører spørring.')
      setHasAttemptedFetch(true)
      return
    }

    setLoading(true)
    setError(null)
    setHasAttemptedFetch(true)
    const processedSql = getProcessedSql(trimmedSql)
    setLastProcessedSql(processedSql)

    try {
      await Promise.resolve(onPersist(id, trimmedSql))
      const data = await executeQueryApi(processedSql)
      setResult(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Query failed'
      setError(message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [getProcessedSql, id, onPersist])

  const handleDryRun = useCallback(async () => {
    const trimmedSql = (latestSqlRef.current || '').trim()
    if (!trimmedSql) {
      setError('Legg inn SQL før du kjører dry run.')
      return
    }

    setEstimating(true)
    setError(null)
    const processedSql = getProcessedSql(trimmedSql)
    setLastProcessedSql(processedSql)

    try {
      await Promise.resolve(onPersist(id, trimmedSql))
      const estimate = await estimateQueryCost(processedSql)
      setDryRunEstimate(estimate)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Dry run failed'
      setError(message)
      setDryRunEstimate(null)
    } finally {
      setEstimating(false)
    }
  }, [getProcessedSql, id, onPersist])

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

  const handleFormatSql = useCallback(() => {
    const input = latestSqlRef.current || ''
    if (!input.trim()) return

    try {
      const { sanitized, placeholders } = sanitizePlaceholders(input)
      const formatted = sqlFormatter.format(sanitized, { language: 'bigquery' })
      const restored = restorePlaceholders(formatted, placeholders)
      const inputRawLiteralCount = (input.match(/\br'[^']*'/gi) || []).length
      const outputRawLiteralCount = (restored.match(/\br'[^']*'/gi) || []).length

      if (inputRawLiteralCount !== outputRawLiteralCount) {
        throw new Error('Formattering kan endre BigQuery-regex. Beholder original SQL.')
      }

      latestSqlRef.current = restored
      onChange(id, restored)
      setFormatSuccess(true)
      window.setTimeout(() => setFormatSuccess(false), 1800)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kunne ikke formatere SQL trygt'
      setError(message)
    }
  }, [id, onChange])

  const handleSave = useCallback(async () => {
    if (isEditorReadOnly) return
    setSaving(true)
    setError(null)
    try {
      await Promise.resolve(onPersist(id))
      setSaveSuccess(true)
      window.setTimeout(() => setSaveSuccess(false), 1800)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kunne ikke lagre kode'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [id, isEditorReadOnly, onPersist])

  const handleEditorFocus = useCallback(() => {
    if (isEditorReadOnly) return
    onStartEditing?.(id)
  }, [id, isEditorReadOnly, onStartEditing])

  const handleEditorBlur = useCallback(() => {
    if (isEditorReadOnly) return
    onBlur?.(id, latestSqlRef.current)
  }, [id, isEditorReadOnly, onBlur])

  const sqlEditorPanel = (
    <div className="flex h-full min-h-0 flex-col gap-2 pt-2">
      {showFormatButton || !isEditorReadOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          {showFormatButton ? (
            <Button size="xsmall" variant="secondary" onClick={handleFormatSql} disabled={isEditorReadOnly || saving}>
              {formatSuccess ? '✓ Formatert' : 'Formater'}
            </Button>
          ) : null}
          {!isEditorReadOnly ? (
            <Button size="xsmall" variant="secondary" onClick={() => void handleSave()} loading={saving}>
              {saveSuccess ? '✓ Lagret' : 'Lagre'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error && !hasAttemptedFetch && (
        <Alert variant="error" size="small">
          {error}
        </Alert>
      )}
      <div
        className={`min-h-0 flex-1 overflow-hidden rounded-md bg-[var(--ax-bg-default)] p-2 ${
          showEditorContainerBorder ? 'border border-[var(--ax-border-neutral-subtle)]' : ''
        }`}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        <CodeMirror
          value={sqlQuery || ''}
          height="100%"
          theme={oneDark}
          extensions={codeLanguage === 'sql' ? [sql()] : []}
          editable={!isEditorReadOnly}
          onFocus={handleEditorFocus}
          onBlur={handleEditorBlur}
          onChange={(value) => {
            if (isEditorReadOnly) return
            latestSqlRef.current = value
            onChange(id, value)
          }}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLineGutter: true,
            autocompletion: true,
          }}
          className={`h-full overflow-hidden text-sm ${
            usePlainCodeStyle
              ? '[&_.cm-content]:!text-[#d5dbe4] [&_.cm-line]:!text-[#d5dbe4] [&_.cm-gutters]:!text-[#8b95a6]'
              : ''
          } ${
            usePresentationEditorFont
              ? '[&_.cm-content]:!text-[1.25rem] [&_.cm-content]:!leading-[1.7] [&_.cm-line]:!text-[1.25rem] [&_.cm-gutters]:!text-[1rem] [&_.cm-lineNumbers]:!text-[1rem]'
              : ''
          }`}
        />
      </div>
    </div>
  )

  return (
    <div className="relative h-full overflow-hidden p-2">
      {!showTabs ? (
        <div className="flex h-full min-h-0 flex-col">{sqlEditorPanel}</div>
      ) : (
        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab(value === 'resultat' ? 'resultat' : 'sql')}
          className="flex h-full min-h-0 flex-col"
        >
          <Tabs.List>
            <Tabs.Tab value="sql" label={sqlTabLabel} />
            {showResultTab ? <Tabs.Tab value="resultat" label="Resultat" /> : null}
          </Tabs.List>
          <Tabs.Panel value="sql" className="min-h-0 flex-1">
            {sqlEditorPanel}
          </Tabs.Panel>
          {showResultTab ? (
            <Tabs.Panel value="resultat" className="min-h-0 flex-1">
              <div className="flex h-full min-h-0 flex-col gap-2 pt-2">
                {hasMetabaseDateFilter || hasUrlPathFilter ? (
                  <div className="flex flex-wrap items-end gap-2">
                    {hasMetabaseDateFilter ? (
                      <div className="max-w-[260px]">
                        <PeriodPicker
                          period={period}
                          onPeriodChange={handlePeriodChange}
                          startDate={dateRange.from}
                          onStartDateChange={(date) => {
                            setDateRange((prev) => ({ ...prev, from: date }))
                            setPeriod('custom')
                          }}
                          endDate={dateRange.to}
                          onEndDateChange={(date) => {
                            setDateRange((prev) => ({ ...prev, to: date }))
                            setPeriod('custom')
                          }}
                        />
                      </div>
                    ) : null}
                    {hasUrlPathFilter ? (
                      <div className="min-w-[220px] max-w-[320px]">
                        <TextField
                          label="URL"
                          size="small"
                          value={urlPath}
                          onChange={(event) => setUrlPath(event.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="xsmall"
                    onClick={() => void handleExecuteQuery()}
                    loading={loading}
                    disabled={saving || estimating}
                  >
                    Vis resultater
                  </Button>
                  <Button
                    size="xsmall"
                    variant="secondary"
                    onClick={() => void handleDryRun()}
                    loading={estimating}
                    disabled={saving || loading}
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
          ) : null}
        </Tabs>
      )}
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} />}
    </div>
  )
}

export default CanvasSqlEditorFrame
