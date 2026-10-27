import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JoinQueryDialog from './JoinQueryDialog'

const renderDialog = (query = 'SELECT') => {
  const onApply = vi.fn<(query: string) => void>()
  const onClose = vi.fn()
  render(<JoinQueryDialog projectId="test-project" query={query} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}

describe('JOIN dialog', () => {
  it.each(['field list', 'modal body'])('dismisses field tooltips when scrolling the %s', async (container) => {
    const user = userEvent.setup()
    renderDialog()
    const diagram = within(screen.getByRole('figure', { name: 'Valgt JOIN' }))
    const table = within(diagram.getByRole('region', { name: 'umami_views.session' }))
    expect(table.getByRole('button', { name: /andre felt/ })).toHaveAttribute('aria-expanded', 'true')
    const field = table.getByText('browser')
    await user.hover(field.parentElement!)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    fireEvent.scroll(
      container === 'field list'
        ? field.closest('ul')!
        : screen.getByRole('dialog').querySelector('.aksel-modal__body')!,
    )
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    await user.unhover(field.parentElement!)
    await user.hover(field.parentElement!)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  it('starts with other fields open and supports collapsing them with visible key roles', async () => {
    const user = userEvent.setup()
    const { onApply, onClose } = renderDialog()
    expect(screen.queryByRole('heading', { name: 'Forhåndsvisning' })).not.toBeInTheDocument()
    const diagram = within(screen.getByRole('figure', { name: 'Valgt JOIN' }))
    const source = within(diagram.getByRole('region', { name: 'umami_views.event' }))
    const target = within(diagram.getByRole('region', { name: 'umami_views.session' }))
    expect(diagram.getByRole('heading', { name: 'Hovedtabell' }).parentElement).toContainElement(
      source.getByText('session_id'),
    )
    expect(diagram.getByRole('heading', { name: 'JOIN med' }).parentElement).toContainElement(
      target.getByRole('combobox', { name: 'JOIN med' }),
    )
    expect(target.getByRole('combobox', { name: 'JOIN med' })).toHaveValue('session')
    expect(source.getByText('session_id').parentElement).toHaveTextContent('(FK)')
    expect(target.getByText('session_id').parentElement).toHaveTextContent('(PK)')
    const sourceToggle = source.getByRole('button', { name: /andre felt/ })
    const targetToggle = target.getByRole('button', { name: /andre felt/ })
    expect(sourceToggle).toHaveAttribute('aria-expanded', 'true')
    expect(targetToggle).toHaveAttribute('aria-expanded', 'true')
    expect(source.getByText('event_id').parentElement).toHaveTextContent('(PK)')
    expect(source.getByText('website_id').parentElement).toHaveTextContent('(FK)')
    targetToggle.focus()
    await user.keyboard('{Enter}')
    expect(targetToggle).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{Enter}')
    expect(targetToggle).toHaveAttribute('aria-expanded', 'true')
    expect(target.getByText('browser')).toBeInTheDocument()
    await user.click(sourceToggle)
    expect(sourceToggle).toHaveAttribute('aria-expanded', 'false')
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each([
    ['session', 'umami_views.session', 'session_id', 'session_id'],
    ['event_data', 'umami_views.event_data', 'event_id', 'website_event_id'],
    ['website', 'umami.public_website', 'website_id', 'website_id'],
  ])('diagrams only the selected %s relation and its keys', (tableId, tableName, sourceField, targetField) => {
    renderDialog()
    fireEvent.change(screen.getByRole('combobox', { name: 'JOIN med' }), { target: { value: tableId } })
    const diagram = within(screen.getByRole('figure', { name: 'Valgt JOIN' }))
    expect(diagram.getAllByRole('region')).toHaveLength(2)
    expect(
      within(diagram.getByRole('region', { name: 'umami_views.event' })).getByText(sourceField),
    ).toBeInTheDocument()
    expect(within(diagram.getByRole('region', { name: tableName })).getByText(targetField)).toBeInTheDocument()
    expect(diagram.getAllByText(/andre felt/)).toHaveLength(2)
    expect(screen.queryByText(/Du kan hente|Hendelser uten/)).not.toBeInTheDocument()
  })

  it('shows the SQL suggestion immediately and copies the currently selected JOIN without applying it', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const { onApply, onClose } = renderDialog()
    expect(screen.getByRole('heading', { name: 'SQL-forslag', level: 3 })).toBeVisible()
    expect(screen.getByLabelText('JOIN-kode')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Vis SQL' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Kopier SQL' }))
    expect(writeText).toHaveBeenLastCalledWith(screen.getByLabelText('JOIN-kode').textContent)
    expect(writeText.mock.calls[0][0]).toContain('umami_views.session')
    fireEvent.change(screen.getByRole('combobox', { name: 'JOIN med' }), { target: { value: 'event_data' } })
    await user.click(screen.getByRole('button', { name: 'SQL kopiert' }))
    expect(writeText).toHaveBeenLastCalledWith(screen.getByLabelText('JOIN-kode').textContent)
    expect(writeText.mock.calls[1][0]).toContain('LEFT JOIN UNNEST')
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    writeText.mockRestore()
  })

  it('omits the data model accordion while retaining the selected relation', () => {
    renderDialog()
    expect(screen.queryByRole('button', { name: 'Datamodell – tabeller og felter' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ER-diagram med fire tabeller' })).not.toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Valgt JOIN' })).toBeInTheDocument()
  })

  it('fills a pending FROM and inserts event details without blocking warnings', () => {
    const { onApply } = renderDialog(
      "SELECT event_name, COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende\nFROM\n",
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'JOIN med' }), { target: { value: 'event_data' } })
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
    expect(screen.getByRole('dialog', { name: 'JOIN tabeller' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Hovedtabell' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'JOIN med' })).toHaveValue('session')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('figure', { name: 'Valgt JOIN' })).getByRole('combobox', { name: 'JOIN med' }),
    ).toHaveValue('session')
    expect(screen.queryByRole('option', { name: 'Hendelser (event)' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Brukerdetaljer (session)' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('LEFT JOIN')
    expect(screen.getByLabelText('JOIN-kode')).not.toHaveTextContent(/SELECT|FROM/)
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    expect(onApply).toHaveBeenCalledWith(expect.stringMatching(/^SELECT\s+FROM\b/))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each([
    ['', 'session'],
    ['', 'event_data'],
    ['', 'website'],
    ['SELECT', 'session'],
    ['SELECT', 'event_data'],
    ['SELECT', 'website'],
    [' \n ', 'session'],
    [' select\n ', 'session'],
  ])('leaves SELECT empty when joining %j with %s', (query, tableId) => {
    const { onApply, onClose } = renderDialog(query)
    fireEvent.change(screen.getByRole('combobox', { name: 'JOIN med' }), { target: { value: tableId } })
    const preview = screen.getByLabelText('JOIN-kode').textContent
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    expect(onApply).toHaveBeenCalledWith(`SELECT\nFROM \`test-project.umami_views.event\` AS event\n${preview}`)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('previews and applies event details with UNNEST', () => {
    const { onApply } = renderDialog()
    fireEvent.change(screen.getByRole('combobox', { name: 'JOIN med' }), { target: { value: 'event_data' } })
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('UNNEST')
    expect(within(screen.getByRole('figure', { name: 'Valgt JOIN' })).getByText('website_event_id')).toBeInTheDocument()
    expect(screen.getByText(/En hendelse kan vises flere ganger/)).toBeInTheDocument()
    expect(screen.getByLabelText('JOIN-kode')).toHaveTextContent('LEFT JOIN UNNEST')
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN UNNEST'))
    expect(onApply.mock.calls[0][0]).toMatch(/^SELECT\s+FROM\b/)
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
    fireEvent.change(screen.getByRole('combobox', { name: 'JOIN med' }), { target: { value: 'event_data' } })
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
    fireEvent.change(screen.getByRole('combobox', { name: 'JOIN med' }), { target: { value: 'website' } })
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
