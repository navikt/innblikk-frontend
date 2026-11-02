import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardWidget } from './DashboardWidget'
import { executeBigQuery } from '../api/bigquery'
import type { SavedChart } from '../../../shared/types/savedChart'
import { getDateRangeFromPeriod } from '../../../shared/lib/utils'

vi.mock('../api/bigquery', () => ({ executeBigQuery: vi.fn() }))
vi.mock('../../analysis/ui/AnalysisActionModal.tsx', () => ({ default: () => null }))
vi.mock('../../../shared/ui/TransferToMetabaseDialog.tsx', () => ({ default: () => null }))
vi.mock('./widget/DashboardWidgetLineChart.tsx', () => ({ default: () => null }))
vi.mock('./widget/DashboardWidgetBarChart.tsx', () => ({ default: () => null }))
vi.mock('./widget/DashboardWidgetPieChart.tsx', () => ({ default: () => null }))
vi.mock('./widget/DashboardWidgetSiteimprove.tsx', () => ({ default: () => null }))

const filters = {
  urlFilters: [],
  dateRange: 'last_7_days',
  pathOperator: 'equals',
  metricType: 'visitors' as const,
}
const baseSql =
  "SELECT event_name, COUNT(*) AS count FROM `project.umami_views.event` e WHERE e.website_id = '{{website_id}}' [[AND {{created_at}}]]"
const directive = '-- @filter event {"label":"Hendelse","options":["paid","signup"]}\n'
const chart: SavedChart = {
  id: 'one',
  title: 'Hendelser',
  type: 'table',
  sql: `${directive}${baseSql} AND event_name = {{event}} GROUP BY event_name`,
}

describe('dashboard custom SQL filters', () => {
  beforeEach(() => {
    vi.mocked(executeBigQuery)
      .mockReset()
      .mockResolvedValue({ data: [{ event_name: 'result', count: 3 }] })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('guides users to fill required filters, fetches the selection, and returns to info when cleared', async () => {
    const user = userEvent.setup()
    render(<DashboardWidget chart={chart} websiteId="website-1" filters={filters} />)
    const message = screen.getByText(/Velg eller fyll ut «Hendelse»/)
    expect(message.closest('[data-variant]')).toHaveAttribute('data-variant', 'info')
    expect(executeBigQuery).not.toHaveBeenCalled()
    const input = screen.getByRole('combobox', { name: 'Hendelse' })
    expect(input).not.toHaveAttribute('aria-describedby')
    await user.click(input)
    await user.click(screen.getByRole('option', { name: 'paid' }))
    expect(await screen.findByText('result')).toBeInTheDocument()
    expect(executeBigQuery).toHaveBeenCalledOnce()
    expect(executeBigQuery).toHaveBeenCalledWith(expect.stringContaining("AND event_name = 'paid'"), 'Dashboard')
    expect(vi.mocked(executeBigQuery).mock.calls[0][0]).not.toMatch(/\{\{|\[\[/)
    await user.click(input)
    await user.keyboard('{Backspace}')
    expect(screen.getByText(/Velg eller fyll ut «Hendelse»/)).toBeInTheDocument()
    expect(screen.queryByText('result')).not.toBeInTheDocument()
    expect(executeBigQuery).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Tøm' })).not.toBeInTheDocument()
  })

  it('runs blank optional filters without their condition, and reapplies them when selected', async () => {
    const user = userEvent.setup()
    const optionalChart = { ...chart, sql: `${directive}${baseSql} [[AND event_name = {{event}}]] GROUP BY event_name` }
    render(<DashboardWidget chart={optionalChart} websiteId="website-1" filters={filters} />)
    await screen.findByText('result')
    expect(vi.mocked(executeBigQuery).mock.calls[0][0]).not.toMatch(/event_name\s*=/)
    await user.click(screen.getByRole('combobox', { name: 'Hendelse' }))
    await user.click(screen.getByRole('option', { name: 'signup' }))
    await waitFor(() => expect(executeBigQuery).toHaveBeenCalledTimes(2))
    expect(vi.mocked(executeBigQuery).mock.calls[1][0]).toContain("event_name = 'signup'")
    expect(screen.queryByText(/Velg eller fyll ut/)).not.toBeInTheDocument()
  })

  it('keeps equally named filters isolated to their own card', async () => {
    const user = userEvent.setup()
    render(
      <>
        <section aria-label="First card">
          <DashboardWidget chart={chart} websiteId="website-1" filters={filters} />
        </section>
        <section aria-label="Second card">
          <DashboardWidget chart={{ ...chart, id: 'two' }} websiteId="website-2" filters={filters} />
        </section>
      </>,
    )
    const first = within(screen.getByRole('region', { name: 'First card' }))
    const second = within(screen.getByRole('region', { name: 'Second card' }))
    await user.click(first.getByRole('combobox', { name: 'Hendelse' }))
    await user.click(first.getByRole('option', { name: 'paid' }))
    await first.findByText('result')
    expect(second.getByText(/Velg eller fyll ut «Hendelse»/)).toBeInTheDocument()
    expect(executeBigQuery).toHaveBeenCalledOnce()
    expect(vi.mocked(executeBigQuery).mock.calls[0][0]).toContain("website_id = 'website-1'")
  })

  it('loads event suggestions for the card website and active period, including manual values', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ events: [{ name: 'suggested-event' }] }))),
      )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    const dynamicChart = { ...chart, sql: `${baseSql} AND e.event_name = {{Hendelse}} GROUP BY event_name` }
    const { rerender } = render(<DashboardWidget chart={dynamicChart} websiteId="website-1" filters={filters} />)
    const input = screen.getByRole('combobox', { name: 'Hendelse' })
    await user.click(input)
    await user.click(await screen.findByRole('option', { name: 'suggested-event' }))
    await screen.findByText('result')
    const range = getDateRangeFromPeriod(filters.dateRange)!
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/bigquery/websites/website-1/events?startAt=${range.startDate.getTime()}&endAt=${range.endDate.getTime()}`,
    )
    rerender(
      <DashboardWidget
        chart={dynamicChart}
        websiteId="website-2"
        filters={{ ...filters, dateRange: 'last_28_days' }}
      />,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toEqual(expect.stringContaining('/websites/website-2/events?'))
    await user.click(input)
    await user.keyboard('{Backspace}')
    await user.type(input, 'custom-event{Enter}')
    await waitFor(() =>
      expect(executeBigQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("event_name = 'custom-event'"),
        'Dashboard',
      ),
    )
  })

  it('ignores a late response from a previous selection', async () => {
    let resolveOld: (result: unknown) => void = () => {
      throw new Error('Request not started')
    }
    vi.mocked(executeBigQuery)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce({ data: [{ event_name: 'current', count: 5 }] })
    const user = userEvent.setup()
    render(<DashboardWidget chart={chart} websiteId="website-1" filters={filters} />)
    const input = screen.getByRole('combobox', { name: 'Hendelse' })
    await user.click(input)
    await user.click(screen.getByRole('option', { name: 'paid' }))
    await waitFor(() => expect(executeBigQuery).toHaveBeenCalledOnce())
    await user.click(input)
    await user.keyboard('{Backspace}')
    await user.click(input)
    await user.click(screen.getByRole('option', { name: 'signup' }))
    await screen.findByText('current')
    await act(async () => {
      resolveOld({ data: [{ event_name: 'stale', count: 1 }] })
      await Promise.resolve()
    })
    expect(screen.queryByText('stale')).not.toBeInTheDocument()
    expect(screen.getByText('current')).toBeInTheDocument()
  })

  it('does not replace real query errors with missing-input guidance', async () => {
    vi.mocked(executeBigQuery).mockRejectedValueOnce(new Error('Invalid column'))
    render(<DashboardWidget chart={{ ...chart, sql: baseSql }} websiteId="website-1" filters={filters} />)
    const message = await screen.findByText('Invalid column')
    expect(message.closest('[data-variant]')).toHaveAttribute('data-variant', 'error')
    expect(screen.queryByRole('combobox', { name: 'Hendelse' })).not.toBeInTheDocument()
  })

  it('does not use prefetched unfiltered results for a custom-filtered chart', () => {
    render(
      <DashboardWidget
        chart={chart}
        websiteId="website-1"
        filters={filters}
        prefetchedData={[{ event_name: 'unfiltered', count: 99 }]}
      />,
    )
    expect(screen.getByText(/Velg eller fyll ut «Hendelse»/)).toBeInTheDocument()
    expect(screen.queryByText('unfiltered')).not.toBeInTheDocument()
    expect(executeBigQuery).not.toHaveBeenCalled()
  })
})
