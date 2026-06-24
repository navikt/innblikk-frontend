import { useEffect, useState } from 'react'
import {
  Alert,
  BodyShort,
  Button,
  Heading,
  Label,
  Loader,
  Select,
  Switch,
  TextField,
  UNSAFE_Combobox as Combobox,
} from '@navikt/ds-react'
import { Plus, Trash2 } from 'lucide-react'
import { ResponsiveContainer, LineChart } from '@fluentui/react-charting'
import ChartLayout from '../../analysis/ui/ChartLayout.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import CookieMixNotice from '../../analysis/ui/CookieMixNotice.tsx'
import TableSectionHeader from '../../../shared/ui/TableSectionHeader.tsx'
import { useGoalCompletion } from '../hooks/useGoalCompletion'
import GoalCompletionStatsCards from './GoalCompletionStatsCards.tsx'
import type { GoalStep, GoalStepParam } from '../model/types'
import { getGoalStepUrlDisplay, splitGoalStepUrlInput } from '../utils/goalStepUtils'
import { getGoalCompletionSqlTemplate } from '../utils/goalCompletionDashboardSql.ts'
import SqlViewer from '../../chartbuilder/ui/results/SqlViewer.tsx'

const createEmptyParam = (): GoalStepParam => ({ key: '', operator: 'equals', value: '' })

const getStepUrlData = (step: GoalStep): { value: string; query: string } =>
  step.type === 'event'
    ? splitGoalStepUrlInput(step.urlPath ?? '', step.urlQuery ?? '')
    : splitGoalStepUrlInput(step.value, step.query ?? '')

const updateStepParam = (
  step: GoalStep,
  paramIndex: number,
  field: keyof GoalStepParam,
  value: GoalStepParam[keyof GoalStepParam],
): GoalStep => {
  const params = [...(step.params ?? [])]
  if (!params[paramIndex]) return step
  params[paramIndex] = { ...params[paramIndex], [field]: value }
  return { ...step, params }
}

const removeStepParam = (step: GoalStep, paramIndex: number): GoalStep => {
  const params = (step.params ?? []).filter((_, index) => index !== paramIndex)
  return { ...step, params }
}

const GoalCompletion = () => {
  const {
    selectedWebsite,
    setSelectedWebsite,
    usesCookies,
    startStep,
    setStartStep,
    goalStep,
    setGoalStep,
    fetchAvailableEvents,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    data,
    summary,
    chartData,
    queryStats,
    loading,
    error,
    hasAttemptedFetch,
    hasUnappliedFilterChanges,
    cookieBadge,
    isPreCookieRange,
    cookieStartDate,
    fetchData,
  } = useGoalCompletion()

  const [showTableSection, setShowTableSection] = useState(false)
  const [eventOptionsByStep, setEventOptionsByStep] = useState<Record<string, string[]>>({})
  const [loadingEventsByStep, setLoadingEventsByStep] = useState<Record<string, boolean>>({})
  const [eventInputByStep, setEventInputByStep] = useState<Record<string, string>>({})
  const hasValidSteps = startStep.value.trim() !== '' && goalStep.value.trim() !== ''

  useEffect(() => {
    if (!selectedWebsite) return

    const steps: Array<{ id: 'start' | 'goal'; step: GoalStep }> = [
      { id: 'start', step: startStep },
      { id: 'goal', step: goalStep },
    ]

    for (const { id, step } of steps) {
      if (step.type !== 'event' || !step.value.trim()) continue
      const scopeKey = `${selectedWebsite.id}:${id}`
      const stepUrlData = getStepUrlData(step)
      const hasOptions = (eventOptionsByStep[scopeKey]?.length ?? 0) > 0
      const isLoading = loadingEventsByStep[scopeKey] ?? false
      if (hasOptions || isLoading) continue

      void (async () => {
        setLoadingEventsByStep((prev) => ({ ...prev, [scopeKey]: true }))
        try {
          const events = await fetchAvailableEvents(stepUrlData.value)
          setEventOptionsByStep((prev) => ({ ...prev, [scopeKey]: events }))
          setEventInputByStep((prev) => ({ ...prev, [scopeKey]: step.value }))
        } finally {
          setLoadingEventsByStep((prev) => ({ ...prev, [scopeKey]: false }))
        }
      })()
    }
  }, [selectedWebsite, startStep, goalStep, eventOptionsByStep, loadingEventsByStep, fetchAvailableEvents])

  return (
    <ChartLayout
      title="Måloppnåelse"
      description="Se hvor mange som starter på ett steg og fullfører på et valgt målsteg."
      currentPage="maloppnaelse"
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={<WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />}
      filters={
        <>
          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            startDate={customStartDate}
            onStartDateChange={setCustomStartDate}
            endDate={customEndDate}
            onEndDateChange={setCustomEndDate}
            showShortPeriods={usesCookies}
          />
        </>
      }
    >
      <div className="mb-6 bg-[var(--ax-bg-neutral-soft)] p-4 rounded-lg border border-[var(--ax-border-neutral-subtle)]">
        <Heading level="2" size="small" className="mb-4">
          Start og mål
        </Heading>

        <div className="grid gap-4 xl:grid-cols-2">
          {[
            { id: 'start' as const, label: 'Startsteg', step: startStep, setStep: setStartStep },
            { id: 'goal' as const, label: 'Målsteg', step: goalStep, setStep: setGoalStep },
          ].map(({ id, label, step, setStep }, stepIndex) => (
            <div
              key={label}
              className="border border-[var(--ax-border-neutral-subtle)] rounded-lg p-4 bg-[var(--ax-bg-default)]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                  {stepIndex + 1}
                </div>
                <Heading level="3" size="xsmall">
                  {label}
                </Heading>
              </div>

              <div className="space-y-4">
                {(() => {
                  const scopeKey = `${selectedWebsite?.id ?? 'none'}:${id}`
                  const eventOptions = eventOptionsByStep[scopeKey] ?? []
                  const isLoadingEvents = loadingEventsByStep[scopeKey] ?? false
                  const eventInput = eventInputByStep[scopeKey] ?? (step.type === 'event' ? step.value : '')
                  const stepUrlData = getStepUrlData(step)
                  return (
                    <>
                      <div className="space-y-2">
                        <Label size="small" htmlFor={`goal-step-url-${scopeKey}`}>
                          URL-sti
                        </Label>
                        <TextField
                          label="URL-sti"
                          hideLabel
                          id={`goal-step-url-${scopeKey}`}
                          size="small"
                          value={getGoalStepUrlDisplay(stepUrlData)}
                          onChange={(e) => {
                            if (step.type === 'event') {
                              setStep({ ...step, urlPath: e.target.value, urlQuery: '' })
                            } else {
                              setStep({ ...step, value: e.target.value, query: '' })
                            }
                          }}
                          onBlur={(e) => {
                            const next = splitGoalStepUrlInput(e.target.value, stepUrlData.query)
                            if (step.type === 'event') {
                              setStep({ ...step, urlPath: next.value || undefined, urlQuery: next.query || undefined })
                            } else {
                              setStep({ ...step, value: next.value, query: next.query })
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2 pt-1">
                        <Label size="small" htmlFor={`goal-step-event-${scopeKey}`}>
                          Hendelse (valgfritt)
                        </Label>
                        {eventOptions.length === 0 && step.type !== 'event' && (
                          <div className="flex justify-start">
                            <Button
                              size="small"
                              variant="secondary"
                              loading={isLoadingEvents}
                              onClick={() => {
                                if (isLoadingEvents) return
                                void (async () => {
                                  setLoadingEventsByStep((prev) => ({ ...prev, [scopeKey]: true }))
                                  try {
                                    const events = await fetchAvailableEvents(stepUrlData.value)
                                    setEventOptionsByStep((prev) => ({ ...prev, [scopeKey]: events }))
                                  } finally {
                                    setLoadingEventsByStep((prev) => ({ ...prev, [scopeKey]: false }))
                                  }
                                })()
                              }}
                              disabled={!selectedWebsite || isLoadingEvents}
                            >
                              Hent hendelser
                            </Button>
                          </div>
                        )}
                      </div>

                      {(eventOptions.length > 0 || step.type === 'event') && (
                        <div className="space-y-2">
                          <Combobox
                            label="Hendelse (valgfritt)"
                            hideLabel
                            id={`goal-step-event-${scopeKey}`}
                            size="small"
                            options={eventOptions.map((eventName) => ({ label: eventName, value: eventName }))}
                            selectedOptions={step.type === 'event' && step.value ? [step.value] : []}
                            value={eventInput}
                            onChange={(value) => setEventInputByStep((prev) => ({ ...prev, [scopeKey]: value }))}
                            onToggleSelected={(option, isSelected) => {
                              const carriedUrl = getStepUrlData(step)
                              if (isSelected) {
                                setEventInputByStep((prev) => ({ ...prev, [scopeKey]: option }))
                                setStep({
                                  type: 'event',
                                  value: option,
                                  query: undefined,
                                  urlPath: carriedUrl.value || undefined,
                                  urlQuery: carriedUrl.query || undefined,
                                  params: step.type === 'event' ? (step.params ?? []) : [],
                                })
                              } else {
                                setEventInputByStep((prev) => ({ ...prev, [scopeKey]: '' }))
                                setStep({
                                  type: 'url',
                                  value: carriedUrl.value,
                                  query: carriedUrl.query,
                                })
                              }
                            }}
                            isLoading={isLoadingEvents}
                            shouldAutocomplete
                            clearButton
                          />
                          {eventOptions.length > 0 && (
                            <div className="flex justify-end">
                              <Button
                                size="small"
                                variant="secondary"
                                loading={isLoadingEvents}
                                onClick={() => {
                                  if (isLoadingEvents) return
                                  void (async () => {
                                    setLoadingEventsByStep((prev) => ({ ...prev, [scopeKey]: true }))
                                    try {
                                      const events = await fetchAvailableEvents(stepUrlData.value)
                                      setEventOptionsByStep((prev) => ({ ...prev, [scopeKey]: events }))
                                    } finally {
                                      setLoadingEventsByStep((prev) => ({ ...prev, [scopeKey]: false }))
                                    }
                                  })()
                                }}
                                disabled={!selectedWebsite || isLoadingEvents}
                              >
                                Oppdater hendelser
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {step.type === 'event' && (
                        <div>
                          <div className="text-sm font-semibold mb-2">Filtrer på hendelsesdetaljer</div>
                          {(step.params ?? []).length > 0 && (
                            <div className="space-y-3 mb-3">
                              {(step.params ?? []).map((param, paramIndex) => (
                                <div
                                  key={`${label}-param-${paramIndex}`}
                                  className="bg-[var(--ax-bg-neutral-soft)] rounded-md p-3 border border-[var(--ax-border-neutral-subtle)]"
                                >
                                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                                    <TextField
                                      label="Detalj"
                                      size="small"
                                      value={param.key}
                                      onChange={(e) =>
                                        setStep(updateStepParam(step, paramIndex, 'key', e.target.value))
                                      }
                                    />
                                    <Select
                                      label="Operator"
                                      size="small"
                                      value={param.operator}
                                      onChange={(e) =>
                                        setStep(
                                          updateStepParam(
                                            step,
                                            paramIndex,
                                            'operator',
                                            e.target.value as GoalStepParam['operator'],
                                          ),
                                        )
                                      }
                                    >
                                      <option value="equals">= Er lik</option>
                                      <option value="contains">Inneholder</option>
                                    </Select>
                                  </div>
                                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                                    <TextField
                                      label="Verdi"
                                      size="small"
                                      value={param.value}
                                      onChange={(e) =>
                                        setStep(updateStepParam(step, paramIndex, 'value', e.target.value))
                                      }
                                    />
                                    <Button
                                      variant="tertiary-neutral"
                                      size="small"
                                      icon={<Trash2 size={14} />}
                                      onClick={() => setStep(removeStepParam(step, paramIndex))}
                                    >
                                      Fjern
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <Button
                            size="small"
                            variant="tertiary-neutral"
                            icon={<Plus size={14} />}
                            onClick={() => setStep({ ...step, params: [...(step.params ?? []), createEmptyParam()] })}
                          >
                            Legg til filter
                          </Button>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={fetchData}
            size="small"
            disabled={!selectedWebsite || loading || !hasUnappliedFilterChanges || !hasValidSteps}
            loading={loading}
          >
            Beregn måloppnåelse
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && (
        <div className="flex justify-center items-center h-full">
          <Loader size="xlarge" title="Beregner måloppnåelse..." />
        </div>
      )}

      {!loading && hasAttemptedFetch && summary.totalStarters > 0 && (
        <>
          {(cookieBadge === 'mix' || isPreCookieRange) && (
            <CookieMixNotice
              websiteName={selectedWebsite?.name}
              cookieStartDate={cookieStartDate}
              variant={isPreCookieRange ? 'pre' : 'mix'}
            />
          )}

          <GoalCompletionStatsCards summary={summary} />

          <div className="pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Heading level="3" size="small">
                Måloppnåelse over tid
              </Heading>
              {queryStats && (
                <div className="px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                  {queryStats.totalBytesProcessedGB} GB prosessert
                </div>
              )}
            </div>
            {data.length > 0 ? (
              <div style={{ width: '100%', height: '500px' }}>
                {chartData && (
                  <ResponsiveContainer>
                    <LineChart
                      data={chartData.data}
                      legendsOverflowText={'Overflow Items'}
                      yAxisTickFormat={(d: number | string) => `${Number(d)}% `}
                      legendProps={{
                        allowFocusOnLegends: true,
                        styles: {
                          text: { color: 'var(--ax-text-default)' },
                        },
                      }}
                    />
                  </ResponsiveContainer>
                )}
              </div>
            ) : (
              <Alert variant="info" className="mb-2">
                Ingen fullføringer i valgt periode.
              </Alert>
            )}
            <div className="mt-4 flex justify-end">
              <Switch checked={showTableSection} onChange={(e) => setShowTableSection(e.target.checked)} size="small">
                Vis som tabell
              </Switch>
            </div>
          </div>

          {showTableSection && (
            <div className="pt-4">
              <div className="border border-[var(--ax-border-neutral-subtle)] rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
                <div className="p-4 pb-2">
                  <TableSectionHeader title="Tabell" />
                </div>
                <div className="overflow-x-auto px-4">
                  <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
                    <thead className="bg-[var(--ax-bg-neutral-soft)]">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">
                          Dag
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">
                          Fullførte brukere
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ax-text-default)] uppercase tracking-wider">
                          Prosent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
                      {data.map((item, index) => (
                        <tr key={index} className="hover:bg-[var(--ax-bg-neutral-soft]">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--ax-text-default)]">
                            Dag {item.day}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                            {item.completed_users.toLocaleString('nb-NO')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ax-text-default)]">
                            {item.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 pb-4" aria-hidden="true" />
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && hasAttemptedFetch && summary.totalStarters === 0 && (
        <div className="text-center p-8 text-gray-500 bg-[var(--ax-bg-neutral-soft)] rounded-lg border border-[var(--ax-border-neutral-subtle)] mt-4">
          <BodyShort>Ingen brukere startet på valgt startsteg i perioden.</BodyShort>
        </div>
      )}

      {hasValidSteps && <SqlViewer sql={getGoalCompletionSqlTemplate(startStep, goalStep)} seksjon="goalcompletion" />}
    </ChartLayout>
  )
}

export default GoalCompletion
