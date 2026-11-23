// @vitest-environment-options {"url":"https://innblikk.ansatt.nav.no"}
import { StrictMode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ChartImport from './ChartImport'
import {
  createDashboard,
  createProject,
  fetchCategories,
  fetchDashboards,
  fetchProjects,
} from '../../oversikt/api/oversiktApi'
import { importTransferredChart } from '../api/importTransferredChart'
import { clearChartImport, initializeChartImport } from '../utils/chartTransfer'
import { fetchWebsites } from '../../../shared/api/websiteApi'

vi.mock('../../oversikt/api/oversiktApi', () => ({
  fetchCategories: vi.fn(),
  fetchDashboards: vi.fn(),
  fetchProjects: vi.fn(),
  createProject: vi.fn(),
  createDashboard: vi.fn(),
}))
vi.mock('../api/importTransferredChart', () => ({ importTransferredChart: vi.fn() }))
vi.mock('../../../shared/api/websiteApi', () => ({ fetchWebsites: vi.fn() }))

const existingId = '11111111-1111-1111-1111-111111111111'
const secondProductionId = '22222222-2222-2222-2222-222222222222'
const missingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const secondMissingId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const origin = 'https://innblikk.ansatt.dev.nav.no'
const chart = {
  title: 'Besøk',
  graphType: 'LINE',
  width: 50,
  queries: [{ name: 'Besøk', sql: 'SELECT * FROM `team-researchops-dev-4396.umami_views.event`' }],
}

beforeEach(() => {
  vi.resetAllMocks()
  clearChartImport()
  sessionStorage.clear()
  vi.mocked(fetchProjects).mockResolvedValue([{ id: 10, name: 'Mitt team' }])
  vi.mocked(fetchDashboards).mockResolvedValue([{ id: 20, projectId: 10, name: 'Mitt dashboard' }])
  vi.mocked(fetchCategories).mockResolvedValue([{ id: 30, dashboardId: 20, name: 'General' }])
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 30, name: 'Besøk' })
  vi.mocked(fetchWebsites).mockResolvedValue([
    { id: existingId, name: 'Nettsted en', domain: 'one.nav.no', teamId: '', createdAt: '' },
    { id: secondProductionId, name: 'Nettsted to', domain: 'two.nav.no', teamId: '', createdAt: '' },
  ])
})

afterEach(() => vi.restoreAllMocks())

function ImportRoutes() {
  const location = useLocation()
  return (
    <>
      <Routes>
        <Route path="/importer-graf" element={<ChartImport />} />
        <Route path="/dashboard/:id" element={<h1>Måldashboard</h1>} />
        <Route path="/" element={<h1>Forside</h1>} />
      </Routes>
      <output aria-label="Gjeldende side">{location.pathname + location.search}</output>
    </>
  )
}

const renderRoutes = () =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
        <ImportRoutes />
      </MemoryRouter>
    </StrictMode>,
  )

const renderImport = (transferredChart: unknown = chart, sourceOrigin = origin) => {
  const params = new URLSearchParams({
    importId: crypto.randomUUID(),
    chart: JSON.stringify({ version: 1, sourceOrigin, chart: transferredChart }),
  })
  window.history.replaceState({}, '', `/importer-graf?${params}`)
  initializeChartImport()
  return renderRoutes()
}

const comboboxOptions = (input: HTMLElement) => {
  const popupId = input.getAttribute('aria-controls')
  const popup = popupId ? document.getElementById(popupId) : null
  if (!popup) throw new Error('Combobox option list is missing')
  return within(popup)
}

const chooseComboboxOption = async (user: ReturnType<typeof userEvent.setup>, label: string, option: string) => {
  const input = await screen.findByRole('combobox', { name: label })
  await waitFor(() => expect(input).toBeEnabled())
  await user.click(input)
  await user.click(await comboboxOptions(input).findByRole('option', { name: option }))
}

const typeNewOption = async (user: ReturnType<typeof userEvent.setup>, label: string, name: string) => {
  const input = await screen.findByRole('combobox', { name: label })
  await waitFor(() => expect(input).toBeEnabled())
  await user.click(input)
  await user.clear(input)
  await user.type(input, name)
  await user.keyboard('{Enter}')
}

const selectDashboard = async () => {
  const user = userEvent.setup()
  await chooseComboboxOption(user, 'Team i prod', 'Mitt team')
  await chooseComboboxOption(user, 'Dashboard i prod', 'Mitt dashboard')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeEnabled())
  return user
}

it('imports in a standalone tab without SQL and navigates only after saving completes', async () => {
  let finishSave!: () => void
  vi.mocked(importTransferredChart).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSave = () => resolve({ id: 40, categoryId: 30, name: 'Besøk' })
      }),
  )
  renderImport()
  const user = await selectDashboard()
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  expect(screen.getByRole('textbox', { name: 'Grafnavn' })).toHaveValue('Besøk')
  expect(screen.getAllByRole('heading')).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'Legg til i Innblikk prod' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Fane')).not.toBeInTheDocument()
  expect(window.location.hash).toBe('')
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, chart, 'prod', 30)
  expect(screen.queryByRole('heading', { name: 'Måldashboard' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Avbryt' })).toBeDisabled()
  await act(async () => {
    finishSave()
    await Promise.resolve()
  })
  expect(screen.getByRole('heading', { name: 'Måldashboard' })).toBeInTheDocument()
  expect(screen.getByLabelText('Gjeldende side')).toHaveTextContent('/dashboard/20?categoryId=30')
  expect(sessionStorage.length).toBe(0)
})

it('keeps the form and pending import after a failed save without navigating', async () => {
  vi.mocked(importTransferredChart).mockRejectedValue(new Error('Kunne ikke lagre'))
  renderImport()
  const user = await selectDashboard()
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Kunne ikke lagre')
  expect(screen.queryByRole('heading', { name: 'Måldashboard' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeEnabled()
  expect(sessionStorage.length).toBe(1)
})

it('does not allow another save if storage cleanup fails after the chart has been saved', async () => {
  renderImport()
  const user = await selectDashboard()
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new DOMException('Storage blocked', 'SecurityError')
  })
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Kunne ikke fjerne importdata')
  expect(screen.getByText(/Grafen er lagret i prod/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Åpne dashboard' })).toHaveAttribute('href', '/dashboard/20?categoryId=30')
  expect(screen.queryByRole('button', { name: 'Legg til i Innblikk prod' })).not.toBeInTheDocument()
  expect(importTransferredChart).toHaveBeenCalledOnce()
})

it('rejects an invalid source without loading production data', () => {
  renderImport(chart, 'https://evil.test')
  expect(screen.getByRole('alert')).toHaveTextContent('ugyldig eller tilhører feil miljø')
  expect(fetchProjects).not.toHaveBeenCalled()
  expect(fetchWebsites).not.toHaveBeenCalled()
})

it('explains how to retry if a login redirect lost the chart fragment', () => {
  window.history.replaceState({}, '', `/importer-graf?importId=${crypto.randomUUID()}`)
  renderRoutes()
  expect(screen.getByRole('alert')).toHaveTextContent('Hvis du nettopp logget inn')
  expect(fetchProjects).not.toHaveBeenCalled()
})

it('restores the pending chart on reload after removing the fragment', async () => {
  const view = renderImport()
  await screen.findByRole('textbox', { name: 'Grafnavn' })
  expect(window.location.hash).toBe('')
  view.unmount()
  renderRoutes()
  expect(await screen.findByRole('textbox', { name: 'Grafnavn' })).toHaveValue('Besøk')
})

it('clears pending import data when cancelled', async () => {
  renderImport()
  await screen.findByRole('textbox', { name: 'Grafnavn' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Avbryt' }))
  expect(screen.getByRole('heading', { name: 'Forside' })).toBeInTheDocument()
  expect(sessionStorage.length).toBe(0)
})

it('keeps all valid website IDs unchanged without showing a website picker', async () => {
  const validChart = {
    ...chart,
    sourceWebsites: [
      { id: existingId, name: 'Nettsted en', domain: 'one.dev.nav.no' },
      { id: secondProductionId, name: 'Nettsted to', domain: 'two.dev.nav.no' },
    ],
    queries: [
      { name: 'Besøk', sql: `SELECT * FROM events WHERE website_id IN ('${existingId}', '${secondProductionId}')` },
    ],
  }
  renderImport(validChart)
  const user = await selectDashboard()
  expect(screen.queryByLabelText('Velg nettsted i prod')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, validChart, 'prod', 30)
})

it('requires separate valid replacements for missing IDs and keeps existing IDs across variants', async () => {
  const user = userEvent.setup()
  const multiChart = {
    ...chart,
    sourceWebsites: [
      { id: missingId, name: 'Første dev-nettsted', domain: 'one.dev.nav.no' },
      { id: secondMissingId, name: 'Andre dev-nettsted', domain: 'two.dev.nav.no' },
    ],
    queries: [
      {
        name: 'Alle',
        sql: `SELECT * FROM events WHERE website_id IN ('${existingId}', '${missingId}', '${secondMissingId}')`,
      },
      { name: 'Andre', sql: `SELECT * FROM events WHERE website_id = '${secondMissingId}'` },
    ],
  }
  renderImport(multiChart)
  await chooseComboboxOption(user, 'Team i prod', 'Mitt team')
  await chooseComboboxOption(user, 'Dashboard i prod', 'Mitt dashboard')
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  const firstWebsite = screen.getByRole('combobox', { name: 'Velg nettsted i prod for Første dev-nettsted' })
  await user.type(firstWebsite, 'one.nav.no')
  expect(firstWebsite).toHaveValue('one.nav.no')
  expect(
    comboboxOptions(firstWebsite).queryByRole('option', { name: 'Nettsted to (two.nav.no)' }),
  ).not.toBeInTheDocument()
  await user.click(await comboboxOptions(firstWebsite).findByRole('option', { name: 'Nettsted en (one.nav.no)' }))
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  const secondWebsite = screen.getByRole('combobox', { name: 'Velg nettsted i prod for Andre dev-nettsted' })
  await user.type(secondWebsite, 'Nettsted to')
  expect(
    comboboxOptions(secondWebsite).queryByRole('option', { name: 'Nettsted en (one.nav.no)' }),
  ).not.toBeInTheDocument()
  await user.click(await comboboxOptions(secondWebsite).findByRole('option', { name: 'Nettsted to (two.nav.no)' }))
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeEnabled()
  await chooseComboboxOption(user, 'Velg nettsted i prod for Første dev-nettsted', 'Nettsted en (one.nav.no)')
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  await chooseComboboxOption(user, 'Velg nettsted i prod for Første dev-nettsted', 'Nettsted en (one.nav.no)')
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  expect(screen.getAllByText(/Velg nettstedet som skal brukes\./)).toHaveLength(2)
  expect(screen.queryByText(/Fant ikke samme nettsted-ID/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: '#researchops' })).toHaveLength(1)
  expect(screen.getByRole('link', { name: '#researchops' })).toHaveAttribute(
    'href',
    'https://nav-it.slack.com/archives/C02UGFS2J4B',
  )
  expect(screen.getByText(/Hvis nettstedet mangler sporingskode for prod/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(
    10,
    20,
    {
      ...multiChart,
      queries: [
        {
          name: 'Alle',
          sql: `SELECT * FROM events WHERE website_id IN ('${existingId}', '${existingId}', '${secondProductionId}')`,
        },
        { name: 'Andre', sql: `SELECT * FROM events WHERE website_id = '${secondProductionId}'` },
      ],
    },
    'prod',
    30,
  )
})

it('blocks saving and shows an error if the production website list cannot be loaded', async () => {
  vi.mocked(fetchWebsites).mockRejectedValue(new Error('Kunne ikke hente nettsteder'))
  renderImport()
  expect(await screen.findByRole('alert')).toHaveTextContent('Kunne ikke hente nettsteder')
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  expect(importTransferredChart).not.toHaveBeenCalled()
})

it('shows ordered tabs only for dashboards with multiple tabs and saves to the chosen tab', async () => {
  vi.mocked(fetchCategories).mockResolvedValue([
    { id: 31, dashboardId: 20, name: 'Detaljer', ordering: 1 },
    { id: 30, dashboardId: 20, name: 'General', ordering: 0 },
  ])
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 31, name: 'Besøk' })
  renderImport()
  const user = await selectDashboard()
  const tabs = await screen.findByLabelText('Fane')
  expect(tabs).toHaveValue('30')
  expect(screen.getByRole('option', { name: 'Fane 1' })).toBeInTheDocument()
  await user.selectOptions(tabs, '31')
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, chart, 'prod', 31)
  expect(screen.getByLabelText('Gjeldende side')).toHaveTextContent('/dashboard/20?categoryId=31')
})

it('resets tab selection when switching dashboards and hides the picker for a single tab', async () => {
  vi.mocked(fetchDashboards).mockResolvedValue([
    { id: 20, projectId: 10, name: 'Mitt dashboard' },
    { id: 21, projectId: 10, name: 'Annet dashboard' },
  ])
  vi.mocked(fetchCategories)
    .mockResolvedValueOnce([
      { id: 30, dashboardId: 20, name: 'General' },
      { id: 31, dashboardId: 20, name: 'Detaljer' },
    ])
    .mockResolvedValueOnce([{ id: 32, dashboardId: 21, name: 'General' }])
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 32, name: 'Besøk' })
  renderImport()
  const user = await selectDashboard()
  await user.selectOptions(await screen.findByLabelText('Fane'), '31')
  await chooseComboboxOption(user, 'Dashboard i prod', 'Annet dashboard')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeEnabled())
  expect(screen.queryByLabelText('Fane')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 21, chart, 'prod', 32)
})

it('blocks saving while tabs load and after a tab-loading error', async () => {
  const user = userEvent.setup()
  let rejectTabs!: (error: Error) => void
  vi.mocked(fetchCategories).mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectTabs = reject
      }),
  )
  renderImport()
  await chooseComboboxOption(user, 'Team i prod', 'Mitt team')
  await chooseComboboxOption(user, 'Dashboard i prod', 'Mitt dashboard')
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  await act(async () => {
    rejectTabs(new Error('Kunne ikke hente faner'))
    await Promise.resolve()
  })
  expect(await screen.findByRole('alert')).toHaveTextContent('Kunne ikke hente faner')
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  expect(importTransferredChart).not.toHaveBeenCalled()
})

it('keeps the default-tab creation behavior when the dashboard has no tabs', async () => {
  vi.mocked(fetchCategories).mockResolvedValue([])
  renderImport()
  const user = await selectDashboard()
  expect(screen.queryByLabelText('Fane')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, chart, 'prod', undefined)
})

it('lets the user rename the copy without changing the original chart or query variants', async () => {
  renderImport()
  const user = await selectDashboard()
  const name = screen.getByRole('textbox', { name: 'Grafnavn' })
  await user.clear(name)
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  expect(screen.getByText('Skriv et grafnavn.')).toBeInTheDocument()
  await user.type(name, '  Besøk i prod  ')
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, { ...chart, title: 'Besøk i prod' }, 'prod', 30)
  expect(chart.title).toBe('Besøk')
})

it('creates a team and dashboard from the comboboxes, then saves the chart there', async () => {
  const user = userEvent.setup()
  vi.mocked(fetchProjects).mockResolvedValue([])
  vi.mocked(fetchDashboards).mockResolvedValue([])
  vi.mocked(fetchCategories).mockResolvedValue([])
  vi.mocked(createProject).mockResolvedValue({ id: 11, name: 'Nytt team' })
  vi.mocked(createDashboard).mockResolvedValue({ id: 21, projectId: 11, name: 'Nytt dashboard' })
  renderImport()
  await typeNewOption(user, 'Team i prod', 'Nytt team')
  await typeNewOption(user, 'Dashboard i prod', 'Nytt dashboard')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeEnabled())
  expect(createProject).toHaveBeenCalledExactlyOnceWith('Nytt team')
  expect(createDashboard).toHaveBeenCalledExactlyOnceWith(11, 'Nytt dashboard')
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(11, 21, chart, 'prod', undefined)
})

it('blocks saving and cancellation during team creation and allows retry after a failed creation', async () => {
  const user = userEvent.setup()
  let rejectCreation!: (error: Error) => void
  vi.mocked(createProject)
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCreation = reject
        }),
    )
    .mockResolvedValue({ id: 11, name: 'Nytt team' })
  renderImport()
  await typeNewOption(user, 'Team i prod', 'Nytt team')
  expect(screen.getByRole('button', { name: 'Avbryt' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  await act(async () => {
    rejectCreation(new Error('Kunne ikke opprette team'))
    await Promise.resolve()
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Kunne ikke opprette team')
  await typeNewOption(user, 'Team i prod', 'Nytt team')
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Dashboard i prod' })).toBeEnabled())
  expect(createProject).toHaveBeenCalledTimes(2)
})

it('keeps the selected team and allows retry after a dashboard creation fails', async () => {
  const user = userEvent.setup()
  vi.mocked(fetchDashboards).mockResolvedValue([])
  vi.mocked(fetchCategories).mockResolvedValue([])
  vi.mocked(createDashboard)
    .mockRejectedValueOnce(new Error('Kunne ikke opprette dashboard'))
    .mockResolvedValue({ id: 21, projectId: 10, name: 'Nytt dashboard' })
  renderImport()
  await chooseComboboxOption(user, 'Team i prod', 'Mitt team')
  await typeNewOption(user, 'Dashboard i prod', 'Nytt dashboard')
  expect(await screen.findByRole('alert')).toHaveTextContent('Kunne ikke opprette dashboard')
  await typeNewOption(user, 'Dashboard i prod', 'Nytt dashboard')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeEnabled())
  expect(createDashboard).toHaveBeenNthCalledWith(1, 10, 'Nytt dashboard')
  expect(createDashboard).toHaveBeenNthCalledWith(2, 10, 'Nytt dashboard')
})
