import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SqlResultsSection from './SqlResultsSection'
import { fetchCategories, saveChartToBackend } from '../../chartbuilder-next/api/chartStorageApi'

vi.mock('../../chartbuilder-next', () => ({
  ResultsPanel: ({ sql }: { sql: string }) => <pre data-testid="result-sql">{sql}</pre>,
}))
vi.mock('../../../shared/lib/trackEvent', () => ({ trackEvent: vi.fn() }))
vi.mock('../../chartbuilder-next/api/chartStorageApi', () => ({
  fetchProjects: vi.fn().mockResolvedValue([{ id: 1, name: 'Start Umami' }]),
  fetchDashboards: vi.fn().mockResolvedValue([{ id: 2, name: 'Grafbygger' }]),
  fetchCategories: vi.fn().mockResolvedValue([]),
  createProject: vi.fn(),
  createDashboard: vi.fn(),
  saveChartToBackend: vi.fn().mockResolvedValue({
    project: { id: 1, name: 'Start Umami' },
    dashboard: { id: 2, name: 'Grafbygger' },
  }),
}))

const query = 'SELECT browser FROM `test-project.umami_views.session`'
const executed = `${query} WHERE created_at BETWEEN TIMESTAMP('2026-10-18') AND TIMESTAMP('2026-10-24')`
const dynamic = `${query} WHERE 1 = 1 [[AND {{created_at}} ]]`

const renderResults = (getExportQuery?: () => Promise<string>) =>
  render(
    <SqlResultsSection
      result={{ data: [{ browser: 'chrome' }] }}
      loading={false}
      estimating={false}
      error={null}
      queryStats={null}
      query={query}
      lastProcessedSql={executed}
      getExportQuery={getExportQuery}
      websiteId="test-website"
      copiedMetabase={false}
      onExecuteQuery={vi.fn().mockResolvedValue(undefined)}
      onCopyMetabase={vi.fn()}
      prepareLineChartData={() => null}
      prepareBarChartData={() => null}
      preparePieChartData={() => null}
    />,
  )

describe('SQL export templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the executed SQL view for callers without an export template', () => {
    renderResults()
    expect(screen.getByTestId('result-sql').textContent).toBe(executed)
  })

  it('shows the dynamic template and saves it to the dashboard instead of executed dates', async () => {
    renderResults(vi.fn().mockResolvedValue(dynamic))
    await waitFor(() => expect(screen.getByTestId('result-sql').textContent).toBe(dynamic))
    fireEvent.click(screen.getByRole('button', { name: 'Legg til i dashboard' }))
    await waitFor(() => expect(fetchCategories).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('textbox', { name: 'Grafnavn' }), { target: { value: 'Besokende' } })
    fireEvent.click(screen.getByRole('button', { name: 'Legg til' }))
    await waitFor(() => expect(saveChartToBackend).toHaveBeenCalledWith(expect.objectContaining({ sqlText: dynamic })))
    expect(vi.mocked(saveChartToBackend).mock.calls[0][0].sqlText).not.toContain('TIMESTAMP(')
  })
})
