import { fireEvent, render, screen, within } from '@testing-library/react'
import ErDiagramAccordion from './ErDiagramAccordion'
import styles from './ErDiagramAccordion.module.css'

const renderDiagram = () => {
  const onInsertSnippet = vi.fn()
  const onOpenJoin = vi.fn()
  const view = render(
    <ErDiagramAccordion projectId="test-project" onOpenJoin={onOpenJoin} onInsertSnippet={onInsertSnippet} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Datamodell – tabeller og felter' }))
  return { ...view, onInsertSnippet, onOpenJoin }
}

describe('ER diagram', () => {
  it.each([
    ['umami_views.event', 'event_id', 'PK'],
    ['umami_views.event', 'website_id', 'FK'],
    ['umami_views.event', 'session_id', 'FK'],
    ['umami_views.session', 'session_id', 'PK'],
    ['umami_views.session', 'website_id', 'FK'],
    ['umami.public_website', 'website_id', 'PK'],
    ['umami_views.event_data', 'website_event_id', 'FK'],
    ['umami_views.event_data', 'website_id', 'FK'],
  ])('labels %s.%s as %s without inserting the label', (tableName, field, role) => {
    const { onInsertSnippet } = renderDiagram()
    const button = screen.getByRole('button', { name: `Sett inn ${tableName}.${field}` })
    expect(within(button).getByText(`(${role})`)).toBeInTheDocument()
    const icon = button.querySelector('svg')
    expect(icon).toHaveClass(role === 'PK' ? styles.primaryKey : styles.foreignKey)
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(button)
    expect(onInsertSnippet).toHaveBeenLastCalledWith(field)
  })

  it('explains both key labels outside the horizontally scrolling diagram', () => {
    renderDiagram()
    const diagram = screen.getByRole('region', { name: 'ER-diagram med fire tabeller' })
    expect(screen.getByText('PK (primærnøkkel):')).toBeInTheDocument()
    expect(screen.getByText('FK (fremmednøkkel):')).toBeInTheDocument()
    expect(within(diagram).queryByText('PK (primærnøkkel):')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sett inn umami_views.session.browser' })).not.toHaveTextContent(
      /\((?:PK|FK)\)/,
    )
  })

  it('shows all four tables with connecting fields and three relationships', () => {
    const { container } = renderDiagram()
    const event = screen.getByRole('region', { name: 'umami_views.event' })
    const session = screen.getByRole('region', { name: 'umami_views.session' })
    const eventData = screen.getByRole('region', { name: 'umami_views.event_data' })
    const website = screen.getByRole('region', { name: 'umami.public_website' })
    expect(within(event).getByText('event_id')).toBeInTheDocument()
    expect(within(session).getByText('session_id')).toBeInTheDocument()
    expect(within(eventData).getByText('website_event_id')).toBeInTheDocument()
    expect(within(website).getByText('website_id')).toBeInTheDocument()
    expect(container.querySelectorAll('svg [data-relation]')).toHaveLength(3)
    expect(screen.getByRole('region', { name: 'ER-diagram med fire tabeller' })).toHaveAttribute('tabindex', '0')
    expect(screen.queryByRole('button', { name: /Koble på/ })).not.toBeInTheDocument()
  })

  it.each([
    [
      'umami_views.event',
      [
        'url_query',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
        'referrer_path',
        'referrer_query',
        'gclid',
        'fbclid',
        'msclkid',
        'ttclid',
        'li_fat_id',
        'twclid',
        'tag',
        'hostname',
      ],
    ],
    [
      'umami_views.session',
      [
        'website_id',
        'session_parameters',
        'sp.data_key',
        'sp.string_value',
        'sp.number_value',
        'sp.date_value',
        'sp.data_type',
      ],
    ],
    ['umami_views.event_data', ['website_id', 'event_parameters', 'ep.number_value', 'ep.date_value', 'ep.data_type']],
    [
      'umami.public_website',
      ['share_id', 'reset_at', 'user_id', 'team_id', 'created_by', 'created_at', 'updated_at', 'deleted_at'],
    ],
  ])('shows and inserts the additional fields on %s', (tableName, fields) => {
    const { onInsertSnippet } = renderDiagram()
    const table = screen.getByRole('region', { name: tableName })
    for (const field of fields) {
      fireEvent.click(within(table).getByRole('button', { name: `Sett inn ${tableName}.${field}` }))
      expect(onInsertSnippet).toHaveBeenLastCalledWith(field)
    }
  })

  it('does not show the old flat Postgres parameter columns', () => {
    renderDiagram()
    const table = screen.getByRole('region', { name: 'umami_views.event_data' })
    expect(within(table).queryByText('event_data_id')).not.toBeInTheDocument()
    expect(within(table).queryByText('string_value')).not.toBeInTheDocument()
    expect(within(table).getByText('ep.string_value')).toBeInTheDocument()
  })

  it('inserts a field and a fully qualified table name', () => {
    const { onInsertSnippet } = renderDiagram()
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn umami_views.session.browser' }))
    expect(onInsertSnippet).toHaveBeenLastCalledWith('browser')
    fireEvent.click(screen.getByRole('button', { name: 'Sett inn umami_views.session' }))
    expect(onInsertSnippet).toHaveBeenLastCalledWith('`test-project.umami_views.session`')
  })

  it('always shows JOIN buttons on the three related tables', () => {
    renderDiagram()
    const buttons = screen.getAllByRole('button', { name: /^Legg til JOIN med / })
    expect(buttons).toHaveLength(3)
    buttons.forEach((button) => expect(button).toBeEnabled())
  })

  it('opens the JOIN dialog with the selected table', () => {
    const { onOpenJoin, onInsertSnippet } = renderDiagram()
    fireEvent.click(screen.getByRole('button', { name: 'Legg til JOIN med Brukerdetaljer' }))
    expect(onOpenJoin).toHaveBeenCalledWith('session')
    expect(onInsertSnippet).not.toHaveBeenCalled()
  })

  it('selects tables with a native button without nested controls', () => {
    renderDiagram()
    const session = screen.getByRole('region', { name: 'umami_views.session' })
    const header = within(session).getByRole('button', { name: /Brukerdetaljer/, pressed: false })
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-pressed', 'true')
    expect(header.querySelector('button')).toBeNull()
  })
})
