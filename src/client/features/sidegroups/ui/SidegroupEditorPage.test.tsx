import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import SidegroupEditorRoute from './SidegroupEditorPage.tsx'
import { createSidegroup, listSidegroups, updateSidegroup } from '../api/sidegroupsApi.ts'

vi.mock('../api/sidegroupsApi.ts', () => ({
  listSidegroups: vi.fn(),
  createSidegroup: vi.fn().mockResolvedValue({}),
  updateSidegroup: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../../shared/api/websiteApi.ts', () => ({
  fetchWebsites: vi.fn().mockResolvedValue([{ id: 'site-1', name: 'Nav.no', domain: 'nav.no' }]),
}))

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sidegrupper/ny" element={<SidegroupEditorRoute />} />
        <Route path="/sidegrupper/:id" element={<SidegroupEditorRoute />} />
        <Route path="/sidegrupper" element={<div>Oversikt</div>} />
        <Route path="/annet" element={<div>Annen side</div>} />
      </Routes>
      <Link to="/annet">Annen lenke</Link>
    </MemoryRouter>,
  )
}

describe('SidegroupEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listSidegroups).mockResolvedValue([
      {
        id: 'g1',
        name: 'Artikler',
        description: 'Alle artikler',
        websiteId: 'site-1',
        include: ['/artikler/'],
        startWith: ['/hjelp'],
      },
    ])
  })

  it('shows a website picker and a beta marker when creating', async () => {
    renderAt('/sidegrupper/ny?websiteId=site-1')

    expect(await screen.findByRole('heading', { name: 'Ny sidegruppe' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hvilke sider skal være med i gruppen?' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Nettsted' })).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('asks for a name and a website before saving', async () => {
    const user = userEvent.setup()
    renderAt('/sidegrupper/ny')

    await user.click(await screen.findByRole('button', { name: 'Opprett sidegruppe' }))

    expect(await screen.findByText('Gi sidegruppen et navn')).toBeInTheDocument()
    expect(screen.getByText('Velg hvilket nettsted sidegruppen gjelder')).toBeInTheDocument()
    expect(createSidegroup).not.toHaveBeenCalled()
  })

  it('creates a sidegroup with its URL conditions and returns to the list', async () => {
    const user = userEvent.setup()
    renderAt('/sidegrupper/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText('Navn'), 'Hjelp')
    await user.type(screen.getByRole('textbox', { name: 'URL-sti' }), '/hjelp{Enter}')
    await user.click(screen.getByRole('button', { name: 'Opprett sidegruppe' }))

    await waitFor(() => expect(createSidegroup).toHaveBeenCalled())
    expect(createSidegroup).toHaveBeenCalledWith({
      name: 'Hjelp',
      description: '',
      websiteId: 'site-1',
      include: ['/hjelp'],
      exclude: [],
      exact: [],
      startWith: [],
      endWith: [],
    })
    expect(await screen.findByText('Oversikt')).toBeInTheDocument()
  })

  it('offers to add or drop a pattern that was typed but not added', async () => {
    const user = userEvent.setup()
    renderAt('/sidegrupper/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText('Navn'), 'Hjelp')
    await user.type(screen.getByRole('textbox', { name: 'URL-sti' }), '/ikke-lagt-til')
    await user.click(screen.getByRole('button', { name: 'Opprett sidegruppe' }))

    expect(await screen.findByText('URL-stien er ikke lagt til ennå.')).toBeInTheDocument()
    expect(createSidegroup).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Lagre uten å legge til' }))
    await waitFor(() => expect(createSidegroup).toHaveBeenCalledWith(expect.objectContaining({ include: [] })))
  })

  it('opens an existing sidegroup without a website picker and keeps its description when saving', async () => {
    const user = userEvent.setup()
    renderAt('/sidegrupper/g1')

    expect(await screen.findByRole('heading', { name: 'Rediger sidegruppe' })).toBeInTheDocument()
    expect(screen.getByText('Nettsted: Nav.no — nav.no')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Nettsted' })).not.toBeInTheDocument()
    expect(screen.getByText('/artikler/')).toBeInTheDocument()
    expect(screen.getByText('/hjelp')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lagre endringer' }))

    await waitFor(() => expect(updateSidegroup).toHaveBeenCalled())
    expect(updateSidegroup).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({
        name: 'Artikler',
        description: 'Alle artikler',
        websiteId: 'site-1',
        include: ['/artikler/'],
        startWith: ['/hjelp'],
      }),
    )
  })

  it('reports a sidegroup that does not exist', async () => {
    renderAt('/sidegrupper/finnes-ikke')

    expect(await screen.findByText('Fant ikke sidegruppen')).toBeInTheDocument()
  })

  it('asks before following an in-app link while there are unsaved edits', async () => {
    const user = userEvent.setup()
    renderAt('/sidegrupper/ny?websiteId=site-1')

    await user.type(await screen.findByLabelText('Navn'), 'Halvferdig')
    await user.click(screen.getByRole('link', { name: 'Annen lenke' }))

    expect(await screen.findByText('Forkaste endringene?')).toBeInTheDocument()
    expect(screen.queryByText('Annen side')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Forkast' }))
    expect(await screen.findByText('Annen side')).toBeInTheDocument()
  })
})
