// @vitest-environment-options {"url":"https://innblikk.ansatt.dev.nav.no"}
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChartImport from './ChartImport'
import { fetchCategories, fetchProjects, fetchDashboards } from '../../oversikt/api/oversiktApi'
import { fetchWebsites } from '../../../shared/api/websiteApi'
import { importTransferredChart } from '../api/importTransferredChart'
import { PRODUCTION_ORIGIN, TRANSFER_CHANNEL } from '../utils/chartTransfer'

vi.mock('../../oversikt/api/oversiktApi', () => ({
  fetchCategories: vi.fn(),
  fetchProjects: vi.fn(),
  fetchDashboards: vi.fn(),
}))
vi.mock('../../../shared/api/websiteApi', () => ({ fetchWebsites: vi.fn() }))
vi.mock('../api/importTransferredChart', () => ({ importTransferredChart: vi.fn() }))

const existingId = '11111111-1111-1111-1111-111111111111'
const missingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const replacementId = '22222222-2222-2222-2222-222222222222'
const parentWindow = { postMessage: vi.fn() }
const originalParent = Object.getOwnPropertyDescriptor(window, 'parent')!

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState({}, '', `/importer-graf?origin=${encodeURIComponent(PRODUCTION_ORIGIN)}&requestId=test`)
  Object.defineProperty(window, 'parent', { configurable: true, value: parentWindow })
  vi.mocked(fetchProjects).mockResolvedValue([{ id: 10, name: 'Dev-team' }])
  vi.mocked(fetchDashboards).mockResolvedValue([{ id: 20, projectId: 10, name: 'Dev-dashboard' }])
  vi.mocked(fetchCategories).mockResolvedValue([{ id: 30, dashboardId: 20, name: 'General' }])
  vi.mocked(fetchWebsites).mockResolvedValue([
    { id: existingId, name: 'Eksisterende', domain: 'existing.dev.nav.no', teamId: '', createdAt: '' },
    { id: replacementId, name: 'Erstatning', domain: 'replacement.dev.nav.no', teamId: '', createdAt: '' },
  ])
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 30, name: 'Besøk' })
})

afterEach(() => Object.defineProperty(window, 'parent', originalParent))

it('imports from prod into dev, preserving matching IDs and requiring a dev replacement for missing IDs', async () => {
  const user = userEvent.setup()
  const sourceChart = {
    title: 'Besøk',
    graphType: 'LINE',
    width: 50,
    queries: [
      {
        name: 'Besøk',
        sql: `SELECT * FROM \`team-researchops-prod-01d6.umami_views.event\` WHERE website_id IN ('${existingId}', '${missingId}')`,
      },
    ],
  }
  render(<ChartImport />)
  await act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: PRODUCTION_ORIGIN,
        source: window.parent,
        data: { channel: TRANSFER_CHANNEL, type: 'chart', requestId: 'test', chart: sourceChart },
      }),
    ),
  )
  await user.selectOptions(await screen.findByLabelText('Team i dev'), '10')
  await screen.findByRole('option', { name: 'Dev-dashboard' })
  await user.selectOptions(screen.getByLabelText('Dashboard i dev'), '20')
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk dev' })).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('Velg nettsted i dev'), replacementId)
  await user.click(screen.getByRole('button', { name: 'Legg til i Innblikk dev' }))
  expect(importTransferredChart).toHaveBeenCalledWith(
    10,
    20,
    {
      ...sourceChart,
      queries: [
        {
          name: 'Besøk',
          sql: `SELECT * FROM \`team-researchops-prod-01d6.umami_views.event\` WHERE website_id IN ('${existingId}', '${replacementId}')`,
        },
      ],
    },
    'dev',
    30,
  )
  expect(parentWindow.postMessage).toHaveBeenCalledWith(
    {
      channel: TRANSFER_CHANNEL,
      type: 'saved',
      requestId: 'test',
      dashboardId: 20,
    },
    PRODUCTION_ORIGIN,
  )
})

it('rejects an import opened from the same dev environment', () => {
  window.history.replaceState(
    {},
    '',
    `/importer-graf?origin=${encodeURIComponent(window.location.origin)}&requestId=test`,
  )
  render(<ChartImport />)
  expect(screen.getByRole('alert')).toHaveTextContent('Åpne «Legg til i Innblikk» fra grafmenyen')
  expect(fetchProjects).not.toHaveBeenCalled()
})
