import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterState } from '../../oversikt/model/types.ts'
import Canvas from './Canvas.tsx'
import { fetchCanvasStorageData } from '../api/canvasStorageApi.ts'
import { fetchDashboards, updateDashboard } from '../../oversikt/api/oversiktApi.ts'

vi.mock('../api/canvasStorageApi.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchCanvasStorageData: vi.fn(),
}))
vi.mock('../../oversikt/api/oversiktApi.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchDashboards: vi.fn(),
  updateDashboard: vi.fn().mockResolvedValue({}),
}))
vi.mock('../hooks/useCanvasBackgroundSync.ts', () => ({ default: vi.fn() }))
vi.mock('@navikt/ds-react', async (importOriginal) => ({
  ...(await importOriginal()),
  Textarea: () => null,
}))
const ws = vi.hoisted(() => ({
  isConnected: true,
  subscribe: () => () => {},
  broadcast: vi.fn(),
  sendRaw: vi.fn(),
}))
vi.mock('../hooks/useCanvasWebSocket.ts', () => ({
  default: () => ws,
}))
vi.mock('./layers/CanvasFrameLayer.tsx', () => ({
  default: ({ dashboardWidgetFilters }: { dashboardWidgetFilters: FilterState }) => (
    <output data-testid="chart-url-filter">{JSON.stringify(dashboardWidgetFilters.urlFilters)}</output>
  ),
}))

describe('Canvas URL filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', '/canvas?projectId=1&dashboardId=2')
    vi.mocked(fetchDashboards).mockResolvedValue([
      { id: 2, projectId: 1, name: 'Canvas', description: '[canvas] [urlPath:%2F]' },
    ])
    vi.mocked(fetchCanvasStorageData).mockResolvedValue({
      categories: [],
      connections: [],
      frames: [
        {
          id: 'chart',
          kind: 'chart',
          label: 'Chart',
          x: 0,
          y: 0,
          refreshNonce: 0,
          chartSql: 'SELECT * FROM events WHERE {{url_sti}}',
        },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [], participants: [], locks: [] }),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderCanvas() {
    return render(
      <MemoryRouter initialEntries={['/canvas?projectId=1&dashboardId=2']}>
        <Canvas />
      </MemoryRouter>,
    )
  }

  it('allows deleting the slash and typing a replacement without rewriting the input', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const input = await screen.findByRole('textbox', { name: 'URL-sti' })
    expect(input).toHaveValue('/')
    await user.click(input)
    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('')
    expect(screen.getByTestId('chart-url-filter')).toHaveTextContent('[]')

    await user.type(input, 'arbeid')
    expect(input).toHaveValue('arbeid')
    await waitFor(() => expect(screen.getByTestId('chart-url-filter')).toHaveTextContent('["/arbeid"]'))
  })

  it('keeps a full URL editable while using its path in charts', async () => {
    const user = userEvent.setup()
    renderCanvas()
    const input = await screen.findByRole('textbox', { name: 'URL-sti' })
    await user.clear(input)
    await user.type(input, 'https://www.nav.no/arbeid?lang=nb')
    expect(input).toHaveValue('https://www.nav.no/arbeid?lang=nb')
    await waitFor(() => expect(screen.getByTestId('chart-url-filter')).toHaveTextContent('["/arbeid"]'))
  })

  it('does not select the homepage when no default URL is saved', async () => {
    vi.mocked(fetchDashboards).mockResolvedValue([{ id: 2, projectId: 1, name: 'Canvas', description: '[canvas]' }])
    renderCanvas()
    expect(await screen.findByRole('textbox', { name: 'URL-sti' })).toHaveValue('')
    expect(screen.getByTestId('chart-url-filter')).toHaveTextContent('[]')
  })

  it('saves an empty default URL without restoring the homepage filter', async () => {
    const user = userEvent.setup()
    renderCanvas()
    await screen.findByRole('textbox', { name: 'URL-sti' })
    await user.click(screen.getByRole('button', { name: 'Innstillinger' }))
    await user.click(screen.getByRole('menuitem', { name: 'Innstillinger' }))
    await user.clear(screen.getByRole('textbox', { name: 'Standard URL-sti' }))
    await user.click(screen.getByRole('button', { name: 'Lagre' }))

    await waitFor(() => expect(updateDashboard).toHaveBeenCalled())
    expect(vi.mocked(updateDashboard).mock.calls[0][2].description).not.toContain('[urlPath:')
    expect(screen.getByRole('textbox', { name: 'URL-sti' })).toHaveValue('')
    expect(screen.getByTestId('chart-url-filter')).toHaveTextContent('[]')
  })
})
