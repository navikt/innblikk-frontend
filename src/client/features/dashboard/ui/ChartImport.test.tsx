// @vitest-environment-options {"url":"https://innblikk.ansatt.nav.no"}
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChartImport from './ChartImport'
import { fetchCategories, fetchDashboards, fetchProjects } from '../../oversikt/api/oversiktApi'
import { importTransferredChart } from '../api/importTransferredChart'
import { TRANSFER_CHANNEL } from '../utils/chartTransfer'
import { fetchWebsites } from '../../../shared/api/websiteApi'

vi.mock('../../oversikt/api/oversiktApi', () => ({
  fetchCategories: vi.fn(),
  fetchDashboards: vi.fn(),
  fetchProjects: vi.fn(),
}))
vi.mock('../api/importTransferredChart', () => ({ importTransferredChart: vi.fn() }))
vi.mock('../../../shared/api/websiteApi', () => ({ fetchWebsites: vi.fn() }))

const existingId = '11111111-1111-1111-1111-111111111111'
const secondProductionId = '22222222-2222-2222-2222-222222222222'
const missingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const secondMissingId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const origin = 'https://innblikk.ansatt.dev.nav.no'
const parentWindow = { postMessage: vi.fn() }
const originalParent = Object.getOwnPropertyDescriptor(window, 'parent')!
const chart = {
  title: 'Besøk',
  graphType: 'LINE',
  width: 50,
  queries: [{ name: 'Besøk', sql: 'SELECT * FROM `team-researchops-dev-4396.umami_views.event`' }],
}

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState({}, '', `/importer-graf?origin=${encodeURIComponent(origin)}&requestId=test`)
  Object.defineProperty(window, 'parent', { configurable: true, value: parentWindow })
  vi.mocked(fetchProjects).mockResolvedValue([{ id: 10, name: 'Mitt team' }])
  vi.mocked(fetchDashboards).mockResolvedValue([{ id: 20, projectId: 10, name: 'Mitt dashboard' }])
  vi.mocked(fetchCategories).mockResolvedValue([{ id: 30, dashboardId: 20, name: 'General' }])
  vi.mocked(fetchWebsites).mockResolvedValue([
    { id: existingId, name: 'Nettsted en', domain: 'one.nav.no', teamId: '', createdAt: '' },
    { id: secondProductionId, name: 'Nettsted to', domain: 'two.nav.no', teamId: '', createdAt: '' },
  ])
})

afterEach(() => {
  Object.defineProperty(window, 'parent', originalParent)
})

const receiveChart = (sourceOrigin = origin, transferredChart: unknown = chart) =>
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: sourceOrigin,
        source: window.parent,
        data: { channel: TRANSFER_CHANNEL, requestId: 'test', type: 'chart', chart: transferredChart },
      }),
    ),
  )

it('lets the user choose team/dashboard without SQL and acknowledges only after saving completes', async () => {
  const user = userEvent.setup()
  let finishSave!: () => void
  vi.mocked(importTransferredChart).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSave = () => resolve({ id: 40, categoryId: 30, name: 'Besøk' })
      }),
  )
  render(<ChartImport />)
  await receiveChart('https://evil.test')
  expect(screen.queryByText('Graf: Besøk')).not.toBeInTheDocument()
  await receiveChart()
  await user.selectOptions(await screen.findByLabelText('Team i prod'), '10')
  await waitFor(() => expect(screen.getByRole('option', { name: 'Mitt dashboard' })).toBeInTheDocument())
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '20')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: /Lagre graf|Legg til i Innblikk|Eksporter graf/ }),
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Fane')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, chart, 'prod', 30)
  expect(parentWindow.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'saved' }), origin)
  await act(async () => {
    finishSave()
    await Promise.resolve()
  })
  expect(parentWindow.postMessage).toHaveBeenCalledWith(
    {
      channel: TRANSFER_CHANNEL,
      requestId: 'test',
      type: 'saved',
      dashboardId: 20,
    },
    origin,
  )
})

it('keeps the form open and reports a failed save without sending a success message', async () => {
  const user = userEvent.setup()
  vi.mocked(importTransferredChart).mockRejectedValue(new Error('Kunne ikke lagre'))
  render(<ChartImport />)
  await receiveChart()
  await user.selectOptions(await screen.findByLabelText('Team i prod'), '10')
  await screen.findByRole('option', { name: 'Mitt dashboard' })
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '20')
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Kunne ikke lagre')
  expect(parentWindow.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'saved' }), origin)
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeEnabled()
})

it('does not load production data when opened without a trusted dev parent', () => {
  window.history.replaceState({}, '', '/importer-graf?origin=https://evil.test&requestId=test')
  render(<ChartImport />)
  expect(screen.getByRole('alert')).toHaveTextContent('Åpne «Legg til i Innblikk» fra grafmenyen')
  expect(fetchProjects).not.toHaveBeenCalled()
  expect(fetchWebsites).not.toHaveBeenCalled()
})

it('keeps all valid website IDs unchanged without showing a website picker', async () => {
  const user = userEvent.setup()
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 30, name: 'Besøk' })
  const validChart = {
    ...chart,
    queries: [
      { name: 'Besøk', sql: `SELECT * FROM events WHERE website_id IN ('${existingId}', '${secondProductionId}')` },
    ],
  }
  render(<ChartImport />)
  await receiveChart(origin, validChart)
  await user.selectOptions(await screen.findByLabelText('Team i prod'), '10')
  await screen.findByRole('option', { name: 'Mitt dashboard' })
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '20')
  expect(screen.queryByLabelText('Velg nettsted i prod')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, validChart, 'prod', 30)
})

it('requires separate valid replacements for missing IDs and keeps existing IDs across variants', async () => {
  const user = userEvent.setup()
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 30, name: 'Besøk' })
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
  render(<ChartImport />)
  await receiveChart(origin, multiChart)
  await user.selectOptions(await screen.findByLabelText('Team i prod'), '10')
  await screen.findByRole('option', { name: 'Mitt dashboard' })
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '20')
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('Velg nettsted i prod for Første dev-nettsted'), existingId)
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('Velg nettsted i prod for Andre dev-nettsted'), secondProductionId)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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
  render(<ChartImport />)
  await receiveChart()
  expect(await screen.findByRole('alert')).toHaveTextContent('Kunne ikke hente nettsteder')
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeDisabled()
  expect(importTransferredChart).not.toHaveBeenCalled()
})

it('shows ordered tabs only for dashboards with multiple tabs and saves to the chosen tab', async () => {
  const user = userEvent.setup()
  vi.mocked(fetchCategories).mockResolvedValue([
    { id: 31, dashboardId: 20, name: 'Detaljer', ordering: 1 },
    { id: 30, dashboardId: 20, name: 'General', ordering: 0 },
  ])
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 31, name: 'Besøk' })
  render(<ChartImport />)
  await receiveChart()
  await user.selectOptions(await screen.findByLabelText('Team i prod'), '10')
  await screen.findByRole('option', { name: 'Mitt dashboard' })
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '20')
  const tabs = await screen.findByLabelText('Fane')
  expect(tabs).toHaveValue('30')
  expect(screen.getByRole('option', { name: 'Fane 1' })).toBeInTheDocument()
  await user.selectOptions(tabs, '31')
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, chart, 'prod', 31)
})

it('resets tab selection when switching dashboards and hides the picker for a single tab', async () => {
  const user = userEvent.setup()
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
  render(<ChartImport />)
  await receiveChart()
  await user.selectOptions(await screen.findByLabelText('Team i prod'), '10')
  await screen.findByRole('option', { name: 'Mitt dashboard' })
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '20')
  await user.selectOptions(await screen.findByLabelText('Fane'), '31')
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '21')
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
  render(<ChartImport />)
  await receiveChart()
  await user.selectOptions(await screen.findByLabelText('Team i prod'), '10')
  await screen.findByRole('option', { name: 'Mitt dashboard' })
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '20')
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
  const user = userEvent.setup()
  vi.mocked(fetchCategories).mockResolvedValue([])
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 30, name: 'Besøk' })
  render(<ChartImport />)
  await receiveChart()
  await user.selectOptions(await screen.findByLabelText('Team i prod'), '10')
  await screen.findByRole('option', { name: 'Mitt dashboard' })
  await user.selectOptions(screen.getByLabelText('Dashboard i prod'), '20')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Legg til i Innblikk prod' })).toBeEnabled())
  expect(screen.queryByLabelText('Fane')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk prod' }))
  expect(importTransferredChart).toHaveBeenCalledWith(10, 20, chart, 'prod', undefined)
})
