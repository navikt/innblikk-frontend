import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, afterEach } from 'vitest'

// goalCompletionDashboardSql.ts reads GCP_PROJECT_ID at module load time,
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

import GoalCompletion from './GoalCompletion.tsx'

const FAKE_WEBSITES = [{ id: 'site-1', name: 'Nav.no - prod', domain: 'nav.no', createdAt: '2023-01-01T00:00:00Z' }]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/maloppnaelse']}>
      <GoalCompletion />
    </MemoryRouter>,
  )
}

describe('GoalCompletion page', () => {
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
    expect(screen.getByRole('heading', { name: /måloppnåelse/i })).toBeInTheDocument()
    await screen.findByRole('combobox', { name: /nettside/i })
  })

  it('renders the website picker', async () => {
    renderPage()
    expect(await screen.findByRole('combobox', { name: /nettside/i })).toBeInTheDocument()
  })

  it('renders the start/goal step section', async () => {
    renderPage()
    expect(await screen.findByText(/start og mål/i)).toBeInTheDocument()
  })
})
