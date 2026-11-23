import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../cohortmanager/api/columnValuesApi.ts', () => ({
  fetchColumnValues: vi.fn(),
}))

vi.mock('../../analysis/ui/ChartLayout.tsx', () => ({
  default: ({
    title,
    sidebarContent,
    filters,
    children,
  }: {
    title: string
    sidebarContent?: React.ReactNode
    filters?: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      <h1>{title}</h1>
      <aside>{sidebarContent}</aside>
      <div>{filters}</div>
      <main>{children}</main>
    </div>
  ),
}))

import Funnel from './Funnel.tsx'
import { useFunnel } from '../hooks/useFunnel'
import { FUNNEL_REQUEST_TIMEOUT_MS } from '../api/funnelApi'
import { fetchColumnValues } from '../../cohortmanager/api/columnValuesApi.ts'
import { columnValuesSuggestions } from '../../cohortmanager/hooks/useColumnValueSuggestions.ts'

const FAKE_WEBSITES = [{ id: 'site-1', name: 'Nav.no - prod', domain: 'nav.no', createdAt: '2023-01-01T00:00:00Z' }]
const FAKE_FUNNEL_SQL = `WITH events AS (
  SELECT * FROM events
  WHERE website_id = 'site-1'
    AND created_at BETWEEN '2026-10-04T22:00:00.000Z' AND '2026-11-01T22:59:59.999Z'
)
SELECT 0 AS step, '/stillinger' AS url, 100 AS count`

function renderPage(entry = '/trakt') {
  window.history.replaceState({}, '', entry)
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Funnel />
    </MemoryRouter>,
  )
}

const getRefreshButton = () => screen.getAllByRole('button', { name: 'Oppdater' })[1]

describe('Funnel page', () => {
  beforeEach(() => {
    localStorage.clear()
    const dashboards = [{ id: 2, name: 'Dashboard', projectId: 1 }]
    columnValuesSuggestions.clearColumnValuesCache()
    vi.mocked(fetchColumnValues).mockReset()
    vi.mocked(fetchColumnValues).mockImplementation((_websiteId, column) =>
      Promise.resolve({
        values: column === 'event_data_key' ? ['hasSuperrask', 'category'] : ['1', '2', '3'],
        scannedDays: 30,
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/backend/projects/1/dashboards' && init?.method === 'POST') {
          const payload = JSON.parse(init.body as string) as { name: string }
          const created = { id: 20, name: payload.name, projectId: 1 }
          dashboards.push(created)
          return Promise.resolve(new Response(JSON.stringify(created)))
        }
        if (url === '/api/bigquery/funnel') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                sql: FAKE_FUNNEL_SQL,
                data: [
                  { step: 0, url: '/stillinger', count: 100 },
                  { step: 1, url: 'Stillingsvisning', count: 20 },
                ],
              }),
          })
        }
        if (url.endsWith('/queries') && init?.method === 'POST' && typeof init.body === 'string') {
          const payload: unknown = JSON.parse(init.body)
          if (
            typeof payload !== 'object' ||
            payload === null ||
            !('sqlText' in payload) ||
            typeof payload.sqlText !== 'string' ||
            !/^(?:SELECT|WITH)\b/i.test(payload.sqlText.trim())
          ) {
            return Promise.resolve(
              new Response(JSON.stringify({ error: 'Only SELECT queries are allowed' }), { status: 400 }),
            )
          }
        }
        const backendData: Record<string, unknown> = {
          '/api/backend/projects': [{ id: 1, name: 'Team' }],
          '/api/backend/projects/1/dashboards': dashboards,
          '/api/backend/projects/1/dashboards/2/categories': [{ id: 3, name: 'Fane 1', dashboardId: 2 }],
          '/api/backend/projects/1/dashboards/2/categories/3/graphs': { id: 4, name: 'Trakt', categoryId: 3 },
          '/api/backend/projects/1/dashboards/2/categories/3/graphs/4/queries': { id: 5, name: 'Trakt', graphId: 4 },
          '/api/backend/projects/1/dashboards/20/categories': [{ id: 30, name: 'Fane 1', dashboardId: 20 }],
          '/api/backend/projects/1/dashboards/20/categories/30/graphs': { id: 40, name: 'Trakt', categoryId: 30 },
          '/api/backend/projects/1/dashboards/20/categories/30/graphs/40/queries': {
            id: 50,
            name: 'Trakt',
            graphId: 40,
          },
        }
        if (url in backendData) {
          return Promise.resolve(new Response(JSON.stringify(backendData[url])))
        }
        if (url.includes('/events?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ events: [{ name: 'Stillingsvisning' }, { name: 'Annen hendelse' }] }),
          })
        }
        if (url.includes('/api/bigquery/websites')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: FAKE_WEBSITES }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /^trakt$/i })).toBeInTheDocument()
    await screen.findByRole('combobox', { name: /nettside/i })
  })

  it('renders the website picker', async () => {
    renderPage()
    expect(await screen.findByRole('combobox', { name: /nettside/i })).toBeInTheDocument()
  })

  it('renders the steps sidebar', async () => {
    renderPage()
    expect(await screen.findByText(/steg i trakten/i)).toBeInTheDocument()
  })

  it('only queries on refresh and keeps detail filters when the shared page is reopened', async () => {
    const user = userEvent.setup()
    const params = new URLSearchParams({ websiteId: 'site-1', strict: 'false' })
    params.append('step', 'url:/stillinger')
    params.append('step', 'event:Stillingsvisning|anywhere|param:hasSuperrask=1')
    const page = renderPage(`/trakt?${params}`)
    const refresh = (await screen.findAllByRole('button', { name: 'Oppdater' }))[1]
    await waitFor(() => expect(refresh).toBeEnabled())

    await user.type(screen.getByRole('combobox', { name: 'URL-sti' }), '/stillinger/test')
    await user.tab()
    await new Promise((resolve) => setTimeout(resolve, 400))
    const queryCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/bigquery/funnel')
    expect(queryCalls()).toHaveLength(0)

    await user.click(refresh)
    await screen.findByRole('heading', { name: 'Resultater' })
    expect(queryCalls()).toHaveLength(1)
    expect(queryCalls()[0][1]?.body).toContain('"value":"/stillinger/test"')
    expect(queryCalls()[0][1]?.body).toContain('"key":"hasSuperrask","value":"1","operator":"equals"')
    const shareUrl = `${window.location.pathname}${window.location.search}`
    expect(new URLSearchParams(window.location.search).getAll('step')[1]).toContain('param:hasSuperrask=1')

    page.unmount()
    renderPage(shareUrl)
    await waitFor(() => expect(getRefreshButton()).toBeEnabled())
    expect(screen.getByRole('combobox', { name: 'Detalj' }).closest('.cohort-suggesting-value')).toHaveTextContent(
      'hasSuperrask',
    )
    expect(queryCalls()).toHaveLength(1)
    await user.click(getRefreshButton())
    await screen.findByRole('heading', { name: 'Resultater' })
    expect(queryCalls()).toHaveLength(2)
    expect(queryCalls()[1][1]?.body).toBe(queryCalls()[0][1]?.body)
  })

  function renderEventPage() {
    const params = new URLSearchParams({ websiteId: 'site-1' })
    params.append('step', 'url:')
    params.append('step', 'event:Stillingsvisning|anywhere')
    return renderPage(`/trakt?${params}`)
  }

  it('moves complete steps, retains focus and sends the new order when refreshed', async () => {
    const user = userEvent.setup()
    const params = new URLSearchParams({ websiteId: 'site-1' })
    params.append('step', 'url:/stillinger')
    params.append('step', 'url:/finish')
    params.append('step', 'event:Stillingsvisning|anywhere|param:hasSuperrask=1')
    renderPage(`/trakt?${params}`)
    await waitFor(() => expect(getRefreshButton()).toBeEnabled())
    const move = screen.getByRole('button', { name: 'Flytt steg 3 opp' })
    await user.click(move)
    expect(move).toHaveFocus()
    expect(move).toHaveAccessibleName('Flytt steg 2 opp')
    expect(screen.getByRole('status')).toHaveTextContent('Steg 3 flyttet til plass 2')
    await user.click(getRefreshButton())
    await screen.findByRole('heading', { name: 'Resultater' })
    const request = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/bigquery/funnel')
    const body = JSON.parse(request?.[1]?.body as string) as {
      steps: { value: string; params?: unknown; id?: string }[]
    }
    expect(body.steps.map((step) => step.value)).toEqual(['/stillinger', 'Stillingsvisning', '/finish'])
    expect(body.steps[1].params).toEqual([{ key: 'hasSuperrask', value: '1', operator: 'equals' }])
    expect(body.steps.some((step) => step.id)).toBe(false)
  })

  it('saves a visual funnel using backend-compatible TABLE storage and dynamic dashboard dates', async () => {
    const user = userEvent.setup()
    const params = new URLSearchParams({ websiteId: 'site-1' })
    params.append('step', 'url:/stillinger')
    params.append('step', 'event:Stillingsvisning|anywhere')
    params.set('view', 'horizontal')
    renderPage(`/trakt?${params}`)
    await waitFor(() => expect(getRefreshButton()).toBeEnabled())
    await user.click(getRefreshButton())
    expect(screen.getByRole('tab', { name: 'Horisontal' })).toHaveAttribute('aria-selected', 'true')
    await user.click(await screen.findByRole('button', { name: 'Legg til i dashboard' }))
    const dialog = screen.getByRole('dialog', { name: 'Legg til i dashboard' })
    const name = within(dialog).getByRole('textbox', { name: 'Grafnavn' })
    expect(name).toHaveValue('')
    expect(dialog.querySelector('input, select')).toBe(name)
    expect(within(dialog).queryByRole('combobox', { name: 'Nettside' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/backend/projects/1/dashboards/2/categories', undefined),
    )
    const save = within(dialog).getByRole('button', { name: 'Legg til i dashboard' })
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Skriv et grafnavn')
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) => typeof url === 'string' && url.endsWith('/graphs') && init?.method === 'POST',
        ),
    ).toBe(false)
    await user.type(name, 'Min trakt')
    await user.click(save)
    expect(await screen.findByRole('button', { name: 'Gå til dashboard' })).toBeVisible()
    const graphRequest = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => typeof url === 'string' && url.endsWith('/graphs') && init?.method === 'POST')
    const queryRequest = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => typeof url === 'string' && url.endsWith('/queries') && init?.method === 'POST')
    expect(graphRequest?.[1]?.body).toContain('"graphType":"TABLE"')
    expect(graphRequest?.[1]?.body).toContain('"name":"Min trakt"')
    expect(queryRequest?.[1]?.body).toContain('/* @chart funnel horizontal */')
    expect(queryRequest?.[1]?.body).toContain('[[AND {{created_at}}]]')
    expect(queryRequest?.[1]?.body).not.toContain('2026-10-04')
  })

  it('suggests detail names and numeric values scoped to the website, event, and key', async () => {
    const user = userEvent.setup()
    renderEventPage()
    await user.click(await screen.findByRole('button', { name: 'Legg til filter' }))

    await waitFor(() =>
      expect(fetchColumnValues).toHaveBeenCalledWith('site-1', 'event_data_key', undefined, 'Stillingsvisning'),
    )
    expect(vi.mocked(fetchColumnValues).mock.calls.some(([, column]) => column === 'event_data_value')).toBe(false)

    await user.click(screen.getByRole('combobox', { name: 'Detalj' }))
    await user.click(await screen.findByRole('option', { name: 'hasSuperrask' }))
    await waitFor(() =>
      expect(fetchColumnValues).toHaveBeenCalledWith('site-1', 'event_data_value', 'hasSuperrask', 'Stillingsvisning'),
    )

    const value = screen.getByRole('combobox', { name: 'Verdi' })
    const valueEditor = within(value.closest<HTMLElement>('.cohort-suggesting-value')!)
    await user.click(value)
    expect(await valueEditor.findByRole('option', { name: '1' })).toBeInTheDocument()
    expect(valueEditor.getByRole('option', { name: '3' })).toBeInTheDocument()
    await user.click(valueEditor.getByRole('option', { name: '2' }))
    expect(value.closest('.cohort-suggesting-value')).toHaveTextContent('2')

    await user.click(screen.getByRole('combobox', { name: 'Hendelse' }))
    await user.click(await screen.findByRole('option', { name: 'Annen hendelse' }))
    await waitFor(() =>
      expect(fetchColumnValues).toHaveBeenCalledWith('site-1', 'event_data_key', undefined, 'Annen hendelse'),
    )
    expect(fetchColumnValues).toHaveBeenCalledWith('site-1', 'event_data_value', 'hasSuperrask', 'Annen hendelse')

    await user.click(screen.getByRole('combobox', { name: 'Detalj' }))
    await user.click(await screen.findByRole('option', { name: 'category' }))
    await waitFor(() =>
      expect(fetchColumnValues).toHaveBeenCalledWith('site-1', 'event_data_value', 'category', 'Annen hendelse'),
    )
  })

  it.each([false, true])(
    'creates a dashboard from the funnel dialog and can retry a failed creation (%s)',
    async (failFirst) => {
      const user = userEvent.setup()
      const originalFetch = vi.mocked(fetch).getMockImplementation()!
      let fail = failFirst
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: RequestInit) => {
          if (fail && url === '/api/backend/projects/1/dashboards' && init?.method === 'POST') {
            fail = false
            return Promise.resolve(
              new Response(JSON.stringify({ error: 'Kunne ikke opprette dashboard' }), { status: 500 }),
            )
          }
          return originalFetch(url, init)
        }),
      )
      const params = new URLSearchParams({ websiteId: 'site-1' })
      params.append('step', 'url:/stillinger')
      params.append('step', 'event:Stillingsvisning|anywhere')
      renderPage(`/trakt?${params}`)
      await waitFor(() => expect(getRefreshButton()).toBeEnabled())
      await user.click(getRefreshButton())
      await user.click(await screen.findByRole('button', { name: 'Legg til i dashboard' }))
      const dialog = screen.getByRole('dialog', { name: 'Legg til i dashboard' })
      await user.type(within(dialog).getByRole('textbox', { name: 'Grafnavn' }), 'Min trakt')
      const dashboard = within(dialog).getByRole('combobox', { name: 'Dashboard' })
      await waitFor(() => expect(dashboard).toBeEnabled())
      await user.click(dashboard)
      await user.keyboard('{Backspace}')
      await user.type(dashboard, 'Min trakt')
      await user.keyboard('{Enter}')
      if (failFirst) {
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Kunne ikke opprette dashboard')
        expect(screen.getByRole('heading', { name: 'Resultater' })).toBeInTheDocument()
        const retryDashboard = within(dialog).getByRole('combobox', { name: 'Dashboard' })
        await user.click(retryDashboard)
        await user.clear(retryDashboard)
        await user.type(retryDashboard, 'Min trakt')
        await user.keyboard('{Enter}')
      }
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith('/api/backend/projects/1/dashboards/20/categories', undefined),
      )
      const save = within(dialog).getByRole('button', { name: 'Legg til i dashboard' })
      await waitFor(() => expect(save).toBeEnabled())
      await user.click(save)
      expect(await screen.findByRole('button', { name: 'Gå til dashboard' })).toBeVisible()
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([url, init]) => url === '/api/backend/projects/1/dashboards' && init?.method === 'POST'),
      ).toHaveLength(failFirst ? 2 : 1)
      expect(fetch).toHaveBeenCalledWith(
        '/api/backend/projects/1/dashboards/20/categories/30/graphs',
        expect.objectContaining({ method: 'POST' }),
      )
    },
  )

  it('keeps manual detail and value entry available when suggestions fail', async () => {
    vi.mocked(fetchColumnValues).mockRejectedValue(new Error('Suggestions unavailable'))
    const user = userEvent.setup()
    renderEventPage()
    await user.click(await screen.findByRole('button', { name: 'Legg til filter' }))
    await screen.findByText(/Kunne ikke hente forslag/)

    const detail = screen.getByRole('combobox', { name: 'Detalj' })
    await user.type(detail, 'customDetail')
    await user.tab()
    await waitFor(() =>
      expect(fetchColumnValues).toHaveBeenCalledWith('site-1', 'event_data_value', 'customDetail', 'Stillingsvisning'),
    )
    expect(detail.closest('.cohort-suggesting-value')).toHaveTextContent('customDetail')

    const value = screen.getByRole('combobox', { name: 'Verdi' })
    await user.type(value, '42')
    await user.tab()
    expect(value.closest('.cohort-suggesting-value')).toHaveTextContent('42')
  })

  function renderConfiguredHook() {
    const hook = renderHook(() => useFunnel(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    act(() => {
      hook.result.current.setSelectedWebsite({ ...FAKE_WEBSITES[0], teamId: 'team-1' })
      hook.result.current.setSteps([
        { type: 'url', value: '/start' },
        { type: 'url', value: '/finish' },
      ])
    })
    return hook
  }

  it('releases refresh after a timeout and fetches again without losing the configuration', async () => {
    vi.useFakeTimers()
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    let hang = true
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/bigquery/funnel' && hang) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error), { once: true })
          })
        }
        return originalFetch(url, init)
      }),
    )
    const { result } = renderConfiguredHook()
    act(() => {
      void result.current.fetchData()
    })
    expect(result.current.loading).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FUNNEL_REQUEST_TIMEOUT_MS)
    })
    expect(result.current.error).toContain('tok for lang tid')
    expect(result.current.canFetch).toBe(true)
    expect(result.current.steps.map((step) => step.value)).toEqual(['/start', '/finish'])
    hang = false
    await act(async () => {
      await result.current.fetchData()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.funnelData).toHaveLength(2)
  })

  it('aborts outdated requests and prevents old responses from releasing or overwriting the new request', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    const requests: { resolve: (response: Response) => void; signal: AbortSignal }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/bigquery/funnel') {
          return new Promise<Response>((resolve) => {
            requests.push({ resolve, signal: init!.signal! })
          })
        }
        return originalFetch(url, init)
      }),
    )
    const { result } = renderConfiguredHook()
    let oldRequest!: Promise<void>
    act(() => {
      oldRequest = result.current.fetchData()
    })
    act(() => {
      result.current.setSteps([
        { type: 'url', value: '/new' },
        { type: 'url', value: '/finish' },
      ])
    })
    expect(requests[0].signal.aborted).toBe(true)
    expect(result.current.canFetch).toBe(true)
    let newRequest!: Promise<void>
    act(() => {
      newRequest = result.current.fetchData()
    })
    await act(async () => {
      requests[0].resolve(new Response(JSON.stringify({ data: [{ step: 0, url: '/old', count: 100 }] })))
      await oldRequest
    })
    expect(result.current.loading).toBe(true)
    expect(result.current.funnelData).toEqual([])
    await act(async () => {
      requests[1].resolve(new Response(JSON.stringify({ data: [{ step: 0, url: '/new', count: 100 }] })))
      await newRequest
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.funnelData[0].url).toBe('/new')
  })

  it('automatically refreshes period and flow after running a funnel, but never while editing steps', async () => {
    const { result } = renderConfiguredHook()
    const queryCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/bigquery/funnel')
    act(() => {
      result.current.setOnlyDirectEntry(false)
    })
    expect(queryCalls()).toHaveLength(0)
    await act(async () => {
      await result.current.fetchData()
    })
    expect(queryCalls()).toHaveLength(1)
    act(() => {
      result.current.setOnlyDirectEntry(true)
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(queryCalls()).toHaveLength(2)
    expect(queryCalls()[1][1]?.body).toContain('"onlyDirectEntry":true')
    act(() => {
      result.current.setPeriod(result.current.period === 'last_7_days' ? 'last_28_days' : 'last_7_days')
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(queryCalls()).toHaveLength(3)
    act(() => {
      result.current.setSteps([
        { type: 'url', value: '/n' },
        { type: 'url', value: '/finish' },
      ])
    })
    act(() => {
      result.current.setSteps([
        { type: 'url', value: '/new' },
        { type: 'url', value: '/finish' },
      ])
    })
    act(() => {
      result.current.setOnlyDirectEntry(false)
    })
    expect(queryCalls()).toHaveLength(3)
    await act(async () => {
      await result.current.fetchData()
    })
    expect(queryCalls()).toHaveLength(4)
  })

  it('offers refresh below the steps and keeps URL guidance in HelpText', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('combobox', { name: 'Nettside' })
    const refreshButtons = screen.getAllByRole('button', { name: 'Oppdater' })
    expect(refreshButtons).toHaveLength(2)
    refreshButtons.forEach((button) => expect(button).toBeDisabled())
    expect(
      screen.getByRole('button', { name: 'Legg til steg' }).compareDocumentPosition(refreshButtons[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const help = screen.getAllByRole('button', { name: 'Om URL-sti' })[0]
    expect(help).toHaveAttribute('aria-expanded', 'false')
    await user.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
  })

  it('copies the current presentation and custom period into the share link', async () => {
    userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { result } = renderConfiguredHook()
    act(() => {
      result.current.setActiveTab('horizontal')
      result.current.setPeriod('custom')
      result.current.setCustomStartDate(new Date('2026-10-01T10:00:00Z'))
      result.current.setCustomEndDate(new Date('2026-10-04T10:00:00Z'))
    })
    await act(async () => {
      await result.current.copyShareLink()
    })
    const shared = new URL(write.mock.calls[0][0])
    expect(shared.searchParams.get('view')).toBe('horizontal')
    expect(shared.searchParams.get('period')).toBe('custom')
    expect(shared.searchParams.get('from')).toBe('2026-10-01T10:00:00.000Z')
    expect(shared.searchParams.get('to')).toBe('2026-10-04T10:00:00.000Z')
    expect(shared.searchParams.getAll('step')).toEqual(['url:%2Fstart', 'url:%2Ffinish'])
  })
})
