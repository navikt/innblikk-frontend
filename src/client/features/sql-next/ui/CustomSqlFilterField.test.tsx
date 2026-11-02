import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomSqlFilterField from './CustomSqlFilterField'
import type { CustomSqlFilter } from '../../sql/utils/customSqlFilters'

const dateRange = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-31T23:59:59Z') }
const filter: CustomSqlFilter = { name: 'event', label: 'Hendelse', optional: true, source: 'event_name' }
const response = (names: string[]) =>
  new Response(JSON.stringify({ events: names.map((name) => ({ name })) }), {
    headers: { 'Content-Type': 'application/json' },
  })

function Field({ definition = filter }: { definition?: CustomSqlFilter }) {
  const [value, setValue] = useState('')
  return (
    <>
      <CustomSqlFilterField
        filter={definition}
        value={value}
        onChange={setValue}
        websiteIds={['first', 'second', 'first']}
        dateRange={dateRange}
      />
      <output aria-label="Filterverdi">{value}</output>
    </>
  )
}

describe('custom SQL filter fields', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads unique suggestions lazily for all selected websites and the selected period, then selects and clears', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(['signup', 'paid']))
      .mockResolvedValueOnce(response(['paid']))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<Field />)
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('combobox', { name: 'Hendelse' }))
    const option = await screen.findByRole('option', { name: 'paid' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/bigquery/websites/first/events?startAt=${dateRange.from.getTime()}&endAt=${dateRange.to.getTime()}`,
    )
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
    expect(screen.getAllByRole('option', { name: 'paid' })).toHaveLength(1)
    await user.click(option)
    expect(screen.getByLabelText('Filterverdi')).toHaveTextContent('paid')
    expect(screen.queryByRole('button', { name: /Tøm/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Hendelse' }))
    await user.keyboard('{Backspace}')
    expect(screen.getByLabelText('Filterverdi')).toBeEmptyDOMElement()
    expect(screen.queryByText(/Tomt felt viser alle/)).not.toBeInTheDocument()
  })

  it('supports searchable static options and manual values without fetching events', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<Field definition={{ name: 'device', label: 'Enhet', optional: false, options: ['mobile', 'desktop'] }} />)
    const input = screen.getByRole('combobox', { name: 'Enhet' })
    await user.type(input, 'desk')
    expect(screen.getByRole('option', { name: 'desktop' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'mobile' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'desktop' }))
    expect(screen.getByLabelText('Filterverdi')).toHaveTextContent('desktop')
    await user.click(input)
    await user.keyboard('{Backspace}')
    await user.type(input, 'custom{Enter}')
    expect(screen.getByLabelText('Filterverdi')).toHaveTextContent('custom')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/Må fylles ut/)).not.toBeInTheDocument()
  })

  it('keeps plain custom filters as text fields and exposes invalid metadata', async () => {
    const user = userEvent.setup()
    render(<Field definition={{ name: 'minimum', label: 'Minimum', optional: true, error: 'Ugyldig @filter' }} />)
    await user.type(screen.getByRole('textbox', { name: 'Minimum' }), '42')
    expect(screen.getByLabelText('Filterverdi')).toHaveTextContent('42')
    await user.keyboard('{Backspace}')
    expect(screen.getByLabelText('Filterverdi')).toHaveTextContent('4')
    expect(screen.getByText('Ugyldig @filter')).toBeInTheDocument()
  })

  it('shows loading errors, allows manual entry and can retry', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<Field />)
    const input = screen.getByRole('combobox', { name: 'Hendelse' })
    await user.click(input)
    expect(await screen.findByText(/Forslag kunne ikke lastes: Unavailable/)).toBeInTheDocument()
    await user.type(input, 'manual{Enter}')
    expect(screen.getByLabelText('Filterverdi')).toHaveTextContent('manual')
    fetchMock.mockImplementation(() => Promise.resolve(response(['retry-event'])))
    await user.click(screen.getByRole('button', { name: 'Prøv igjen' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await user.click(input)
    expect(await screen.findByRole('option', { name: 'retry-event' })).toBeInTheDocument()
  })

  it('clears stale suggestions and ignores old responses when the website or period changes', async () => {
    let resolveOld: (value: Response) => void = () => {
      throw new Error('Request not started')
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce(response(['current']))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    const props = { filter, value: '', onChange: vi.fn(), dateRange }
    const { rerender } = render(<CustomSqlFilterField {...props} websiteIds={['old']} />)
    await user.click(screen.getByRole('combobox', { name: 'Hendelse' }))
    rerender(<CustomSqlFilterField {...props} websiteIds={['new']} />)
    expect(await screen.findByRole('option', { name: 'current' })).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    await act(async () => {
      resolveOld(response(['stale']))
      await Promise.resolve()
    })
    expect(screen.queryByRole('option', { name: 'stale' })).not.toBeInTheDocument()
  })

  it('does not request unbounded suggestions when no website or valid period is selected', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    const props = { filter, value: '', onChange: vi.fn() }
    const { rerender } = render(<CustomSqlFilterField {...props} websiteIds={[]} dateRange={dateRange} />)
    await user.click(screen.getByRole('combobox', { name: 'Hendelse' }))
    expect(screen.getByText('Velg en nettside for å hente forslag.')).toBeInTheDocument()
    rerender(<CustomSqlFilterField {...props} websiteIds={['first']} dateRange={{ from: undefined, to: undefined }} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
