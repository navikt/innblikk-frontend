import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, afterEach } from 'vitest'

// trafficDashboardSqlTemplates.ts reads GCP_PROJECT_ID at module load time,
// so this must run before any import that transitively imports it.
vi.hoisted(() => {
  window.__RUNTIME_CONFIG__ = { GCP_PROJECT_ID: 'test-project' }
})

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

import TrafficAnalysis from './TrafficAnalysis.tsx'

const FAKE_WEBSITES = [{ id: 'site-1', name: 'Nav.no - prod', domain: 'nav.no', createdAt: '2023-01-01T00:00:00Z' }]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trafikkanalyse']}>
      <TrafficAnalysis />
    </MemoryRouter>,
  )
}

describe('TrafficAnalysis page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/bigquery/websites')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: FAKE_WEBSITES }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /trafikkoversikt/i })).toBeInTheDocument()
    await screen.findByRole('combobox', { name: /nettside/i })
  })

  it('renders the website picker', async () => {
    renderPage()
    expect(await screen.findByRole('combobox', { name: /nettside/i })).toBeInTheDocument()
  })
})
