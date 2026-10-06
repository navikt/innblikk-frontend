import { useRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlternativePreviewOptions, PreviewLoadingStatus, useAlternativePreview } from './AlternativePreviewOptions.tsx'

const Preview = ({ url = 'https://nav.no/account' }: { url?: string }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const preview = useAlternativePreview(url, iframeRef)
  return (
    <>
      <AlternativePreviewOptions preview={preview} />
      <PreviewLoadingStatus preview={preview} />
      <iframe ref={iframeRef} title="Preview" srcDoc={preview.srcDoc} onLoad={preview.onLoad} />
    </>
  )
}

describe('AlternativePreviewOptions', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows loading immediately, hides it on load and shows it again for a different page', () => {
    const { rerender } = render(<Preview />)
    expect(screen.getByRole('status')).toHaveTextContent('Henter forhåndsvisning...')
    const iframe = screen.getByTitle<HTMLIFrameElement>('Preview')
    if (iframe.contentDocument) iframe.contentDocument.body.textContent = 'Siden er lastet'
    fireEvent.load(iframe)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(<Preview url="https://nav.no/another-page" />)
    expect(screen.getByRole('status')).toHaveTextContent('Henter forhåndsvisning...')
  })

  it('uses a safe browser snapshot after server failure and makes only one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<a href="/next">Neste</a><script>alert(1)</script>', {
        headers: { 'content-type': 'text/html' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<Preview />)
    const iframe = screen.getByTitle<HTMLIFrameElement>('Preview')
    iframe.contentDocument?.body.setAttribute('data-clickmap-preview-error', 'unavailable')
    fireEvent.load(iframe)
    fireEvent.load(iframe)
    await waitFor(() => expect(iframe).toHaveAttribute('srcdoc', expect.stringContaining('Neste')))
    expect(iframe.getAttribute('srcdoc')).not.toContain('<script')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cancels a browser request when the original page changes and ignores its late response', async () => {
    let resolveResponse: (response: Response) => void = () => {
      throw new Error('Fetch has not started')
    }
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal || undefined
        return new Promise<Response>((resolve) => {
          resolveResponse = resolve
        })
      }),
    )
    const { rerender } = render(<Preview />)
    const iframe = screen.getByTitle<HTMLIFrameElement>('Preview')
    iframe.contentDocument?.body.setAttribute('data-clickmap-preview-error', 'unavailable')
    fireEvent.load(iframe)
    iframe.contentDocument?.body.removeAttribute('data-clickmap-preview-error')
    rerender(<Preview url="https://nav.no/another-page" />)
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      resolveResponse(new Response('<p>Old page</p>', { headers: { 'content-type': 'text/html' } }))
      await Promise.resolve()
    })
    expect(iframe).not.toHaveAttribute('srcdoc')
    expect(screen.queryByRole('button', { name: 'Alternative visningsvalg' })).not.toBeInTheDocument()
  })

  it('times out a blocked browser fetch and points to researchops', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
              once: true,
            })
          }),
      ),
    )
    render(<Preview />)
    const iframe = screen.getByTitle<HTMLIFrameElement>('Preview')
    const document = iframe.contentDocument
    if (!document) throw new Error('Expected the preview document')
    document.body.setAttribute('data-clickmap-preview-error', 'unavailable')
    fireEvent.load(iframe)
    expect(document.body).toHaveTextContent('Prøver å hente siden i nettleseren')
    expect(screen.getByRole('status')).toHaveTextContent('Prøver å hente siden direkte fra nettleseren...')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })
    expect(document.body).toHaveTextContent('Innblikk får ikke hentet siden')
    expect(document.body).toHaveTextContent('#researchops')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('tries the browser after a JSON fetch error and offers researchops help when that fails', async () => {
    render(<Preview />)
    const iframe = screen.getByTitle<HTMLIFrameElement>('Preview')
    const document = iframe.contentDocument
    if (!document) throw new Error('Expected the preview document')
    document.body.textContent = JSON.stringify({
      error: 'Failed to fetch clickmap preview HTML',
      message: 'fetch failed',
    })
    fireEvent.load(iframe)
    await waitFor(() => expect(document.body).toHaveTextContent('Innblikk får ikke hentet siden'))
    expect(document.body).toHaveTextContent('zero trust')
    expect(document.querySelector('a')?.textContent).toBe('#researchops')
    expect(document.body).not.toHaveTextContent('fetch failed')
    expect(document.querySelector('[data-clickmap-open-alternatives]')).toHaveClass('aksel-button')
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toBeInTheDocument()
  })

  it('offers alternatives for a persistently empty preview but allows slow content to appear', async () => {
    vi.useFakeTimers()
    render(<Preview />)
    const iframe = screen.getByTitle<HTMLIFrameElement>('Preview')
    const document = iframe.contentDocument
    if (!document) throw new Error('Expected the preview document')
    document.body.innerHTML = '<div id="root"></div><script>/* app bootstrap */</script>'
    fireEvent.load(iframe)
    expect(screen.queryByRole('button', { name: 'Alternative visningsvalg' })).not.toBeInTheDocument()
    document.body.textContent = 'Siden er lastet'
    act(() => {
      vi.advanceTimersByTime(12_000)
    })
    expect(screen.queryByRole('button', { name: 'Alternative visningsvalg' })).not.toBeInTheDocument()
    document.body.innerHTML = '<div id="root"></div>'
    fireEvent.load(iframe)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    expect(document.body).toHaveTextContent('Innblikk får ikke hentet siden')
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toBeInTheDocument()
  })

  it('only offers alternatives after the original preview reports failure', async () => {
    render(<Preview />)
    expect(screen.queryByRole('button', { name: 'Alternative visningsvalg' })).not.toBeInTheDocument()
    const iframe = screen.getByTitle<HTMLIFrameElement>('Preview')
    if (iframe.contentDocument)
      iframe.contentDocument.body.innerHTML =
        '<main class="wrap"><p class="muted">Prøv en offentlig side for å se markeringene.</p></main>'
    fireEvent.load(iframe)
    expect(screen.queryByRole('button', { name: 'Alternative visningsvalg' })).not.toBeInTheDocument()
    await act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: { type: 'umami-clickmap-preview-error' },
        }),
      ),
    )
    expect(screen.queryByRole('button', { name: 'Alternative visningsvalg' })).not.toBeInTheDocument()
    await act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: iframe.contentWindow,
          data: { type: 'umami-clickmap-preview-error', reason: 'unauthenticated' },
        }),
      ),
    )
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toBeInTheDocument()
    fireEvent.load(iframe)
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toBeInTheDocument()
    const shortcut = iframe.contentDocument?.querySelector<HTMLButtonElement>('[data-clickmap-open-alternatives]')
    expect(shortcut?.textContent).toBe('Bruk en annen side')
    expect(shortcut?.tagName).toBe('BUTTON')
    expect(shortcut).toHaveClass('aksel-button')
    expect(shortcut?.closest('.alternative-preview-message')?.textContent).toBe(
      'Du kan bruke HTML eller en mockside.Bruk en annen side',
    )
    expect(iframe.contentDocument?.body.textContent).not.toContain('Prøv en offentlig side')
    if (!shortcut) throw new Error('Expected the error-page shortcut')
    fireEvent.click(shortcut)
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('radio', { name: 'Lim inn HTML' })).toBeVisible()
    expect(shortcut).toHaveTextContent('Lukk visningsvalg')
    expect(shortcut).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(shortcut)
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toHaveAttribute('aria-expanded', 'false')
    expect(shortcut).toHaveTextContent('Bruk en annen side')
  })

  it('detects an unavailable page on load and resets when the original URL changes', () => {
    const { rerender } = render(<Preview />)
    const iframe = screen.getByTitle<HTMLIFrameElement>('Preview')
    iframe.contentDocument?.body.setAttribute('data-clickmap-preview-error', 'unauthenticated')
    fireEvent.load(iframe)
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toBeInTheDocument()
    rerender(<Preview url="https://nav.no/another-page" />)
    expect(screen.queryByRole('button', { name: 'Alternative visningsvalg' })).not.toBeInTheDocument()
  })
})
