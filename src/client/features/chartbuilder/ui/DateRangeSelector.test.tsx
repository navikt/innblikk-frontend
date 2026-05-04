import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import DateRangeSelector from './grafbygger/DateRangeSelector.tsx'

function renderDateRangeSelector(overrides = {}) {
  const setFilters = vi.fn()
  const setSelectedDateRange = vi.fn()
  const setCustomPeriodInputs = vi.fn()

  render(
    <DateRangeSelector
      filters={[]}
      setFilters={setFilters}
      maxDaysAvailable={90}
      selectedDateRange="last30days"
      setSelectedDateRange={setSelectedDateRange}
      customPeriodInputs={{}}
      setCustomPeriodInputs={setCustomPeriodInputs}
      interactiveMode={false}
      {...overrides}
    />,
  )

  return { setFilters, setSelectedDateRange }
}

describe('DateRangeSelector', () => {
  it('renders all three tab options', () => {
    renderDateRangeSelector()
    expect(screen.getByRole('tab', { name: /ofte brukte/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /relative/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /bestemte/i })).toBeInTheDocument()
  })

  it('shows preset date buttons by default (Ofte brukte tab)', () => {
    renderDateRangeSelector()
    expect(screen.getByRole('button', { name: /siste 30 dager/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /siste 7 dager/i })).toBeInTheDocument()
  })

  it('switches to Relative tab on click', async () => {
    const user = userEvent.setup()
    renderDateRangeSelector()

    await user.click(screen.getByRole('tab', { name: /relative/i }))

    expect(screen.getByRole('tab', { name: /relative/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to Bestemte (fixed) tab on click', async () => {
    const user = userEvent.setup()
    renderDateRangeSelector()

    await user.click(screen.getByRole('tab', { name: /bestemte/i }))

    expect(screen.getByRole('tab', { name: /bestemte/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('calls setSelectedDateRange when a preset button is clicked', async () => {
    const user = userEvent.setup()
    const { setSelectedDateRange } = renderDateRangeSelector()

    await user.click(screen.getByRole('button', { name: /siste 7 dager/i }))

    expect(setSelectedDateRange).toHaveBeenCalled()
  })
})
