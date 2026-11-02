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
    children,
  }: {
    title: string
    sidebarContent?: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      <h1>{title}</h1>
      <aside>{sidebarContent}</aside>
      <main>{children}</main>
    </div>
  ),
}))

import Funnel from './Funnel.tsx'
import { fetchColumnValues } from '../../cohortmanager/api/columnValuesApi.ts'
import { columnValuesSuggestions } from '../../cohortmanager/hooks/useColumnValueSuggestions.ts'

const FAKE_WEBSITES = [{ id: 'site-1', name: 'Nav.no - prod', domain: 'nav.no', createdAt: '2023-01-01T00:00:00Z' }]

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
      vi.fn((url: string) => {
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

  function renderEventPage() {
    const params = new URLSearchParams({ websiteId: 'site-1' })
    params.append('step', 'url:')
    params.append('step', 'event:Stillingsvisning|anywhere')
    return renderPage(`/trakt?${params}`)
  }

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
