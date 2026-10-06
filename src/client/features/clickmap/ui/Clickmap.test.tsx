import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../analysis/ui/ChartLayout.tsx', () => ({
  default: ({
    title,
    sidebarContent,
    children,
  }: {
    title: string
    sidebarContent?: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      <h1>{title}</h1>
      <aside>{sidebarContent}</aside>
      <main>{children}</main>
    </div>
  ),
}))

import Clickmap from './Clickmap.tsx'
import type { VisualizationMode } from '../model/visualizationMode.ts'

const FAKE_WEBSITES = [{ id: 'site-1', name: 'Nav.no - prod', domain: 'nav.no', createdAt: '2023-01-01T00:00:00Z' }]

function renderPage(visualizationMode: VisualizationMode = 'clickmap', withPreview = false) {
  if (withPreview) window.history.replaceState({}, '', '/klikkoversikt?websiteId=site-1&urlPath=/account')
  return render(
    <MemoryRouter
      initialEntries={[withPreview ? '/klikkoversikt?websiteId=site-1&urlPath=/account' : '/klikkoversikt']}
    >
      <Clickmap visualizationMode={visualizationMode} />
    </MemoryRouter>,
  )
}

describe('Clickmap page', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/clickmap?') || url.includes('/scrollmap?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: [
                  {
                    sourcePath: '/account',
                    linkText: 'Neste',
                    destination: '/next',
                    component: '',
                    section: '',
                    audience: '',
                    count: 12,
                  },
                ],
              }),
          })
        }
        if (url.includes('/api/bigquery/websites')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: FAKE_WEBSITES }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /klikkoversikt/i })).toBeInTheDocument()
    await screen.findByRole('combobox', { name: /nettside/i })
  })

  it('renders the website picker', async () => {
    renderPage()
    expect(await screen.findByRole('combobox', { name: /nettside/i })).toBeInTheDocument()
  })

  it.each<VisualizationMode>(['clickmap', 'heatmap', 'scrollmap'])(
    'shows the Aksel shortcut and alternatives in %s mode',
    async (mode) => {
      const { rerender } = renderPage(mode, true)
      const iframe = await screen.findByTitle<HTMLIFrameElement>(/sidevisning/)
      const document = iframe.contentDocument
      if (!document) throw new Error('Expected the preview document')
      document.open()
      document.write(
        '<html><head></head><body data-clickmap-preview-error="unauthenticated"><main class="wrap"><p class="muted">Prøv en offentlig side for å se markeringene.</p></main></body></html>',
      )
      document.close()
      fireEvent.load(iframe)
      const shortcut = within(document.body).getByRole('button', { name: 'Åpne alternative visningsvalg' })
      expect(shortcut).toHaveClass('aksel-button')
      fireEvent.click(shortcut)
      expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('radio', { name: 'Lim inn HTML' })).toBeVisible()
      rerender(
        <MemoryRouter>
          <Clickmap visualizationMode={mode === 'clickmap' ? 'heatmap' : 'clickmap'} />
        </MemoryRouter>,
      )
      expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('radio', { name: 'Lim inn HTML' })).toBeVisible()
      expect(within(document.body).getByRole('button', { name: 'Lukk alternative visningsvalg' })).toHaveClass(
        'aksel-button',
      )
    },
  )
})
