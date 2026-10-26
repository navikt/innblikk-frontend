import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SqlBuilderPanel from './SqlBuilderPanel'
import type { ComponentProps } from 'react'
import { DEFAULT_WEBSITE_ID } from '../../../shared/lib/domain'

const renderPanel = (overrides: Partial<ComponentProps<typeof SqlBuilderPanel>> = {}) => {
  const props: ComponentProps<typeof SqlBuilderPanel> = {
    projectId: 'test-project',
    selectedWebsiteId: DEFAULT_WEBSITE_ID.prod,
    showBuildingBlocks: true,
    query: '',
    loading: false,
    estimating: false,
    estimate: null,
    dryRunError: null,
    validateError: null,
    oldTableWarning: false,
    shareSuccess: false,
    explicitLimit: null,
    isSelectStarOnBigTable: false,
    isMissingPartitionFilter: false,
    onQueryChange: vi.fn(),
    onUpgradeTables: vi.fn(),
    onAddDateFilter: vi.fn(),
    onAddWebsiteFilter: vi.fn(),
    onOpenFilters: vi.fn(),
    onShare: vi.fn(),
    onExecute: vi.fn(),
    onFormat: vi.fn(),
    onOpenJoin: vi.fn(),
    editorInstanceRef: { current: null },
    ...overrides,
  }
  render(<SqlBuilderPanel {...props} />)
  return props
}

describe('SQL insertion toolbar', () => {
  it('opens the filter dialog instead of editing the SQL itself', () => {
    const props = renderPanel({ query: 'SELECT event_name FROM `test-project.umami_views.event`' })
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Editorhandlinger' })).getByRole('button', { name: 'Filtre' }),
    )
    expect(props.onOpenFilters).toHaveBeenCalledOnce()
    expect(props.onQueryChange).not.toHaveBeenCalled()
    expect(props.onExecute).not.toHaveBeenCalled()
  })

  it.each(['', 'SELECT', "SELECT 1 FROM `test-project.umami_views.event` WHERE website_id = '{{website_id}}'"])(
    'keeps the filter button available for %j',
    (query) => {
      renderPanel({ query })
      expect(
        within(screen.getByRole('group', { name: 'Editorhandlinger' })).getByRole('button', { name: 'Filtre' }),
      ).toBeEnabled()
    },
  )

  it('opens the group picker separately from JOIN', () => {
    const onOpenGroup = vi.fn()
    const props = renderPanel({ onOpenGroup })
    const actions = screen.getByRole('group', { name: 'Editorhandlinger' })
    const buttons = within(actions).getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName('JOIN tabeller')
    expect(buttons[1]).toHaveAccessibleName('Filtre')
    expect(buttons[2]).toHaveAccessibleName('Gruppe')
    for (const button of buttons.slice(0, 3)) {
      expect(button).toHaveAttribute('data-variant', 'tertiary')
      expect(button).toHaveClass('aksel-button--xsmall')
      expect(button.querySelector('svg')).not.toBeNull()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Gruppe' }))
    expect(onOpenGroup).toHaveBeenCalledOnce()
    expect(props.onOpenJoin).not.toHaveBeenCalled()
  })

  it.each([
    [DEFAULT_WEBSITE_ID.prod, true],
    [DEFAULT_WEBSITE_ID.dev, true],
    ['other-subdomain', false],
  ] as const)('only offers cookie counts for a supported website: %s', (id, supported) => {
    renderPanel({ selectedWebsiteId: id })
    fireEvent.click(screen.getByRole('button', { name: 'Felter' }))
    expect(Boolean(screen.queryByRole('menuitem', { name: 'Unike besøkende (cookie)' }))).toBe(supported)
    expect(screen.getByRole('menuitem', { name: 'Unike besøkende (fingeravtrykk)' })).toBeInTheDocument()
  })

  it('does not offer cookie counts for a mixed website selection', () => {
    renderPanel({ selectedWebsiteIds: [DEFAULT_WEBSITE_ID.prod, 'other-subdomain'] })
    fireEvent.click(screen.getByRole('button', { name: 'Felter' }))
    expect(screen.queryByRole('menuitem', { name: 'Unike besøkende (cookie)' })).not.toBeInTheDocument()
  })

  it('hides the old menus by default and keeps the JOIN guide available', () => {
    const props = renderPanel({ showBuildingBlocks: undefined })
    expect(screen.queryByRole('group', { name: 'Byggeklosser' })).not.toBeInTheDocument()
    for (const name of ['SQL-ord', 'Felter', 'Tabeller']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    const actions = screen.getByRole('group', { name: 'Editorhandlinger' })
    expect(screen.getAllByRole('button', { name: 'Filtre' })).toHaveLength(1)
    expect(within(actions).getByRole('button', { name: 'Filtre' })).toBeInTheDocument()
    const join = within(actions).getByRole('button', { name: 'JOIN tabeller' })
    expect(join.querySelector('svg')).not.toBeNull()
    expect(join).toBeEnabled()
    fireEvent.click(join)
    expect(props.onOpenJoin).toHaveBeenCalledOnce()
  })

  it('confirms successful validation', () => {
    renderPanel({ query: 'SELECT 1', estimate: { totalBytesProcessedGB: '1' } })
    expect(screen.getByText('Gyldig SQL').closest('[role="status"]')).toHaveTextContent(/Gyldig SQL\s*· 1\.00 GB/)
    expect(screen.getByText('1.00 GB')).toBeInTheDocument()
  })

  it.each([
    { estimating: true },
    { dryRunError: 'Ugyldig SQL' },
    { validateError: 'Velg en nettside først.' },
    { incompleteQueryMessage: 'Spørringen er ikke ferdig.' },
  ])('does not confirm validation while pending or invalid: %j', (overrides) => {
    renderPanel({ query: 'SELECT 1', estimate: { totalBytesProcessedGB: '1' }, ...overrides })
    expect(screen.queryByText('Gyldig SQL')).not.toBeInTheDocument()
  })

  it('hints that the whole table is read when the period is missing', () => {
    renderPanel({
      query: 'SELECT * FROM `test-project.umami_views.session`',
      isMissingPartitionFilter: true,
    })
    expect(screen.getByText(/Mangler periode/)).toBeInTheDocument()
    expect(screen.queryByText(/Velg en nettside øverst/)).not.toBeInTheDocument()
  })

  it('offers to add the period through the dialog instead of doing it silently', () => {
    const props = renderPanel({
      query: 'SELECT * FROM `test-project.umami_views.session`',
      isMissingPartitionFilter: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Legg til periode' }))
    expect(props.onOpenFilters).toHaveBeenCalledOnce()
    expect(props.onQueryChange).not.toHaveBeenCalled()
  })

  it('does not show the period hint once the cost is known', () => {
    renderPanel({
      query: 'SELECT * FROM `test-project.umami_views.session`',
      isMissingPartitionFilter: true,
      estimate: { totalBytesProcessedGB: '1' },
    })
    expect(screen.queryByText(/Mangler periode/)).not.toBeInTheDocument()
  })

  it('keeps clear and share actions', () => {
    const props = renderPanel({ query: 'SELECT 1' })
    const actions = screen.getByRole('group', { name: 'Editorhandlinger' })
    const clearButton = within(actions).getByRole('button', { name: 'Tøm' })
    const shareButton = within(actions).getByRole('button', { name: 'Del' })
    expect(clearButton.querySelector('svg')).not.toBeNull()
    expect(shareButton.querySelector('svg')).not.toBeNull()
    expect(clearButton.textContent).toBe('')
    expect(shareButton.textContent).toBe('')
    expect(screen.queryByText('SQL-spørring')).not.toBeInTheDocument()
    fireEvent.click(shareButton)
    expect(props.onShare).toHaveBeenCalledOnce()
  })

  it('resets to the starting query with website and period instead of an empty editor when cleared', () => {
    const props = renderPanel({ query: 'SELECT * FROM `test-project.umami_views.session`' })
    fireEvent.click(screen.getByRole('button', { name: 'Tøm' }))
    expect(props.onQueryChange).toHaveBeenCalledWith(
      "SELECT\nFROM `test-project.umami_views.event`\nWHERE website_id = '{{website_id}}'\n  [[AND {{created_at}}]]",
    )
  })

  it('does not claim an unchecked query is ready', () => {
    renderPanel({ query: 'SELECT 1' })
    expect(screen.queryByText('Gyldig SQL')).not.toBeInTheDocument()
    expect(screen.queryByText('Ikke sjekket ennå')).not.toBeInTheDocument()
    expect(screen.queryByText('Klar til å kjøre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valider' }).querySelector('svg')).toBeNull()
    expect(screen.getByRole('button', { name: 'Vis resultater' }).querySelector('svg')).toBeNull()
  })

  it('formats SQL when the formatting button is pressed', () => {
    const props = renderPanel({ query: 'SELECT 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Formater' }))
    expect(props.onFormat).toHaveBeenCalledOnce()
  })

  it('disables formatting for an empty query', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Formater' })).toBeDisabled()
  })

  it('checks SQL when the plain validation button is pressed', () => {
    const onValidate = vi.fn()
    renderPanel({ query: 'SELECT 1', onValidate })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(onValidate).toHaveBeenCalledOnce()
  })

  it('shows an incomplete status and disables execution even if an old estimate exists', () => {
    renderPanel({
      query: 'SELECT * FROM `test-project.umami.public_website` WHERE',
      incompleteQueryMessage: 'Spørringen er ikke ferdig.',
      estimate: { totalBytesProcessedGB: '0' },
    })
    expect(screen.getByText('Spørringen er ikke ferdig.')).toBeInTheDocument()
    expect(screen.queryByText('Gyldig SQL')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vis resultater' })).toBeDisabled()
  })

  it('shows only four compact menus until one is opened', () => {
    renderPanel()
    const toolbar = screen.getByRole('group', { name: 'Byggeklosser' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['SQL-ord', 'Felter', 'Tabeller', 'Filtre'])
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('inserts a keyword from its menu', async () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'SQL-ord' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'LIMIT 20' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'SELECT' }))
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledWith('SELECT\n  '))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it.each([
    ['Unike besøkende (fingeravtrykk)', 'COUNT(DISTINCT session_id) AS unike_besokende'],
    ['Unike besøkende (cookie)', "COUNT(DISTINCT NULLIF(distinct_id, '')) AS unike_besokende"],
  ])('inserts %s from the fields menu', async (label, sql) => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Felter' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(label.replace(/[()]/g, '\\$&')) }))
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledWith(sql))
  })

  it('inserts at the saved editor selection and restores focus', async () => {
    const selection = { startLineNumber: 2, startColumn: 3 }
    const editor = { getSelection: vi.fn(() => selection), executeEdits: vi.fn(() => true), focus: vi.fn() }
    renderPanel({ editorInstanceRef: { current: editor } })
    fireEvent.click(screen.getByRole('button', { name: 'Felter' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'browser (nettleser)' }))
    await waitFor(() =>
      expect(editor.executeEdits).toHaveBeenCalledWith('sql-next-block', [
        { range: selection, text: 'browser', forceMoveMarkers: true },
      ]),
    )
    expect(editor.focus).toHaveBeenCalled()
  })

  it('keeps four table insertion choices and an always-visible JOIN action', async () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Tabeller' }))
    const menu = await screen.findByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.slice(0, 4).map((item) => item.textContent)).toEqual([
      'Hendelser',
      'Brukerdetaljer',
      'Hendelsesdetaljer',
      'Nettsider',
    ])
    expect(items.every((item) => item.querySelector('svg'))).toBe(true)
    expect(items).toHaveLength(5)
    expect(within(menu).getByRole('menuitem', { name: 'JOIN tabeller' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(within(menu).queryByText('Tabeller')).not.toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Brukerdetaljer' }))
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledWith('`test-project.umami_views.session`'))
  })

  it('opens the JOIN dialog even for a new query', async () => {
    const props = renderPanel({ query: 'SELECT' })
    fireEvent.click(screen.getByRole('button', { name: 'Tabeller' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'JOIN tabeller' }))
    expect(props.onOpenJoin).toHaveBeenCalledOnce()
    expect(props.onQueryChange).not.toHaveBeenCalled()
  })

  it('omits repeated menu headings and marks filter choices with insertion icons', async () => {
    renderPanel()
    fireEvent.click(within(screen.getByRole('group', { name: 'Byggeklosser' })).getByRole('button', { name: 'Filtre' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByText('Filtre')).not.toBeInTheDocument()
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Bare sidevisninger', 'Bare hendelser', 'Sidesti starter med'])
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .every((item) => item.querySelector('svg')),
    ).toBe(true)
  })

  it.each([
    [
      'both are in the SQL',
      "SELECT 1 FROM `test-project.umami_views.event` WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]",
      false,
    ],
    [
      'only the website is in the SQL',
      "SELECT 1 FROM `test-project.umami_views.event` WHERE website_id = '{{website_id}}'",
      true,
    ],
    [
      'only the period is in the SQL',
      'SELECT 1 FROM `test-project.umami_views.event` WHERE [[AND {{created_at}}]]',
      true,
    ],
    ['neither is in the SQL', 'SELECT 1 FROM `test-project.umami_views.event`', true],
    ['the editor is empty', '', true],
  ])('shows the filter button only when something can be added: %s', (_name, query, visible) => {
    renderPanel({ query, showBuildingBlocks: undefined })
    const actions = screen.getByRole('group', { name: 'Editorhandlinger' })
    expect(Boolean(within(actions).queryByRole('button', { name: 'Filtre' }))).toBe(visible)
    expect(within(actions).getByRole('button', { name: 'JOIN tabeller' })).toBeInTheDocument()
  })

  it('brings the filter button back when a filter is removed', () => {
    const both =
      "SELECT 1 FROM `test-project.umami_views.event` WHERE website_id = '{{website_id}}' [[AND {{created_at}}]]"
    const props = renderPanel({ query: both, showBuildingBlocks: undefined })
    expect(screen.queryByRole('button', { name: 'Filtre' })).not.toBeInTheDocument()
    cleanup()
    render(<SqlBuilderPanel {...props} query="SELECT 1 FROM `test-project.umami_views.event`" />)
    expect(screen.getByRole('button', { name: 'Filtre' })).toBeInTheDocument()
  })
})
