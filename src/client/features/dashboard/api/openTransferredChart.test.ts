// @vitest-environment-options {"url":"https://innblikk.ansatt.dev.nav.no"}
import { openTransferredChart } from './openTransferredChart'
import { fetchWebsites } from '../../../shared/api/websiteApi'

vi.mock('../../../shared/api/websiteApi', () => ({ fetchWebsites: vi.fn() }))

const firstId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const secondId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const chart = {
  title: 'Besøk',
  type: 'line' as const,
  sql: `SELECT * FROM events WHERE website_id IN ('${firstId}', '${secondId}')`,
}
const tab = {
  opener: window as Window | null,
  closed: false,
  location: { replace: vi.fn<(url: string) => void>() },
  close: vi.fn(),
}
const openTab = vi.fn<() => typeof tab | null>()

beforeEach(() => {
  vi.resetAllMocks()
  tab.opener = window
  tab.closed = false
  openTab.mockReturnValue(tab)
  vi.stubGlobal('open', openTab)
  vi.mocked(fetchWebsites).mockResolvedValue([
    { id: firstId, name: 'Første nettsted', domain: 'one.dev.nav.no', teamId: '', createdAt: '' },
    { id: secondId, name: 'Andre nettsted', domain: 'two.dev.nav.no', teamId: '', createdAt: '' },
    { id: 'other', name: 'Annet', domain: 'other.nav.no', teamId: '', createdAt: '' },
  ])
})

afterEach(() => vi.unstubAllGlobals())

it('opens a tab synchronously before fetching website labels and navigates with every referenced website', async () => {
  let finishFetch!: (value: Awaited<ReturnType<typeof fetchWebsites>>) => void
  const websites = await fetchWebsites()
  vi.mocked(fetchWebsites).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishFetch = resolve
      }),
  )
  const request = openTransferredChart(chart, undefined, 'prod')
  expect(openTab).toHaveBeenCalledWith('about:blank', '_blank')
  expect(tab.opener).toBeNull()
  expect(tab.location.replace).not.toHaveBeenCalled()
  finishFetch(websites)
  await request
  const url = new URL(vi.mocked(tab.location.replace).mock.calls[0][0])
  expect(url.origin).toBe('https://innblikk.ansatt.nav.no')
  expect(url.pathname).toBe('/importer-graf')
  expect(url.hash).toBe('')
  const payload: unknown = JSON.parse(url.searchParams.get('chart')!)
  expect(payload).toEqual({
    version: 1,
    sourceOrigin: window.location.origin,
    chart: {
      title: 'Besøk',
      graphType: 'LINE',
      width: 50,
      queries: [{ name: 'Besøk - query', sql: chart.sql }],
      sourceWebsites: websites
        .filter((website) => website.id !== 'other')
        .map(({ id, name, domain }) => ({ id, name, domain })),
    },
  })
})

it('reports a blocked popup without fetching or navigating', async () => {
  vi.stubGlobal(
    'open',
    vi.fn(() => null),
  )
  await expect(openTransferredChart(chart, undefined, 'prod')).rejects.toThrow('Nettleseren blokkerte')
  expect(fetchWebsites).not.toHaveBeenCalled()
  expect(tab.location.replace).not.toHaveBeenCalled()
})

it('closes the blank tab and reports a failed source fetch', async () => {
  vi.mocked(fetchWebsites).mockRejectedValue(new Error('Kunne ikke hente nettsteder'))
  await expect(openTransferredChart(chart, undefined, 'prod')).rejects.toThrow('Kunne ikke hente nettsteder')
  expect(tab.close).toHaveBeenCalledOnce()
  expect(tab.location.replace).not.toHaveBeenCalled()
})

it('skips the website fetch when the chart has no website references', async () => {
  await openTransferredChart({ ...chart, sql: 'SELECT 1' }, undefined, 'prod')
  expect(fetchWebsites).not.toHaveBeenCalled()
  expect(tab.location.replace).toHaveBeenCalledOnce()
})

it('does not navigate if the user closes the new tab before the source fetch completes', async () => {
  tab.closed = true
  await expect(openTransferredChart(chart, undefined, 'prod')).rejects.toThrow('Den nye fanen ble lukket')
  expect(tab.location.replace).not.toHaveBeenCalled()
})
