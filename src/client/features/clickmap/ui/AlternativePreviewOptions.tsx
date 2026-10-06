import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Accordion, Alert, Button, Textarea, TextField, ToggleGroup } from '@navikt/ds-react'
import akselCss from '@navikt/ds-css/dist/index.min.css?inline'
import { Eye } from 'lucide-react'
import { buildHtmlSnapshot } from '../utils/buildHtmlSnapshot.ts'

export const useAlternativePreview = (
  originalUrl: string | null,
  iframeRef: RefObject<HTMLIFrameElement | null>,
  enabled = true,
) => {
  const [originalUnavailable, setOriginalUnavailable] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [shortcutHost, setShortcutHost] = useState<HTMLDivElement | null>(null)
  const [source, setSource] = useState<'url' | 'html' | 'mock'>('url')
  const [htmlDraft, setHtmlDraft] = useState('')
  const [htmlSnapshot, setHtmlSnapshot] = useState<string | undefined>()
  const [mockUrlDraft, setMockUrlDraft] = useState('')
  const [mockUrl, setMockUrl] = useState('')
  const [mockUrlError, setMockUrlError] = useState<string | undefined>()
  const cleanupDocumentRef = useRef<(() => void) | null>(null)
  const renderedSource = source === 'html' && htmlSnapshot ? 'html' : source === 'mock' && mockUrl ? 'mock' : 'url'
  const targetUrl = renderedSource === 'mock' ? mockUrl : originalUrl
  const src =
    renderedSource !== 'html' && targetUrl ? `/api/clickmap-preview?url=${encodeURIComponent(targetUrl)}` : undefined
  const srcDoc = renderedSource === 'html' ? htmlSnapshot : undefined

  const attachShortcut = useCallback(() => {
    if (!enabled) return
    const document = iframeRef.current?.contentDocument
    const container = document?.querySelector('.wrap')
    if (!document || !container) return
    const host =
      document.querySelector<HTMLDivElement>('[data-clickmap-alternative-action]') || document.createElement('div')
    host.setAttribute('data-clickmap-alternative-action', '')
    host.style.marginTop = '12px'
    const message =
      container.querySelector<HTMLElement>('.alternative-preview-message, .muted') || document.createElement('p')
    message.className = 'muted alternative-preview-message'
    message.replaceChildren(
      document.createTextNode('Vis markeringene med innlimt HTML eller en offentlig mockside.'),
      host,
    )
    message.hidden = false
    if (!message.parentElement) container.appendChild(message)
    if (!document.getElementById('clickmap-aksel-styles')) {
      const style = document.createElement('style')
      style.id = 'clickmap-aksel-styles'
      style.textContent = akselCss
      document.head.appendChild(style)
    }
    setShortcutHost(host)
  }, [enabled, iframeRef])

  useEffect(() => {
    setOriginalUnavailable(false)
    setOptionsOpen(false)
    setShortcutHost(null)
    setSource('url')
    setHtmlDraft('')
    setHtmlSnapshot(undefined)
    setMockUrlDraft('')
    setMockUrl('')
    setMockUrlError(undefined)
  }, [originalUrl])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || renderedSource !== 'url') return
      const message: unknown = event.data
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'umami-clickmap-preview-error'
      ) {
        setOriginalUnavailable(true)
        attachShortcut()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef, renderedSource, attachShortcut])

  useEffect(() => () => cleanupDocumentRef.current?.(), [])

  const onLoad = () => {
    cleanupDocumentRef.current?.()
    cleanupDocumentRef.current = null
    const document = iframeRef.current?.contentDocument
    if (!document) return
    if (renderedSource !== 'url') setShortcutHost(null)
    if (renderedSource === 'url' && document.body?.getAttribute('data-clickmap-preview-error')) {
      setOriginalUnavailable(true)
      attachShortcut()
    }
    if (renderedSource === 'html') {
      const preventNavigation = (event: MouseEvent) => {
        const target = event.target as Element | null
        if (target?.nodeType === 1 && target.closest('a, area')) event.preventDefault()
      }
      document.addEventListener('click', preventNavigation, true)
      cleanupDocumentRef.current = () => document.removeEventListener('click', preventNavigation, true)
    }
  }

  return {
    originalUnavailable,
    optionsOpen,
    setOptionsOpen,
    shortcutHost,
    source,
    setSource,
    renderedSource,
    src,
    srcDoc,
    onLoad,
    htmlDraft,
    setHtmlDraft,
    mockUrlDraft,
    setMockUrlDraft,
    mockUrlError,
    applyHtml: () => {
      if (originalUrl && htmlDraft.trim()) setHtmlSnapshot(buildHtmlSnapshot(htmlDraft, originalUrl))
    },
    applyMock: () => {
      try {
        const target = new URL(mockUrlDraft.trim())
        if (target.protocol !== 'https:' || target.username || target.password) throw new Error()
        setMockUrlError(undefined)
        setMockUrl(target.toString())
      } catch {
        setMockUrlError('Oppgi en fullstendig HTTPS-adresse uten innloggingsopplysninger.')
      }
    },
  }
}

export const AlternativePreviewOptions = ({ preview }: { preview: ReturnType<typeof useAlternativePreview> }) => {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!preview.optionsOpen) return
    panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    panelRef.current?.querySelector('button')?.focus({ preventScroll: true })
  }, [preview.optionsOpen])
  if (!preview.originalUnavailable) return null

  return (
    <>
      {preview.shortcutHost &&
        createPortal(
          <Button
            size="small"
            variant="secondary"
            aria-expanded={preview.optionsOpen}
            data-clickmap-open-alternatives
            onClick={() => preview.setOptionsOpen(!preview.optionsOpen)}
          >
            {preview.optionsOpen ? 'Lukk alternative visningsvalg' : 'Åpne alternative visningsvalg'}
          </Button>,
          preview.shortcutHost,
        )}
      <div ref={panelRef}>
        <Accordion size="small">
          <Accordion.Item open={preview.optionsOpen} onOpenChange={preview.setOptionsOpen}>
            <Accordion.Header>Alternative visningsvalg</Accordion.Header>
            <Accordion.Content>
              <div className="space-y-3">
                <ToggleGroup
                  label="Sidekilde"
                  size="small"
                  className="[&_[role=radiogroup]]:flex-wrap"
                  value={preview.source}
                  onChange={(value) => preview.setSource(value as 'url' | 'html' | 'mock')}
                >
                  <ToggleGroup.Item value="url">Opprinnelig side</ToggleGroup.Item>
                  <ToggleGroup.Item value="html">Lim inn HTML</ToggleGroup.Item>
                  <ToggleGroup.Item value="mock">Offentlig mockside</ToggleGroup.Item>
                </ToggleGroup>
                {preview.source === 'html' && (
                  <>
                    <Alert variant="info" size="small">
                      Unngå personopplysninger og hemmeligheter. HTML-en sendes ikke til serveren og lagres ikke.
                      Eksterne stilark og bilder kan bli hentet fra opprinnelige adresser.
                    </Alert>
                    <Textarea
                      label="HTML fra siden"
                      size="small"
                      value={preview.htmlDraft}
                      onChange={(event) => preview.setHtmlDraft(event.target.value)}
                      minRows={6}
                      maxRows={12}
                      maxLength={2_000_000}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button
                      size="small"
                      icon={<Eye size={16} />}
                      disabled={!preview.htmlDraft.trim()}
                      onClick={preview.applyHtml}
                    >
                      Vis HTML
                    </Button>
                  </>
                )}
                {preview.source === 'mock' && (
                  <>
                    <TextField
                      label="URL til offentlig mockside"
                      type="url"
                      size="small"
                      value={preview.mockUrlDraft}
                      onChange={(event) => preview.setMockUrlDraft(event.target.value)}
                      error={preview.mockUrlError}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button
                      size="small"
                      icon={<Eye size={16} />}
                      disabled={!preview.mockUrlDraft.trim()}
                      onClick={preview.applyMock}
                    >
                      Vis mockside
                    </Button>
                  </>
                )}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </div>
    </>
  )
}
