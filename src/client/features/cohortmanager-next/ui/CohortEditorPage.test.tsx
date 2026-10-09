import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import CohortEditorRoute from './CohortEditorPage.tsx'
import { deleteCohortChecked } from '../api/cohortApi.ts'
import { createCohort, getCohort, replaceCriteria } from '../../cohortmanager/api/cohortManagerApi.ts'
import type { CohortDetailDto } from '../../cohortmanager/model/types.ts'

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
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/brukergrupper-next/ny" element={<CohortEditorRoute />} />
        <Route path="/brukergrupper-next/:id" element={<CohortEditorRoute />} />
        <Route path="/brukergrupper-next" element={<div>Oversikt</div>} />
        <Route path="/annet" element={<div>Annen side</div>} />
      </Routes>
      <Link to="/annet">Annen lenke</Link>
    </MemoryRouter>,
  )
}

describe('CohortEditorPage', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('starts with one empty criterion and the og/eller/deretter choices', async () => {
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    expect(await screen.findByRole('heading', { name: 'Ny brukergruppe' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Kriterium 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'og' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eller' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'deretter' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fjern kriterium/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Oppsummering' })).not.toBeInTheDocument()
  })

  it('adds a second criterion with «og», then only offers «og» and a switch between og/eller', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'og' }))

    expect(screen.getByRole('region', { name: 'Kriterium 2' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Fjern kriterium/ })).toHaveLength(2)
    expect(screen.getByRole('complementary', { name: 'Oppsummering' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Hvordan henger kriteriene sammen?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'eller' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'eller' }))
    expect(screen.getByRole('button', { name: 'eller' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'og' })).not.toBeInTheDocument()
  })

  it('refuses to save an incomplete group and lists what is missing', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'Opprett brukergruppe' }))

    expect(await screen.findByText('Dette må rettes før du kan lagre:')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gi brukergruppen et navn' })).toBeInTheDocument()
    expect(createCohort).not.toHaveBeenCalled()
  })

  it('extends the last activity with «deretter» and can undo it', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'deretter' }))

    expect(screen.getAllByRole('region', { name: /Kriterium/ })).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Kriterium 1' })).getByText('Brukere som')).toBeInTheDocument()
    expect(screen.getByText('Hva skjedde etterpå?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rekkefølge' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Fjern «deretter»/ }))
    expect(screen.queryByText('Hva skjedde etterpå?')).not.toBeInTheDocument()
  })

  it('lets you choose the website when creating, and asks for it if missing', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny')

    expect(await screen.findByRole('combobox', { name: 'Nettsted' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Opprett brukergruppe' }))

    expect(await screen.findByRole('link', { name: 'Velg hvilket nettsted brukergruppen gjelder' })).toBeInTheDocument()
    expect(createCohort).not.toHaveBeenCalled()
  })

  it('does not offer a website picker when editing an existing group', async () => {
    vi.mocked(getCohort).mockResolvedValue({
      id: 3,
      websiteId: 'site-1',
      name: 'Eksisterende',
      root: { nodeType: 'GROUP', combinator: 'AND', negated: false, children: [] },
    })
    renderAt('/brukergrupper-next/3')

    expect(await screen.findByRole('heading', { name: 'Rediger brukergruppe' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Nettsted' })).not.toBeInTheDocument()
  })

  it('follows in-app links freely when nothing has been changed', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.click(await screen.findByRole('link', { name: 'Annen lenke' }))
    expect(await screen.findByText('Annen side')).toBeInTheDocument()
  })

  it('asks before following an in-app link while there are unsaved edits', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText('Navn'), 'Halvferdig')
    await user.click(screen.getByRole('link', { name: 'Annen lenke' }))

    expect(await screen.findByText('Forkaste endringene?')).toBeInTheDocument()
    expect(screen.queryByText('Annen side')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Forkast' }))
    expect(await screen.findByText('Annen side')).toBeInTheDocument()
  })

  it('reports it when the empty group left by a failed save cannot be removed', async () => {
    const user = userEvent.setup()
    vi.mocked(replaceCriteria).mockRejectedValueOnce(new Error('Kriterier avvist'))
    vi.mocked(deleteCohortChecked).mockRejectedValueOnce(new Error('500'))
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText('Navn'), 'Søkere')
    await user.type(screen.getByRole('combobox', { name: 'Verdi' }), '/soknad{Enter}')
    await user.click(screen.getByRole('button', { name: 'Opprett brukergruppe' }))

    expect(await screen.findByText(/kunne ikke fjernes/)).toBeInTheDocument()
  })

  it('saves a complete group as a wrapped event group', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

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
    // A AND (B OR C)
    const nested: CohortDetailDto = {
      id: 9,
      websiteId: 'site-1',
      name: 'Nøstet',
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
    renderAt('/brukergrupper-next/9')

    expect(await screen.findByRole('heading', { name: 'Rediger brukergruppe' })).toBeInTheDocument()
    expect(screen.queryByText('Denne brukergruppen kan ikke redigeres her ennå')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Kriterium 2' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Kriterium 2' })).getAllByRole('region')).toHaveLength(2)
  })

  it('builds a group from the «gruppe» button, with its own og/eller inside', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'gruppe' }))

    const group = screen.getByRole('region', { name: 'Kriterium 2' })
    expect(within(group).getByRole('region', { name: 'Delkriterium 1' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'og' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'eller' })).toBeInTheDocument()
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
    renderAt('/brukergrupper-next/10')

    expect(await screen.findByText('Denne brukergruppen kan ikke redigeres her ennå')).toBeInTheDocument()
    expect(screen.queryByText(/gamle editoren/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tilbake til brukergrupper/ })).toHaveAttribute(
      'href',
      '/brukergrupper-next?websiteId=site-1',
    )
  })
})
