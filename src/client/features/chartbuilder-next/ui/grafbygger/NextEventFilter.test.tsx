import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import NextEventFilter from './NextEventFilter.tsx'
import type { Filter } from '../../../../shared/types/chart.ts'
import { useSidegroupsForWebsite } from '../../../sidegroups/hooks/useSidegroupsForWebsite.ts'
import { isFilterArray } from '../../utils/typeGuards.ts'
import { createSidegroup } from '../../../sidegroups/api/sidegroupsApi.ts'

vi.mock('../../../sidegroups/hooks/useSidegroupsForWebsite.ts', () => ({
  useSidegroupsForWebsite: vi.fn(() => ({
    sidegroups: [{ id: 'group-1', websiteId: 'site-1', name: 'Søknad', startWith: ['/soknad'] }],
    loading: false,
    error: false,
  })),
}))

vi.mock('../../../sidegroups/api/sidegroupsApi.ts', () => ({
  createSidegroup: vi.fn(),
  listSidegroups: vi.fn(),
  updateSidegroup: vi.fn(),
}))

const ref = createRef<{
  resetFilters: () => void
  enableCustomEvents: () => void
  validateSelection: () => boolean
}>()

function Harness({
  initial = [],
  events = ['/soknad', 'pageview', 'skjema sendt', 'knapp klikket'],
  loading = false,
}: {
  initial?: Filter[]
  events?: string[]
  loading?: boolean
}) {
  const [filters, setFilters] = useState(initial)
  return (
    <MemoryRouter initialEntries={['/grafbygger-alfa?websiteId=site-1']}>
      <NextEventFilter
        ref={ref}
        filters={filters}
        setFilters={setFilters}
        parameters={[]}
        website={{ id: 'site-1', name: 'Test', domain: 'nav.no', teamId: '', createdAt: '2024-01-01' }}
        availableEvents={events}
        isEventsLoading={loading}
      />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
    </MemoryRouter>
  )
}

const filters = (): Filter[] => {
  const parsed: unknown = JSON.parse(screen.getByTestId('filters').textContent ?? '[]')
  if (!isFilterArray(parsed)) throw new Error('Expected a filter array')
  return parsed
}

async function addFilter(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Filter' }))
  await user.click(screen.getByRole('option', { name }))
}

describe('NextEventFilter', () => {
  beforeEach(() => {
    vi.mocked(createSidegroup).mockReset()
  })

  it('focuses and opens filter suggestions immediately, and allows dismissal and reopening', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    const picker = screen.getByRole('combobox', { name: 'Velg filter' })
    expect(picker).toHaveFocus()
    expect(picker).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('option', { name: 'Side (URL)' })).toBeVisible()
    expect(screen.getByRole('option', { name: 'Sidegruppe' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(picker).toHaveAttribute('aria-expanded', 'false')
    await user.click(picker)
    expect(picker).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Avbryt filtervalg' }))
    expect(screen.queryByRole('combobox', { name: 'Velg filter' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    expect(screen.getByRole('combobox', { name: 'Velg filter' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('starts empty without a warning and puts pageviews first in a searchable event list', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Hendelser' }))
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Sidevisninger')
    expect(screen.getByRole('option', { name: 'knapp klikket' })).toBeVisible()
    expect(screen.queryByRole('option', { name: 'Alle egne hendelser' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'pageview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sidevisninger slett' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Hendelser' })).not.toHaveAttribute('placeholder')
    expect(screen.getByRole('combobox', { name: 'Hendelser' })).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Velg sidevisninger eller en egen hendelse.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bruk sidevisninger' })).not.toBeInTheDocument()
    expect(screen.queryByText('Velg hva du vil måle: sidevisninger eller en egen hendelse.')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Hele nettstedet' })).not.toBeInTheDocument()
    expect(filters()).toEqual(
      expect.arrayContaining([
        { column: 'event_type', rawExpression: 'FALSE' },
        expect.objectContaining({ column: 'url_path', interactive: true }),
      ]),
    )
  })

  it('selects and searches custom events without a separate source card', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const picker = screen.getByRole('combobox', { name: 'Hendelser' })
    await user.type(picker, 'skjema')
    await user.click(screen.getByRole('option', { name: 'skjema sendt' }))
    expect(filters()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: 'event_type', multipleValues: ['2'] }),
        expect.objectContaining({
          column: 'event_name',
          multipleValues: ['skjema sendt'],
        }),
      ]),
    )
    expect(filters().find((filter) => filter.column === 'event_name')?.rawExpression).toBeUndefined()
    expect(screen.getByRole('button', { name: 'skjema sendt slett' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Bruk sidevisninger' })).not.toBeInTheDocument()
  })

  it('preserves existing filters when pageviews are selected from the event picker', async () => {
    const user = userEvent.setup()
    const browserFilter: Filter = { column: 'browser', operator: '=', value: 'Chrome' }
    render(<Harness initial={[browserFilter]} />)
    expect(screen.queryByRole('button', { name: 'Sidevisninger slett' })).not.toBeInTheDocument()
    act(() => {
      ref.current?.validateSelection()
    })
    await user.click(screen.getByRole('combobox', { name: 'Hendelser' }))
    await user.click(screen.getByRole('option', { name: 'Sidevisninger' }))
    expect(screen.getByRole('button', { name: 'Sidevisninger slett' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Hendelser' })).toHaveFocus()
    expect(screen.getByRole('combobox', { name: 'Hendelser' })).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Velg sidevisninger eller en egen hendelse.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bruk sidevisninger' })).not.toBeInTheDocument()
    expect(filters()).toContainEqual(browserFilter)
    expect(filters()).toContainEqual({ column: 'event_type', operator: 'IN', value: '1', multipleValues: ['1'] })
    expect(filters().some((filter) => filter.column === 'event_name')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Sidevisninger slett' }))
    expect(screen.queryByRole('button', { name: 'Bruk sidevisninger' })).not.toBeInTheDocument()
    expect(filters()).toContainEqual(browserFilter)
  })

  it('never turns an empty event selection into all events', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Hendelser' }))
    await user.click(screen.getByRole('option', { name: 'Sidevisninger' }))
    await user.click(screen.getByRole('button', { name: 'Sidevisninger slett' }))
    expect(screen.queryByText('Velg sidevisninger eller en egen hendelse.')).not.toBeInTheDocument()
    expect(filters()).toContainEqual({ column: 'event_type', rawExpression: 'FALSE' })
  })

  it('only nudges after empty validation, focuses the picker, and clears the nudge after selection', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    let valid: boolean | undefined
    act(() => {
      valid = ref.current?.validateSelection()
    })
    expect(valid).toBe(false)
    const picker = screen.getByRole('combobox', { name: 'Hendelser' })
    expect(picker).toHaveFocus()
    expect(picker).not.toHaveAttribute('aria-invalid', 'true')
    expect(picker).toHaveAccessibleDescription('Velg sidevisninger eller en egen hendelse.')
    expect(
      within(screen.getByRole('status', { name: 'Hva vil du måle?' })).getByText(
        'Velg sidevisninger eller en egen hendelse.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Bruk sidevisninger' })).toBeVisible()

    await user.type(picker, 'skjema')
    expect(screen.getByRole('heading', { name: 'Hva vil du måle?' })).toBeVisible()
    await user.click(screen.getByRole('option', { name: 'skjema sendt' }))
    expect(screen.queryByText('Velg sidevisninger eller en egen hendelse.')).not.toBeInTheDocument()
    expect(picker).not.toHaveAttribute('aria-invalid', 'true')
    act(() => {
      valid = ref.current?.validateSelection()
    })

    expect(valid).toBe(true)

    act(() => ref.current?.resetFilters())
    expect(screen.queryByRole('button', { name: 'skjema sendt slett' })).not.toBeInTheDocument()
    expect(screen.queryByText('Velg sidevisninger eller en egen hendelse.')).not.toBeInTheDocument()
    expect(picker).not.toHaveAttribute('aria-invalid', 'true')
    expect(filters()).toContainEqual({ column: 'event_type', rawExpression: 'FALSE' })
  })

  it('offers pageviews only after an empty attempt and preserves filters when the nudge is accepted', async () => {
    const user = userEvent.setup()
    const browserFilter: Filter = { column: 'browser', operator: '=', value: 'Chrome' }
    render(<Harness initial={[browserFilter]} />)
    expect(screen.queryByRole('button', { name: 'Bruk sidevisninger' })).not.toBeInTheDocument()
    act(() => {
      expect(ref.current?.validateSelection()).toBe(false)
    })
    await user.click(screen.getByRole('button', { name: 'Bruk sidevisninger' }))
    expect(screen.getByRole('button', { name: 'Sidevisninger slett' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Hva vil du måle?' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Hendelser' })).toHaveFocus()
    expect(filters()).toContainEqual(browserFilter)
    expect(filters()).toContainEqual({ column: 'event_type', operator: 'IN', value: '1', multipleValues: ['1'] })
    await user.click(screen.getByRole('button', { name: 'Sidevisninger slett' }))
    expect(screen.queryByRole('button', { name: 'Bruk sidevisninger' })).not.toBeInTheDocument()
    act(() => {
      expect(ref.current?.validateSelection()).toBe(false)
    })
    expect(screen.getByRole('button', { name: 'Bruk sidevisninger' })).toBeVisible()
  })

  it('lets users enter a specific event before suggestions have loaded', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness events={[]} loading />)
    expect(screen.queryByText(/Henter egne hendelser/)).not.toBeInTheDocument()
    const picker = screen.getByRole('combobox', { name: 'Hendelser' })
    await user.type(picker, 'søknad fullført{Enter}')
    expect(filters()).toContainEqual(
      expect.objectContaining({
        column: 'event_name',
        value: 'søknad fullført',
        multipleValues: ['søknad fullført'],
      }),
    )
    expect(screen.getByRole('button', { name: 'søknad fullført slett' })).toBeVisible()

    rerender(<Harness events={['søknad fullført', 'knapp klikket']} />)
    await user.click(picker)
    expect(screen.getAllByRole('option', { name: 'søknad fullført' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'søknad fullført slett' }))
    expect(filters().some((filter) => filter.column === 'event_name')).toBe(false)
  })

  it('offers adding an exact event when the suggestion list is empty', async () => {
    const user = userEvent.setup()
    render(<Harness events={[]} />)
    expect(screen.queryByText('Skriv inn hendelsesnavnet for å legge til en egen hendelse.')).not.toBeInTheDocument()
    const picker = screen.getByRole('combobox', { name: 'Hendelser' })
    await user.type(picker, 'skjema fullført')
    await user.click(screen.getByRole('option', { name: /legg til.*skjema fullført/i }))
    expect(filters()).toContainEqual(expect.objectContaining({ column: 'event_name', value: 'skjema fullført' }))
    expect(screen.queryByRole('button', { name: 'Alle egne hendelser slett' })).not.toBeInTheDocument()
  })

  it('does not duplicate exact suggestions with an add option', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByRole('combobox', { name: 'Hendelser' }), 'skjema sendt')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'skjema sendt' })).toBeVisible()
  })

  it('keeps restored all-events selections removable without making them the default suggestion', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ column: 'event_type', operator: '=', value: '2' }]} />)
    await user.click(screen.getByRole('button', { name: 'Alle egne hendelser slett' }))
    expect(filters()).toContainEqual({ column: 'event_type', rawExpression: 'FALSE' })
    expect(screen.queryByText('Velg sidevisninger eller en egen hendelse.')).not.toBeInTheDocument()
  })

  it('opens page filtering directly on manual paths, with sidegroups as an equal alternative', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByText('Filtre', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Flere valg for hendelser')).not.toBeInTheDocument()
    await addFilter(user, 'Side (URL)')
    expect(screen.queryByRole('combobox', { name: 'Kolonne' })).not.toBeInTheDocument()
    const pathPicker = screen.getByRole('combobox', { name: 'Verdi' })
    await user.click(pathPicker)
    await user.click(screen.getByRole('option', { name: '/soknad' }))
    expect(filters()).toContainEqual(expect.objectContaining({ column: 'url_path', multipleValues: ['/soknad'] }))
    await addFilter(user, 'Sidegruppe')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sidegruppe' }), 'group-1')
    expect(filters()).toContainEqual(
      expect.objectContaining({
        column: 'url_path',
        rawExpression: "((STARTS_WITH(LOWER(url_path), LOWER('/soknad'))))",
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Fjern sidegruppefilter' }))
    expect(filters().some((filter) => filter.column === 'url_path')).toBe(false)
  })

  it('adds an ordinary filter beside the page filter', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await addFilter(user, 'Nettlesertype')
    const value = screen.getByRole('combobox', { name: 'Verdi' })
    await user.type(value, 'Firefox{Enter}')
    expect(filters()).toContainEqual(expect.objectContaining({ column: 'browser', value: 'Firefox' }))
    await user.click(screen.getByRole('button', { name: 'Fjern' }))
    expect(filters().some((filter) => filter.column === 'browser')).toBe(false)
  })

  it('creates a sidegroup in a modal and immediately selects it, including when other groups exist', async () => {
    const user = userEvent.setup()
    const group = { id: 'group-new', websiteId: 'site-1', name: 'Hjelpesider', startWith: ['/hjelp'] }
    vi.mocked(createSidegroup).mockResolvedValue(group)
    render(<Harness />)
    await addFilter(user, 'Sidegruppe')
    const createButton = screen.getByRole('button', { name: 'Opprett sidegruppe' })
    await user.click(createButton)
    const dialog = within(screen.getByRole('dialog', { name: 'Ny sidegruppe' }))
    expect(dialog.getByRole('textbox', { name: 'Navn' })).toHaveFocus()
    expect(dialog.queryByRole('combobox', { name: 'Nettsted' })).not.toBeInTheDocument()
    expect(dialog.queryByRole('link', { name: 'Tilbake til sidegrupper' })).not.toBeInTheDocument()
    await user.type(dialog.getByRole('textbox', { name: 'Navn' }), 'Hjelpesider')
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Samsvar' }), 'startWith')
    await user.type(dialog.getByRole('textbox', { name: 'URL-sti' }), '/hjelp{Enter}')
    await user.click(dialog.getByRole('button', { name: 'Opprett sidegruppe' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ny sidegruppe' })).not.toBeInTheDocument())
    expect(createSidegroup).toHaveBeenCalledWith(
      expect.objectContaining({ websiteId: 'site-1', name: 'Hjelpesider', startWith: ['/hjelp'] }),
    )
    expect(filters()).toContainEqual(
      expect.objectContaining({
        column: 'url_path',
        multipleValues: ['group-new'],
        customColumn: 'Hjelpesider',
        rawExpression: "((STARTS_WITH(LOWER(url_path), LOWER('/hjelp'))))",
      }),
    )
    const picker = screen.getByRole('combobox', { name: 'Sidegruppe' })
    expect(picker).toHaveValue('group-new')
    await user.selectOptions(picker, 'group-1')
    await user.selectOptions(picker, 'group-new')
    expect(picker).toHaveValue('group-new')
  })

  it('cancels without saving and confirms before discarding a partially created sidegroup', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await addFilter(user, 'Sidegruppe')
    await user.click(screen.getByRole('button', { name: 'Opprett sidegruppe' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Ny sidegruppe' })).getByRole('button', { name: 'Avbryt' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ny sidegruppe' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Opprett sidegruppe' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Ny sidegruppe' }))
    await user.type(dialog.getByRole('textbox', { name: 'Navn' }), 'Halvferdig')
    await user.keyboard('{Escape}')
    const confirmation = within(await screen.findByRole('alertdialog', { name: 'Forkaste endringene?' }))
    await user.click(confirmation.getByRole('button', { name: 'Fortsett å redigere' }))
    expect(dialog.getByRole('textbox', { name: 'Navn' })).toHaveValue('Halvferdig')
    await user.click(dialog.getByRole('button', { name: 'Avbryt' }))
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Forkaste endringene?' })).getByRole('button', {
        name: 'Forkast',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ny sidegruppe' })).not.toBeInTheDocument())
    expect(createSidegroup).not.toHaveBeenCalled()
    expect(filters()).toContainEqual({ column: 'url_path', rawExpression: 'TRUE' })
  })

  it('keeps the form open with its values when saving fails and selects the group after retrying', async () => {
    const user = userEvent.setup()
    vi.mocked(createSidegroup)
      .mockRejectedValueOnce(new Error('Kunne ikke lagre sidegruppen'))
      .mockResolvedValue({ id: 'group-new', websiteId: 'site-1', name: 'Hjelp', include: ['/hjelp'] })
    render(<Harness />)
    await addFilter(user, 'Sidegruppe')
    await user.click(screen.getByRole('button', { name: 'Opprett sidegruppe' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Ny sidegruppe' }))
    await user.click(dialog.getByRole('button', { name: 'Opprett sidegruppe' }))
    expect(dialog.getByText('Gi sidegruppen et navn')).toBeVisible()
    expect(createSidegroup).not.toHaveBeenCalled()
    await user.type(dialog.getByRole('textbox', { name: 'Navn' }), 'Hjelp')
    await user.type(dialog.getByRole('textbox', { name: 'URL-sti' }), '/hjelp{Enter}')
    await user.click(dialog.getByRole('button', { name: 'Opprett sidegruppe' }))
    expect(await dialog.findByText('Kunne ikke lagre sidegruppen')).toBeVisible()
    expect(dialog.getByRole('textbox', { name: 'Navn' })).toHaveValue('Hjelp')
    expect(filters().find((filter) => filter.column === 'url_path')?.multipleValues).toBeUndefined()
    await user.click(dialog.getByRole('button', { name: 'Opprett sidegruppe' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ny sidegruppe' })).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Sidegruppe' })).toHaveValue('group-new')
  })

  it('restores custom event and page filters without inserting pageviews', () => {
    render(
      <Harness
        initial={[
          { column: 'event_type', operator: '=', value: '2' },
          { column: 'event_name', operator: 'IN', value: 'skjema sendt', multipleValues: ['skjema sendt'] },
          { column: 'url_path', operator: 'IN', value: '/soknad', multipleValues: ['/soknad'] },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'skjema sendt slett' })).toBeVisible()
    expect(screen.getByRole('button', { name: '/soknad slett' })).toBeVisible()
    expect(filters().find((filter) => filter.column === 'event_type')?.value).toBe('2')
  })

  it('keeps date filters when resetting or enabling custom events from grouping', async () => {
    const date: Filter = { column: 'created_at', operator: 'SPECIAL', value: '{{created_at}}', interactive: true }
    render(<Harness initial={[date]} />)
    act(() => ref.current?.enableCustomEvents())
    await waitFor(() =>
      expect(filters().find((filter) => filter.column === 'event_type')?.multipleValues).toEqual(['2']),
    )
    act(() => ref.current?.resetFilters())
    expect(filters()).toContainEqual(date)
    expect(filters()).toContainEqual({ column: 'event_type', rawExpression: 'FALSE' })
  })

  it('supports advanced event matching and dashboard-controlled events', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Hendelser' }))
    await user.click(screen.getByRole('option', { name: 'Sidevisninger' }))
    await addFilter(user, 'Hendelsesutvalg (avansert)')
    await user.click(screen.getByRole('radio', { name: 'Utvalgte hendelser' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Hendelsesnavn' }), 'STARTS_WITH')
    const eventPicker = screen.getByRole('combobox', { name: 'Velg hendelse' })
    await user.type(eventPicker, 'skjema')
    const listId = eventPicker.getAttribute('aria-controls')
    const list = listId ? document.getElementById(listId) : null
    if (!list) throw new Error('Expected the event picker list')
    await user.click(within(list).getByRole('option', { name: 'skjema sendt' }))
    expect(filters().find((filter) => filter.column === 'event_name')?.rawExpression).toContain(
      "STARTS_WITH(event_name, 'skjema",
    )
    await user.click(screen.getByRole('radio', { name: 'Filter der mottaker velger selv i dashboardet' }))
    expect(filters().find((filter) => filter.column === 'event_name')).toEqual(
      expect.objectContaining({
        value: '{{event_name}}',
        interactive: true,
        rawExpression: '(event_type = 1 OR (event_type = 2 AND event_name = {{event_name}}))',
      }),
    )
  })

  it('reports sidegroup loading failures explicitly', () => {
    vi.mocked(useSidegroupsForWebsite).mockReturnValueOnce({ sidegroups: [], loading: false, error: true })
    render(
      <Harness
        initial={[
          { column: 'event_type', operator: '=', value: '1' },
          { column: 'url_path', rawExpression: 'TRUE', multipleValues: ['missing'], customColumn: 'Lagret gruppe' },
        ]}
      />,
    )
    expect(screen.getByText(/Kunne ikke hente sidegrupper/)).toBeVisible()
  })
})
