import { render, screen, waitFor } from '@testing-library/react'
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
import { fetchCohortsDeep } from '../api/cohortApi.ts'
import type { CohortDetailDto } from '../../../shared/types/cohort.ts'

// Cohort API is unit-tested elsewhere; here we control the deep-fetch directly.
vi.mock('../api/cohortApi.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchCohorts: vi.fn().mockResolvedValue([]),
  fetchCohortsDeep: vi.fn().mockResolvedValue(new Map()),
}))

// CohortPicker is interaction-heavy (combobox of cohort names); for the
// staleness tests we stub it and report the persisted cohortIds upstream on
// mount, mimicking what a restored session does.
vi.mock('./grafbygger/CohortPicker.tsx', async () => {
  const React = await import('react')
  const CohortPickerStub = ({
    onCohortIdsChange,
  }: {
    onCohortIdsChange: (ids: string[]) => void
    onRatioModeChange: (enabled: boolean) => void
  }) => {
    const ids =
      (JSON.parse(localStorage.getItem('grafbygger:config') ?? '{}') as { cohortIds?: string[] }).cohortIds ?? []
    React.useEffect(() => {
      if (ids.length > 0) onCohortIdsChange(ids)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid="cohort-picker" />
  }
  return { default: CohortPickerStub }
})

const mockFetchCohortsDeep = vi.mocked(fetchCohortsDeep)

const cohort = (id: string, value: string): CohortDetailDto => ({
  id,
  websiteId: 'site-1',
  name: `Cohort ${id}`,
  root: {
    nodeType: 'GROUP',
    combinator: 'AND',
    negated: false,
    children: [{ nodeType: 'CONDITION', field: 'browser', conditionType: 'EQUALS', value }],
  },
})

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

  describe('cross-tab cohort staleness', () => {
    const renderWithSelectedCohort = async () => {
      // Persisted grafbygger config selects website + one cohort, bypassing UI clicks.
      localStorage.setItem(
        'grafbygger:config',
        JSON.stringify({
          website: FAKE_WEBSITES[0],
          metrics: [{ function: 'count', alias: 'antall' }],
          groupByFields: [],
          cohortIds: ['1'],
        }),
      )
      mockFetchCohortsDeep.mockResolvedValue(new Map([['1', cohort('1', 'Chrome')]]))
      renderGrafbygger()
      // Initial handleCohortIdsChange-equivalent state: our effect only matters
      // when cohortIds are set, which the persisted config provides on mount.
      await screen.findByRole('combobox', { name: /nettside/i })
      // Wait for React to settle (usePersistentState hydration + effect attach)
      // before dispatching focus events — otherwise they land before the
      // window 'focus' listener is registered.
      await screen.findByText(/datakilder/i)
    }

    it('re-fetches selected cohorts on window focus and shows the inline note when the tree changed', async () => {
      await renderWithSelectedCohort()
      expect(screen.queryByText(/Oppdatert — en brukergruppe ble endret i en annen fane/)).toBeNull()
      // CohortPicker stub reports the persisted selection on mount (baseline fetch).
      await waitFor(() => expect(mockFetchCohortsDeep).toHaveBeenCalled())

      // Another tab edits the cohort: next focus-fetch returns a different tree.
      mockFetchCohortsDeep.mockResolvedValue(new Map([['1', cohort('1', 'Firefox')]]))
      window.dispatchEvent(new Event('focus'))

      expect(await screen.findByText(/Oppdatert — en brukergruppe ble endret i en annen fane/)).toBeInTheDocument()
    })

    it('stays silent on focus when nothing changed', async () => {
      await renderWithSelectedCohort()
      await waitFor(() => expect(mockFetchCohortsDeep).toHaveBeenCalled())

      window.dispatchEvent(new Event('focus')) // same tree
      await waitFor(() => expect(mockFetchCohortsDeep.mock.calls.length).toBeGreaterThanOrEqual(2))

      expect(screen.queryByText(/Oppdatert — en brukergruppe ble endret i en annen fane/)).toBeNull()
    })
  })
})
