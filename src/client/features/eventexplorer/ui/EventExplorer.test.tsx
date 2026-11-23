import { useEffect, type ReactNode } from 'react'
import { format } from 'date-fns'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider, useLocation, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventExplorer from './EventExplorer'
import * as api from '../api/eventExplorerApi'

vi.mock('../api/eventExplorerApi', () => ({
  fetchEvents: vi.fn(),
  fetchEventSeries: vi.fn(),
  fetchEventProperties: vi.fn(),
  fetchParameterValues: vi.fn(),
  fetchLatestEvents: vi.fn(),
}))

vi.mock('../../analysis/ui/ChartLayout.tsx', () => ({
  default: function MockChartLayout({
    children,
    sidebarContent,
    filters,
  }: {
    children: ReactNode
    sidebarContent: ReactNode
    filters: ReactNode
  }) {
    const { search, hash } = useLocation()
    const params = new URLSearchParams(search)
    params.delete('event')
    params.delete('parameter')
    return (
      <>
        <Link to={`/utforsk-hendelser?${params}${hash}`}>Hendelser i sidemenyen</Link>
        {sidebarContent}
        {filters}
        {children}
      </>
    )
  },
}))
vi.mock('../../analysis/ui/WebsitePicker.tsx', () => ({
  default: function MockWebsitePicker({
    selectedWebsite,
    onWebsiteChange,
  }: {
    selectedWebsite: { id: string } | null
    onWebsiteChange: (site: { id: string; name: string; domain: string }) => void
  }) {
    const [params] = useSearchParams()
    useEffect(() => {
      const id = params.get('websiteId') || 'one'
      if (selectedWebsite?.id !== id) onWebsiteChange({ id, name: id, domain: `${id}.no` })
    }, [params, selectedWebsite, onWebsiteChange])
    return <div data-testid="website">{selectedWebsite?.id}</div>
  },
}))
vi.mock('../../analysis/ui/PeriodPicker.tsx', () => ({
  default: ({
    period,
    startDate,
    endDate,
    onPeriodChange,
    onStartDateChange,
    onEndDateChange,
  }: {
    period: string
    startDate?: Date
    endDate?: Date
    onPeriodChange: (value: string) => void
    onStartDateChange: (value: Date) => void
    onEndDateChange: (value: Date) => void
  }) => (
    <div>
      <span data-testid="period">{period}</span>
      <span data-testid="dates">
        {startDate && format(startDate, 'yyyy-MM-dd')}:{endDate && format(endDate, 'yyyy-MM-dd')}
      </span>
      <button onClick={() => onPeriodChange('last_7_days')}>Change period</button>
      <button
        onClick={() => {
          onStartDateChange(new Date(2025, 1, 2))
          onEndDateChange(new Date(2025, 1, 12))
          onPeriodChange('custom')
        }}
      >
        Custom period
      </button>
    </div>
  ),
}))
vi.mock('../../analysis/ui/UrlPathFilter.tsx', () => ({
  default: ({ urlPaths, pathOperator }: { urlPaths: string[]; pathOperator: string }) => (
    <div data-testid="paths">
      {urlPaths.join(',')}:{pathOperator}
    </div>
  ),
}))
vi.mock('./EventSeriesChart.tsx', () => ({ default: () => <div>Chart</div> }))
vi.mock('../../chartbuilder-next', () => ({ SqlViewer: () => null }))
vi.mock('../../../shared/ui/AddToDashboardDialog.tsx', () => ({ default: () => null }))
vi.mock('../../../shared/ui/TransferToMetabaseDialog.tsx', () => ({ default: () => null }))
vi.mock('../../../shared/lib/trackEvent.ts', () => ({ trackEvent: vi.fn() }))

const common = 'websiteId=one&period=last_28_days&urlPath=%2Fhei%2Bdu&pathOperator=contains&metricType=visitors'
const site = (id: string) => ({ id, name: id, domain: `${id}.no` })

function setup(initialEntry: string) {
  const router = createMemoryRouter(
    [
      { path: '/utforsk-hendelser', element: <EventExplorer /> },
      { path: '/utforsk-hendelser/hendelse', element: <EventExplorer /> },
      { path: '/utforsk-hendelser/hendelse/parameter', element: <EventExplorer /> },
    ],
    { initialEntries: [initialEntry] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  vi.mocked(api.fetchEvents).mockResolvedValue({ events: [{ name: 'event + space', count: 5 }] })
  vi.mocked(api.fetchEventSeries).mockResolvedValue({ data: [{ time: '2025-01-01', count: 5 }] })
  vi.mocked(api.fetchEventProperties).mockResolvedValue({ properties: [{ propertyName: 'param + space', total: 5 }] })
  vi.mocked(api.fetchParameterValues).mockResolvedValue({ values: [{ value: 'value', count: 5 }] })
  vi.mocked(api.fetchLatestEvents).mockResolvedValue({ events: [] })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: () => Promise.resolve({ data: [site('one'), site('two')] }) }),
  )
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('Event explorer routing', () => {
  it('uses links and push history for event and parameter, preserving context and encoding', async () => {
    const router = setup(`/utforsk-hendelser?${common}#chart`)
    const eventLink = await screen.findByRole('link', { name: 'Utforsk' })
    expect(eventLink.getAttribute('href')).toContain('event=event+%2B+space')
    const modifiedClick = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    fireEvent(eventLink, modifiedClick)
    expect(modifiedClick.defaultPrevented).toBe(false)
    expect(router.state.location.pathname).toBe('/utforsk-hendelser')
    fireEvent.click(eventLink)
    expect(router.state.location.pathname).toBe('/utforsk-hendelser/hendelse')
    expect(router.state.location.hash).toBe('#chart')
    expect(new URLSearchParams(router.state.location.search).get('event')).toBe('event + space')
    const paramLink = await screen.findByRole('link', { name: 'Utforsk' })
    expect(paramLink.getAttribute('href')).toContain('parameter=param+%2B+space')
    fireEvent.click(paramLink)
    expect(router.state.location.pathname).toBe('/utforsk-hendelser/hendelse/parameter')
    expect(new URLSearchParams(router.state.location.search).get('metricType')).toBe('visitors')
    expect(await screen.findByRole('heading', { name: 'param + space' })).toBeTruthy()
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/utforsk-hendelser/hendelse')
    expect(new URLSearchParams(router.state.location.search).has('parameter')).toBe(false)
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/utforsk-hendelser')
    await act(() => router.navigate(1))
    await act(() => router.navigate(1))
    expect(router.state.location.pathname).toBe('/utforsk-hendelser/hendelse/parameter')
    fireEvent.click(screen.getByRole('link', { name: 'Hendelser i sidemenyen' }))
    expect(router.state.location.pathname).toBe('/utforsk-hendelser')
    expect(new URLSearchParams(router.state.location.search).has('event')).toBe(false)
    expect(router.state.location.hash).toBe('#chart')
  })

  it('replaces legacy URLs and normalizes incomplete deep links before fetching', async () => {
    const router = setup(`/utforsk-hendelser?${common}&event=event%20%2B%20space#details`)
    await waitFor(() => expect(router.state.location.pathname).toBe('/utforsk-hendelser/hendelse'))
    expect(router.state.location.hash).toBe('#details')
    expect(await screen.findByRole('heading', { name: 'Hendelse: event + space' })).toBeTruthy()
    expect(api.fetchEvents).not.toHaveBeenCalled()
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/utforsk-hendelser/hendelse')
    await act(() => router.navigate(`/utforsk-hendelser/hendelse/parameter?${common}#x`))
    await waitFor(() => expect(router.state.location.pathname).toBe('/utforsk-hendelser'))
    expect(router.state.location.hash).toBe('#x')
    await act(() => router.navigate(`/utforsk-hendelser/hendelse/parameter?${common}&event=event%2Bname#x`))
    await waitFor(() => expect(router.state.location.pathname).toBe('/utforsk-hendelser/hendelse'))
    expect(screen.getByRole('heading', { name: 'Hendelse: event+name' })).toBeTruthy()
  })

  it('restores a deep link after refresh and common filters on same-route navigation', async () => {
    const url = `/utforsk-hendelser/hendelse/parameter?${common}&event=event+%2B+space&parameter=param+%2B+space#refresh`
    let router = setup(url)
    expect(await screen.findByRole('heading', { name: 'param + space' })).toBeTruthy()
    cleanup()
    router = setup(url)
    expect(await screen.findByRole('heading', { name: 'param + space' })).toBeTruthy()
    await act(() =>
      router.navigate(
        '/utforsk-hendelser/hendelse/parameter?websiteId=two&period=custom&from=2025-01-01&to=2025-01-10&urlPath=%2Fnew&pathOperator=equals&event=event+%2B+space&parameter=param+%2B+space#other',
      ),
    )
    await waitFor(() => expect(screen.getByTestId('website').textContent).toBe('two'))
    expect(screen.getByTestId('period').textContent).toBe('custom')
    expect(screen.getByTestId('dates').textContent).toBe('2025-01-01:2025-01-10')
    expect(screen.getByTestId('paths').textContent).toBe('/new:equals')
    await waitFor(() =>
      expect(api.fetchEventSeries).toHaveBeenLastCalledWith(
        expect.objectContaining({ websiteId: 'two', urlPath: '/new' }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change period' }))
    expect(router.state.location.hash).toBe('#other')
    expect(new URLSearchParams(router.state.location.search).get('period')).toBe('last_7_days')
    fireEvent.click(screen.getByRole('button', { name: 'Custom period' }))
    const updated = new URLSearchParams(router.state.location.search)
    expect(updated.get('period')).toBe('custom')
    expect(updated.get('from')).toBe('2025-02-02')
    expect(updated.get('to')).toBe('2025-02-12')
  })

  it('does not let a late list request change the selected screen', async () => {
    let resolve!: (result: { events: { name: string; count: number }[] }) => void
    vi.mocked(api.fetchEvents).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const router = setup(`/utforsk-hendelser?${common}`)
    await waitFor(() => expect(api.fetchEvents).toHaveBeenCalled())
    await act(() => router.navigate(`/utforsk-hendelser/hendelse?${common}&event=other#detail`))
    await act(() => Promise.resolve().then(() => resolve({ events: [{ name: 'old', count: 1 }] })))
    expect(router.state.location.pathname).toBe('/utforsk-hendelser/hendelse')
    expect(new URLSearchParams(router.state.location.search).get('event')).toBe('other')
    expect(within(document.body).queryByText('old')).toBeNull()
    expect(router.state.location.hash).toBe('#detail')
  })
})
