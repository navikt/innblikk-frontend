import { fireEvent, render, screen } from '@testing-library/react'
import JoinQueryDialog from './JoinQueryDialog'

const renderDialog = (query = 'SELECT') => {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(<JoinQueryDialog projectId="test-project" query={query} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}

describe('JOIN dialog', () => {
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

  it('does not replace an existing query when it cannot be extended', () => {
    const { onApply } = renderDialog('SELECT browser FROM `test-project.umami_views.session`')
    expect(screen.getByText(/Kan ikke legge til JOIN/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sett inn JOIN' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Erstatt med eksempel' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn JOIN' }))
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
