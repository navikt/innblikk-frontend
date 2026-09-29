import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Filter } from '../../../../shared/types/chart.ts'
import PeriodOverrideOption from './PeriodFilter.tsx'

function Harness({ initialFilters }: { initialFilters: Filter[] }) {
  const [filters, setFilters] = useState(initialFilters)
  return (
    <>
      <PeriodOverrideOption filters={filters} setFilters={setFilters} />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
    </>
  )
}

const filters = (): Filter[] => JSON.parse(screen.getByTestId('filters').textContent || '[]') as Filter[]

describe('PeriodOverrideOption', () => {
  const dashboardPeriod: Filter = {
    column: 'created_at',
    operator: 'SPECIAL',
    value: '{{created_at}}',
    interactive: true,
    metabaseParam: true,
  }

  it('keeps dashboard override enabled by default and adds the placeholder when no date filter exists', () => {
    render(<Harness initialFilters={[]} />)

    const toggle = screen.getByRole('checkbox', { name: /^La dashboardet overstyre tidsperioden/ })
    expect(toggle).toBeChecked()
    expect(filters()).toEqual(expect.arrayContaining([expect.objectContaining({ value: '{{created_at}}' })]))
  })

  it('disabling the override removes the placeholder so the picker dates are baked in', async () => {
    const user = userEvent.setup()
    render(<Harness initialFilters={[dashboardPeriod]} />)

    await user.click(screen.getByRole('checkbox', { name: /^La dashboardet overstyre tidsperioden/ }))

    expect(filters().filter((filter) => filter.column === 'created_at')).toEqual([])
  })

  it('re-enabling the override restores the placeholder', async () => {
    const user = userEvent.setup()
    render(<Harness initialFilters={[]} />)

    const toggle = screen.getByRole('checkbox', { name: /^La dashboardet overstyre tidsperioden/ })
    await user.click(toggle)
    expect(filters().filter((filter) => filter.column === 'created_at')).toEqual([])

    await user.click(toggle)
    expect(filters().filter((filter) => filter.column === 'created_at')).toEqual([
      expect.objectContaining({ value: '{{created_at}}', interactive: true, metabaseParam: true }),
    ])
  })
})
