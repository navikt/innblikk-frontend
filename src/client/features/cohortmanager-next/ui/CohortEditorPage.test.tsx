import { act, render, screen, waitFor, within } from '@testing-library/react'
import { createRef } from 'react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import CohortEditorRoute, { CohortEditorPage, type CohortEditorRef } from './CohortEditorPage.tsx'
import { deleteCohortChecked } from '../api/cohortApi.ts'
import { createCohort, getCohort, replaceCriteria, updateCohort } from '../../cohortmanager/api/cohortManagerApi.ts'
import type { CohortDetailDto } from '../../cohortmanager/model/types.ts'
import { fetchCohortPreview } from '../api/previewApi.ts'

vi.mock('../api/previewApi.ts', () => ({
  fetchCohortPreview: vi.fn().mockResolvedValue({ users: 12, total: 100, coverage: { total: 100, withDistinctId: 0 } }),
}))

vi.mock('../../cohortmanager/api/cohortManagerApi.ts', () => ({
  listCohorts: vi.fn().mockResolvedValue([]),
  getCohort: vi.fn(),
  createCohort: vi.fn().mockResolvedValue({ id: 5, websiteId: 'site-1', name: 'Ny' }),
  updateCohort: vi.fn().mockResolvedValue({}),
  replaceCriteria: vi.fn().mockResolvedValue({}),
  deleteCohort: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../api/cohortApi.ts', () => ({
  deleteCohortChecked: vi.fn().mockResolvedValue(undefined),
  permanentlyDeleteCohortChecked: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../cohortmanager/api/columnValuesApi.ts', () => ({
  fetchColumnValues: vi.fn().mockResolvedValue({ values: [], scannedDays: 30 }),
}))

vi.mock('../../../shared/api/websiteApi.ts', () => ({
  fetchWebsites: vi.fn().mockResolvedValue([{ id: 'site-1', name: 'Nav.no', domain: 'nav.no' }]),
}))

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <Link to="/annet">Annen lenke</Link>
          </>
        ),
        children: [
          { path: '/brukergrupper/ny', element: <CohortEditorRoute /> },
          { path: '/brukergrupper/:id', element: <CohortEditorRoute /> },
          { path: '/brukergrupper', element: <div>Oversikt</div> },
          { path: '/annet', element: <div>Annen side</div> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('CohortEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('starts with one empty criterion and the og/eller/deretter choices', async () => {
    renderAt('/brukergrupper/ny?websiteId=site-1')

    expect(await screen.findByRole('heading', { name: 'Ny brukergruppe' })).toBeInTheDocument()
    expect(screen.getByLabelText('Beskrivelse (valgfri)')).not.toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Beskrivelse (valgfri)' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Kriterium 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'og' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eller' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'deretter' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fjern kriterium/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Oppsummering' })).not.toBeInTheDocument()
  })

  it('adds a second criterion with «og» and keeps both og and eller available', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'og' }))

    expect(screen.getByRole('region', { name: 'Kriterium 2' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Fjern kriterium/ })).toHaveLength(2)
    expect(screen.getByRole('complementary', { name: 'Oppsummering' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Hvordan henger kriteriene sammen?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'og' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eller' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'eller' }))
    expect(screen.getByRole('radio', { name: 'eller' })).toBeChecked()
    expect(screen.getAllByRole('region', { name: /Kriterium/ })).toHaveLength(2)
  })

  it('previews unsaved criteria without requiring a name or creating a group', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper/ny?websiteId=site-1')
    await user.type(await screen.findByRole('combobox', { name: 'Verdi' }), '/soknad{Enter}')
    await user.click(screen.getByRole('button', { name: 'Forhåndsvis gruppe' }))
    expect(await screen.findByText('12 unike brukere')).toBeInTheDocument()
    expect(fetchCohortPreview).toHaveBeenCalledWith(
      expect.objectContaining({ websiteId: 'site-1' }),
      expect.any(AbortSignal),
    )
    expect(createCohort).not.toHaveBeenCalled()
    expect(screen.queryByText('Gi brukergruppen et navn')).not.toBeInTheDocument()
  })

  it('refuses to save an incomplete group and lists what is missing', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'Opprett brukergruppe' }))

    expect(await screen.findByText('Dette må rettes før du kan lagre:')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gi brukergruppen et navn' })).toBeInTheDocument()
    expect(createCohort).not.toHaveBeenCalled()
  })

  it('extends the last activity with «deretter» and can undo it', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'deretter' }))

    expect(screen.getAllByRole('region', { name: /Kriterium/ })).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Kriterium 1' })).getByText('Brukere som')).toBeInTheDocument()
    expect(screen.getByText('Hva skjedde etterpå?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rekkefølge' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Fjern «deretter»/ }))
    expect(screen.queryByText('Hva skjedde etterpå?')).not.toBeInTheDocument()
  })

  it('hides the website picker when the URL identifies a known website', async () => {
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Nettsted' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Tilbake til brukergrupper' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Nettsted' })).not.toBeInTheDocument()
  })

  it.each(['/brukergrupper/ny', '/brukergrupper/ny?websiteId=', '/brukergrupper/ny?websiteId=unknown'])(
    'requires a website selection when the URL has no valid website: %s',
    async (path) => {
      const user = userEvent.setup()
      renderAt(path)

      expect(await screen.findByRole('combobox', { name: 'Nettsted' })).toBeInTheDocument()
      await user.type(screen.getByLabelText('Navn'), 'Søkere')
      await user.type(screen.getByRole('combobox', { name: 'Verdi' }), '/soknad{Enter}')
      await user.click(screen.getByRole('button', { name: 'Opprett brukergruppe' }))

      expect(
        await screen.findByRole('link', { name: 'Velg hvilket nettsted brukergruppen gjelder' }),
      ).toBeInTheDocument()
      expect(createCohort).not.toHaveBeenCalled()

      await user.type(screen.getByRole('combobox', { name: 'Nettsted' }), 'Nav.no')
      await user.click(await screen.findByRole('option', { name: 'nav.no' }))
      expect(screen.getByRole('combobox', { name: 'Nettsted' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Opprett brukergruppe' }))

      await waitFor(() =>
        expect(createCohort).toHaveBeenCalledWith({ websiteId: 'site-1', name: 'Søkere', description: undefined }),
      )
      expect(await screen.findByText('Oversikt')).toBeInTheDocument()
    },
  )

  it('does not offer a website picker when editing an existing group', async () => {
    vi.mocked(getCohort).mockResolvedValue({
      id: 3,
      websiteId: 'site-1',
      name: 'Eksisterende',
      root: { nodeType: 'GROUP', combinator: 'AND', negated: false, children: [] },
    })
    renderAt('/brukergrupper/3')

    expect(await screen.findByRole('heading', { name: 'Rediger brukergruppe' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Nettsted' })).not.toBeInTheDocument()
  })

  it('follows in-app links freely when nothing has been changed', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await user.click(await screen.findByRole('link', { name: 'Annen lenke' }))
    expect(await screen.findByText('Annen side')).toBeInTheDocument()
  })

  it('asks before following an in-app link while there are unsaved edits', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText('Navn'), 'Halvferdig')
    await user.click(screen.getByRole('link', { name: 'Annen lenke' }))

    expect(await screen.findByText('Forkaste endringene?')).toBeInTheDocument()
    expect(screen.queryByText('Annen side')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Forkast' }))
    expect(await screen.findByText('Annen side')).toBeInTheDocument()
  })

  it('keeps embedded close and save callbacks without route navigation', async () => {
    const user = userEvent.setup()
    const ref = createRef<CohortEditorRef>()
    const onCancel = vi.fn()
    const onSaved = vi.fn()
    const website = { id: 'site-1', name: 'Nav.no', domain: 'nav.no', teamId: 'team', createdAt: '' }
    const router = createMemoryRouter([
      { path: '/', element: <CohortEditorPage ref={ref} website={website} onCancel={onCancel} onSaved={onSaved} /> },
    ])
    render(<RouterProvider router={router} />)
    await user.type(await screen.findByLabelText('Navn'), 'Søkere')
    act(() => ref.current?.requestClose())
    await user.click(await screen.findByRole('button', { name: 'Fortsett å redigere' }))
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Navn')).toHaveValue('Søkere')
    await user.type(screen.getByRole('combobox', { name: 'Verdi' }), '/soknad{Enter}')
    await user.click(screen.getByRole('button', { name: 'Opprett brukergruppe' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByText('Forkaste endringene?')).not.toBeInTheDocument()
  })

  it('discards an embedded draft through the cancel callback', async () => {
    const user = userEvent.setup()
    const ref = createRef<CohortEditorRef>()
    const onCancel = vi.fn()
    const website = { id: 'site-1', name: 'Nav.no', domain: 'nav.no', teamId: 'team', createdAt: '' }
    const router = createMemoryRouter([
      { path: '/', element: <CohortEditorPage ref={ref} website={website} onCancel={onCancel} onSaved={vi.fn()} /> },
    ])
    render(<RouterProvider router={router} />)
    await user.type(await screen.findByLabelText('Navn'), 'Søkere')
    act(() => ref.current?.requestClose())
    await user.click(await screen.findByRole('button', { name: 'Forkast' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/')
  })

  it('resumes router navigation instead of cancelling the embedded editor', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const website = { id: 'site-1', name: 'Nav.no', domain: 'nav.no', teamId: 'team', createdAt: '' }
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <CohortEditorPage website={website} onCancel={onCancel} onSaved={vi.fn()} />
            <Link to="/annet">Gå videre</Link>
          </>
        ),
      },
      { path: '/annet', element: <div>Annen side</div> },
    ])
    render(<RouterProvider router={router} />)
    await user.type(await screen.findByLabelText('Navn'), 'Søkere')
    await user.click(screen.getByRole('link', { name: 'Gå videre' }))
    await user.click(await screen.findByRole('button', { name: 'Forkast' }))
    expect(await screen.findByText('Annen side')).toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('reports it when the empty group left by a failed save cannot be removed', async () => {
    const user = userEvent.setup()
    vi.mocked(replaceCriteria).mockRejectedValueOnce(new Error('Kriterier avvist'))
    vi.mocked(deleteCohortChecked).mockRejectedValueOnce(new Error('500'))
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText('Navn'), 'Søkere')
    await user.type(screen.getByRole('combobox', { name: 'Verdi' }), '/soknad{Enter}')
    await user.click(screen.getByRole('button', { name: 'Opprett brukergruppe' }))

    expect(await screen.findByText(/kunne ikke fjernes/)).toBeInTheDocument()
  })

  it('saves a complete group as a wrapped event group', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText('Navn'), 'Søkere')
    await user.type(screen.getByRole('combobox', { name: 'Verdi' }), '/soknad{Enter}')
    await user.click(screen.getByRole('button', { name: 'Opprett brukergruppe' }))

    await waitFor(() => expect(replaceCriteria).toHaveBeenCalled())
    expect(createCohort).toHaveBeenCalledWith({ websiteId: 'site-1', name: 'Søkere', description: undefined })
    expect(vi.mocked(replaceCriteria).mock.calls[0][1]).toEqual({
      nodeType: 'GROUP',
      combinator: 'AND',
      negated: false,
      children: [
        {
          nodeType: 'GROUP',
          combinator: 'AND',
          negated: false,
          children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/soknad' }],
        },
      ],
    })
    expect(await screen.findByText('Oversikt')).toBeInTheDocument()
  })

  it('opens an existing group with nested logic and lets it be edited here', async () => {
    const user = userEvent.setup()
    // A AND (B OR C)
    const nested: CohortDetailDto = {
      id: 9,
      websiteId: 'site-1',
      name: 'Nøstet',
      description: 'En eksisterende beskrivelse',
      root: {
        nodeType: 'GROUP',
        combinator: 'AND',
        negated: false,
        children: [
          {
            nodeType: 'GROUP',
            combinator: 'AND',
            negated: false,
            children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/a' }],
          },
          {
            nodeType: 'GROUP',
            combinator: 'OR',
            negated: false,
            children: [
              {
                nodeType: 'GROUP',
                combinator: 'AND',
                negated: false,
                children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/b' }],
              },
              {
                nodeType: 'GROUP',
                combinator: 'AND',
                negated: false,
                children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/c' }],
              },
            ],
          },
        ],
      },
    }
    vi.mocked(getCohort).mockResolvedValue(nested)
    renderAt('/brukergrupper/9')

    expect(await screen.findByRole('heading', { name: 'Rediger brukergruppe' })).toBeInTheDocument()
    expect(screen.queryByText('Denne brukergruppen kan ikke redigeres her ennå')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Kriterium 2' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Kriterium 2' })).getAllByRole('region')).toHaveLength(2)
    expect(screen.getByLabelText('Beskrivelse (valgfri)')).not.toBeVisible()
    await user.type(screen.getByRole('textbox', { name: 'Navn' }), ' oppdatert')
    await user.click(screen.getByRole('button', { name: 'Lagre endringer' }))
    await waitFor(() =>
      expect(updateCohort).toHaveBeenCalledWith(9, {
        websiteId: 'site-1',
        name: 'Nøstet oppdatert',
        description: 'En eksisterende beskrivelse',
      }),
    )
  })

  it('turns «A og B» + eller into «A og (B eller C)», and further eller adds to that group', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'og' }))
    await user.click(screen.getByRole('button', { name: 'eller' }))

    expect(screen.getAllByRole('region', { name: /^Kriterium/ })).toHaveLength(2)
    const group = screen.getByRole('region', { name: 'Kriterium 2' })
    expect(within(group).getByRole('radio', { name: 'en av disse' })).toBeChecked()
    expect(within(group).getAllByRole('region', { name: /^Delkriterium/ })).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'eller' })[0])
    expect(within(group).getAllByRole('region', { name: /^Delkriterium/ })).toHaveLength(3)
  })

  it('never points to the old editor, even for a group it cannot show', async () => {
    vi.mocked(getCohort).mockResolvedValue({
      id: 10,
      websiteId: 'site-1',
      name: 'Ukjent felt',
      root: {
        nodeType: 'GROUP',
        combinator: 'AND',
        negated: false,
        children: [{ nodeType: 'CONDITION', field: 'screen', conditionType: 'EQUALS', value: '1x1' }],
      },
    })
    renderAt('/brukergrupper/10')

    expect(await screen.findByText('Denne brukergruppen kan ikke redigeres her ennå')).toBeInTheDocument()
    expect(screen.queryByText(/gamle editoren/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ukjent felt' })).toBeInTheDocument()
  })
})
