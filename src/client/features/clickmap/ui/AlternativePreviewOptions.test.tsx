import { useRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlternativePreviewOptions, useAlternativePreview } from './AlternativePreviewOptions.tsx'

const Preview = ({ url = 'https://nav.no/account' }: { url?: string }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const preview = useAlternativePreview(url, iframeRef)
  return (
    <>
      <AlternativePreviewOptions preview={preview} />
      <iframe ref={iframeRef} title="Preview" onLoad={preview.onLoad} />
    </>
  )
}

describe('AlternativePreviewOptions', () => {
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
          data: { type: 'umami-clickmap-preview-error' },
        }),
      ),
    )
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toBeInTheDocument()
    fireEvent.load(iframe)
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toBeInTheDocument()
    const shortcut = iframe.contentDocument?.querySelector<HTMLButtonElement>('[data-clickmap-open-alternatives]')
    expect(shortcut?.textContent).toBe('Åpne alternative visningsvalg')
    expect(shortcut?.tagName).toBe('BUTTON')
    expect(shortcut).toHaveClass('aksel-button')
    expect(shortcut?.closest('.alternative-preview-message')?.textContent).toBe(
      'Vis markeringene med innlimt HTML eller en offentlig mockside.Åpne alternative visningsvalg',
    )
    expect(iframe.contentDocument?.body.textContent).not.toContain('Prøv en offentlig side')
    if (!shortcut) throw new Error('Expected the error-page shortcut')
    fireEvent.click(shortcut)
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('radio', { name: 'Lim inn HTML' })).toBeVisible()
    expect(shortcut).toHaveTextContent('Lukk alternative visningsvalg')
    expect(shortcut).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(shortcut)
    expect(screen.getByRole('button', { name: 'Alternative visningsvalg' })).toHaveAttribute('aria-expanded', 'false')
    expect(shortcut).toHaveTextContent('Åpne alternative visningsvalg')
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
