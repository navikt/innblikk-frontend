import { render, screen, waitFor, within } from '@testing-library/react'
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

describe('Funnel page', () => {
  beforeEach(() => {
    localStorage.clear()
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
          '/api/backend/projects/1/dashboards': [{ id: 2, name: 'Dashboard', projectId: 1 }],
          '/api/backend/projects/1/dashboards/2/categories': [{ id: 3, name: 'Fane 1', dashboardId: 2 }],
          '/api/backend/projects/1/dashboards/2/categories/3/graphs': { id: 4, name: 'Trakt', categoryId: 3 },
          '/api/backend/projects/1/dashboards/2/categories/3/graphs/4/queries': { id: 5, name: 'Trakt', graphId: 4 },
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
    const refresh = await screen.findByRole('button', { name: 'Oppdater' })
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Oppdater' })).toBeEnabled())
    expect(screen.getByRole('combobox', { name: 'Detalj' }).closest('.cohort-suggesting-value')).toHaveTextContent(
      'hasSuperrask',
    )
    expect(queryCalls()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Oppdater' }))
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

  it('saves a visual funnel using backend-compatible TABLE storage and dynamic dashboard dates', async () => {
    const user = userEvent.setup()
    const params = new URLSearchParams({ websiteId: 'site-1' })
    params.append('step', 'url:/stillinger')
    params.append('step', 'event:Stillingsvisning|anywhere')
    renderPage(`/trakt?${params}`)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Oppdater' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Oppdater' }))
    await user.click(await screen.findByRole('button', { name: 'Legg til i dashboard' }))
    const dialog = screen.getByRole('dialog', { name: 'Legg til i dashboard' })
    expect(within(dialog).queryByRole('combobox', { name: 'Nettside' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/backend/projects/1/dashboards/2/categories', undefined),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Legg til i dashboard' }))
    expect(await screen.findByRole('button', { name: 'Gå til dashboard' })).toBeVisible()
    const graphRequest = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => typeof url === 'string' && url.endsWith('/graphs') && init?.method === 'POST')
    const queryRequest = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => typeof url === 'string' && url.endsWith('/queries') && init?.method === 'POST')
    expect(graphRequest?.[1]?.body).toContain('"graphType":"TABLE"')
    expect(queryRequest?.[1]?.body).toContain('/* @chart funnel */')
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
})
