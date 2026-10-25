import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { estimateQueryCost, executeQueryApi } from '../../sql/api/sqlApi'
import SqlNextPage from './SqlNextPage'
import { getGcpProjectId } from '../../sql/utils/formatters'

vi.mock('../../sql/api/sqlApi', () => ({
  fetchWebsites: vi.fn().mockResolvedValue([]),
  estimateQueryCost: vi.fn(),
  executeQueryApi: vi.fn(),
}))

vi.mock('../../../shared/ui/theme/PageHeader/PageHeader.tsx', () => ({ PageHeader: () => null }))
vi.mock('../../../shared/ui/theme/AppBlock/AppBlock.tsx', () => ({
  AppBlock: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../analysis/ui/WebsitePicker.tsx', () => ({ default: () => null }))
vi.mock('../../analysis/ui/PeriodPicker.tsx', () => ({ default: () => null }))
vi.mock('./ErDiagramAccordion', () => ({ default: () => null }))
vi.mock('./SqlBuilderPanel', () => ({
  default: ({ query, onExecute, onValidate }: { query: string; onExecute: () => void; onValidate: () => void }) => (
    <div>
      <pre data-testid="editor-query">{query}</pre>
      <button type="button" onClick={onExecute}>
        Vis resultater
      </button>
      <button type="button" onClick={onValidate}>
        Valider
      </button>
    </div>
  ),
}))
vi.mock('../../sql/ui/SqlResultsSection', () => ({
  default: ({ error }: { error: string | null }) => (
    <div data-testid="results-section">{error && <div role="alert">{error}</div>}</div>
  ),
}))

describe('SQL error results', () => {
  it('explains automatic filters without a second SQL dropdown', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const sql = 'SELECT browser FROM `test-project.umami_views.session`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    vi.mocked(estimateQueryCost).mockReset()
    vi.mocked(executeQueryApi).mockClear()
    render(
      <MemoryRouter>
        <SqlNextPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByText('Filtrene legges til automatisk når spørringen kjøres. Du trenger ikke legge dem inn manuelt.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Vis SQL som kjøres')).not.toBeInTheDocument()
    expect(screen.getByTestId('editor-query').textContent).toBe(sql)
    expect(estimateQueryCost).not.toHaveBeenCalled()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
    vi.restoreAllMocks()
  })

  it.each(['Vis resultater', 'Valider'])(
    'suggests a JOIN for a missing field after %s without running it automatically',
    async (action) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const sql = `SELECT COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende FROM \`${getGcpProjectId()}.umami_views.session\` WHERE browser = 'chrome' AND url_path = '/pensjon'`
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
      vi.mocked(executeQueryApi).mockClear()
      vi.mocked(estimateQueryCost)
        .mockReset()
        .mockRejectedValueOnce(new Error('Unrecognized name: url_path at [5:348]'))
      render(
        <MemoryRouter>
          <SqlNextPage />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('button', { name: 'Koble til Hendelser' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: action }))
      const fixButton = await screen.findByRole('button', { name: 'Koble til Hendelser' })
      expect(screen.getByText(/finnes i Hendelser, ikke i Brukerdetaljer/)).toBeInTheDocument()
      expect(screen.getByText(/Koblingen kan gi flere rader/)).toBeInTheDocument()
      expect(screen.getByText('Vis JOIN-kode')).toBeInTheDocument()
      fireEvent.click(fixButton)
      const corrected = screen.getByTestId('editor-query').textContent
      expect(corrected).toContain('LEFT JOIN')
      expect(corrected).toContain('session_id')
      expect(corrected).toContain('COUNT(DISTINCT NULLIF(')
      expect(corrected).toContain('AS unike_besokende')
      expect(corrected).toContain("browser = 'chrome'")
      expect(corrected).toContain("url_path = '/pensjon'")
      expect(screen.queryByRole('heading', { name: 'Feil i spørringen' })).not.toBeInTheDocument()
      expect(estimateQueryCost).toHaveBeenCalledOnce()
      expect(executeQueryApi).not.toHaveBeenCalled()
    },
  )

  it.each(['Vis resultater', 'Valider'])(
    'offers missing quotes for text filters after %s without rerunning the query',
    async (action) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const sql = 'SELECT COUNT(*) FROM `test-project.umami_views.session` WHERE browser = chrome AND device = mobile'
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
      vi.mocked(executeQueryApi).mockClear()
      vi.mocked(estimateQueryCost).mockReset().mockRejectedValueOnce(new Error('Unrecognized name: chrome at [1:90]'))
      render(
        <MemoryRouter>
          <SqlNextPage />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('button', { name: 'Legg til anførselstegn' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: action }))
      const fixButton = await screen.findByRole('button', { name: 'Legg til anførselstegn' })
      expect(screen.getByText(/Tekstverdier må stå i anførselstegn/)).toBeInTheDocument()
      fireEvent.click(fixButton)
      expect(screen.getByTestId('editor-query')).toHaveTextContent("browser = 'chrome' AND device = 'mobile'")
      expect(screen.getByTestId('editor-query')).toHaveTextContent('SELECT COUNT(*)')
      expect(screen.queryByRole('heading', { name: 'Feil i spørringen' })).not.toBeInTheDocument()
      expect(estimateQueryCost).toHaveBeenCalledOnce()
      expect(executeQueryApi).not.toHaveBeenCalled()
    },
  )

  it('offers missing quotes for a path rejected by SQL parsing', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const sql = 'SELECT COUNT(*) FROM `test-project.umami_views.event` WHERE url_path = /pensjon'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    vi.mocked(estimateQueryCost).mockReset()
    vi.mocked(executeQueryApi).mockClear()
    render(
      <MemoryRouter>
        <SqlNextPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Legg til anførselstegn' }))
    expect(screen.getByTestId('editor-query')).toHaveTextContent("url_path = '/pensjon'")
    expect(screen.queryByRole('heading', { name: 'Feil i spørringen' })).not.toBeInTheDocument()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it.each(['Vis resultater', 'Valider'])('shows one actionable grouping error after %s', async (action) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const sql = 'SELECT language, COUNT(DISTINCT session_id) AS besokende\nFROM `test-project.umami_views.session`'
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    vi.mocked(executeQueryApi).mockClear()
    vi.mocked(estimateQueryCost).mockRejectedValueOnce(
      new Error('SELECT list expression references column language which is neither grouped nor aggregated at [5:8]'),
    )
    render(
      <MemoryRouter>
        <SqlNextPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: action }))
    const groupButton = await screen.findByRole('button', { name: 'Legg til GROUP BY language' })
    expect(screen.getAllByRole('heading', { name: 'Feil i spørringen' })).toHaveLength(1)
    expect(screen.queryByTestId('results-section')).not.toBeInTheDocument()
    expect(screen.getByText(/Når du teller og samtidig viser language/)).toBeInTheDocument()

    fireEvent.click(groupButton)
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Feil i spørringen' })).not.toBeInTheDocument())
    expect(screen.getByTestId('editor-query')).toHaveTextContent('GROUP BY language')
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it('shows a complete validation error instead of an empty results placeholder', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    window.history.replaceState({}, '', '/sql?sql=SELECT%201')
    const message =
      'Unrecognized name: missing_column. Check the selected fields and the table in the FROM clause at [1:8]'
    vi.mocked(estimateQueryCost).mockRejectedValueOnce(new Error(message))
    render(
      <MemoryRouter>
        <SqlNextPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Resultater vises her' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('results-section')).not.toBeInTheDocument()
  })
})
