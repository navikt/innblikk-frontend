import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import CohortEditorRoute from './CohortEditorPage.tsx'
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
      </Routes>
    </MemoryRouter>,
  )
}

describe('CohortEditorPage', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('starts with one empty criterion and a summary, without the and/or choice', async () => {
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    expect(await screen.findByRole('heading', { name: 'Ny brukergruppe' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Kriterium 1' })).toBeInTheDocument()
    expect(screen.queryByText('Brukeren må oppfylle')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Slik leser vi gruppen' })).toBeInTheDocument()
  })

  it('shows the all/any choice once there are two criteria', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'Aktivitet' }))

    expect(screen.getByText('Brukeren må oppfylle')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Kriterium 2' })).toBeInTheDocument()
  })

  it('refuses to save an incomplete group and lists what is missing', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.click(await screen.findByRole('button', { name: 'Opprett brukergruppe' }))

    expect(await screen.findByText('Dette må rettes før du kan lagre:')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gi brukergruppen et navn' })).toBeInTheDocument()
    expect(createCohort).not.toHaveBeenCalled()
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

  it('saves a complete group as a wrapped event group', async () => {
    const user = userEvent.setup()
    renderAt('/brukergrupper-next/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText(/Navn på brukergruppen/), 'Søkere')
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

  it('does not let an existing group with nested logic be edited here', async () => {
    const nested: CohortDetailDto = {
      id: 9,
      websiteId: 'site-1',
      name: 'Avansert',
      root: {
        nodeType: 'GROUP',
        combinator: 'AND',
        negated: false,
        children: [
          {
            nodeType: 'GROUP',
            combinator: 'AND',
            negated: false,
            children: [{ nodeType: 'GROUP', combinator: 'OR', negated: false, children: [] }],
          },
        ],
      },
    }
    vi.mocked(getCohort).mockResolvedValue(nested)
    renderAt('/brukergrupper-next/9')

    expect(await screen.findByText('Denne brukergruppen kan ikke redigeres her ennå')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Åpne i den gamle editoren' })).toHaveAttribute(
      'href',
      '/brukergrupper?websiteId=site-1',
    )
  })
})
