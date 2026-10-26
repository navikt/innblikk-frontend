import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupQueryDialog from './GroupQueryDialog'
import { listSidegroups } from '../../sidegroups/api/sidegroupsApi'
import { getCohort, listCohorts } from '../../cohortmanager/api/cohortManagerApi'

vi.mock('../../sidegroups/api/sidegroupsApi', () => ({ listSidegroups: vi.fn() }))
vi.mock('../../cohortmanager/api/cohortManagerApi', () => ({ listCohorts: vi.fn(), getCohort: vi.fn() }))

beforeEach(() => {
  vi.mocked(listSidegroups).mockResolvedValue([
    { id: 'page', name: 'Søknader', websiteId: 'site', startWith: ['/soknad'] },
    { id: 'other', name: 'Annen nettside', websiteId: 'other' },
  ])
  vi.mocked(listCohorts).mockResolvedValue([{ id: 1, name: 'Mobil', websiteId: 'site' }])
  vi.mocked(getCohort).mockResolvedValue({
    id: 1,
    name: 'Mobil',
    websiteId: 'site',
    root: {
      nodeType: 'GROUP',
      combinator: 'AND',
      negated: false,
      children: [{ nodeType: 'CONDITION', field: 'device', conditionType: 'EQUALS', value: 'mobile' }],
    },
  })
})

const websites = [
  { id: 'site', name: 'Nav', domain: 'www.nav.no', teamId: 'team', createdAt: '2026-10-01' },
  { id: 'other', name: 'Annen', domain: 'annen.nav.no', teamId: 'team', createdAt: '2026-10-01' },
]

const setup = (query = 'SELECT', websiteIds = ['site']) => {
  const onApply = vi.fn()
  const onClose = vi.fn()
  const onWebsiteIdsChange = vi.fn()
  render(
    <GroupQueryDialog
      projectId="test"
      query={query}
      websiteIds={websiteIds}
      websites={websites}
      onWebsiteIdsChange={onWebsiteIdsChange}
      onApply={onApply}
      onClose={onClose}
    />,
  )
  return { onApply, onClose, onWebsiteIdsChange }
}

it('selects both group types and inserts their filters together', async () => {
  const { onApply, onClose } = setup()
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Mobil' }))
  expect(screen.getByRole('tab', { name: 'Brukergrupper' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.queryByRole('checkbox', { name: 'Søknader' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Sidegrupper' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Søknader' }))
  expect(screen.getByText('2 grupper valgt')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Brukergrupper' }))
  expect(screen.getByRole('checkbox', { name: 'Mobil' })).toBeChecked()
  fireEvent.click(screen.getByRole('tab', { name: 'Sidegrupper' }))
  expect(screen.getByRole('checkbox', { name: 'Søknader' })).toBeChecked()
  expect(screen.queryByRole('checkbox', { name: 'Annen nettside' })).not.toBeInTheDocument()
  expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Legg til i SQL' }))
  await waitFor(() => expect(onApply).toHaveBeenCalledOnce())
  expect(onApply.mock.calls[0][0]).toContain('/soknad')
  expect(onApply.mock.calls[0][0]).toContain('mobile')
  expect(onApply.mock.calls[0][0]).toContain("website_id = '{{website_id}}'")
  expect(onApply.mock.calls[0][0]).toContain('[[AND {{created_at}}]]')
  expect(onApply.mock.calls[0][0]).not.toMatch(/website_id = '(?!\{\{)/)
  expect(onClose).toHaveBeenCalledOnce()
})

it('keeps the original query when insertion is unsafe', async () => {
  const { onApply, onClose } = setup('SELECT 1')
  await screen.findByRole('checkbox', { name: 'Mobil' })
  fireEvent.click(screen.getByRole('tab', { name: 'Sidegrupper' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Søknader' }))
  fireEvent.click(screen.getByRole('button', { name: 'Legg til i SQL' }))
  expect(await screen.findByText(/Legg til Hendelser eller Brukerdetaljer/)).toBeInTheDocument()
  expect(onApply).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

it('lets the user pick a website inside the dialog when none is selected', async () => {
  const { onWebsiteIdsChange } = setup('SELECT', [])
  expect(screen.getByRole('combobox', { name: 'Nettsider eller apper' })).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'Brukergrupper' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Legg til i SQL' })).toBeDisabled()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Nettsider eller apper' }))
  await user.click(await screen.findByRole('option', { name: 'www.nav.no' }))
  expect(onWebsiteIdsChange).toHaveBeenCalledWith(['site'])
})

it('offers creation links in both empty tabs without unnecessary controls', async () => {
  vi.mocked(listSidegroups).mockResolvedValue([])
  vi.mocked(listCohorts).mockResolvedValue([])
  setup()
  const createCohort = await screen.findByRole('link', { name: /Opprett din første brukergruppe/ })
  expect(createCohort).toHaveAttribute('href', '/brukergrupper?websiteId=site')
  expect(createCohort).toHaveAttribute('target', '_blank')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByText('0 grupper valgt')).not.toBeInTheDocument()
  expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Sidegrupper' }))
  expect(screen.getByRole('link', { name: /Opprett din første sidegruppe/ })).toHaveAttribute(
    'href',
    '/sidegrupper?websiteId=site',
  )
})
