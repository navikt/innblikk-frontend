import { Radio, RadioGroup, TextField } from '@navikt/ds-react'
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { Metric, MetricOption, Filter } from '../../../../shared/types/chart.ts'

type RadioValue = 'count' | 'distinct_session' | 'distinct_visit' | 'tid' | ''
type TidSubValue = 'median' | 'average' | 'mode'
type TidUnit = 'seconds' | 'minutes'

interface SummarizeProps {
  metrics: Metric[]
  METRICS: MetricOption[]
  removeMetric: (index: number) => void
  addMetric: (metricFunction: string, initialUpdates?: Partial<Metric>) => void
  filters: Filter[]
  resetSignal?: number
}

const RADIO_OPTIONS = [
  {
    value: 'count' as RadioValue,
    label: 'Antall',
    defaultAlias: 'antall',
    metricFunction: 'count',
    column: undefined as string | undefined,
  },
  {
    value: 'distinct_session' as RadioValue,
    label: 'Unike besøkende',
    defaultAlias: 'unike_besokende',
    metricFunction: 'distinct',
    column: 'session_id',
  },
  {
    value: 'distinct_visit' as RadioValue,
    label: 'Økter / besøk',
    defaultAlias: 'okter_besok',
    metricFunction: 'distinct',
    column: 'visit_id',
  },
]

const TID_METHOD_OPTIONS: { value: TidSubValue; label: string }[] = [
  { value: 'median', label: 'Median' },
  { value: 'average', label: 'Gjennomsnitt (mean)' },
  { value: 'mode', label: 'Hyppigste (mode)' },
]

const TID_UNIT_OPTIONS: { value: TidUnit; label: string }[] = [
  { value: 'seconds', label: 'Sekunder' },
  { value: 'minutes', label: 'Minutter' },
]

const SubSelectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="filter-card-animate-in rounded-md border border-(--ax-border-neutral-subtle) bg-(--ax-bg-default) px-3 py-3">
    {children}
  </div>
)

const getTidDefaultAlias = (method: TidSubValue, unit: TidUnit): string =>
  `sesjonstid_${method}_${unit === 'minutes' ? 'minutter' : 'sekunder'}`

const isTidDefaultAlias = (alias: string): boolean =>
  TID_METHOD_OPTIONS.some((m) => TID_UNIT_OPTIONS.some((u) => alias === getTidDefaultAlias(m.value, u.value)))

const isKnownDefaultAlias = (alias: string): boolean =>
  RADIO_OPTIONS.some((o) => alias === o.defaultAlias) || isTidDefaultAlias(alias)

const getRadioValueFromMetric = (metric: Metric): RadioValue => {
  if (metric.column === 'visit_duration') return 'tid'
  if (metric.function === 'count') return 'count'
  if (metric.function === 'distinct' && metric.column === 'session_id') return 'distinct_session'
  if (metric.function === 'distinct' && metric.column === 'visit_id') return 'distinct_visit'
  return ''
}

const getTidSubFromMetric = (metric: Metric): TidSubValue => {
  if (metric.function === 'average') return 'average'
  if (metric.function === 'mode') return 'mode'
  return 'median'
}

const MetricSelector = forwardRef(({ metrics, removeMetric, addMetric, resetSignal }: SummarizeProps, ref) => {
  const activeMetric = metrics.length > 0 ? metrics[0] : null
  const activeRadioValue: RadioValue = activeMetric ? getRadioValueFromMetric(activeMetric) : ''

  const getInitialAlias = (): string => {
    if (!activeMetric) return ''
    if (activeMetric.alias) return activeMetric.alias
    const option = RADIO_OPTIONS.find((o) => o.value === getRadioValueFromMetric(activeMetric))
    return option?.defaultAlias || ''
  }

  const [aliasInput, setAliasInput] = useState<string>(() => getInitialAlias() || 'antall')
  const [tidSub, setTidSub] = useState<TidSubValue>(() =>
    activeMetric && activeRadioValue === 'tid' ? getTidSubFromMetric(activeMetric) : 'median',
  )
  const [tidUnit, setTidUnit] = useState<TidUnit>(() => (activeMetric?.showInMinutes ? 'minutes' : 'seconds'))

  const resetConfig = (_silent = false) => {
    const count = metrics.length
    for (let i = count - 1; i >= 0; i--) {
      removeMetric(i)
    }
  }

  useImperativeHandle(ref, () => ({
    resetConfig,
  }))

  useEffect(() => {
    if (metrics.length === 0) {
      addMetric('count', { alias: 'antall' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeMetric && !aliasInput) {
      setAliasInput(activeMetric.alias || RADIO_OPTIONS.find((o) => o.value === activeRadioValue)?.defaultAlias || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMetric])

  useEffect(() => {
    setAliasInput(getInitialAlias())
    setTidSub('median')
    setTidUnit('seconds')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])
  useEffect(() => {
    const event = new CustomEvent('summarizeStepStatus', {
      detail: { hasUserSelectedMetrics: metrics.length > 0 },
    })
    document.dispatchEvent(event)
  }, [metrics])

  const applyTidMetric = (method: TidSubValue, unit: TidUnit, alias: string) => {
    const count = metrics.length
    for (let i = count - 1; i >= 0; i--) {
      removeMetric(i)
    }
    addMetric(method, {
      column: 'visit_duration',
      alias: alias || getTidDefaultAlias(method, unit),
      showInMinutes: unit === 'minutes',
    })
  }

  const handleRadioChange = (value: string) => {
    const radioValue = value as RadioValue

    const count = metrics.length
    for (let i = count - 1; i >= 0; i--) {
      removeMetric(i)
    }

    if (radioValue === 'tid') {
      const defaultAlias = getTidDefaultAlias(tidSub, tidUnit)
      const alias = !aliasInput.trim() || isKnownDefaultAlias(aliasInput.trim()) ? defaultAlias : aliasInput.trim()
      setAliasInput(alias)
      addMetric(tidSub, { column: 'visit_duration', alias, showInMinutes: tidUnit === 'minutes' })
      return
    }

    const option = RADIO_OPTIONS.find((o) => o.value === radioValue)
    if (!option) return

    const alias = !aliasInput.trim() || isKnownDefaultAlias(aliasInput.trim()) ? option.defaultAlias : aliasInput.trim()
    setAliasInput(alias)
    const updates: Partial<Metric> = { alias }
    if (option.column) updates.column = option.column

    addMetric(option.metricFunction, updates)
  }

  const handleTidSubChange = (value: string) => {
    const sub = value as TidSubValue
    setTidSub(sub)
    const newDefault = getTidDefaultAlias(sub, tidUnit)
    const alias = !aliasInput.trim() || isTidDefaultAlias(aliasInput.trim()) ? newDefault : aliasInput.trim()
    setAliasInput(alias)
    applyTidMetric(sub, tidUnit, alias)
  }

  const handleTidUnitChange = (value: string) => {
    const unit = value as TidUnit
    setTidUnit(unit)
    const newDefault = getTidDefaultAlias(tidSub, unit)
    const alias = !aliasInput.trim() || isTidDefaultAlias(aliasInput.trim()) ? newDefault : aliasInput.trim()
    setAliasInput(alias)
    applyTidMetric(tidSub, unit, alias)
  }

  const handleAliasBlur = () => {
    if (!activeMetric || metrics.length === 0) return
    const trimmed = aliasInput.trim()

    if (activeRadioValue === 'tid') {
      const fallback = getTidDefaultAlias(tidSub, tidUnit)
      const alias = trimmed || fallback
      if (!trimmed) setAliasInput(fallback)
      applyTidMetric(tidSub, tidUnit, alias)
      return
    }

    if (!trimmed) {
      const option = RADIO_OPTIONS.find((o) => o.value === activeRadioValue)
      const fallback = option?.defaultAlias || 'antall'
      setAliasInput(fallback)
      return
    }
    const option = RADIO_OPTIONS.find((o) => o.value === activeRadioValue)
    if (!option) return
    removeMetric(0)
    const updates: Partial<Metric> = { alias: trimmed }
    if (option.column) updates.column = option.column
    addMetric(option.metricFunction, updates)
  }

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup legend="Velg måltype" hideLegend value={activeRadioValue} onChange={handleRadioChange} size="small">
        {RADIO_OPTIONS.map((option) => (
          <Radio key={option.value} value={option.value}>
            {option.label}
          </Radio>
        ))}
        <Radio value="tid">Gjennomsnittlig tid</Radio>
      </RadioGroup>

      {activeRadioValue === 'tid' && (
        <div className="filter-card-animate-in ml-6 flex flex-col gap-3 pb-2">
          <SubSelectionCard>
            <RadioGroup legend="Beregningsmetode" value={tidSub} onChange={handleTidSubChange} size="small">
              {TID_METHOD_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value}>
                  {opt.label}
                </Radio>
              ))}
            </RadioGroup>
          </SubSelectionCard>

          <SubSelectionCard>
            <RadioGroup legend="Enhet" value={tidUnit} onChange={handleTidUnitChange} size="small">
              {TID_UNIT_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value}>
                  {opt.label}
                </Radio>
              ))}
            </RadioGroup>
          </SubSelectionCard>
        </div>
      )}

      {activeRadioValue !== '' && (
        <TextField
          label="Kolonnenavn"
          size="small"
          value={aliasInput}
          onChange={(e) => setAliasInput(e.target.value)}
          onBlur={handleAliasBlur}
          placeholder={
            activeRadioValue === 'tid'
              ? 'gjennomsnittlig_tid'
              : (RADIO_OPTIONS.find((o) => o.value === activeRadioValue)?.defaultAlias ?? 'antall')
          }
        />
      )}
    </div>
  )
})

MetricSelector.displayName = 'MetricSelector'

export default MetricSelector
