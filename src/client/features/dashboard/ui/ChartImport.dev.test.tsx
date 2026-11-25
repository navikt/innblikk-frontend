// @vitest-environment-options {"url":"https://innblikk.ansatt.dev.nav.no"}
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ChartImport from './ChartImport'
import { fetchCategories, fetchProjects, fetchDashboards } from '../../oversikt/api/oversiktApi'
import { fetchWebsites } from '../../../shared/api/websiteApi'
import { importTransferredChart } from '../api/importTransferredChart'
import { PRODUCTION_ORIGIN, clearChartImport, initializeChartImport } from '../utils/chartTransfer'

vi.mock('../../oversikt/api/oversiktApi', () => ({
  fetchCategories: vi.fn(),
  fetchProjects: vi.fn(),
  fetchDashboards: vi.fn(),
  createProject: vi.fn(),
  createDashboard: vi.fn(),
}))
vi.mock('../../../shared/api/websiteApi', () => ({ fetchWebsites: vi.fn() }))
vi.mock('../api/importTransferredChart', () => ({ importTransferredChart: vi.fn() }))

const existingId = '11111111-1111-1111-1111-111111111111'
const missingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const replacementId = '22222222-2222-2222-2222-222222222222'
beforeEach(() => {
  vi.resetAllMocks()
  clearChartImport()
  sessionStorage.clear()
  vi.mocked(fetchProjects).mockResolvedValue([{ id: 10, name: 'Dev-team' }])
  vi.mocked(fetchDashboards).mockResolvedValue([{ id: 20, projectId: 10, name: 'Dev-dashboard' }])
  vi.mocked(fetchCategories).mockResolvedValue([{ id: 30, dashboardId: 20, name: 'General' }])
  vi.mocked(fetchWebsites).mockResolvedValue([
    { id: existingId, name: 'Eksisterende', domain: 'existing.dev.nav.no', teamId: '', createdAt: '' },
    { id: replacementId, name: 'Erstatning', domain: 'replacement.dev.nav.no', teamId: '', createdAt: '' },
  ])
  vi.mocked(importTransferredChart).mockResolvedValue({ id: 40, categoryId: 30, name: 'Besøk' })
})

const renderImport = () =>
  render(
    <MemoryRouter initialEntries={['/importer-graf']}>
      <Routes>
        <Route path="/importer-graf" element={<ChartImport />} />
        <Route path="/dashboard/:id" element={<h1>Dev-dashboard åpnet</h1>} />
      </Routes>
    </MemoryRouter>,
  )

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
  const params = new URLSearchParams({
    importId: crypto.randomUUID(),
    chart: JSON.stringify({ version: 1, sourceOrigin: PRODUCTION_ORIGIN, chart: sourceChart }),
  })
  window.history.replaceState({}, '', `/importer-graf?${params}`)
  initializeChartImport()
  renderImport()
  await user.click(await screen.findByRole('combobox', { name: 'Team i dev' }))
  await user.click(await screen.findByRole('option', { name: 'Dev-team' }))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Dashboard i dev' })).toBeEnabled())
  await user.click(screen.getByRole('combobox', { name: 'Dashboard i dev' }))
  await user.click(await screen.findByRole('option', { name: 'Dev-dashboard' }))
  expect(screen.getByRole('button', { name: 'Legg til i Innblikk dev' })).toBeDisabled()
  expect(screen.queryByRole('link', { name: '#researchops' })).not.toBeInTheDocument()
  await user.type(screen.getByRole('combobox', { name: 'Velg nettsted i dev' }), 'replacement.dev.nav.no')
  await user.click(await screen.findByRole('option', { name: 'Erstatning (replacement.dev.nav.no)' }))
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
  expect(screen.getByRole('heading', { name: 'Dev-dashboard åpnet' })).toBeInTheDocument()
  expect(sessionStorage.length).toBe(0)
})

it('rejects an import opened from the same dev environment', () => {
  window.history.replaceState(
    {},
    '',
    `/importer-graf?importId=${crypto.randomUUID()}#${new URLSearchParams({
      chart: JSON.stringify({
        version: 1,
        sourceOrigin: window.location.origin,
        chart: { title: 'Besøk', graphType: 'LINE', width: 50, queries: [{ name: 'Besøk', sql: 'SELECT 1' }] },
      }),
    })}`,
  )
  renderImport()
  expect(screen.getByRole('alert')).toHaveTextContent('ugyldig eller tilhører feil miljø')
  expect(fetchProjects).not.toHaveBeenCalled()
})
