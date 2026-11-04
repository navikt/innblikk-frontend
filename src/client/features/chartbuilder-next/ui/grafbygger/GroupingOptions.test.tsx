import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { vi } from 'vitest'
import { FILTER_COLUMNS } from '../../../../shared/lib/constants.ts'
import type { Filter } from '../../../../shared/types/chart.ts'
import GroupingOptions from './GroupingOptions.tsx'
import { setEventSelection } from '../../utils/eventSelection.ts'

vi.mock('../../../../shared/lib/trackEvent.ts', () => ({
  trackEvent: vi.fn(),
}))

function Harness({
  edition = 'next',
  initial = [],
  filters = [],
  onEnableCustomEvents = vi.fn(),
  setDateFormat = vi.fn(),
}: {
  edition?: 'current' | 'next'
  initial?: string[]
  filters?: Filter[]
  onEnableCustomEvents?: () => void
  setDateFormat?: (format: string) => void
}) {
  const [groupByFields, setGroupByFields] = useState(initial)
  return (
    <GroupingOptions
      edition={edition}
      groupByFields={groupByFields}
      parameters={[]}
      dateFormat="day"
      DATE_FORMATS={[
        { label: 'Dag', value: 'day', format: '%Y-%m-%d' },
        { label: 'Måned', value: 'month', format: '%Y-%m' },
      ]}
      COLUMN_GROUPS={FILTER_COLUMNS}
      sanitizeColumnName={(key) => key}
      addGroupByField={(field) => setGroupByFields((previous) => [...previous, field])}
      removeGroupByField={(field) => setGroupByFields((previous) => previous.filter((value) => value !== field))}
      moveGroupField={vi.fn()}
      setDateFormat={setDateFormat}
      filters={filters}
      onEnableCustomEvents={onEnableCustomEvents}
    />
  )
}

describe('GroupingOptions', () => {
  it('uses the same URL names as filters in the shortcuts, accordion and reorder list', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['url_path', 'url_query']} />)
    await user.click(screen.getByRole('button', { name: 'Sidedetaljer (2)' }))
    expect(screen.getByRole('checkbox', { name: 'Parameter (URL)' })).toBeChecked()
    expect(screen.getAllByRole('checkbox', { name: 'Side (URL)' })).toHaveLength(2)
    expect(screen.queryByRole('checkbox', { name: 'URL-spørring' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Side og parametere (URL)' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Referrer (domene)' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Referrer (side)' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Henvisningsdomene' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /^Endre rekkefølge på grupperinger/ }))
    expect(screen.getByText('Parameter (URL)', { selector: 'span.font-medium' })).toBeVisible()
    expect(screen.getByText('Side (URL)', { selector: 'span.font-medium' })).toBeVisible()
  })
  const multipleEvents = setEventSelection([], false, true, {
    column: 'event_name',
    operator: 'IN',
    value: 'signup',
    multipleValues: ['signup', 'paid'],
  })

  it('shows date, URL path and event name shortcuts before the accordions', () => {
    render(<Harness filters={multipleEvents} />)
    const shortcuts = screen.getAllByRole('checkbox').slice(0, 3)
    for (const [index, name] of ['Dato', 'Side (URL)', 'Hendelsesnavn'].entries()) {
      expect(shortcuts[index]).toHaveAccessibleName(name)
      expect(shortcuts[index]).toBeVisible()
      expect(shortcuts[index]).not.toBeChecked()
    }
  })

  it('keeps only the date shortcut in the current edition', () => {
    render(<Harness edition="current" filters={multipleEvents} />)
    expect(screen.getAllByRole('checkbox')[0]).toHaveAccessibleName('Dato')
    expect(screen.getAllByRole('checkbox', { name: 'URL-sti' })).toHaveLength(1)
    expect(screen.getAllByRole('checkbox', { name: 'Hendelsesnavn' })).toHaveLength(1)
  })

  it.each([
    ['no events', setEventSelection([], false, false), false],
    ['pageviews only', setEventSelection([], true, false), false],
    ['all custom events', setEventSelection([], false, true), false],
    [
      'one custom event',
      setEventSelection([], false, true, { column: 'event_name', operator: '=', value: 'signup' }),
      false,
    ],
    [
      'pageviews and one custom event',
      setEventSelection([], true, true, {
        column: 'event_name',
        operator: 'IN',
        value: 'signup',
        multipleValues: ['signup'],
      }),
      true,
    ],
    ['two custom events', multipleEvents, true],
    [
      'duplicate custom event names',
      setEventSelection([], false, true, {
        column: 'event_name',
        operator: 'IN',
        value: 'signup',
        multipleValues: ['signup', 'signup'],
      }),
      false,
    ],
  ])('only shows the shortcut for multiple selected events: %s', (_label, filters, visible) => {
    render(<Harness filters={filters} />)
    expect(screen.getAllByRole('checkbox', { name: 'Hendelsesnavn' })).toHaveLength(visible ? 2 : 1)
  })

  it('hides the shortcut when selection shrinks without clearing grouping in the accordion', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness initial={['event_name']} filters={multipleEvents} />)
    expect(screen.getAllByRole('checkbox', { name: 'Hendelsesnavn' })).toHaveLength(2)
    rerender(
      <Harness
        initial={['event_name']}
        filters={setEventSelection([], false, true, { column: 'event_name', operator: '=', value: 'signup' })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Hendelser (1)' }))
    const checkbox = screen.getByRole('checkbox', { name: 'Hendelsesnavn' })
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('keeps URL path shortcuts and accordion choices in sync', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getAllByRole('checkbox', { name: 'Side (URL)' })[0])
    await user.click(screen.getByRole('button', { name: 'Sidedetaljer (1)' }))
    const checkboxes = screen.getAllByRole('checkbox', { name: 'Side (URL)' })
    expect(checkboxes).toHaveLength(2)
    checkboxes.forEach((checkbox) => expect(checkbox).toBeChecked())
    await user.click(checkboxes[1])
    checkboxes.forEach((checkbox) => expect(checkbox).not.toBeChecked())
  })

  it('still enables custom events when selecting event name in the accordion', async () => {
    const user = userEvent.setup()
    const onEnableCustomEvents = vi.fn()
    render(<Harness onEnableCustomEvents={onEnableCustomEvents} />)
    await user.click(screen.getByRole('button', { name: 'Hendelser' }))
    const checkbox = screen.getAllByRole('checkbox', { name: 'Hendelsesnavn' })[0]
    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(onEnableCustomEvents).toHaveBeenCalledTimes(1)
    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
    expect(onEnableCustomEvents).toHaveBeenCalledTimes(1)
  })

  it('restores selected shortcuts without re-enabling custom events', async () => {
    const user = userEvent.setup()
    const onEnableCustomEvents = vi.fn()
    render(
      <Harness
        initial={['url_path', 'event_name']}
        filters={multipleEvents}
        onEnableCustomEvents={onEnableCustomEvents}
      />,
    )
    expect(screen.getAllByRole('checkbox', { name: 'Side (URL)' })[0]).toBeChecked()
    const checkbox = screen.getAllByRole('checkbox', { name: 'Hendelsesnavn' })[0]
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    await user.click(checkbox)
    expect(onEnableCustomEvents).not.toHaveBeenCalled()
  })

  it('preserves date format selection alongside the shortcuts', async () => {
    const user = userEvent.setup()
    const setDateFormat = vi.fn()
    render(<Harness setDateFormat={setDateFormat} />)
    expect(screen.queryByRole('combobox', { name: 'Visning per' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Dato' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Visning per' }), 'month')
    expect(setDateFormat).toHaveBeenCalledWith('month')
    await user.click(screen.getByRole('checkbox', { name: 'Dato' }))
    expect(screen.queryByRole('combobox', { name: 'Visning per' })).not.toBeInTheDocument()
  })
})
