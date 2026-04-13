import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Website } from '../../../../shared/types/website.ts'
import { getDateRangeFromPeriod, normalizeUrlToPath } from '../../../../shared/lib/utils.ts'
import type { ClickmapItem } from '../../../clickmap/model/types.ts'
import {
  getClickmapDatasetFromVisualizationMode,
  isVisualizationMode,
  type VisualizationMode,
} from '../../../clickmap/model/visualizationMode.ts'
import { fetchClickmap } from '../../../clickmap/api/clickmapApi.ts'

type WebsiteVisualizationFrame = {
  id: string
  kind: string
  websiteId?: string
  targetUrl?: string
  renderWebsite?: boolean
  isInternalDashboard?: boolean
  visualizationMode?: VisualizationMode
}

type CanvasFrameVisualizationData = {
  requestKey: string
  loading: boolean
  error: string | null
  items: ClickmapItem[]
  websiteId?: string
  path?: string
}

type UseCanvasWebsiteVisualizationParams = {
  frameItems: WebsiteVisualizationFrame[]
  availableWebsites: Website[]
  selectedWebsiteId?: string | null
  selectedWebsiteDomain?: string | null
  canvasConfiguredWebsiteId?: string | null
  period: string
  customStartDate: Date | null
  customEndDate: Date | null
  clickmapEvents: string[]
}

type ClickmapFocusLinkPayload = {
  type: 'umami-clickmap-focus-link'
  linkText?: string
  destination?: string
  component?: string
  section?: string
}

const normalizeDomainForComparison = (value: string): string =>
  value.replace(/^https?:\/\//i, '').replace(/^www\./i, '')

const getFrameVisualizationMode = (
  frame: Pick<WebsiteVisualizationFrame, 'visualizationMode'>,
): VisualizationMode | '' => (isVisualizationMode(frame.visualizationMode) ? frame.visualizationMode : '')

const CLICKMAP_FOCUSED_CLASS = 'umami-clickmap-focused-link'

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()

const isAccordionLike = (value: string): boolean => {
  const cleaned = cleanText(value)
  return cleaned.includes('accordion') || cleaned.includes('trekkspill')
}

const isInternalNavigationComponent = (value: string): boolean => {
  const cleaned = cleanText(value)
  return cleaned.includes('intern-navigasjon') || cleaned.includes('page-navigation')
}

const isNavigationMenuLink = (element: Element): boolean =>
  !!element.closest('nav, .part__page-navigation-menu, [class*="PageNavigationMenu"], [class*="NavigationMenu"]')
const isHeadingLink = (element: Element): boolean => !!element.closest('h1, h2, h3, h4, h5, h6')
const isInPageHashLink = (element: Element): boolean => {
  const href = element.getAttribute('href') || ''
  return href.startsWith('#')
}

const getElementSectionKey = (element: Element): string => {
  const accordionSection = element.closest(
    'section.navds-expansioncard, section[class*="expansioncard"], section[class*="Expandable_expandable"], section[aria-label]',
  )
  if (accordionSection) {
    const titleNode =
      accordionSection.querySelector(
        '[class*="Expandable_headerTitle"], .navds-expansioncard__header-content, .navds-expansioncard__header',
      ) || accordionSection
    const title = cleanText(titleNode.textContent || '')
    if (title) return title
    const ariaLabel = cleanText(accordionSection.getAttribute('aria-label') || '')
    if (ariaLabel) return ariaLabel
  }

  const sectionContainer = element.closest('section, article, [role="region"]')
  if (sectionContainer) {
    const heading = sectionContainer.querySelector('h1, h2, h3, h4, h5, h6')
    const headingText = cleanText(heading?.textContent || '')
    if (headingText) return headingText
    const ariaLabel = cleanText(sectionContainer.getAttribute('aria-label') || '')
    if (ariaLabel) return ariaLabel
  }

  return ''
}

const normalizeDestination = (value: string): { path: string; full: string } => {
  if (!value) return { path: '', full: '' }
  try {
    const resolved = new URL(value, window.location.href)
    const normalizedPath = decodeURIComponent(resolved.pathname || '/')
    const path = normalizedPath === '/' ? '/' : normalizedPath.replace(/\/+$/, '')
    const host = (resolved.hostname || '').toLowerCase()
    return { path, full: host ? host + path : path }
  } catch {
    const path = normalizeUrlToPath(value || '')
    if (!path) return { path: '', full: '' }
    return { path, full: path === '/' ? '/' : path.replace(/\/+$/, '') }
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

const ensureFocusedStyle = (doc: Document) => {
  if (doc.getElementById('umami-clickmap-focused-style')) return
  const style = doc.createElement('style')
  style.id = 'umami-clickmap-focused-style'
  style.textContent = `
    .${CLICKMAP_FOCUSED_CLASS} {
      outline: 3px solid rgba(185, 28, 28, 0.95) !important;
      outline-offset: 1px !important;
      background-color: rgba(220, 38, 38, 0.2) !important;
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.82), 0 0 0 6px rgba(220, 38, 38, 0.52) !important;
      border-radius: 3px !important;
    }
  `
  doc.head.appendChild(style)
}

const clearFocusedElement = (doc: Document) => {
  doc.querySelectorAll(`.${CLICKMAP_FOCUSED_CLASS}`).forEach((node) => {
    node.classList.remove(CLICKMAP_FOCUSED_CLASS)
  })
}

const findBestElementForClickmapItem = (doc: Document, item: ClickmapItem): Element | null => {
  const targetText = cleanText(item.linkText || '')
  const targetDestination = normalizeDestination(item.destination || '')
  const targetIsAccordion = isAccordionLike(item.component || '')
  const targetIsInternalNavigation = isInternalNavigationComponent(item.component || '')
  const targetSection = cleanText(item.section || '')

  const candidates = [
    ...Array.from(doc.querySelectorAll('a[href]')).map((element) => ({ element, kind: 'link' as const })),
    ...Array.from(doc.querySelectorAll('button[aria-expanded], button[aria-controls], summary')).map((element) => ({
      element,
      kind: 'accordion' as const,
    })),
  ]

  let bestElement: Element | null = null
  let bestScore = -1

  for (const candidate of candidates) {
    if (!isElementVisible(candidate.element)) continue
    if (targetIsAccordion && candidate.kind !== 'accordion') continue
    if (candidate.kind === 'link' && isHeadingLink(candidate.element)) continue
    if (candidate.kind === 'link' && isInPageHashLink(candidate.element) && !isNavigationMenuLink(candidate.element))
      continue
    if (targetIsInternalNavigation && candidate.kind === 'link' && !isNavigationMenuLink(candidate.element)) continue

    const elementText = cleanText(candidate.element.textContent || candidate.element.getAttribute('aria-label') || '')
    const href = candidate.kind === 'link' ? candidate.element.getAttribute('href') || '' : ''
    const normalizedHref = normalizeDestination(href)
    const sectionKey = getElementSectionKey(candidate.element)

    let score = 0

    if (targetText && elementText === targetText) score += 100
    else if (targetText && elementText.includes(targetText)) score += 70
    else if (targetText && targetText.includes(elementText) && elementText) score += 45

    if (targetDestination.full && normalizedHref.full && normalizedHref.full === targetDestination.full) score += 90
    else if (targetDestination.path && normalizedHref.path && normalizedHref.path === targetDestination.path)
      score += 70

    if (targetSection && sectionKey && sectionKey === targetSection) score += 30

    if (targetIsAccordion && candidate.kind === 'accordion') score += 15
    if (targetIsInternalNavigation && isNavigationMenuLink(candidate.element)) score += 15

    if (score > bestScore) {
      bestScore = score
      bestElement = candidate.element
    }
  }

  return bestScore >= 60 ? bestElement : null
}

const useCanvasWebsiteVisualization = ({
  frameItems,
  availableWebsites,
  selectedWebsiteId,
  selectedWebsiteDomain,
  canvasConfiguredWebsiteId,
  period,
  customStartDate,
  customEndDate,
  clickmapEvents,
}: UseCanvasWebsiteVisualizationParams) => {
  const [frameVisualizationData, setFrameVisualizationData] = useState<Record<string, CanvasFrameVisualizationData>>({})
  const frameVisualizationDataRef = useRef<Record<string, CanvasFrameVisualizationData>>({})
  const websiteIframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})

  useEffect(() => {
    frameVisualizationDataRef.current = frameVisualizationData
  }, [frameVisualizationData])

  const visualizationWebsiteFrames = useMemo(
    () =>
      frameItems
        .filter((frame) => frame.kind === 'website' && !frame.isInternalDashboard && frame.renderWebsite !== false)
        .map((frame) => ({
          id: frame.id,
          kind: frame.kind,
          websiteId: frame.websiteId,
          targetUrl: frame.targetUrl,
          renderWebsite: frame.renderWebsite,
          isInternalDashboard: frame.isInternalDashboard,
          visualizationMode: frame.visualizationMode,
        })),
    [frameItems],
  )

  const visualizationWebsiteFramesKey = useMemo(
    () => JSON.stringify(visualizationWebsiteFrames),
    [visualizationWebsiteFrames],
  )

  const visualizationWebsiteFramesRef = useRef(visualizationWebsiteFrames)

  useEffect(() => {
    visualizationWebsiteFramesRef.current = visualizationWebsiteFrames
  }, [visualizationWebsiteFrames])

  const sendVisualizationDataToWebsiteFrame = useCallback(
    (
      frame: Pick<
        WebsiteVisualizationFrame,
        'id' | 'kind' | 'isInternalDashboard' | 'renderWebsite' | 'visualizationMode'
      >,
    ) => {
      if (frame.kind !== 'website' || frame.isInternalDashboard || frame.renderWebsite === false) return
      const contentWindow = websiteIframeRefs.current[frame.id]?.contentWindow
      if (!contentWindow) return

      const viewMode = getFrameVisualizationMode(frame)
      const frameData = frameVisualizationData[frame.id]
      const items = viewMode ? (frameData?.items ?? []) : []
      const payloadItems = items.map((item) => ({
        ...item,
        badgeLabel: item.count.toLocaleString('nb-NO'),
      }))

      contentWindow.postMessage(
        {
          type: 'umami-clickmap-data',
          items: payloadItems,
          zeroBadgeLabel: '0',
          viewMode: viewMode || 'clickmap',
          includeUnmatched: viewMode === 'clickmap',
        },
        '*',
      )
    },
    [frameVisualizationData],
  )

  useEffect(() => {
    const websiteFrames = visualizationWebsiteFramesRef.current

    setFrameVisualizationData((current) => {
      const validIds = new Set(websiteFrames.map((frame) => frame.id))
      const next = Object.fromEntries(Object.entries(current).filter(([frameId]) => validIds.has(frameId)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })

    const dateRange = getDateRangeFromPeriod(period, customStartDate ?? undefined, customEndDate ?? undefined)
    if (!dateRange) return

    const normalizedSelectedDomain = normalizeDomainForComparison(selectedWebsiteDomain || '')
    const websiteByDomain = new Map<string, string>()
    availableWebsites.forEach((website) => {
      const normalizedDomain = normalizeDomainForComparison(website.domain || '')
      if (normalizedDomain && !websiteByDomain.has(normalizedDomain)) {
        websiteByDomain.set(normalizedDomain, website.id)
      }
    })

    let isActive = true

    const loadVisualizationData = async () => {
      await Promise.all(
        websiteFrames.map(async (frame) => {
          const pagePath = frame.targetUrl ? normalizeUrlToPath(frame.targetUrl) : ''
          if (!pagePath) {
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey: '',
                loading: false,
                error: 'Fant ikke gyldig URL-sti for kortet.',
                items: [],
                path: '',
              },
            }))
            return
          }

          let websiteId = frame.websiteId || selectedWebsiteId || canvasConfiguredWebsiteId || ''
          if (!websiteId && frame.targetUrl) {
            try {
              const targetDomain = normalizeDomainForComparison(new URL(frame.targetUrl).hostname)
              websiteId = websiteByDomain.get(targetDomain) || ''
            } catch {
              // Ignore invalid target URL.
            }
          }
          if (!websiteId && normalizedSelectedDomain) {
            websiteId = websiteByDomain.get(normalizedSelectedDomain) || ''
          }
          if (!websiteId) {
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey: '',
                loading: false,
                error: 'Fant ikke nettsted for URL-en i kortet.',
                items: [],
                websiteId: '',
                path: pagePath,
              },
            }))
            return
          }

          const mode = getFrameVisualizationMode(frame)
          if (!mode) return
          const dataset = getClickmapDatasetFromVisualizationMode(mode)
          const requestKey = JSON.stringify({
            websiteId,
            pagePath,
            period,
            customStartDate: customStartDate?.toISOString() ?? null,
            customEndDate: customEndDate?.toISOString() ?? null,
            mode,
            dataset,
          })

          const existing = frameVisualizationDataRef.current[frame.id]
          const hasCompletedSuccessfulResult =
            existing?.requestKey === requestKey && existing.loading === false && existing.error === null
          if (hasCompletedSuccessfulResult) return

          setFrameVisualizationData((current) => ({
            ...current,
            [frame.id]: {
              requestKey,
              loading: true,
              error: null,
              items: existing?.requestKey === requestKey ? existing.items : [],
              websiteId,
              path: pagePath,
            },
          }))

          try {
            const result = await fetchClickmap({
              websiteId,
              startAt: dateRange.startDate.getTime(),
              endAt: dateRange.endDate.getTime(),
              urlPath: pagePath,
              pathOperator: 'equals',
              eventNames: clickmapEvents,
              limit: 400,
              dataset,
            })

            if (!isActive) return
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey,
                loading: false,
                error: null,
                items: result.data ?? [],
                websiteId,
                path: pagePath,
              },
            }))
          } catch (error) {
            if (!isActive) return
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey,
                loading: false,
                error: error instanceof Error ? error.message : 'Kunne ikke hente visualiseringsdata',
                items: [],
                websiteId,
                path: pagePath,
              },
            }))
          }
        }),
      )
    }

    void loadVisualizationData()

    return () => {
      isActive = false
    }
  }, [
    availableWebsites,
    canvasConfiguredWebsiteId,
    clickmapEvents,
    customEndDate,
    customStartDate,
    period,
    selectedWebsiteDomain,
    selectedWebsiteId,
    visualizationWebsiteFramesKey,
  ])

  useEffect(() => {
    const websiteFrames = visualizationWebsiteFramesRef.current
    websiteFrames.forEach((frame) => {
      sendVisualizationDataToWebsiteFrame(frame)
    })
  }, [frameVisualizationData, sendVisualizationDataToWebsiteFrame, visualizationWebsiteFramesKey])

  const setWebsiteIframeRef = useCallback((frameId: string, node: HTMLIFrameElement | null) => {
    websiteIframeRefs.current[frameId] = node
  }, [])

  const handleWebsiteFrameLoad = useCallback(
    (
      frame: Pick<
        WebsiteVisualizationFrame,
        'id' | 'kind' | 'isInternalDashboard' | 'renderWebsite' | 'visualizationMode'
      >,
    ) => {
      sendVisualizationDataToWebsiteFrame(frame)
    },
    [sendVisualizationDataToWebsiteFrame],
  )

  const focusWebsiteTopListItem = useCallback((frameId: string, item: ClickmapItem) => {
    const iframeNode = websiteIframeRefs.current[frameId]
    const iframeDoc = iframeNode?.contentDocument
    const iframeWindow = iframeNode?.contentWindow

    if (iframeDoc && iframeWindow) {
      ensureFocusedStyle(iframeDoc)
      clearFocusedElement(iframeDoc)
      const matchedElement = findBestElementForClickmapItem(iframeDoc, item)
      if (matchedElement) {
        matchedElement.classList.add(CLICKMAP_FOCUSED_CLASS)
        const rect = matchedElement.getBoundingClientRect()
        const targetTop = Math.max(0, rect.top + iframeWindow.scrollY - iframeWindow.innerHeight * 0.35)
        iframeWindow.scrollTo({ top: targetTop, behavior: 'smooth' })
        return
      }
    }

    const contentWindow = iframeNode?.contentWindow
    if (!contentWindow) return

    const focusPayload: ClickmapFocusLinkPayload = {
      type: 'umami-clickmap-focus-link',
      linkText: item.linkText,
      destination: item.destination,
      component: item.component,
      section: item.section,
    }

    contentWindow.postMessage(focusPayload, '*')
  }, [])

  return {
    frameVisualizationData,
    setWebsiteIframeRef,
    handleWebsiteFrameLoad,
    focusWebsiteTopListItem,
  }
}

export default useCanvasWebsiteVisualization
