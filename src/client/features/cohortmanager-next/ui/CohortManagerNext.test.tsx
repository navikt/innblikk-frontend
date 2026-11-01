import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import { getCohort, listCohorts } from '../../cohortmanager/api/cohortManagerApi.ts'
import type { CohortDetailDto } from '../../cohortmanager/model/types.ts'
import CohortManagerNext from './CohortManagerNext.tsx'

vi.mock('../../../shared/api/websiteApi.ts', () => ({
  fetchWebsites: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../cohortmanager/api/cohortManagerApi.ts', () => ({
  listCohorts: vi.fn().mockResolvedValue([]),
  getCohort: vi.fn(),
}))

vi.mock('../api/previewApi.ts', () => ({
  fetchCohortPreview: vi.fn().mockResolvedValue({ users: 12, total: 100 }),
}))

function LocationDisplay() {
  const { pathname, search } = useLocation()
  return <output aria-label="Gjeldende adresse">{pathname + search}</output>
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <CohortManagerNext />
      <LocationDisplay />
    </MemoryRouter>,
  )
}

describe('CohortManagerNext', () => {
  it('shows Grafbygger above the title and marks Brukergrupper as the current page', async () => {
    renderAt('/brukergrupper')

    expect(screen.queryByRole('heading', { name: 'Brukergrupper er i beta' })).not.toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: 'Brødsmulesti' })
    expect(
      within(navigation)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Grafbygger', 'Brukergrupper'])
    expect(within(navigation).getByRole('link', { name: 'Grafbygger' })).toHaveAttribute('href', '/grafbygger')
    expect(within(navigation).getByText('Brukergrupper')).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).queryByRole('link', { name: 'Brukergrupper' })).not.toBeInTheDocument()
    expect(
      navigation.compareDocumentPosition(screen.getByRole('heading', { name: 'Brukergrupper', level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await waitFor(() => expect(screen.queryByTitle('Laster nettsteder…')).not.toBeInTheDocument())
  })

  describe('using a group in Grafbygger', () => {
    const group: CohortDetailDto = {
      id: 42,
      websiteId: 'site-1',
      name: 'Søkere',
      root: {
        nodeType: 'GROUP',
        combinator: 'AND',
        negated: false,
        children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/soknad' }],
      },
    }
    const website = { id: 'site-1', name: 'Nav.no', domain: 'nav.no', teamId: 'team-1', createdAt: '2026-01-01' }

    beforeEach(() => {
      vi.mocked(fetchWebsites).mockResolvedValueOnce([website])
      vi.mocked(listCohorts).mockResolvedValueOnce([group])
      vi.mocked(getCohort).mockResolvedValueOnce(group)
    })

    it('opens a new graph directly with the correct website and group, without a choice step', async () => {
      const user = userEvent.setup()
      renderAt('/brukergrupper?websiteId=site-1')
      await user.click(await screen.findByRole('button', { name: 'Vis gruppe' }))

      const dialog = screen.getByRole('dialog', { name: 'Søkere' })
      expect(await within(dialog).findByRole('heading', { name: 'Gruppestørrelse' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Rediger gruppe' })).toHaveAttribute(
        'href',
        '/brukergrupper/42',
      )
      const link = within(dialog).getByRole('button', { name: 'Bruk i Grafbygger' })
      const url = new URL(link.getAttribute('href')!, 'https://example.test')
      expect(url.pathname).toBe('/grafbygger')
      expect(JSON.parse(url.searchParams.get('config')!)).toEqual({
        website,
        cohortIds: ['42'],
        metrics: [],
        groupByFields: [],
      })

      await user.click(link)
      expect(screen.getByLabelText('Gjeldende adresse').textContent).toBe(url.pathname + url.search)
    })
  })

  it.each(['site-1', 'site /?&'])('returns to Grafbygger with the selected website %s', async (websiteId) => {
    const user = userEvent.setup()
    const destination = `/grafbygger?websiteId=${encodeURIComponent(websiteId)}`
    renderAt(`/brukergrupper?websiteId=${encodeURIComponent(websiteId)}`)

    await user.click(screen.getByRole('link', { name: 'Grafbygger' }))

    expect(screen.getByLabelText('Gjeldende adresse').textContent).toBe(destination)
  })

  it('updates the link when the default website is selected after loading', async () => {
    vi.mocked(fetchWebsites).mockResolvedValueOnce([
      { id: 'site-1', name: 'Nav.no', domain: 'nav.no', teamId: 'team-1', createdAt: '2026-01-01T00:00:00Z' },
    ])
    renderAt('/brukergrupper')

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Grafbygger' })).toHaveAttribute('href', '/grafbygger?websiteId=site-1'),
    )
  })
})
