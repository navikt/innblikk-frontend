import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Accordion, Alert, Button, Textarea, TextField, ToggleGroup } from '@navikt/ds-react'
import akselCss from '@navikt/ds-css/dist/index.min.css?inline'
import { Eye } from 'lucide-react'
import { buildHtmlSnapshot, fetchHtmlSnapshot } from '../utils/buildHtmlSnapshot.ts'
import { RESEARCHOPS_SLACK_URL } from '../../../shared/ui/BetaFeatureNotice.tsx'

export const useAlternativePreview = (originalUrl: string | null, iframeRef: RefObject<HTMLIFrameElement | null>) => {
  const [originalUnavailable, setOriginalUnavailable] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [shortcutHost, setShortcutHost] = useState<HTMLDivElement | null>(null)
  const [source, setSource] = useState<'url' | 'html' | 'mock'>('url')
  const [htmlDraft, setHtmlDraft] = useState('')
  const [htmlSnapshot, setHtmlSnapshot] = useState<string | undefined>()
  const [mockUrlDraft, setMockUrlDraft] = useState('')
  const [mockUrl, setMockUrl] = useState('')
  const [mockUrlError, setMockUrlError] = useState<string | undefined>()
  const [browserSnapshot, setBrowserSnapshot] = useState<{ url: string; html: string } | null>(null)
  const [browserFallbackPending, setBrowserFallbackPending] = useState(false)
  const fallbackRequestRef = useRef<{ url: string; controller: AbortController } | null>(null)
  const attemptedUrlsRef = useRef(new Set<string>())
  const cleanupDocumentRef = useRef<(() => void) | null>(null)
  const blankPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const targetUrl = source === 'mock' && mockUrl ? mockUrl : originalUrl
  const snapshot =
    source === 'html' && htmlSnapshot
      ? htmlSnapshot
      : browserSnapshot?.url === targetUrl
        ? browserSnapshot.html
        : undefined
  const renderedSource = snapshot ? 'html' : source === 'mock' && mockUrl ? 'mock' : 'url'
  const src =
    renderedSource !== 'html' && targetUrl ? `/api/clickmap-preview?url=${encodeURIComponent(targetUrl)}` : undefined
  const srcDoc = snapshot

  const attachShortcut = useCallback(() => {
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
  }, [iframeRef])

  const showUnavailablePreview = useCallback(
    (pending = false) => {
      const document = iframeRef.current?.contentDocument
      if (!document?.body) return
      document.body.setAttribute('data-clickmap-preview-error', 'unavailable')
      const container = document.createElement('main')
      container.className = 'wrap'
      container.style.cssText = 'max-width: 720px; margin: 48px auto; padding: 24px; color: #1f2937; background: white;'
      const heading = document.createElement('h1')
      heading.textContent = pending ? 'Prøver å hente siden i nettleseren' : 'Innblikk får ikke hentet siden'
      const description = document.createElement('p')
      if (pending) {
        description.textContent = 'Serveren kunne ikke hente siden. Prøver direkte fra nettleseren.'
      } else {
        const contact = document.createElement('a')
        contact.href = RESEARCHOPS_SLACK_URL
        contact.target = '_blank'
        contact.rel = 'noopener noreferrer'
        contact.textContent = '#researchops'
        description.append(
          document.createTextNode(
            'Siden kan være tilgjengelig selv om Innblikk ikke får hentet den. Serverens tilgangsregler (zero trust) eller nettleserens sikkerhetsregler kan blokkere forespørselen. Kontakt ',
          ),
          contact,
          document.createTextNode(' for å få undersøkt og eventuelt åpnet tilgang til nettstedet. Oppgi nettadressen.'),
        )
      }
      container.append(heading, description)
      document.body.replaceChildren(container)
      setOriginalUnavailable(true)
      attachShortcut()
    },
    [iframeRef, attachShortcut],
  )

  const handlePreviewFailure = useCallback(
    (reason = 'unavailable') => {
      setOriginalUnavailable(true)
      if (reason === 'unauthenticated') {
        attachShortcut()
        return
      }
      if (!targetUrl) return
      if (attemptedUrlsRef.current.has(targetUrl)) {
        showUnavailablePreview(fallbackRequestRef.current?.url === targetUrl)
        return
      }
      attemptedUrlsRef.current.add(targetUrl)
      const request = { url: targetUrl, controller: new AbortController() }
      fallbackRequestRef.current = request
      setBrowserFallbackPending(true)
      showUnavailablePreview(true)
      const timeout = setTimeout(() => request.controller.abort(), 8_000)
      void fetchHtmlSnapshot(targetUrl, request.controller.signal)
        .then((html) => {
          if (fallbackRequestRef.current !== request || request.controller.signal.aborted) return
          setBrowserSnapshot({ url: request.url, html })
          setShortcutHost(null)
        })
        .catch(() => {
          if (fallbackRequestRef.current === request) showUnavailablePreview()
        })
        .finally(() => {
          clearTimeout(timeout)
          if (fallbackRequestRef.current === request) {
            fallbackRequestRef.current = null
            setBrowserFallbackPending(false)
          }
        })
    },
    [targetUrl, attachShortcut, showUnavailablePreview],
  )

  useEffect(() => {
    fallbackRequestRef.current?.controller.abort()
    fallbackRequestRef.current = null
    attemptedUrlsRef.current.clear()
    setBrowserSnapshot(null)
    setBrowserFallbackPending(false)
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
      if (event.source !== iframeRef.current?.contentWindow || renderedSource === 'html') return
      const message: unknown = event.data
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'umami-clickmap-preview-error'
      ) {
        handlePreviewFailure('reason' in message && typeof message.reason === 'string' ? message.reason : 'unavailable')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef, renderedSource, handlePreviewFailure])

  useEffect(
    () => () => {
      cleanupDocumentRef.current?.()
      fallbackRequestRef.current?.controller.abort()
      fallbackRequestRef.current = null
      if (blankPreviewTimerRef.current) clearTimeout(blankPreviewTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (blankPreviewTimerRef.current) clearTimeout(blankPreviewTimerRef.current)
    const request = fallbackRequestRef.current
    if (request && (request.url !== targetUrl || srcDoc)) {
      request.controller.abort()
      fallbackRequestRef.current = null
      setBrowserFallbackPending(false)
    }
  }, [src, srcDoc, targetUrl])

  const onLoad = () => {
    cleanupDocumentRef.current?.()
    cleanupDocumentRef.current = null
    if (blankPreviewTimerRef.current) clearTimeout(blankPreviewTimerRef.current)
    const document = iframeRef.current?.contentDocument
    if (!document) return
    if (renderedSource === 'html') setShortcutHost(null)
    if (renderedSource !== 'html' && document.body?.getAttribute('data-clickmap-preview-error')) {
      handlePreviewFailure(document.body.getAttribute('data-clickmap-preview-error') || 'unavailable')
    } else if (renderedSource !== 'html' && document.body) {
      const responseText = document.querySelector('pre')?.textContent || document.body.textContent || ''
      try {
        const response: unknown = JSON.parse(responseText)
        if (response && typeof response === 'object' && 'error' in response && typeof response.error === 'string') {
          handlePreviewFailure()
          return
        }
      } catch {
        if (document.contentType === 'application/json') {
          handlePreviewFailure()
          return
        }
      }
      blankPreviewTimerRef.current = setTimeout(() => {
        const currentDocument = iframeRef.current?.contentDocument
        if (currentDocument !== document || !document.body || document.body.hasAttribute('data-clickmap-preview-error'))
          return
        const content = document.body.cloneNode(true)
        if (!(content instanceof document.defaultView!.HTMLElement)) return
        content.querySelectorAll('script, style, template, noscript').forEach((element) => element.remove())
        if (
          !content.textContent?.trim() &&
          !content.querySelector('img, svg, canvas, video, iframe, input, button, textarea, select')
        ) {
          handlePreviewFailure()
        }
      }, 12_000)
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
    browserFallbackPending,
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
