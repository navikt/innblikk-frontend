import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Filter } from '../../../../shared/types/chart.ts'
import PeriodOverrideOption from './PeriodFilter.tsx'

function Harness({ initialFilters }: { initialFilters: Filter[] }) {
  const [filters, setFilters] = useState(initialFilters)
  return (
    <>
      <PeriodOverrideOption filters={filters} setFilters={setFilters} maxDaysAvailable={365} />
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

  it('uses the dashboard period by default and enables a last-seven-days override', async () => {
    const user = userEvent.setup()
    render(<Harness initialFilters={[dashboardPeriod]} />)

    const override = screen.getByRole('checkbox', { name: /^Overstyr tidsperiode/ })
    expect(override).not.toBeChecked()
    expect(screen.queryByRole('combobox', { name: 'Periode' })).not.toBeInTheDocument()

    await user.click(override)

    expect(screen.getByRole('tab', { name: 'Ofte brukte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siste 7 dager' })).toHaveAttribute('data-variant', 'primary')
    expect(filters()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column: 'created_at',
          operator: '>=',
          value: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)',
        }),
      ]),
    )
  })

  it('restores dashboard control when the override is disabled', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initialFilters={[
          {
            column: 'created_at',
            operator: '>=',
            value: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 28 DAY)',
            dateRangeType: 'dynamic',
          },
          {
            column: 'created_at',
            operator: '<=',
            value: 'CURRENT_TIMESTAMP()',
            dateRangeType: 'dynamic',
          },
        ]}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /^Overstyr tidsperiode/ }))

    expect(filters().filter((filter) => filter.column === 'created_at')).toEqual([
      expect.objectContaining({ value: '{{created_at}}', interactive: true, metabaseParam: true }),
    ])
  })
})
