import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExportChartDialog from './ExportChartDialog'
import { PRODUCTION_ORIGIN, transferEnvironments, TRANSFER_CHANNEL } from '../utils/chartTransfer'
import { fetchWebsites } from '../../../shared/api/websiteApi'

vi.mock('../../../shared/api/websiteApi', () => ({ fetchWebsites: vi.fn() }))

it.each(['prod', 'dev'] as const)(
  'sends the chart only to the %s frame and closes only on its matching saved confirmation',
  async (target) => {
    const user = userEvent.setup()
    const close = vi.fn()
    const saved = vi.fn()
    const targetOrigin = transferEnvironments[target].origin
    render(
      <ExportChartDialog
        target={target}
        chart={{ title: 'Besøk', type: 'line', sql: 'SELECT 1', width: '50' }}
        onClose={close}
        onSaved={saved}
      />,
    )
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: `Legg til i Innblikk ${target}` })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: `Legg til i Innblikk ${target}` })).toBeInTheDocument()
    const iframe = screen.getByTitle<HTMLIFrameElement>(`Velg team og dashboard i ${target}`)
    expect(new URL(iframe.src).pathname).toBe('/importer-graf')
    const requestId = new URL(iframe.src).searchParams.get('requestId')
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
    const send = (
      type: string,
      origin: string = targetOrigin,
      source: Window | null = iframe.contentWindow,
      id = requestId,
      dashboardId: unknown = 20,
    ) =>
      act(() =>
        window.dispatchEvent(
          new MessageEvent('message', {
            origin,
            source,
            data: { channel: TRANSFER_CHANNEL, requestId: id, type, saving: true, dashboardId },
          }),
        ),
      )

    await send('ready', 'https://evil.test')
    await send('ready', transferEnvironments[target === 'prod' ? 'dev' : 'prod'].origin)
    await send('ready', targetOrigin, window)
    await send('ready', targetOrigin, iframe.contentWindow, 'wrong-id')
    await send('saved')
    expect(post).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()

    await send('ready')
    expect(post).toHaveBeenCalledWith(
      {
        channel: TRANSFER_CHANNEL,
        requestId,
        type: 'chart',
        chart: {
          title: 'Besøk',
          graphType: 'LINE',
          width: 50,
          description: undefined,
          queries: [{ name: 'Besøk - query', sql: 'SELECT 1' }],
        },
      },
      targetOrigin,
    )
    expect(iframe.src).not.toContain('SELECT')

    await send('saving')
    expect(screen.getByRole('button', { name: 'Avbryt' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(close).not.toHaveBeenCalled()
    await send('saved', targetOrigin, iframe.contentWindow, 'wrong-id')
    expect(close).not.toHaveBeenCalled()
    await send('saved', targetOrigin, iframe.contentWindow, requestId, 'https://evil.test')
    expect(screen.getByRole('alert')).toHaveTextContent('lenken til dashboardet mangler')
    expect(close).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
    await send('saved')
    expect(close).toHaveBeenCalledOnce()
    expect(saved).toHaveBeenCalledExactlyOnceWith(20)
  },
)

it('includes dev website names for every referenced website, without sending unrelated websites', async () => {
  const firstId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const secondId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  vi.mocked(fetchWebsites).mockResolvedValue([
    { id: firstId, name: 'Første nettsted', domain: 'first.dev.nav.no', teamId: '', createdAt: '' },
    { id: secondId, name: 'Andre nettsted', domain: 'second.dev.nav.no', teamId: '', createdAt: '' },
    { id: 'other', name: 'Annet nettsted', domain: 'other.nav.no', teamId: '', createdAt: '' },
  ])
  render(
    <ExportChartDialog
      target="prod"
      chart={{
        title: 'Besøk',
        type: 'line',
        sql: `SELECT * FROM events WHERE website_id IN ('${firstId}', '${secondId}')`,
      }}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  const iframe = screen.getByTitle<HTMLIFrameElement>('Velg team og dashboard i prod')
  const requestId = new URL(iframe.src).searchParams.get('requestId')
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: PRODUCTION_ORIGIN,
        source: iframe.contentWindow,
        data: { channel: TRANSFER_CHANNEL, type: 'ready', requestId },
      }),
    )
    await Promise.resolve()
  })
  expect(post).toHaveBeenCalledWith(
    {
      channel: TRANSFER_CHANNEL,
      type: 'chart',
      requestId,
      chart: {
        title: 'Besøk',
        graphType: 'LINE',
        width: 50,
        description: undefined,
        queries: [
          { name: 'Besøk - query', sql: `SELECT * FROM events WHERE website_id IN ('${firstId}', '${secondId}')` },
        ],
        sourceWebsites: [
          { id: firstId, name: 'Første nettsted', domain: 'first.dev.nav.no' },
          { id: secondId, name: 'Andre nettsted', domain: 'second.dev.nav.no' },
        ],
      },
    },
    PRODUCTION_ORIGIN,
  )
})
