import * as api from '../../oversikt/api/oversiktApi'
import { importTransferredChart } from './importTransferredChart'
import type { TransferChart } from '../utils/chartTransfer'

vi.mock('../../oversikt/api/oversiktApi', () => ({
  fetchCategories: vi.fn(),
  createCategory: vi.fn(),
  createGraph: vi.fn(),
  createQuery: vi.fn(),
  deleteGraph: vi.fn(),
}))

const chart: TransferChart = {
  title: 'Besøk',
  graphType: 'BAR',
  width: 50,
  description: 'Forklaring',
  queries: [
    { name: 'En', sql: 'SELECT * FROM `team-researchops-dev-4396.umami_views.event`' },
    { name: 'To', sql: 'SELECT * FROM `team-researchops-dev-4396.umami_views.session`' },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.fetchCategories).mockResolvedValue([{ id: 30, dashboardId: 20, name: 'Standard' }])
  vi.mocked(api.createGraph).mockResolvedValue({ id: 40, categoryId: 30, name: 'Besøk' })
  vi.mocked(api.createQuery).mockResolvedValue({ id: 50, graphId: 40, name: 'En', sqlText: 'SELECT 1' })
  vi.mocked(api.deleteGraph).mockResolvedValue()
})

it('saves metadata and converted query variants to the selected production dashboard', async () => {
  await importTransferredChart(10, 20, chart, 'prod')
  expect(api.createGraph).toHaveBeenCalledWith(10, 20, 30, {
    name: 'Besøk',
    graphType: 'BAR',
    width: 50,
    description: 'Forklaring',
  })
  expect(api.createQuery).toHaveBeenNthCalledWith(1, 10, 20, 30, 40, {
    name: 'En',
    sqlText: 'SELECT * FROM `team-researchops-prod-01d6.umami_views.event`',
  })
  expect(api.createQuery).toHaveBeenNthCalledWith(2, 10, 20, 30, 40, {
    name: 'To',
    sqlText: 'SELECT * FROM `team-researchops-prod-01d6.umami_views.session`',
  })
})

it('creates a default tab when the target dashboard has none', async () => {
  vi.mocked(api.fetchCategories).mockResolvedValue([])
  vi.mocked(api.createCategory).mockResolvedValue({ id: 30, dashboardId: 20, name: 'Standard' })
  await importTransferredChart(10, 20, chart, 'prod')
  expect(api.createCategory).toHaveBeenCalledWith(10, 20, 'Standard')
})

it('saves the chart and every query in the selected tab instead of the first tab', async () => {
  vi.mocked(api.fetchCategories).mockResolvedValue([
    { id: 30, dashboardId: 20, name: 'General' },
    { id: 31, dashboardId: 20, name: 'Detaljer' },
  ])
  vi.mocked(api.createGraph).mockResolvedValue({ id: 40, categoryId: 31, name: 'Besøk' })
  await importTransferredChart(10, 20, chart, 'prod', 31)
  expect(api.createGraph).toHaveBeenCalledWith(10, 20, 31, expect.objectContaining({ name: 'Besøk' }))
  expect(api.createQuery).toHaveBeenNthCalledWith(1, 10, 20, 31, 40, expect.objectContaining({ name: 'En' }))
  expect(api.createQuery).toHaveBeenNthCalledWith(2, 10, 20, 31, 40, expect.objectContaining({ name: 'To' }))
})

it('does not silently switch tabs if the selected tab no longer exists', async () => {
  await expect(importTransferredChart(10, 20, chart, 'prod', 31)).rejects.toThrow('Fanen finnes ikke lenger')
  expect(api.createGraph).not.toHaveBeenCalled()
  expect(api.createCategory).not.toHaveBeenCalled()
})

it('removes the incomplete chart if saving a variant fails and reports the failure', async () => {
  vi.mocked(api.createQuery).mockRejectedValueOnce(new Error('Avvist'))
  await expect(importTransferredChart(10, 20, chart, 'prod')).rejects.toThrow('Avvist')
  expect(api.deleteGraph).toHaveBeenCalledWith(10, 20, 30, 40)
})

it('explicitly reports when removing an incomplete chart also fails', async () => {
  vi.mocked(api.createQuery).mockRejectedValueOnce(new Error('Avvist'))
  vi.mocked(api.deleteGraph).mockRejectedValueOnce(new Error('Kunne ikke slette'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(importTransferredChart(10, 20, chart, 'prod')).rejects.toThrow('ufullstendige grafen kunne ikke fjernes')
  expect(log).toHaveBeenCalled()
  log.mockRestore()
})

it('converts all production query variants to dev tables when importing into dev', async () => {
  const sourceChart = {
    ...chart,
    queries: chart.queries.map((query) => ({
      ...query,
      sql: query.sql.replace(/team-researchops-dev-4396/g, 'team-researchops-prod-01d6'),
    })),
  }
  await importTransferredChart(10, 20, sourceChart, 'dev')
  expect(api.createQuery).toHaveBeenNthCalledWith(1, 10, 20, 30, 40, {
    name: 'En',
    sqlText: 'SELECT * FROM `team-researchops-dev-4396.umami_views.event`',
  })
  expect(api.createQuery).toHaveBeenNthCalledWith(2, 10, 20, 30, 40, {
    name: 'To',
    sqlText: 'SELECT * FROM `team-researchops-dev-4396.umami_views.session`',
  })
})
