import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MetricSelector from './grafbygger/MetricSelector.tsx'
import type { Metric, MetricOption } from '../../../shared/types/chart.ts'

const METRICS: MetricOption[] = [
  { label: 'Antall rader', value: 'count' },
  { label: 'Antall unike verdier', value: 'distinct' },
  { label: 'Prosent', value: 'percentage' },
  { label: 'Gjennomsnitt', value: 'average' },
]

function renderMetricSelector(
  metrics: Metric[] = [],
  overrides: Partial<React.ComponentProps<typeof MetricSelector>> = {},
) {
  const addMetric = vi.fn()
  const removeMetric = vi.fn()

  render(
    <MetricSelector
      metrics={metrics}
      METRICS={METRICS}
      addMetric={addMetric}
      removeMetric={removeMetric}
      filters={[]}
      {...overrides}
    />,
  )

  return { addMetric, removeMetric }
}

describe('MetricSelector', () => {
  it('renders radio options for metric type', () => {
    renderMetricSelector()
    expect(screen.getByRole('radio', { name: 'Antall' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Unike besøkende' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Økter / besøk' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Gjennomsnittlig tid' })).toBeInTheDocument()
  })

  it('shows kolonnenavn field when a metric is selected', () => {
    const existingMetric: Metric = {
      function: 'distinct',
      column: 'session_id',
      alias: 'Unike_besokende',
    }
    renderMetricSelector([existingMetric])

    expect(screen.getByRole('textbox', { name: 'Kolonnenavn' })).toBeInTheDocument()
  })

  it('calls addMetric when a radio option is changed', async () => {
    const user = userEvent.setup()
    const { addMetric } = renderMetricSelector([{ function: 'count', alias: 'antall' }])

    await user.click(screen.getByRole('radio', { name: 'Unike besøkende' }))

    expect(addMetric).toHaveBeenCalled()
  })

  it('calls removeMetric when switching away from active metric', async () => {
    const user = userEvent.setup()
    const existingMetric: Metric = {
      function: 'distinct',
      column: 'session_id',
      alias: 'Unike_besokende',
    }
    const { removeMetric } = renderMetricSelector([existingMetric])

    await user.click(screen.getByRole('radio', { name: 'Antall' }))

    expect(removeMetric).toHaveBeenCalled()
  })

  it('shows the active metric alias in kolonnenavn field', () => {
    const existingMetric: Metric = {
      function: 'distinct',
      column: 'session_id',
      alias: 'Unike_besokende',
    }
    renderMetricSelector([existingMetric])

    const input = screen.getByRole('textbox', { name: 'Kolonnenavn' })
    expect(input).toHaveValue('Unike_besokende')
  })

  it('dispatches summarizeStepStatus event when metrics change', () => {
    const handler = vi.fn()
    document.addEventListener('summarizeStepStatus', handler)

    const { rerender } = render(
      <MetricSelector metrics={[]} METRICS={METRICS} addMetric={vi.fn()} removeMetric={vi.fn()} filters={[]} />,
    )

    const metric: Metric = { function: 'count', alias: 'Antall_sidevisninger' }
    rerender(
      <MetricSelector metrics={[metric]} METRICS={METRICS} addMetric={vi.fn()} removeMetric={vi.fn()} filters={[]} />,
    )

    expect(handler).toHaveBeenCalled()
    document.removeEventListener('summarizeStepStatus', handler)
  })
})
