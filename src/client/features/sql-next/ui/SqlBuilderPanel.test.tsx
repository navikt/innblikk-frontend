import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SqlBuilderPanel from './SqlBuilderPanel'
import type { ComponentProps } from 'react'

const renderPanel = (overrides: Partial<ComponentProps<typeof SqlBuilderPanel>> = {}) => {
  const props: ComponentProps<typeof SqlBuilderPanel> = {
    projectId: 'test-project',
    query: '',
    loading: false,
    estimating: false,
    estimate: null,
    dryRunError: null,
    validateError: null,
    oldTableWarning: false,
    shareSuccess: false,
    selectedWebsiteSelected: false,
    safetyLimit: 100,
    explicitLimit: null,
    isSelectStarOnBigTable: false,
    isMissingPartitionFilter: false,
    isHighCost: false,
    onQueryChange: vi.fn(),
    onUpgradeTables: vi.fn(),
    onAddDateFilter: vi.fn(),
    onAddWebsiteFilter: vi.fn(),
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
  it.each([true, false])('confirms successful validation with website selected: %s', (selectedWebsiteSelected) => {
    renderPanel({ query: 'SELECT 1', selectedWebsiteSelected, estimate: { totalBytesProcessedGB: '1' } })
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

  it('does not ask users to insert the selected website and period into their SQL', () => {
    renderPanel({
      query: 'SELECT * FROM `test-project.umami_views.session`',
      isSelectStarOnBigTable: true,
      isMissingPartitionFilter: true,
    })
    expect(screen.queryByText(/Tabellen krever et filter/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Legg til nettside og tidsperiode' })).not.toBeInTheDocument()
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

  it('resets to SELECT instead of an empty editor when cleared', () => {
    const props = renderPanel({ query: 'SELECT * FROM `test-project.umami_views.session`' })
    fireEvent.click(screen.getByRole('button', { name: 'Tøm' }))
    expect(props.onQueryChange).toHaveBeenCalledWith('SELECT')
  })

  it('does not claim an unchecked query is ready', () => {
    renderPanel({ query: 'SELECT 1', selectedWebsiteSelected: true })
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
      selectedWebsiteSelected: true,
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
    expect(within(menu).getByRole('menuitem', { name: 'Legg til JOIN' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(within(menu).queryByText('Tabeller')).not.toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Brukerdetaljer' }))
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledWith('`test-project.umami_views.session`'))
  })

  it('opens the JOIN dialog even for a new query', async () => {
    const props = renderPanel({ query: 'SELECT' })
    fireEvent.click(screen.getByRole('button', { name: 'Tabeller' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Legg til JOIN' }))
    expect(props.onOpenJoin).toHaveBeenCalledOnce()
    expect(props.onQueryChange).not.toHaveBeenCalled()
  })

  it('omits repeated menu headings and marks filter choices with insertion icons', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Filtre' }))
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
})
