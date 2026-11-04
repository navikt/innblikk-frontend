import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClickmapPreviewRouter } from './clickmapPreviewRoutes.js'

const renderPreview = async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        `<html><body>
          <header><section><h2>Navigation</h2><button id="menu" aria-expanded="false">Meny</button></section></header>
          <button id="toggle" aria-controls="panel">Vis mer</button>
          <section aria-label="Detaljer"><button id="accordion" aria-expanded="false">Detaljer</button></section>
          <details><summary id="summary">Spørsmål</summary></details>
          <a id="link" href="/arbeid">Arbeid</a>
        </body></html>`,
        { headers: { 'content-type': 'text/html' } },
      ),
    ),
  )
  const router = createClickmapPreviewRouter()
  const handler = router.stack.find((layer) => layer.route?.path === '/clickmap-preview').route.stack[0].handle
  const res = { status: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), send: vi.fn() }
  await handler({ query: { url: 'https://www.nav.no/' } }, res)
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const view = frame.contentWindow
  vi.spyOn(view.Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 400,
    left: 0,
    right: 100,
    bottom: 440,
    width: 100,
    height: 40,
  })
  doc.open()
  doc.write(res.send.mock.calls[0][0])
  doc.close()
  view.eval(doc.querySelector('script').textContent)
  view.scrollTo = vi.fn()
  return {
    doc,
    view,
    send: (data) => view.dispatchEvent(new view.MessageEvent('message', { data })),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.querySelectorAll('iframe').forEach((frame) => frame.remove())
})

describe('clickmap preview matching', () => {
  it.each(['clickmap', 'heatmap', 'scrollmap'])(
    'matches expandable menu and button controls in %s',
    async (viewMode) => {
      const { doc, view, send } = await renderPreview()
      const postMessage = vi.spyOn(view.parent, 'postMessage')
      send({
        type: 'umami-clickmap-data',
        viewMode,
        items: [
          { linkText: 'Meny', component: 'DropDownMenu', count: 87759 },
          { linkText: 'Vis mer', component: 'Button', count: 42 },
        ],
      })
      if (viewMode === 'clickmap') {
        expect(doc.getElementById('menu')).toHaveAttribute('data-clickmap-count', '87759')
        expect(doc.getElementById('toggle')).toHaveAttribute('data-clickmap-count', '42')
      } else if (viewMode === 'heatmap') {
        expect(doc.getElementById('menu')).toHaveClass('umami-heatmap-hit')
        expect(doc.getElementById('toggle')).toHaveClass('umami-heatmap-hit')
      } else {
        expect(postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'umami-scrollmap-summary',
            totalEstimatedClicks: 87801,
            breakpoints: expect.arrayContaining([
              expect.objectContaining({ categoryCounts: { linkClicks: 0, accordionClicks: 0, otherClicks: 87801 } }),
            ]),
          }),
          '*',
        )
      }
      send({ type: 'umami-clickmap-focus-link', linkText: 'Meny', component: 'DropDownMenu' })
      expect(doc.getElementById('menu')).toHaveClass(
        viewMode === 'heatmap' ? 'umami-heatmap-hit-active' : 'umami-clickmap-hit-active',
      )
    },
  )

  it('preserves accordion, summary and link matching', async () => {
    const { doc, send } = await renderPreview()
    send({
      type: 'umami-clickmap-data',
      items: [
        { linkText: 'Detaljer', component: 'Accordion', count: 12 },
        { linkText: 'Spørsmål', component: 'Accordion', count: 8 },
        { linkText: 'Arbeid', destination: '/arbeid', count: 20 },
      ],
    })
    expect(doc.getElementById('accordion')).toHaveAttribute('data-clickmap-count', '12')
    expect(doc.getElementById('summary')).toHaveAttribute('data-clickmap-count', '8')
    expect(doc.getElementById('link')).toHaveAttribute('data-clickmap-count', '20')
    expect(doc.getElementById('menu')).toHaveAttribute('data-clickmap-count', '0')
    send({ type: 'umami-clickmap-focus-link', linkText: 'Detaljer', component: 'Accordion' })
    expect(doc.getElementById('accordion')).toHaveClass('umami-clickmap-hit-active')
  })
})
