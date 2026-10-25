import { fireEvent, render, screen, within } from '@testing-library/react'
import JoinQueryDialog from './JoinQueryDialog'

const renderDialog = (query = 'SELECT') => {
  const onApply = vi.fn<(query: string) => void>()
  const onClose = vi.fn()
  render(<JoinQueryDialog projectId="test-project" query={query} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}

describe('JOIN dialog', () => {
  it('includes a collapsible data model that selects JOINs without editing SQL', () => {
    const { onApply, onClose } = renderDialog()
    const toggle = screen.getByRole('button', { name: 'Datamodell – tabeller og felter' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    for (const table of [
      'umami_views.event',
      'umami_views.session',
      'umami_views.event_data',
      'umami.public_website',
    ]) {
      expect(screen.getByRole('region', { name: table })).toBeInTheDocument()
    }
    expect(screen.getByText('PK (primærnøkkel):')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Sett inn umami/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kopier umami_views.event_data' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Legg til JOIN med Detaljer på hendelser' }))
    expect(screen.getByRole('combobox', { name: 'Legg til' })).toHaveValue('event_data')
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('LEFT JOIN UNNEST')
    expect(
      within(screen.getByRole('region', { name: 'umami_views.event_data' })).getByText('ep.string_value'),
    ).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('fills a pending FROM and inserts event details without blocking warnings', () => {
    const { onApply } = renderDialog(
      "SELECT event_name, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende\nFROM\n",
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Legg til' }), { target: { value: 'event_data' } })
    expect(screen.queryByText(/Kan ikke legge til JOIN/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/En hendelse kan vises flere ganger/)).toBeInTheDocument()
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('FROM')
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('umami_views.event')
    expect(screen.getByRole('button', { name: 'Sett inn JOIN' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    const sql = onApply.mock.calls[0][0]
    expect(sql).toContain('event_name')
    expect(sql).toContain('COUNT(DISTINCT NULLIF(')
    expect(sql).toContain('AS unike_besokende')
    expect(sql).toContain('LEFT JOIN UNNEST')
    expect(sql.match(/\bFROM\b/g)).toHaveLength(1)
  })

  it('starts a new query with a preview and selected join', () => {
    const { onApply, onClose } = renderDialog()
    expect(screen.getByRole('dialog', { name: 'Legg til JOIN' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Start med' })).toHaveValue('Hendelser (event)')
    expect(screen.getByRole('textbox', { name: 'Start med' })).toHaveAttribute('readonly')
    expect(screen.getByRole('combobox', { name: 'Legg til' })).toHaveValue('session')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('Hendelser uten brukerdetaljer beholdes i koblingen.')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Hendelser (event)' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Brukerdetaljer (session)' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('LEFT JOIN')
    expect(screen.getByLabelText('JOIN-kode')).not.toHaveTextContent(/SELECT|FROM/)
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('session.browser'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('previews and applies event details with UNNEST', () => {
    const { onApply } = renderDialog()
    fireEvent.change(screen.getByRole('combobox', { name: 'Legg til' }), { target: { value: 'event_data' } })
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('UNNEST')
    expect(screen.getByText('Hendelser uten hendelsesdetaljer beholdes i koblingen.')).toBeInTheDocument()
    expect(screen.getByText(/En hendelse kan vises flere ganger/)).toBeInTheDocument()
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('LEFT JOIN UNNEST')
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('ep.string_value'))
  })

  it('extends an existing query without replacing its filters', () => {
    const { onApply } = renderDialog('SELECT url_path FROM `test-project.umami_views.event` WHERE event_type = 2')
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('event_type = 2'))
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN'))
    expect(onApply.mock.calls[0][0]).not.toContain('session.browser')
    expect(screen.getByLabelText('JOIN-kode')).not.toHaveTextContent(/SELECT|FROM|WHERE/)
  })

  it('adds FROM and JOIN from the selected tables while keeping the existing visitor count', () => {
    const { onApply } = renderDialog("SELECT COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende\n")
    expect(screen.queryByText(/Kan ikke legge til JOIN/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('FROM')
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('test-project.umami_views.session')
    expect(screen.getByLabelText('JOIN-kode')).not.toHaveTextContent('SELECT')
    expect(screen.getByRole('button', { name: 'Sett inn JOIN' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    const sql = onApply.mock.calls[0][0]
    expect(sql).toContain('COUNT(DISTINCT NULLIF(')
    expect(sql).toContain('AS unike_besokende')
    expect(sql).toContain('LEFT JOIN')
    expect(sql).not.toMatch(/url_path|browser/)
  })

  it('offers to replace a different source without replacing selected fields', () => {
    const { onApply } = renderDialog('SELECT browser FROM `test-project.umami_views.session`')
    expect(screen.getByText(/Erstatter FROM og eksisterende JOIN-er/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erstatt FROM og JOIN' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Erstatt med eksempel' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Erstatt FROM og JOIN' }))
    expect(onApply).toHaveBeenCalledWith(expect.stringMatching(/^SELECT browser\nFROM/))
    expect(onApply.mock.calls[0][0]).toContain('umami_views.event')
    expect(onApply.mock.calls[0][0]).toContain('LEFT JOIN')
  })

  it('replaces FROM for an unfinished WHERE while retaining fields and grouping', () => {
    const before = "SELECT browser, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende\n"
    const tail = 'WHERE\nGROUP BY browser\n'
    const { onApply } = renderDialog(`${before}FROM \`test-project.umami_views.session\`\n${tail}`)
    expect(screen.queryByText(/Kan ikke finne FROM-delen/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('FROM')
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('umami_views.event')
    fireEvent.click(screen.getByRole('button', { name: 'Erstatt FROM og JOIN' }))
    const sql = onApply.mock.calls[0][0]
    expect(sql.startsWith(before)).toBe(true)
    expect(sql.endsWith(tail)).toBe(true)
    expect(sql.match(/\bFROM\b/g)).toHaveLength(1)
    expect(sql).toContain('LEFT JOIN')
  })

  it('replaces old JOINs and does not confuse quoted keywords with clauses', () => {
    const before = "SELECT 'FROM WHERE JOIN' AS tekst, browser\n"
    const tail = "WHERE browser = 'FROM WHERE' AND\nGROUP BY browser"
    const { onApply } = renderDialog(
      `${before}FROM \`test-project.umami_views.session\` LEFT JOIN old_table ON TRUE\n${tail}`,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Legg til' }), { target: { value: 'event_data' } })
    fireEvent.click(screen.getByRole('button', { name: 'Erstatt FROM og JOIN' }))
    const sql = onApply.mock.calls[0][0]
    expect(sql.startsWith(before)).toBe(true)
    expect(sql.endsWith(tail)).toBe(true)
    expect(sql).not.toContain('old_table')
    expect(sql).toContain('LEFT JOIN UNNEST')
  })

  it('preserves optional filters after replacing a different source', () => {
    const tail = '[[WHERE {{created_at}}]]\nGROUP BY browser'
    const { onApply } = renderDialog(`SELECT browser FROM \`test-project.umami_views.session\`\n${tail}`)
    fireEvent.click(screen.getByRole('button', { name: 'Erstatt FROM og JOIN' }))
    expect(onApply.mock.calls[0][0].endsWith(tail)).toBe(true)
  })

  it.each([
    'WITH source AS (SELECT 1) SELECT * FROM source',
    'SELECT 1 FROM old UNION ALL SELECT 2 FROM other',
    'SELECT 1 FROM old; SELECT 2 FROM other',
  ])('does not guess which source to replace in %s', (query) => {
    const { onApply } = renderDialog(query)
    expect(screen.getByRole('button', { name: 'Sett inn JOIN' })).toBeDisabled()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('uses the existing alias in the JOIN preview', () => {
    renderDialog('SELECT e.url_path FROM `test-project.umami_views.event` AS e WHERE e.event_type = 2')
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent(/`?e`?\.session_id/)
    expect(screen.getByLabelText('JOIN-kode')).not.toHaveTextContent(/SELECT|WHERE/)
  })

  it('prevents duplicate joins', () => {
    renderDialog(
      'SELECT e.url_path FROM `test-project.umami_views.event` e LEFT JOIN `test-project.umami_views.session` s ON e.session_id = s.session_id',
    )
    expect(screen.getByText('Denne tabellen er allerede koblet til Hendelser.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sett inn JOIN' })).toBeDisabled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('keeps all events without requiring a join mode choice', () => {
    const { onApply } = renderDialog('SELECT COUNT(*) AS antall')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('LEFT JOIN')
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN'))
    expect(onApply.mock.calls[0][0]).not.toContain('session.browser')
    expect(onApply.mock.calls[0][0]).toContain('COUNT(*) AS antall')
  })

  it('offers only the three tables connected to events', () => {
    renderDialog()
    expect(screen.getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual([
      'session',
      'event_data',
      'website',
    ])
    fireEvent.change(screen.getByRole('combobox', { name: 'Legg til' }), { target: { value: 'website' } })
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('LEFT JOIN')
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('public_website')
    expect(screen.queryByText(/En hendelse kan vises flere ganger/)).not.toBeInTheDocument()
  })

  it('cancels without changing the query', () => {
    const { onApply, onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
