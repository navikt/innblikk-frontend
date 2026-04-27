import { RadioGroup, Radio, TextField } from '@navikt/ds-react'
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { Metric, MetricOption, Filter } from '../../../../shared/types/chart.ts'

type RadioValue = 'count' | 'distinct_session' | 'distinct_visit' | ''

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
    description: 'COUNT(*)',
    defaultAlias: 'antall',
    metricFunction: 'count',
    column: undefined as string | undefined,
  },
  {
    value: 'distinct_session' as RadioValue,
    label: 'Unike besøkende',
    description: 'COUNT(DISTINCT session_id)',
    defaultAlias: 'unike_besokende',
    metricFunction: 'distinct',
    column: 'session_id',
  },
  {
    value: 'distinct_visit' as RadioValue,
    label: 'Økter / besøk',
    description: 'COUNT(DISTINCT visit_id)',
    defaultAlias: 'okter_besok',
    metricFunction: 'distinct',
    column: 'visit_id',
  },
]

const getRadioValueFromMetric = (metric: Metric): RadioValue => {
  if (metric.function === 'count') return 'count'
  if (metric.function === 'distinct' && metric.column === 'session_id') return 'distinct_session'
  if (metric.function === 'distinct' && metric.column === 'visit_id') return 'distinct_visit'
  return ''
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

  const [aliasInput, setAliasInput] = useState<string>(getInitialAlias)

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
    setAliasInput(getInitialAlias())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  useEffect(() => {
    const event = new CustomEvent('summarizeStepStatus', {
      detail: { hasUserSelectedMetrics: metrics.length > 0 },
    })
    document.dispatchEvent(event)
  }, [metrics])

  const handleRadioChange = (value: string) => {
    const radioValue = value as RadioValue
    const option = RADIO_OPTIONS.find((o) => o.value === radioValue)
    if (!option) return

    const count = metrics.length
    for (let i = count - 1; i >= 0; i--) {
      removeMetric(i)
    }

    const alias = aliasInput.trim() || option.defaultAlias
    const updates: Partial<Metric> = { alias }
    if (option.column) updates.column = option.column

    addMetric(option.metricFunction, updates)
  }

  const handleAliasBlur = () => {
    if (!activeMetric || metrics.length === 0) return
    const trimmed = aliasInput.trim()
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
      </RadioGroup>

      {activeRadioValue !== '' && (
        <TextField
          label="Kolonnenavn"
          size="small"
          value={aliasInput}
          onChange={(e) => setAliasInput(e.target.value)}
          onBlur={handleAliasBlur}
          placeholder={RADIO_OPTIONS.find((o) => o.value === activeRadioValue)?.defaultAlias || 'antall'}
        />
      )}
    </div>
  )
})

export default MetricSelector
