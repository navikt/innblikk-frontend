import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MetricSelector from './grafbygger/MetricSelector.tsx'
import type { Metric, MetricOption } from '../../../shared/types/chart.ts'

// Use distinct labels that don't collide with accordion section names (Antall/Andel/Tid)
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
  it('renders accordion section headings', () => {
    renderMetricSelector()
    // Accordion headers are buttons — target by role to avoid ambiguity
    expect(screen.getByRole('button', { name: 'Antall' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Andel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tid' })).toBeInTheDocument()
  })

  it('expands Antall section on click and shows metric options', async () => {
    const user = userEvent.setup()
    renderMetricSelector()

    await user.click(screen.getByRole('button', { name: 'Antall' }))

    expect(screen.getByText('Antall unike besøkende')).toBeInTheDocument()
    expect(screen.getByText('Antall sidevisninger')).toBeInTheDocument()
  })

  it('calls addMetric when an unchecked metric is clicked', async () => {
    const user = userEvent.setup()
    const { addMetric } = renderMetricSelector()

    await user.click(screen.getByRole('button', { name: 'Antall' }))

    const checkbox = screen.getByRole('checkbox', { name: /Antall unike besøkende/i })
    await user.click(checkbox)

    expect(addMetric).toHaveBeenCalledOnce()
  })

  it('calls removeMetric when a checked metric is clicked', async () => {
    const user = userEvent.setup()
    const existingMetric: Metric = {
      function: 'distinct',
      column: 'session_id',
      alias: 'Unike_besokende',
    }
    const { removeMetric } = renderMetricSelector([existingMetric])

    // Header shows "Antall (1)" when 1 metric active — click by partial name
    await user.click(screen.getByRole('button', { name: /Antall/i }))

    const checkbox = screen.getByRole('checkbox', { name: /Antall unike besøkende/i })
    expect(checkbox).toBeChecked()
    await user.click(checkbox)

    expect(removeMetric).toHaveBeenCalledOnce()
  })

  it('shows selected count in accordion header when metrics are active', () => {
    const existingMetric: Metric = {
      function: 'distinct',
      column: 'session_id',
      alias: 'Unike_besokende',
    }
    renderMetricSelector([existingMetric])

    expect(screen.getByRole('button', { name: 'Antall (1)' })).toBeInTheDocument()
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
