import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, TextField } from '@navikt/ds-react'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ChartLayout from '../../analysis/ui/ChartLayout.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import { parseJourneyStep } from '../../eventjourney/utils/parsers.ts'
import { getStoredPeriod, normalizeUrlToPath, savePeriodPreference } from '../../../shared/lib/utils.ts'
import type { Website } from '../../../shared/types/chart.ts'

type JourneyStep = {
  rawStep: string
  eventName: string
  details: { key: string; value: string }[]
}

type JourneyMarker = {
  index: number
  x: number
  y: number
  visible: boolean
}

const JOURNEY_STEP_BADGE_SIZE = 34
const JOURNEY_STEP_BADGE_RADIUS = JOURNEY_STEP_BADGE_SIZE / 2
const JOURNEY_STEP_BADGE_OFFSET = 20

const getMarkerAnchor = (rect: DOMRect): { x: number; y: number } => {
  // Anchor arrows at the center of the step badge shown on each highlighted element.
  const x = rect.left - (JOURNEY_STEP_BADGE_OFFSET - JOURNEY_STEP_BADGE_RADIUS)
  const y = rect.top - (JOURNEY_STEP_BADGE_OFFSET - JOURNEY_STEP_BADGE_RADIUS)
  return { x, y }
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const getMarkerRenderPoint = (
  marker: JourneyMarker,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } => {
  const min = 16
  const maxX = Math.max(min, viewportWidth - min)
  const maxY = Math.max(min, viewportHeight - min)
  return {
    x: clamp(marker.x, min, maxX),
    y: clamp(marker.y, min, maxY),
  }
}

type ParsedStepMatchMeta = {
  destination: string
  linkText: string
  component: string
  title: string
}

const JOURNEY_STEP_HIT_CLASS = 'umami-journey-step-hit'
const JOURNEY_STEP_START_CLASS = 'umami-journey-step-start'
const JOURNEY_STEP_ACTIVE_CLASS = 'umami-journey-step-active'
const JOURNEY_STEP_NUMBER_ATTR = 'data-journey-step'

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()
const isAccordionLike = (value: string): boolean => value.includes('accordion') || value.includes('trekkspill')
const normalizeToIdLike = (value: string): string =>
  cleanText(value)
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeComparablePath = (value: string): string => {
  const normalizedValue = normalizeUrlToPath(value || '')
  if (!normalizedValue) return ''
  if (normalizedValue === '/') return '/'
  return normalizedValue.replace(/\/+$/, '')
}

const normalizeDestination = (value: string): { path: string; full: string } => {
  if (!value) return { path: '', full: '' }
  try {
    const resolved = new URL(value, window.location.href)
    const normalizedPath = decodeURIComponent(resolved.pathname || '/')
    const path = normalizedPath === '/' ? '/' : normalizedPath.replace(/\/+$/, '')
    const host = (resolved.hostname || '').toLowerCase()
    return {
      path,
      full: host ? host + path : path,
    }
  } catch {
    const path = normalizeComparablePath(value)
    return { path, full: path }
  }
}

const isElementVisible = (element: Element): boolean => {
  const view = element.ownerDocument.defaultView
  if (!view) return false
  const style = view.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const getHashFragment = (value: string): string => {
  if (!value) return ''
  try {
    const resolved = new URL(value, window.location.href)
    return cleanText((resolved.hash || '').replace(/^#/, ''))
  } catch {
    return cleanText(value.replace(/^#/, ''))
  }
}

const getStepMatchMeta = (step: JourneyStep): ParsedStepMatchMeta => {
  const byKey = new Map<string, string>()
  step.details.forEach((detail) => {
    byKey.set(detail.key.trim().toLowerCase(), detail.value.trim())
  })

  const destination =
    byKey.get('destinasjon') ||
    byKey.get('destination') ||
    byKey.get('href') ||
    byKey.get('url') ||
    byKey.get('lenke') ||
    ''

  const linkText =
    byKey.get('lenketekst') ||
    byKey.get('tekst') ||
    byKey.get('label') ||
    byKey.get('tittel') ||
    byKey.get('title') ||
    ''

  const component =
    byKey.get('komponent') || byKey.get('component') || byKey.get('kategori') || byKey.get('innholdstype') || ''

  const title = byKey.get('tittel') || byKey.get('title') || ''

  return { destination, linkText, component, title }
}

const findAccordionElementByTitle = (doc: Document, targetTextKey: string): Element | null => {
  if (!targetTextKey) return null
  const targetIdLike = normalizeToIdLike(targetTextKey)
  const sectionCandidates = Array.from(
    doc.querySelectorAll(
      'section.navds-expansioncard, section[class*="expansioncard"], section[class*="Expandable_expandable"], section[aria-label][id]',
    ),
  )

  let bestSection: Element | null = null
  let bestSectionScore = -1

  for (const section of sectionCandidates) {
    if (!isElementVisible(section)) continue
    const ariaLabel = cleanText(section.getAttribute('aria-label') || '')
    const idValue = normalizeToIdLike(section.getAttribute('id') || '')
    const headerTitle =
      section.querySelector(
        '[class*="Expandable_headerTitle"], .navds-expansioncard__header-content, .navds-expansioncard__header',
      ) || null
    const headerText = cleanText(headerTitle?.textContent || '')

    const exactAria = !!ariaLabel && ariaLabel === targetTextKey
    const exactId = !!idValue && idValue === targetIdLike
    const exactHeader = !!headerText && headerText === targetTextKey
    const headerContains =
      !!headerText && !exactHeader && (headerText.includes(targetTextKey) || targetTextKey.includes(headerText))

    if (!exactAria && !exactId && !exactHeader && !headerContains) continue

    const score = (exactAria ? 150 : 0) + (exactId ? 140 : 0) + (exactHeader ? 130 : 0) + (headerContains ? 80 : 0)
    if (score > bestSectionScore) {
      bestSection = section
      bestSectionScore = score
    }
  }

  if (bestSection) {
    return (
      bestSection.querySelector(
        '[class*="Expandable_headerTitle"], .navds-expansioncard__header, .navds-expansioncard__header-button',
      ) || bestSection
    )
  }

  const headerCandidates = Array.from(
    doc.querySelectorAll(
      '[class*="Expandable_headerTitle"], .navds-expansioncard__header-content, .navds-expansioncard__header, summary, button[aria-expanded], button[aria-controls]',
    ),
  )

  for (const candidate of headerCandidates) {
    if (!isElementVisible(candidate)) continue
    const textValue = cleanText(candidate.textContent || candidate.getAttribute('aria-label') || '')
    const idValue = normalizeToIdLike(candidate.getAttribute('id') || '')
    if (textValue === targetTextKey || textValue.includes(targetTextKey) || idValue === targetIdLike) {
      return candidate
    }
  }

  return null
}

const findBestElementForStep = (doc: Document, step: JourneyStep): Element | null => {
  const matchMeta = getStepMatchMeta(step)
  const targetTextKey = cleanText(matchMeta.title || matchMeta.linkText)
  const targetDestination = normalizeDestination(matchMeta.destination)
  const targetHash = getHashFragment(matchMeta.destination)
  const targetComponentKey = cleanText(matchMeta.component)
  const stepIsAccordion = isAccordionLike(cleanText(step.eventName)) || isAccordionLike(targetComponentKey)
  const hasExplicitAccordionTitle = stepIsAccordion && !!cleanText(matchMeta.title)
  const isInternalNavigationStep =
    targetComponentKey.includes('intern-navigasjon') ||
    targetComponentKey.includes('page-navigation') ||
    targetComponentKey.includes('innhold') ||
    !!targetHash

  if (hasExplicitAccordionTitle) {
    const strictAccordionElement = findAccordionElementByTitle(doc, cleanText(matchMeta.title))
    if (strictAccordionElement) return strictAccordionElement
    return null
  }

  const candidates = [
    ...Array.from(doc.querySelectorAll('a[href]')).map((element) => ({ element, kind: 'link' as const })),
    ...Array.from(doc.querySelectorAll('button[aria-expanded], button[aria-controls], summary')).map((element) => ({
      element,
      kind: 'accordion' as const,
    })),
  ]
  let bestElement: Element | null = null
  let bestScore = -1
  let bestStrictAccordionElement: Element | null = null
  let bestStrictAccordionScore = -1

  for (const candidate of candidates) {
    if (!isElementVisible(candidate.element)) continue
    if (stepIsAccordion && candidate.kind !== 'accordion') continue

    const textValue = candidate.element.textContent || candidate.element.getAttribute('aria-label') || ''
    const candidateTextKey = cleanText(textValue)

    const href = candidate.kind === 'link' ? candidate.element.getAttribute('href') || '' : ''
    const normalizedHref = normalizeDestination(href)
    const candidateHash = getHashFragment(href)
    const isNavLink =
      candidate.kind === 'link' &&
      !!candidate.element.closest(
        'nav, .part__page-navigation-menu, [class*="PageNavigationMenu"], [class*="NavigationMenu"]',
      )
    const isCurrentNavLink = candidate.kind === 'link' && candidate.element.getAttribute('aria-current') === 'true'

    const textExactMatch = !!targetTextKey && targetTextKey === candidateTextKey
    const textContainsMatch =
      !!targetTextKey &&
      !textExactMatch &&
      (candidateTextKey.includes(targetTextKey) || targetTextKey.includes(candidateTextKey))

    const destinationMatches =
      candidate.kind === 'link' &&
      !!targetDestination.path &&
      (targetDestination.path === normalizedHref.path || targetDestination.full === normalizedHref.full)
    const hashMatches = candidate.kind === 'link' && !!targetHash && candidateHash === targetHash
    const textMatches = textExactMatch || textContainsMatch
    const componentMatches = stepIsAccordion && candidate.kind === 'accordion'

    if (!destinationMatches && !hashMatches && !textMatches && !componentMatches) continue

    // If an accordion title is explicitly provided (e.g. "tittel: Utbetalingsdatoer"),
    // do not allow generic accordion fallback candidates that do not match text.
    if (hasExplicitAccordionTitle && !textMatches) {
      continue
    }

    if (stepIsAccordion && textMatches) {
      const strictScore = (textExactMatch ? 6 : 4) + (textContainsMatch ? 1 : 0)
      if (strictScore > bestStrictAccordionScore) {
        bestStrictAccordionElement = candidate.element
        bestStrictAccordionScore = strictScore
      }
    }

    const score =
      (destinationMatches ? 3 : 0) +
      (hashMatches ? 6 : 0) +
      (textExactMatch ? 3 : textContainsMatch ? 2 : 0) +
      (componentMatches ? 3 : 0) +
      (isInternalNavigationStep && isNavLink ? 3 : 0) +
      (isInternalNavigationStep && isCurrentNavLink ? 2 : 0) +
      (candidate.kind === 'accordion' ? 0.2 : 0)
    if (score > bestScore) {
      bestElement = candidate.element
      bestScore = score
    }
  }

  if (stepIsAccordion && bestStrictAccordionElement) {
    return bestStrictAccordionElement
  }

  if (hasExplicitAccordionTitle) {
    return null
  }

  return bestElement
}

const ensureJourneyOverlayStyles = (doc: Document) => {
  if (doc.getElementById('umami-journey-overlay-style')) return
  const style = doc.createElement('style')
  style.id = 'umami-journey-overlay-style'
  style.textContent = `
    .${JOURNEY_STEP_HIT_CLASS} {
      position: relative !important;
      outline: 2px solid rgba(185, 28, 28, 0.78) !important;
      outline-offset: 1px !important;
      border-radius: 3px !important;
      background-color: rgba(220, 38, 38, 0.12) !important;
    }
    .${JOURNEY_STEP_HIT_CLASS}[${JOURNEY_STEP_NUMBER_ATTR}]::before {
      content: attr(${JOURNEY_STEP_NUMBER_ATTR});
      position: absolute;
      top: -${JOURNEY_STEP_BADGE_OFFSET}px;
      left: -${JOURNEY_STEP_BADGE_OFFSET}px;
      width: ${JOURNEY_STEP_BADGE_SIZE}px;
      height: ${JOURNEY_STEP_BADGE_SIZE}px;
      border-radius: 9999px;
      border: 2px solid #fff;
      background: rgba(185, 28, 28, 0.98);
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
      z-index: 2147483646;
      pointer-events: none;
    }
    .${JOURNEY_STEP_START_CLASS} {
      outline-width: 3px !important;
      background-color: rgba(220, 38, 38, 0.18) !important;
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.8), 0 0 0 6px rgba(220, 38, 38, 0.45) !important;
    }
    .${JOURNEY_STEP_ACTIVE_CLASS} {
      outline-width: 3px !important;
      background-color: rgba(220, 38, 38, 0.22) !important;
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.85), 0 0 0 7px rgba(220, 38, 38, 0.58) !important;
    }
  `
  doc.head.appendChild(style)
}

const clearJourneyHighlights = (doc: Document) => {
  doc.querySelectorAll(`.${JOURNEY_STEP_HIT_CLASS}`).forEach((node) => {
    node.classList.remove(JOURNEY_STEP_HIT_CLASS)
    node.classList.remove(JOURNEY_STEP_START_CLASS)
    node.classList.remove(JOURNEY_STEP_ACTIVE_CLASS)
  })
  doc.querySelectorAll(`[${JOURNEY_STEP_NUMBER_ATTR}]`).forEach((node) => {
    node.removeAttribute(JOURNEY_STEP_NUMBER_ATTR)
  })
}

const parseJourneyFromSearch = (rawValue: string | null): string[] => {
  if (!rawValue) return []
  try {
    const parsed: unknown = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((step): step is string => typeof step === 'string')
  } catch {
    return []
  }
}

const buildPreviewTargetUrl = (domain: string | undefined, path: string): string | null => {
  if (!domain || !path) return null

  const normalizedPath = normalizeUrlToPath(path)
  if (!normalizedPath) return null

  const withProtocol = domain.startsWith('http://') || domain.startsWith('https://') ? domain : `https://${domain}`

  try {
    const domainUrl = new URL(withProtocol)
    const finalPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
    return new URL(finalPath, domainUrl.origin).toString()
  } catch {
    return null
  }
}

const EventJourneyClickmap = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [isWebsitePickerInitializing, setIsWebsitePickerInitializing] = useState<boolean>(true)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const matchedElementsRef = useRef<Map<number, Element>>(new Map())
  const hasAutoScrolledToFirstStepRef = useRef(false)

  const [urlPath, setUrlPath] = useState(() => normalizeUrlToPath(searchParams.get('urlPath') || ''))
  const [markers, setMarkers] = useState<JourneyMarker[]>([])
  const [overlayViewport, setOverlayViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [unmatchedStepIndexes, setUnmatchedStepIndexes] = useState<number[]>([])
  const [activeStepIndex, setActiveStepIndex] = useState(0)

  const [period, setPeriodState] = useState<string>(() => getStoredPeriod(searchParams.get('period')))
  const setPeriod = (newPeriod: string) => {
    setPeriodState(newPeriod)
    savePeriodPreference(newPeriod)
  }
  const fromDateFromUrl = searchParams.get('from')
  const toDateFromUrl = searchParams.get('to')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(
    fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined,
  )
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(
    toDateFromUrl ? parseISO(toDateFromUrl) : undefined,
  )

  const journeyCount = Number(searchParams.get('journeyCount') || '0')
  const journeyTotal = Number(searchParams.get('journeyTotal') || '0')
  const journeyPercentValue = journeyTotal > 0 ? (journeyCount / journeyTotal) * 100 : 0
  const journeyPercent = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    journeyPercentValue,
  )

  const journeySteps = useMemo<JourneyStep[]>(() => {
    return parseJourneyFromSearch(searchParams.get('journey')).map((step) => ({
      rawStep: step,
      ...parseJourneyStep(step),
    }))
  }, [searchParams])

  const hasJourney = journeySteps.length > 0

  const previewTargetUrl = useMemo(
    () => buildPreviewTargetUrl(selectedWebsite?.domain, urlPath),
    [selectedWebsite, urlPath],
  )
  const iframeSrc = useMemo(
    () => (previewTargetUrl ? `/api/clickmap-preview?url=${encodeURIComponent(previewTargetUrl)}` : ''),
    [previewTargetUrl],
  )

  const updateJourneyOverlay = useCallback(() => {
    const iframeNode = iframeRef.current
    if (!iframeNode) return
    const iframeDoc = iframeNode.contentDocument
    if (!iframeDoc) return

    ensureJourneyOverlayStyles(iframeDoc)
    clearJourneyHighlights(iframeDoc)

    const nextMarkers: JourneyMarker[] = []
    const nextUnmatched: number[] = []
    let firstMatchedElement: Element | null = null
    const nextMatchedElements = new Map<number, Element>()

    journeySteps.forEach((step, index) => {
      const matchedElement = findBestElementForStep(iframeDoc, step)
      if (!matchedElement) {
        nextUnmatched.push(index)
        return
      }

      matchedElement.classList.add(JOURNEY_STEP_HIT_CLASS)
      matchedElement.setAttribute(JOURNEY_STEP_NUMBER_ATTR, String(index + 1))
      nextMatchedElements.set(index, matchedElement)
      if (!firstMatchedElement) {
        firstMatchedElement = matchedElement
        matchedElement.classList.add(JOURNEY_STEP_START_CLASS)
      }
      if (index === activeStepIndex) {
        matchedElement.classList.add(JOURNEY_STEP_ACTIVE_CLASS)
      }

      const elementRect = matchedElement.getBoundingClientRect()
      const isInViewport =
        elementRect.bottom >= 0 &&
        elementRect.top <= iframeNode.clientHeight &&
        elementRect.right >= 0 &&
        elementRect.left <= iframeNode.clientWidth
      const markerAnchor = getMarkerAnchor(elementRect)
      nextMarkers.push({
        index,
        x: markerAnchor.x,
        y: markerAnchor.y,
        visible: isInViewport,
      })
    })

    setMarkers(nextMarkers)
    setOverlayViewport({ width: iframeNode.clientWidth, height: iframeNode.clientHeight })
    setUnmatchedStepIndexes(nextUnmatched)
    matchedElementsRef.current = nextMatchedElements

    const preferredElement = nextMatchedElements.get(activeStepIndex) || firstMatchedElement
    if (!hasAutoScrolledToFirstStepRef.current && preferredElement) {
      hasAutoScrolledToFirstStepRef.current = true
      const iframeWindow = iframeNode.contentWindow
      if (iframeWindow) {
        const rect = preferredElement.getBoundingClientRect()

        const targetTop = Math.max(0, rect.top + iframeWindow.scrollY - iframeWindow.innerHeight * 0.35)
        iframeWindow.scrollTo({ top: targetTop, behavior: 'smooth' })
      }
    }
  }, [journeySteps, activeStepIndex])

  const focusStep = useCallback(
    (stepIndex: number) => {
      setActiveStepIndex(stepIndex)
      const iframeNode = iframeRef.current
      const matchedElement = matchedElementsRef.current.get(stepIndex)
      if (!iframeNode || !matchedElement) return
      const iframeWindow = iframeNode.contentWindow
      if (!iframeWindow) return

      const rect = matchedElement.getBoundingClientRect()

      const targetTop = Math.max(0, rect.top + iframeWindow.scrollY - iframeWindow.innerHeight * 0.35)
      iframeWindow.scrollTo({ top: targetTop, behavior: 'smooth' })
      updateJourneyOverlay()
    },
    [updateJourneyOverlay],
  )

  useEffect(() => {
    const iframeNode = iframeRef.current
    if (!iframeNode) return

    hasAutoScrolledToFirstStepRef.current = false

    const onLoad = () => {
      updateJourneyOverlay()

      const iframeWindow = iframeNode.contentWindow
      const iframeDoc = iframeNode.contentDocument
      if (!iframeWindow || !iframeDoc) return

      const onIframeScroll = () => updateJourneyOverlay()
      const onIframeResize = () => updateJourneyOverlay()
      const onIframeClick = () => window.setTimeout(() => updateJourneyOverlay(), 50)

      iframeWindow.addEventListener('scroll', onIframeScroll, { passive: true })
      iframeWindow.addEventListener('resize', onIframeResize)
      iframeDoc.addEventListener('click', onIframeClick, true)

      const cleanup = () => {
        iframeWindow.removeEventListener('scroll', onIframeScroll)
        iframeWindow.removeEventListener('resize', onIframeResize)
        iframeDoc.removeEventListener('click', onIframeClick, true)
      }

      iframeNode.dataset.overlayCleanup = 'attached'
      ;(iframeNode as HTMLIFrameElement & { __overlayCleanup?: () => void }).__overlayCleanup = cleanup
    }

    iframeNode.addEventListener('load', onLoad)
    return () => {
      iframeNode.removeEventListener('load', onLoad)
      const cleanup = (iframeNode as HTMLIFrameElement & { __overlayCleanup?: () => void }).__overlayCleanup
      if (cleanup) {
        cleanup()
        delete (iframeNode as HTMLIFrameElement & { __overlayCleanup?: () => void }).__overlayCleanup
      }
    }
  }, [iframeSrc, updateJourneyOverlay])

  useEffect(() => {
    hasAutoScrolledToFirstStepRef.current = false
  }, [urlPath, journeySteps, selectedWebsite?.domain])

  useEffect(() => {
    if (!iframeSrc) return

    const interval = window.setInterval(() => {
      updateJourneyOverlay()
    }, 1200)

    return () => {
      window.clearInterval(interval)
    }
  }, [iframeSrc, updateJourneyOverlay])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('period', period)
    if (period === 'custom' && customStartDate && customEndDate) {
      params.set('from', format(customStartDate, 'yyyy-MM-dd'))
      params.set('to', format(customEndDate, 'yyyy-MM-dd'))
    } else {
      params.delete('from')
      params.delete('to')
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }, [period, customStartDate, customEndDate])

  return (
    <ChartLayout
      title="Visualisert hendelsesforløp"
      currentPage="hendelsesreiser"
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={
        <WebsitePicker
          selectedWebsite={selectedWebsite}
          onWebsiteChange={setSelectedWebsite}
          onInitialLoadingChange={setIsWebsitePickerInitializing}
          variant="minimal"
        />
      }
      filters={
        <>
          <div className="w-full sm:w-[350px]">
            <TextField
              size="small"
              label="URL"
              value={urlPath}
              onChange={(event) => setUrlPath(event.target.value)}
              onBlur={(event) => setUrlPath(normalizeUrlToPath(event.target.value))}
              placeholder="/aap"
            />
          </div>

          <div className="flex flex-wrap items-end gap-2 self-end pb-[2px]">
            <PeriodPicker
              period={period}
              onPeriodChange={setPeriod}
              startDate={customStartDate}
              onStartDateChange={setCustomStartDate}
              endDate={customEndDate}
              onEndDateChange={setCustomEndDate}
            />
          </div>
        </>
      }
    >
      {!hasJourney && (
        <Alert variant="warning" className="mb-4">
          Fant ikke valgt forløp. Gå til "Hendelsesforløp" og bruk knappen "Visualiser" i en forløpsboks.
        </Alert>
      )}

      {hasJourney && !selectedWebsite && !isWebsitePickerInitializing && (
        <Alert variant="info" className="mb-4">
          Velg nettsted for å laste sideforhåndsvisning med markert forløp.
        </Alert>
      )}

      {hasJourney && selectedWebsite && !iframeSrc && (
        <Alert variant="warning" className="mb-4">
          Kunne ikke bygge forhåndsvisning for valgt domene/URL.
        </Alert>
      )}

      {hasJourney && selectedWebsite && iframeSrc && (
        <>
          <div className="mb-4 pb-[2px]">
            <Button
              size="small"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
              onClick={() => {
                const params = new URLSearchParams(window.location.search)
                params.delete('journey')
                params.delete('journeyCount')
                params.delete('journeyTotal')
                void navigate(`/hendelsesreiser?${params.toString()}`)
              }}
            >
              Alle hendelsesforløp
            </Button>
          </div>

          <div className="mb-4 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-4 py-3">
            <p className="text-xl leading-8 text-[var(--ax-text-default)]">
              <span className="font-bold text-red-700">{journeyPercent} %</span> av alle økter fulgte dette løpet. Det
              tilsvarer <span className="font-semibold">{journeyCount.toLocaleString('nb-NO')}</span> av{' '}
              <span className="font-semibold">{journeyTotal.toLocaleString('nb-NO')}</span> økter.
            </p>
          </div>

          <div className="mb-3 overflow-x-auto pb-1">
            <div className="flex min-w-max items-start gap-2">
              {journeySteps.map((step, index) => (
                <div key={`${step.rawStep}-${index}`} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => focusStep(index)}
                    className={`w-[290px] rounded-md border p-3 text-left transition-colors ${activeStepIndex === index ? 'border-red-700 bg-[var(--ax-bg-neutral-soft)] shadow-[0_0_0_2px_rgba(220,38,38,0.28)_inset]' : 'border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] hover:bg-[var(--ax-bg-neutral-moderate)]'}`}
                  >
                    <div className="text-xs font-semibold text-[var(--ax-text-subtle)] mb-1">Steg {index + 1}</div>
                    <div className="text-sm font-semibold text-[var(--ax-text-default)] mb-2 break-words">
                      {step.eventName}
                    </div>
                    {step.details.length > 0 ? (
                      <div className="space-y-1">
                        {step.details.slice(0, 4).map((detail, detailIndex) => (
                          <div key={`${detail.key}-${detail.value}-${detailIndex}`} className="text-xs break-words">
                            <span className="font-semibold">{detail.key}:</span> {detail.value}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--ax-text-subtle)]">Ingen ekstra felter</div>
                    )}
                  </button>
                  {index < journeySteps.length - 1 && (
                    <ArrowRight size={18} className="text-[var(--ax-text-subtle)] flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <section className="relative border border-[var(--ax-border-neutral-subtle)] rounded-md overflow-hidden bg-white">
            <iframe
              ref={iframeRef}
              title="Visualisert hendelsesforløp"
              src={iframeSrc}
              className="w-full h-[920px]"
              sandbox="allow-same-origin allow-scripts allow-forms"
            />

            <div className="pointer-events-none absolute inset-0">
              <svg className="absolute inset-0 w-full h-full" aria-hidden>
                {markers.slice(0, -1).map((fromMarker, idx) => {
                  const toMarker = markers[idx + 1]
                  if (!overlayViewport.width || !overlayViewport.height) return null
                  const fromPoint = getMarkerRenderPoint(fromMarker, overlayViewport.width, overlayViewport.height)
                  const toPoint = getMarkerRenderPoint(toMarker, overlayViewport.width, overlayViewport.height)
                  const dx = toPoint.x - fromPoint.x
                  const dy = toPoint.y - fromPoint.y
                  // Skip lines that collapse on the same viewport edge while both points are off-screen.
                  if (!fromMarker.visible && !toMarker.visible && Math.hypot(dx, dy) < 2) return null
                  const length = Math.hypot(dx, dy) || 1
                  const radius = JOURNEY_STEP_BADGE_RADIUS
                  const startX = fromPoint.x + (dx / length) * radius
                  const startY = fromPoint.y + (dy / length) * radius
                  const endX = toPoint.x - (dx / length) * (radius + 2)
                  const endY = toPoint.y - (dy / length) * (radius + 2)
                  return (
                    <line
                      key={`line-${fromMarker.index}-${toMarker.index}`}
                      x1={startX}
                      y1={startY}
                      x2={endX}
                      y2={endY}
                      stroke="rgba(220, 38, 38, 0.95)"
                      strokeWidth={3}
                      strokeLinecap="round"
                      markerEnd="url(#journey-arrow-head)"
                    />
                  )
                })}
                <defs>
                  <marker id="journey-arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="rgba(220, 38, 38, 0.95)" />
                  </marker>
                </defs>
              </svg>

              {markers
                .filter((marker) => !marker.visible && overlayViewport.width > 0 && overlayViewport.height > 0)
                .map((marker) => {
                  const point = getMarkerRenderPoint(marker, overlayViewport.width, overlayViewport.height)
                  return (
                    <div
                      key={`edge-marker-${marker.index}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-700/90 text-white font-bold shadow-md flex items-center justify-center"
                      style={{
                        left: `${point.x}px`,
                        top: `${point.y}px`,
                        width: `${JOURNEY_STEP_BADGE_SIZE}px`,
                        height: `${JOURNEY_STEP_BADGE_SIZE}px`,
                        fontSize: '16px',
                      }}
                      title={`Steg ${marker.index + 1} (utenfor visning)`}
                    >
                      {marker.index + 1}
                    </div>
                  )
                })}
            </div>
          </section>
        </>
      )}

      {hasJourney && selectedWebsite && iframeSrc && unmatchedStepIndexes.length > 0 && (
        <Alert variant="info" className="mt-4">
          Fant ikke eksakt plassering på siden for steg: {unmatchedStepIndexes.map((idx) => idx + 1).join(', ')}.
        </Alert>
      )}
    </ChartLayout>
  )
}

export default EventJourneyClickmap
