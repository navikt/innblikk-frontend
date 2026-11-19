import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import type { Website } from '../../../shared/types/website.ts'
import { listSidegroups } from '../api/sidegroupsApi.ts'
import Sidegroups from './Sidegroups.tsx'

vi.mock('../../../shared/api/websiteApi.ts', () => ({ fetchWebsites: vi.fn() }))
vi.mock('../api/sidegroupsApi.ts', () => ({ listSidegroups: vi.fn(), deleteSidegroup: vi.fn() }))
vi.mock('../../../shared/ui/WebsiteSelect.tsx', () => ({
  WebsiteSelect: ({
    websites,
    selectedId,
    onSelect,
  }: {
    websites: Website[]
    selectedId: string | null
    onSelect: (id: string | null) => void
  }) => (
    <select aria-label="Nettsted" value={selectedId ?? ''} onChange={(event) => onSelect(event.target.value || null)}>
      <option value="">Ingen valgt</option>
      {websites.map((website) => (
        <option key={website.id} value={website.id}>
          {website.name}
        </option>
      ))}
    </select>
  ),
}))

const websites: Website[] = [
  { id: 'site-1', name: 'Første', domain: 'nav.no', teamId: 'team-1', createdAt: '2024-01-01' },
  { id: 'site-2', name: 'Andre', domain: 'arbeid.nav.no', teamId: 'team-1', createdAt: '2024-01-01' },
]

function setup(path = '/sidegrupper?websiteId=site-2&other=keep#groups') {
  const router = createMemoryRouter([{ path: '/sidegrupper', element: <Sidegroups /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('Sidegroups website selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchWebsites).mockResolvedValue(websites)
    vi.mocked(listSidegroups).mockResolvedValue([])
  })

  it('preserves explicit clears and changes without fetching either list again', async () => {
    const user = userEvent.setup()
    const router = setup()
    const select = await screen.findByRole('combobox', { name: 'Nettsted' })
    await waitFor(() => expect(select).toHaveValue('site-2'))
    await user.selectOptions(select, '')
    expect(select).toHaveValue('')
    expect(screen.getByText('Velg et nettsted for å se sidegrupper.')).toBeVisible()
    expect(router.state.location.search).toBe('?other=keep')
    expect(router.state.location.hash).toBe('#groups')

    await user.selectOptions(select, 'site-1')
    expect(select).toHaveValue('site-1')
    await user.selectOptions(select, '')
    expect(select).toHaveValue('')
    expect(fetchWebsites).toHaveBeenCalledTimes(1)
    expect(listSidegroups).toHaveBeenCalledTimes(1)
  })

  it('defaults only on initial entry and follows later URL selections and browser history', async () => {
    const router = setup('/sidegrupper')
    const select = await screen.findByRole('combobox', { name: 'Nettsted' })
    await waitFor(() => expect(select).toHaveValue('site-1'))
    await act(async () => {
      await router.navigate('/sidegrupper?websiteId=site-2')
    })
    expect(select).toHaveValue('site-2')
    await act(async () => {
      await router.navigate('/sidegrupper')
    })
    expect(select).toHaveValue('')
    await act(async () => {
      await router.navigate(-1)
    })
    expect(select).toHaveValue('site-2')
    expect(fetchWebsites).toHaveBeenCalledTimes(1)
    expect(listSidegroups).toHaveBeenCalledTimes(1)
  })

  it('uses the latest URL when website loading completes', async () => {
    let finish!: (items: Website[]) => void
    vi.mocked(fetchWebsites).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const router = setup('/sidegrupper?websiteId=site-1')
    await act(async () => {
      await router.navigate('/sidegrupper?websiteId=site-2')
    })
    await act(async () => {
      finish(websites)
      await Promise.resolve()
    })
    expect(await screen.findByRole('combobox', { name: 'Nettsted' })).toHaveValue('site-2')
    expect(fetchWebsites).toHaveBeenCalledTimes(1)
  })
})
