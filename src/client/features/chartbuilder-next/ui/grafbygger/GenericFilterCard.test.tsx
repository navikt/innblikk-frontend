import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenericFilterCard } from './EventSelector.tsx'
import { fetchColumnValues } from '../../../cohortmanager/api/columnValuesApi.ts'
import { columnValuesSuggestions } from '../../../cohortmanager/hooks/useColumnValueSuggestions.ts'
import { OPERATORS } from '../../../../shared/lib/constants.ts'

vi.mock('../../../cohortmanager/api/columnValuesApi.ts', () => ({
  fetchColumnValues: vi.fn(),
}))

const props = {
  websiteId: 'site-1',
  compact: true,
  filter: { column: 'browser', operator: '=', value: '' },
  index: 0,
  columnLabel: 'Nettlesertype',
  OPERATORS,
  parameters: [],
  uniqueParameters: [],
  customEventsList: [],
  availablePaths: [],
  removeFilter: vi.fn(),
  updateFilter: vi.fn(),
}

beforeEach(() => {
  columnValuesSuggestions.clearColumnValuesCache()
  vi.mocked(fetchColumnValues).mockReset()
  vi.mocked(fetchColumnValues).mockResolvedValue({ values: ['Chrome', 'Firefox'], scannedDays: 30 })
  props.updateFilter.mockReset()
})

describe('GenericFilterCard suggestions', () => {
  it.each([
    ['browser', 'browser', undefined],
    ['os', 'os', undefined],
    ['device', 'device', undefined],
    ['screen', 'screen', undefined],
    ['language', 'language', undefined],
    ['country', 'country', undefined],
    ['referrer_domain', 'referrer_domain', undefined],
    ['url_path', 'url_path', undefined],
    ['param_button', 'event_data_value', 'button'],
  ])('requests the supported column %s with its proper scope', async (column, expected, key) => {
    render(<GenericFilterCard {...props} filter={{ column, operator: '=', value: '' }} />)
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalledExactlyOnceWith('site-1', expected, key, undefined))
  })

  it('reuses cached results and does not query on typing or operator changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<GenericFilterCard {...props} />)
    await waitFor(() => expect(fetchColumnValues).toHaveBeenCalledTimes(1))
    await user.type(screen.getByRole('combobox', { name: 'Verdi' }), 'Chr')
    rerender(<GenericFilterCard {...props} filter={{ ...props.filter, operator: 'LIKE' }} />)
    render(<GenericFilterCard {...props} index={1} />)
    expect(fetchColumnValues).toHaveBeenCalledTimes(1)
  })

  it.each([
    { ...props, websiteId: undefined },
    { ...props, filter: { ...props.filter, column: 'session_id' } },
    { ...props, filter: { ...props.filter, interactive: true } },
    { ...props, filter: { ...props.filter, operator: 'IS NULL' } },
    { ...props, filter: { ...props.filter, operator: 'IS NOT NULL' } },
  ])('does not query without an editable supported value field: %j', (overrides) => {
    render(<GenericFilterCard {...overrides} />)
    expect(fetchColumnValues).not.toHaveBeenCalled()
  })

  it('keeps multi-value equality selections and single-value partial matches', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <GenericFilterCard {...props} filter={{ ...props.filter, value: 'Chrome', multipleValues: ['Chrome'] }} />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Verdi' }))
    await user.click(await screen.findByRole('option', { name: 'Firefox' }))
    expect(props.updateFilter).toHaveBeenLastCalledWith(0, {
      operator: 'IN',
      value: 'Chrome',
      multipleValues: ['Chrome', 'Firefox'],
    })
    rerender(<GenericFilterCard {...props} filter={{ ...props.filter, operator: 'LIKE', value: 'Chrome' }} />)
    await user.click(screen.getByRole('combobox', { name: 'Verdi' }))
    await user.click(await screen.findByRole('option', { name: 'Firefox' }))
    expect(props.updateFilter).toHaveBeenLastCalledWith(0, {
      operator: 'LIKE',
      value: 'Firefox',
      multipleValues: ['Firefox'],
    })
  })

  it('retains manual entry when suggestions are over budget or unavailable', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchColumnValues).mockRejectedValue(new Error('Suggestions exceed budget'))
    render(<GenericFilterCard {...props} />)
    await screen.findByText('Kunne ikke hente forslag — du kan fortsatt skrive verdien manuelt')
    await user.type(screen.getByRole('combobox', { name: 'Verdi' }), 'My browser{Enter}')
    expect(props.updateFilter).toHaveBeenLastCalledWith(0, {
      operator: '=',
      value: 'My browser',
      multipleValues: ['My browser'],
    })
  })

  it('discards suggestions from the previous website even when its request finishes late', async () => {
    let resolveOld!: (result: { values: string[]; scannedDays: number }) => void
    vi.mocked(fetchColumnValues)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce({ values: ['Firefox'], scannedDays: 14 })
    const { rerender } = render(<GenericFilterCard {...props} />)
    rerender(<GenericFilterCard {...props} websiteId="site-2" />)
    await screen.findByText('Forslag fra siste 14 dager')
    await act(async () => {
      resolveOld({ values: ['Old browser'], scannedDays: 7 })
      await Promise.resolve()
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Verdi' }))
    expect(screen.getByRole('option', { name: 'Firefox' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Old browser' })).not.toBeInTheDocument()
    expect(screen.queryByText('Forslag fra siste 7 dager')).not.toBeInTheDocument()
  })
})
