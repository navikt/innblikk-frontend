import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

import TrafficAnalysis from './TrafficAnalysis.tsx'
import { useCookieSupport, useCookieStartDate } from '../../../shared/hooks/useSiteimproveSupport.ts'

vi.mock('../../../shared/hooks/useSiteimproveSupport.ts', () => ({
  useCookieSupport: vi.fn(() => false),
  useCookieStartDate: vi.fn(() => null),
  useSiteimproveSupport: vi.fn(() => false),
  useMarketingSupport: vi.fn(() => false),
}))

const FAKE_WEBSITES = [{ id: 'site-1', name: 'Nav.no - prod', domain: 'nav.no', createdAt: '2023-01-01T00:00:00Z' }]

function renderPage() {
  window.history.replaceState({}, '', '/trafikkanalyse?websiteId=site-1')
  return render(
    <MemoryRouter initialEntries={['/trafikkanalyse?websiteId=site-1']}>
      <TrafficAnalysis />
    </MemoryRouter>,
  )
}

describe('TrafficAnalysis page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useCookieSupport).mockReturnValue(false)
    vi.mocked(useCookieStartDate).mockReturnValue(null)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/bigquery/websites') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: FAKE_WEBSITES }) })
        }
        if (url.includes('/traffic-series?')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], totalCount: 0 }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [false, null, 'fingerprinting'],
    [true, null, 'cookie'],
    [true, new Date(2000, 0, 1), 'cookie'],
    [true, new Date(2100, 0, 1), 'fingerprinting'],
    [true, new Date(new Date().setHours(0, 0, 0, 0) - 3 * 86400000), 'cookie og fingerprinting'],
  ] as const)('describes the visitor counting method (%s, %s)', async (usesCookies, switchDate, method) => {
    vi.mocked(useCookieSupport).mockReturnValue(usesCookies)
    vi.mocked(useCookieStartDate).mockReturnValue(switchDate)
    renderPage()
    const selector = screen.getByRole('combobox', { name: 'Visning' })
    fireEvent.change(selector, { target: { value: 'visitors' } })
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Visning' })).toHaveAccessibleDescription(`Telles med ${method}`),
    )
    const helpButton = screen.getByRole('button', { name: 'Hvordan telles unike besøkende?' })
    expect(helpButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(helpButton)
    expect(helpButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText(
        method === 'cookie'
          ? /En cookie gjør at samme nettleser/
          : method === 'cookie og fingerprinting'
            ? /Den valgte perioden omfatter både/
            : /Fingerprinting bruker tekniske opplysninger/,
      ),
    ).toBeInTheDocument()
    fireEvent.click(helpButton)
    expect(helpButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.change(screen.getByRole('combobox', { name: 'Visning' }), { target: { value: 'pageviews' } })
    expect(screen.queryByRole('button', { name: 'Hvordan telles unike besøkende?' })).not.toBeInTheDocument()
    expect(screen.queryByText(`Telles med ${method}`)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Visning' })).not.toHaveAttribute('aria-describedby')
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

  it('shows filters without a manual refresh button', async () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: 'Visning' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vis trafikk' })).not.toBeInTheDocument()
    await screen.findByRole('combobox', { name: /nettside/i })
  })
})
