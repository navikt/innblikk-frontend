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
  it.each([
    ['4.99', null],
    ['5.30', null],
    ['21.50', null],
    ['49.99', null],
    ['50.00', 'info'],
    ['99.99', 'info'],
    ['100.00', 'warning'],
    ['299.99', 'warning'],
    ['300.00', 'error'],
  ])('shows the data warning at %s GB with severity %s', async (gb, severity) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const sql = `SELECT event_name FROM \`${getGcpProjectId()}.umami_views.event\``
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    vi.mocked(estimateQueryCost).mockReset().mockResolvedValue({ totalBytesProcessedGB: gb })
    render(
      <MemoryRouter>
        <SqlNextPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    await waitFor(() => expect(estimateQueryCost).toHaveBeenCalledOnce())
    if (!severity) {
      expect(screen.queryByRole('heading', { name: 'Spørringen leser mye data' })).not.toBeInTheDocument()
      return
    }
    const heading = await screen.findByRole('heading', { name: 'Spørringen leser mye data' })
    expect(heading.closest('[data-variant]')).toHaveAttribute('data-variant', severity)
    expect(heading.parentElement?.parentElement).not.toContainElement(screen.getByTestId('editor-query'))
    expect(
      screen.getByText(`Spørringen leser ${gb} GB. Begrens gjerne med nettside og kortere tidsperiode.`),
    ).toBeInTheDocument()
  })

  it.each(['Vis resultater', 'Valider'])(
    'keeps comma, clause-order and grouping nudges working together after %s',
    async (action) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const sql = `SELECT ep.string_value\nCOUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende FROM \`${getGcpProjectId()}.umami_views.session\` LEFT JOIN \`${getGcpProjectId()}.umami_views.event\` ON session.session_id = event.session_id LEFT JOIN \`${getGcpProjectId()}.umami_views.event_data\` ON event.event_id = event_data.website_event_id LEFT JOIN UNNEST(event_data.event_parameters) AS ep ON TRUE\nGROUP BY ep.data_key\nWHERE ep.data_key = 'aktivitet'`
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
      vi.mocked(executeQueryApi).mockClear()
      vi.mocked(estimateQueryCost)
        .mockReset()
        .mockRejectedValueOnce(
          new Error(
            'SELECT list expression references column ep.string_value which is neither grouped nor aggregated at [2:3]',
          ),
        )
      render(
        <MemoryRouter>
          <SqlNextPage />
        </MemoryRouter>,
      )
      fireEvent.click(screen.getByRole('button', { name: action }))
      fireEvent.click(await screen.findByRole('button', { name: 'Legg til komma' }))
      expect(screen.getByTestId('editor-query').textContent).toBe(
        sql.replace('ep.string_value\n', 'ep.string_value,\n'),
      )
      fireEvent.click(screen.getByRole('button', { name: action }))
      const move = await screen.findByRole('button', { name: 'Flytt WHERE før GROUP BY' })
      expect(estimateQueryCost).not.toHaveBeenCalled()
      fireEvent.click(move)
      const reordered = screen.getByTestId('editor-query').textContent
      expect(reordered).toContain("WHERE ep.data_key = 'aktivitet'\nGROUP BY ep.data_key")
      expect(reordered).toContain('ep.string_value,')
      expect(estimateQueryCost).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: action }))
      fireEvent.click(await screen.findByRole('button', { name: 'Legg til GROUP BY ep.string_value' }))
      const grouped = screen.getByTestId('editor-query').textContent
      expect(grouped).toContain('GROUP BY ep.data_key, ep.string_value')
      expect(grouped).toContain("WHERE ep.data_key = 'aktivitet'")
      expect(grouped).toContain("COUNT(DISTINCT NULLIF(session.distinct_id, ''))")
      expect(estimateQueryCost).toHaveBeenCalledOnce()
      expect(executeQueryApi).not.toHaveBeenCalled()
    },
  )

  it.each(['Vis resultater', 'Valider'])(
    'offers optional GROUP BY simplification after successful %s',
    async (action) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const sql = `SELECT ep.string_value, COUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende FROM \`${getGcpProjectId()}.umami_views.event\` LEFT JOIN \`${getGcpProjectId()}.umami_views.session\` ON event.session_id = session.session_id LEFT JOIN \`${getGcpProjectId()}.umami_views.event_data\` ON event.event_id = event_data.website_event_id LEFT JOIN UNNEST(event_data.event_parameters) AS ep ON TRUE WHERE event.url_path = '/pensjon' AND event.event_name = 'søk' AND ep.data_key = 'søkeord' GROUP BY event.event_name, ep.data_key, ep.string_value`
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
      const stats = { totalBytesProcessedGB: '0.01', estimatedCostUSD: '0.00' }
      vi.mocked(estimateQueryCost).mockReset().mockResolvedValue(stats)
      vi.mocked(executeQueryApi)
        .mockReset()
        .mockResolvedValue({ data: [{ string_value: '[redacted: search]', unike_besokende: 9 }], queryStats: stats })
      render(
        <MemoryRouter>
          <SqlNextPage />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('button', { name: 'Forenkle GROUP BY' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: action }))
      const simplify = await screen.findByRole('button', { name: 'Forenkle GROUP BY' })
      expect(screen.getByTestId('editor-query').textContent).toBe(sql)
      expect(screen.queryByRole('heading', { name: 'Feil i spørringen' })).not.toBeInTheDocument()
      fireEvent.click(simplify)
      expect(screen.getByTestId('editor-query').textContent).toMatch(/GROUP BY\s+ep\.string_value/)
      expect(estimateQueryCost).toHaveBeenCalledOnce()
      expect(executeQueryApi).toHaveBeenCalledTimes(action === 'Vis resultater' ? 1 : 0)
      expect(screen.queryByRole('button', { name: 'Forenkle GROUP BY' })).not.toBeInTheDocument()
    },
  )

  it.each([
    ['Vis resultater', false],
    ['Valider', false],
    ['Vis resultater', true],
    ['Valider', true],
  ])('suggests a missing SELECT comma after %s with misplaced WHERE: %s', async (action, misplacedWhere) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const base = `SELECT ep.string_value\nCOUNT(DISTINCT NULLIF(session.distinct_id, '')) AS unike_besokende FROM \`${getGcpProjectId()}.umami_views.event\` LEFT JOIN \`${getGcpProjectId()}.umami_views.session\` ON event.session_id = session.session_id LEFT JOIN \`${getGcpProjectId()}.umami_views.event_data\` ON event.event_id = event_data.website_event_id LEFT JOIN UNNEST(event_data.event_parameters) AS ep ON TRUE WHERE event.event_name = 'navigere' AND ep.data_key = 'innholdstype' GROUP BY ep.string_value ORDER BY 2 DESC`
    const sql = misplacedWhere
      ? base.replace(
          "WHERE event.event_name = 'navigere' AND ep.data_key = 'innholdstype' GROUP BY ep.string_value",
          "GROUP BY ep.string_value WHERE event.event_name = 'navigere' AND ep.data_key = 'innholdstype'",
        )
      : base
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    vi.mocked(executeQueryApi).mockClear()
    vi.mocked(estimateQueryCost).mockReset()
    render(
      <MemoryRouter>
        <SqlNextPage />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Legg til komma' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: action }))
    fireEvent.click(await screen.findByRole('button', { name: 'Legg til komma' }))
    expect(screen.getByTestId('editor-query').textContent).toBe(sql.replace('ep.string_value\n', 'ep.string_value,\n'))
    expect(executeQueryApi).not.toHaveBeenCalled()
    expect(estimateQueryCost).not.toHaveBeenCalled()
  })

  it.each(['Vis resultater', 'Valider'])('offers missing quotes for event detail values after %s', async (action) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const sql = `SELECT ep.data_key, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende FROM \`${getGcpProjectId()}.umami_views.event\` LEFT JOIN \`${getGcpProjectId()}.umami_views.session\` ON event.session_id = session.session_id LEFT JOIN \`${getGcpProjectId()}.umami_views.event_data\` ON event.event_id = event_data.website_event_id LEFT JOIN UNNEST(event_data.event_parameters) AS ep ON TRUE WHERE event.event_name = 'navigere' AND ep.data_key = innholdstype GROUP BY event.event_name, ep.data_key ORDER BY 2 DESC`
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    vi.mocked(executeQueryApi).mockClear()
    vi.mocked(estimateQueryCost)
      .mockReset()
      .mockRejectedValueOnce(new Error('Unrecognized name: innholdstype at [5:1032]'))
    render(
      <MemoryRouter>
        <SqlNextPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: action }))
    const fixButton = await screen.findByRole('button', { name: 'Legg til anførselstegn' })
    fireEvent.click(fixButton)
    expect(screen.getByTestId('editor-query').textContent).toBe(
      sql.replace('ep.data_key = innholdstype', "ep.data_key = 'innholdstype'"),
    )
    expect(estimateQueryCost).toHaveBeenCalledOnce()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it.each(['Vis resultater', 'Valider'])(
    'suggests the JOIN chain from user details for ep after %s',
    async (action) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const sql = `SELECT ep.data_key, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende\nFROM \`${getGcpProjectId()}.umami_views.session\`\n`
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
      vi.mocked(executeQueryApi).mockClear()
      vi.mocked(estimateQueryCost).mockReset().mockRejectedValueOnce(new Error('Unrecognized name: ep at [5:8]'))
      render(
        <MemoryRouter>
          <SqlNextPage />
        </MemoryRouter>,
      )
      fireEvent.click(screen.getByRole('button', { name: action }))
      const fixButton = await screen.findByRole('button', { name: 'Koble til Detaljer på hendelser' })
      expect(screen.getByTestId('editor-query').textContent).toBe(sql)
      fireEvent.click(fixButton)
      const corrected = screen.getByTestId('editor-query').textContent
      expect(corrected).toMatch(/FROM\s+`[^`]+\.umami_views\.session`/)
      expect(corrected).toContain('umami_views.event`')
      expect(corrected).toContain('umami_views.event_data`')
      expect(corrected).toContain('LEFT JOIN UNNEST')
      expect(corrected).toContain('AS ep ON TRUE')
      expect(corrected).toContain('ep.data_key')
      expect(corrected).toContain('COUNT(DISTINCT NULLIF(')
      expect(estimateQueryCost).toHaveBeenCalledOnce()
      expect(executeQueryApi).not.toHaveBeenCalled()
    },
  )

  it.each(['Vis resultater', 'Valider'])('suggests event details with UNNEST for ep after %s', async (action) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const sql = `SELECT ep.data_key, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende FROM \`${getGcpProjectId()}.umami_views.event\` LEFT JOIN \`${getGcpProjectId()}.umami_views.session\` ON event.session_id = session.session_id WHERE event_name = 'navigere' GROUP BY event.event_name ORDER BY 2 DESC`
    window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
    vi.mocked(executeQueryApi).mockClear()
    vi.mocked(estimateQueryCost).mockReset().mockRejectedValueOnce(new Error('Unrecognized name: ep at [5:8]'))
    render(
      <MemoryRouter>
        <SqlNextPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: action }))
    const fixButton = await screen.findByRole('button', { name: 'Koble til Detaljer på hendelser' })
    expect(screen.getByText('ep.data_key')).toBeInTheDocument()
    fireEvent.click(fixButton)
    const corrected = screen.getByTestId('editor-query').textContent
    expect(corrected).toContain('LEFT JOIN UNNEST')
    expect(corrected).toContain('AS ep ON TRUE')
    expect(corrected).toContain('ep.data_key')
    expect(corrected).toContain('umami_views.session')
    expect(corrected).toContain('COUNT(DISTINCT NULLIF(')
    expect(corrected).toContain("event_name = 'navigere'")
    expect(estimateQueryCost).toHaveBeenCalledOnce()
    expect(executeQueryApi).not.toHaveBeenCalled()
  })

  it.each(['Vis resultater', 'Valider'])(
    'offers a user-details JOIN for distinct_id with spelling advice after %s',
    async (action) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const sql = `SELECT event_name, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende FROM \`${getGcpProjectId()}.umami_views.event\` GROUP BY 1 ORDER BY 2 DESC`
      window.history.replaceState({}, '', `/sql?${new URLSearchParams({ sql, websiteId: 'chosen-website' })}`)
      vi.mocked(executeQueryApi).mockClear()
      vi.mocked(estimateQueryCost)
        .mockReset()
        .mockRejectedValueOnce(new Error('Unrecognized name: distinct_id; Did you mean visit_id? at [5:42]'))
      render(
        <MemoryRouter>
          <SqlNextPage />
        </MemoryRouter>,
      )
      fireEvent.click(screen.getByRole('button', { name: action }))
      const fixButton = await screen.findByRole('button', { name: 'Koble til Brukerdetaljer' })
      expect(screen.getByText(/finnes i Brukerdetaljer, ikke i Hendelser/)).toBeInTheDocument()
      fireEvent.click(fixButton)
      const corrected = screen.getByTestId('editor-query').textContent
      expect(corrected).toContain('LEFT JOIN')
      expect(corrected).toContain('session_id')
      expect(corrected).toContain("COUNT(DISTINCT NULLIF(distinct_id, ''))")
      expect(corrected).not.toContain('visit_id')
      expect(estimateQueryCost).toHaveBeenCalledOnce()
      expect(executeQueryApi).not.toHaveBeenCalled()
    },
  )

  beforeEach(() => window.sessionStorage.removeItem('innblikk-sql-editor-draft'))
  afterEach(() => window.sessionStorage.removeItem('innblikk-sql-editor-draft'))

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
