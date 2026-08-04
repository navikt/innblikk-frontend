import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, afterEach } from 'vitest'

// ── Stub heavy sidebar children – they have their own tests ───────────────────
vi.mock('./grafbygger/EventFilter.tsx', () => ({ default: () => <div data-testid="event-filter" /> }))
vi.mock('./grafbygger/MetricSelector.tsx', () => ({ default: () => <div data-testid="metric-selector" /> }))
vi.mock('./grafbygger/SegmentBy.tsx', () => ({ default: () => <div data-testid="segment-by" /> }))
vi.mock('./grafbygger/GroupingOptions.tsx', () => ({ default: () => <div data-testid="grouping-options" /> }))
vi.mock('./grafbygger/DisplayOptions.tsx', () => ({ default: () => <div data-testid="display-options" /> }))
vi.mock('./grafbygger/ActiveMetricsPanel.tsx', () => ({ default: () => <div data-testid="active-metrics" /> }))
vi.mock('./grafbygger/AlertWithCloseButton.tsx', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('./results/QueryPreview.tsx', () => ({
  default: () => <div data-testid="query-preview">QueryPreview</div>,
}))

vi.mock('../../analysis/ui/ChartLayoutOriginal.tsx', () => ({
  default: ({ title, filters, children }: { title: string; filters: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <aside data-testid="sidebar">{filters}</aside>
      <main>{children}</main>
    </div>
  ),
}))

import Grafbygger from './Grafbygger.tsx'

const FAKE_WEBSITES = [
  { id: 'site-1', name: 'Nav.no - prod', domain: 'nav.no', createdAt: '2023-01-01T00:00:00Z' },
  { id: 'site-2', name: 'Ditt NAV - prod', domain: 'nav.no', createdAt: '2023-01-01T00:00:00Z' },
]

function renderGrafbygger(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/grafbygger${search}`]}>
      <Grafbygger />
    </MemoryRouter>,
  )
}

describe('Grafbygger page', () => {
  beforeEach(() => {
    // Clear localStorage so cached websites/selection from a previous test don't interfere
    localStorage.clear()

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/bigquery/websites')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: FAKE_WEBSITES }),
          })
        }
        // Any other fetch (event-properties etc.) returns empty
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ properties: [] }),
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the page title', async () => {
    renderGrafbygger()
    expect(screen.getByRole('heading', { name: /grafbyggeren/i })).toBeInTheDocument()
    // Wait for WebsitePicker async fetch to settle
    await screen.findByRole('combobox', { name: /nettside/i })
  })

  it('renders the website picker', async () => {
    renderGrafbygger()
    expect(await screen.findByRole('combobox', { name: /nettside/i })).toBeInTheDocument()
  })

  it('renders QueryPreview', async () => {
    renderGrafbygger()
    expect(screen.getByTestId('query-preview')).toBeInTheDocument()
    // Wait for WebsitePicker async fetch to settle
    await screen.findByRole('combobox', { name: /nettside/i })
  })

  it('shows sidebar sections after selecting a website', async () => {
    const user = userEvent.setup()
    renderGrafbygger()

    // Wait for WebsitePicker to finish its initial fetch and mark itself ready
    const combobox = await screen.findByRole('combobox', { name: /nettside/i })

    // Open the dropdown
    await user.click(combobox)

    // The first website option should now be visible – click it
    const firstOption = await screen.findByRole('option', { name: /nav\.no - prod/i })
    await user.click(firstOption)

    // Sidebar sections should now be visible
    expect(await screen.findByText(/datakilder/i)).toBeInTheDocument()
  })
})
