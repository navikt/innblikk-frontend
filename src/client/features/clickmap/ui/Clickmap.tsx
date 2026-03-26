import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  ExpansionCard,
  Loader,
  Modal,
  ReadMore,
  Search,
  Select,
  Switch,
  TextField,
} from '@navikt/ds-react'
import { useLocation, useNavigate } from 'react-router-dom'
import ChartLayout from '../../analysis/ui/ChartLayout.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import { normalizeUrlToPath } from '../../../shared/lib/utils.ts'
import { useClickmap } from '../hooks/useClickmap.ts'
import type { ClickmapItem } from '../model/types.ts'

const normalizeComparablePath = (value: string): string => {
  const normalizedValue = normalizeUrlToPath(value || '')
  if (!normalizedValue) return ''
  if (normalizedValue === '/') return '/'
  return normalizedValue.replace(/\/+$/, '')
}

const UNSUPPORTED_CLICKMAP_PATH_PREFIXES = ['/oauth2/login']

const isUnsupportedClickmapPath = (value: string): boolean => {
  const normalizedValue = normalizeComparablePath(value)
  if (!normalizedValue) return false
  return UNSUPPORTED_CLICKMAP_PATH_PREFIXES.some(
    (prefix) =>
      normalizedValue === prefix ||
      normalizedValue.startsWith(`${prefix}/`) ||
      normalizedValue.startsWith(`${prefix}?`),
  )
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

const matchesSourcePath = (sourcePath: string, filterPath: string): boolean => {
  const normalizedSourcePath = normalizeComparablePath(sourcePath)
  const normalizedFilterPath = normalizeComparablePath(filterPath)
  if (!normalizedFilterPath) return true

  return (
    normalizedSourcePath === normalizedFilterPath ||
    normalizedSourcePath === `${normalizedFilterPath}/` ||
    normalizedSourcePath.startsWith(`${normalizedFilterPath}?`)
  )
}

type PendingLinkNavigation = {
  path: string
  destination: string
  linkText: string
}

type ClickmapLinkClickMessage = {
  type: 'umami-clickmap-link-click'
  path?: string
  destination?: string
  linkText?: string
}

type ClickmapBlockedLinkMessage = {
  type: 'umami-clickmap-link-blocked'
  reason?: string
  path?: string
  destination?: string
}

type ClickmapPreviewErrorMessage = {
  type: 'umami-clickmap-preview-error'
  reason?: string
  title?: string
  description?: string
  path?: string
  details?: string
}

type ScrollmapSummaryMessage = {
  type: 'umami-scrollmap-summary'
  breakpoints?: Array<{
    depthPercent?: number
    estimatedReachRatio?: number
    estimatedReachPercent?: number
    estimatedClicksReached?: number
    categoryCounts?: {
      linkClicks?: number
      accordionClicks?: number
      otherClicks?: number
    }
  }>
  totalEstimatedClicks?: number
  medianDepthPercent?: number
}

type PreviewNotice = {
  title: string
  description: string
  path?: string
  details?: string
}

type VisualizationMode = 'clickmap' | 'heatmap' | 'scrollmap'

type ClickmapProps = {
  visualizationMode?: VisualizationMode
}

type ClickmapFocusLinkPayload = {
  type: 'umami-clickmap-focus-link'
  linkText?: string
  destination?: string
  component?: string
}

const ROUTE_BY_VISUALIZATION_MODE: Record<VisualizationMode, string> = {
  clickmap: '/klikkoversikt',
  heatmap: '/klikkoversikt/varmekart',
  scrollmap: '/klikkoversikt/scrollkart',
}

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()

const isAccordionLike = (value: string): boolean => {
  const cleaned = cleanText(value)
  return cleaned.includes('accordion') || cleaned.includes('trekkspill')
}

const CLICKMAP_FOCUSED_CLASS = 'umami-clickmap-focused-link'

const normalizeDestination = (value: string): { path: string; full: string } => {
  if (!value) return { path: '', full: '' }
  try {
    const resolved = new URL(value, window.location.href)
    const normalizedPath = decodeURIComponent(resolved.pathname || '/')
    const path = normalizedPath === '/' ? '/' : normalizedPath.replace(/\/+$/, '')
    const host = (resolved.hostname || '').toLowerCase()
    return { path, full: host ? host + path : path }
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

    const elementText = cleanText(candidate.element.textContent || candidate.element.getAttribute('aria-label') || '')
    const textExact = !!targetText && targetText === elementText
    const textContains =
      !!targetText && !textExact && (targetText.includes(elementText) || elementText.includes(targetText))

    const href = candidate.kind === 'link' ? candidate.element.getAttribute('href') || '' : ''
    const destination = normalizeDestination(href)
    const destinationMatches =
      candidate.kind === 'link' &&
      !!targetDestination.path &&
      (targetDestination.path === destination.path || targetDestination.full === destination.full)

    if (!destinationMatches && !textExact && !textContains && !targetIsAccordion) continue

    const score =
      (destinationMatches ? 6 : 0) +
      (textExact ? 4 : textContains ? 2 : 0) +
      (targetIsAccordion && candidate.kind === 'accordion' ? 3 : 0) +
      (candidate.element.classList.contains('umami-clickmap-hit') ||
      candidate.element.classList.contains('umami-heatmap-hit')
        ? 1
        : 0)

    if (score > bestScore) {
      bestScore = score
      bestElement = candidate.element
    }
  }

  return bestElement
}

const isClickmapLinkClickMessage = (value: unknown): value is ClickmapLinkClickMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'umami-clickmap-link-click'
}

const isClickmapBlockedLinkMessage = (value: unknown): value is ClickmapBlockedLinkMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'umami-clickmap-link-blocked'
}

const isClickmapPreviewErrorMessage = (value: unknown): value is ClickmapPreviewErrorMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'umami-clickmap-preview-error'
}

const isScrollmapSummaryMessage = (value: unknown): value is ScrollmapSummaryMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'umami-scrollmap-summary'
}

const Clickmap = ({ visualizationMode = 'clickmap' }: ClickmapProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    selectedWebsite,
    setSelectedWebsite,
    urlPath,
    setUrlPath,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    data,
    loading,
    error,
    hasSearched,
    queryStats,
    hasUnappliedFilterChanges,
    fetchData,
  } = useClickmap(visualizationMode === 'scrollmap' ? 'scrollmap' : 'clickmap')

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const isHeatmap = visualizationMode === 'heatmap'
  const isScrollmap = visualizationMode === 'scrollmap'
  const isClickmap = visualizationMode === 'clickmap'
  const chartLabel = isHeatmap
    ? 'Klikkoversikt: Varmekart'
    : isScrollmap
      ? 'Klikkoversikt: Scrollkart'
      : 'Klikkoversikt'
  const showButtonLabel = isHeatmap
    ? 'Oppdater varmekart'
    : isScrollmap
      ? 'Oppdater scrollmap'
      : 'Oppdater klikkoversikt'
  const [isTopListOpen, setIsTopListOpen] = useState(false)
  const showRightSidebar = isClickmap && isTopListOpen
  const [badgeMode, setBadgeMode] = useState<'count' | 'percent'>('count')
  const [urlInput, setUrlInput] = useState(urlPath)
  const [pendingLinkNavigation, setPendingLinkNavigation] = useState<PendingLinkNavigation | null>(null)
  const [previewNotice, setPreviewNotice] = useState<PreviewNotice | null>(null)
  const [scrollmapSummary, setScrollmapSummary] = useState<{
    breakpoints: Array<{
      depthPercent: number
      estimatedReachPercent: number
      estimatedClicksReached: number
      categoryCounts: {
        linkClicks: number
        accordionClicks: number
        otherClicks: number
      }
    }>
    totalEstimatedClicks: number
    medianDepthPercent: number
  } | null>(null)
  const [selectedScrollmapDepth, setSelectedScrollmapDepth] = useState<{
    depthPercent: number
    categoryCounts: {
      linkClicks: number
      accordionClicks: number
      otherClicks: number
    }
  } | null>(null)
  const [activeTopListItemKey, setActiveTopListItemKey] = useState<string | null>(null)
  const [listTypeFilter, setListTypeFilter] = useState<string>('all')
  const [listSearch, setListSearch] = useState<string>('')

  useEffect(() => {
    setUrlInput(urlPath)
  }, [urlPath])

  useEffect(() => {
    setActiveTopListItemKey(null)
  }, [urlPath, data])

  useEffect(() => {
    if (!isScrollmap) return
    setScrollmapSummary(null)
  }, [isScrollmap, data, urlPath])

  const hasPendingUrlChange = normalizeComparablePath(urlInput) !== normalizeComparablePath(urlPath)

  const previewTargetUrl = useMemo(
    () => buildPreviewTargetUrl(selectedWebsite?.domain, urlPath),
    [selectedWebsite?.domain, urlPath],
  )

  const iframeSrc = useMemo(
    () => (previewTargetUrl ? `/api/clickmap-preview?url=${encodeURIComponent(previewTargetUrl)}` : ''),
    [previewTargetUrl],
  )

  const clickmapDataForPreview = useMemo(() => {
    if (!urlPath) return data
    const filteredByPath = data.filter((item) => matchesSourcePath(item.sourcePath, urlPath))
    return filteredByPath.length > 0 ? filteredByPath : data
  }, [data, urlPath])

  const totalClicks = useMemo(
    () => clickmapDataForPreview.reduce((sum, item) => sum + (Number.isFinite(item.count) ? item.count : 0), 0),
    [clickmapDataForPreview],
  )

  const formatPercentBadge = useCallback((count: number, total: number): string => {
    if (total <= 0 || count <= 0) return '0,0%'
    const rawPercent = (count / total) * 100
    const minVisiblePercent = rawPercent > 0 && rawPercent < 0.1 ? 0.1 : rawPercent
    return `${minVisiblePercent.toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
  }, [])

  const getBadgeLabel = useCallback(
    (count: number): string =>
      badgeMode === 'percent' ? formatPercentBadge(count, totalClicks) : count.toLocaleString('nb-NO'),
    [badgeMode, formatPercentBadge, totalClicks],
  )

  const listTypeOptions = useMemo(() => {
    const componentValues = Array.from(
      new Set(clickmapDataForPreview.map((item) => item.component?.trim()).filter((value): value is string => !!value)),
    ).sort((a, b) => a.localeCompare(b, 'nb'))

    return [
      { value: 'all', label: 'Alle treff' },
      { value: 'links', label: 'Lenker' },
      { value: 'accordion', label: 'Trekkspill/accordion' },
      ...componentValues.map((component) => ({
        value: `component:${component}`,
        label: `Komponent: ${component}`,
      })),
    ]
  }, [clickmapDataForPreview])

  useEffect(() => {
    if (listTypeOptions.some((option) => option.value === listTypeFilter)) return
    setListTypeFilter('all')
  }, [listTypeOptions, listTypeFilter])

  const clickmapDataForSelectedType = useMemo(() => {
    return clickmapDataForPreview.filter((item) => {
      if (listTypeFilter === 'all') return true
      if (listTypeFilter === 'links') return !isAccordionLike(item.component || '')
      if (listTypeFilter === 'accordion') return isAccordionLike(item.component || '')
      if (listTypeFilter.startsWith('component:')) {
        return item.component === listTypeFilter.replace('component:', '')
      }
      return true
    })
  }, [clickmapDataForPreview, listTypeFilter])

  const visibleTopListItems = useMemo(() => {
    const searchKey = cleanText(listSearch)
    if (!searchKey) return clickmapDataForSelectedType

    return clickmapDataForSelectedType.filter((item) => {
      const haystack = cleanText(
        [item.linkText, item.destination, item.section, item.sourcePath, item.component].filter(Boolean).join(' '),
      )
      return haystack.includes(searchKey)
    })
  }, [clickmapDataForSelectedType, listSearch])

  const topListMaxCount = useMemo(
    () => Math.max(1, ...clickmapDataForSelectedType.map((item) => (Number.isFinite(item.count) ? item.count : 0))),
    [clickmapDataForSelectedType],
  )

  const clickmapDataWithLabels = useMemo(
    () =>
      clickmapDataForSelectedType.map((item) => ({
        ...item,
        badgeLabel: getBadgeLabel(item.count),
        countLabel: item.count.toLocaleString('nb-NO'),
        percentLabel: formatPercentBadge(item.count, totalClicks),
      })),
    [clickmapDataForSelectedType, formatPercentBadge, getBadgeLabel, totalClicks],
  )

  const sendHeatmapDataToIframe = useCallback(() => {
    const contentWindow = iframeRef.current?.contentWindow
    if (!contentWindow) return

    contentWindow.postMessage(
      {
        type: 'umami-clickmap-data',
        items: clickmapDataWithLabels,
        zeroBadgeLabel: badgeMode === 'percent' ? '0,0%' : '0',
        viewMode: visualizationMode,
        includeUnmatched: listTypeFilter === 'all',
      },
      '*',
    )
  }, [clickmapDataWithLabels, badgeMode, visualizationMode, listTypeFilter])

  useEffect(() => {
    sendHeatmapDataToIframe()
  }, [sendHeatmapDataToIframe])

  useEffect(() => {
    const iframeNode = iframeRef.current
    if (!iframeNode) return

    const onLoad = () => {
      sendHeatmapDataToIframe()
    }

    iframeNode.addEventListener('load', onLoad)
    return () => {
      iframeNode.removeEventListener('load', onLoad)
    }
  }, [iframeSrc, sendHeatmapDataToIframe])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return

      if (isClickmapBlockedLinkMessage(event.data)) {
        setPendingLinkNavigation(null)
        const blockedPath = normalizeComparablePath(event.data.path || event.data.destination || '')
        const chartLabelLower = chartLabel.toLowerCase()
        setPreviewNotice({
          title: `Siden kan ikke vises i ${chartLabelLower}`,
          description: `${chartLabel} kan foreløpig bare vise åpne sider.`,
          path: blockedPath || undefined,
          details: 'Prøv en offentlig side for å se markeringene.',
        })
        return
      }

      if (isClickmapPreviewErrorMessage(event.data)) {
        setPendingLinkNavigation(null)
        setPreviewNotice(null)
        return
      }

      if (isScrollmapSummaryMessage(event.data)) {
        const normalizedBreakpoints = Array.isArray(event.data.breakpoints)
          ? event.data.breakpoints
              .map((entry) => ({
                depthPercent: Number(entry.depthPercent),
                estimatedReachPercent: Number(entry.estimatedReachPercent),
                estimatedClicksReached: Number(entry.estimatedClicksReached),
                categoryCounts: {
                  linkClicks: Number(entry.categoryCounts?.linkClicks) || 0,
                  accordionClicks: Number(entry.categoryCounts?.accordionClicks) || 0,
                  otherClicks: Number(entry.categoryCounts?.otherClicks) || 0,
                },
              }))
              .filter(
                (entry) =>
                  Number.isFinite(entry.depthPercent) &&
                  Number.isFinite(entry.estimatedReachPercent) &&
                  Number.isFinite(entry.estimatedClicksReached),
              )
          : []

        const totalEstimatedClicks = Number(event.data.totalEstimatedClicks)
        const medianDepthPercent = Number(event.data.medianDepthPercent)
        setScrollmapSummary({
          breakpoints: normalizedBreakpoints,
          totalEstimatedClicks: Number.isFinite(totalEstimatedClicks) ? totalEstimatedClicks : 0,
          medianDepthPercent: Number.isFinite(medianDepthPercent) ? medianDepthPercent : 0,
        })
        return
      }

      if (!isClickmapLinkClickMessage(event.data)) return

      const nextPath = normalizeComparablePath(event.data.path || event.data.destination || '')
      if (!nextPath) return
      if (nextPath === normalizeComparablePath(urlPath)) return
      if (isUnsupportedClickmapPath(nextPath)) return

      setPendingLinkNavigation({
        path: nextPath,
        destination: String(event.data.destination || ''),
        linkText: String(event.data.linkText || ''),
      })
    }

    window.addEventListener('message', onMessage)

    // Re-send after listener attachment so scrollmap summary is not missed on fast iframe loads.
    const syncTimeout = window.setTimeout(() => {
      sendHeatmapDataToIframe()
    }, 0)

    return () => {
      window.clearTimeout(syncTimeout)
      window.removeEventListener('message', onMessage)
    }
  }, [urlPath, chartLabel, sendHeatmapDataToIframe])

  const handleConfirmLinkNavigation = useCallback(() => {
    if (!pendingLinkNavigation) return
    const nextPath = pendingLinkNavigation.path
    setPendingLinkNavigation(null)
    setUrlPath(nextPath)
    void fetchData(nextPath)
  }, [pendingLinkNavigation, setUrlPath, fetchData])

  const handleFocusTopListItem = useCallback((item: (typeof clickmapDataForPreview)[number], index: number) => {
    const itemKey = `${item.sourcePath}-${item.linkText}-${item.destination}-${index}`
    setActiveTopListItemKey(itemKey)
    const iframeNode = iframeRef.current
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

    const contentWindow = iframeRef.current?.contentWindow
    if (!contentWindow) return

    const focusPayload: ClickmapFocusLinkPayload = {
      type: 'umami-clickmap-focus-link',
      linkText: item.linkText,
      destination: item.destination,
      component: item.component,
    }

    contentWindow.postMessage(focusPayload, '*')
  }, [])

  const handleVisualizationModeChange = useCallback(
    (nextMode: VisualizationMode) => {
      if (nextMode === visualizationMode) return

      void navigate(
        {
          pathname: ROUTE_BY_VISUALIZATION_MODE[nextMode],
          search: location.search,
        },
        { replace: false },
      )
    },
    [visualizationMode, navigate, location.search],
  )

  return (
    <ChartLayout
      title={chartLabel}
      description={
        isHeatmap
          ? 'Viser en varmevisualisering av hvor folk klikker.'
          : isScrollmap
            ? 'Estimerer hvor langt ned brukerne scroller basert på hva folk har klikket på.'
            : 'Viser visuelt hvor folk klikker.'
      }
      currentPage="clickmap"
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={<WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />}
      filters={
        <>
          <div className="w-full sm:w-[260px]">
            <TextField
              size="small"
              label="URL"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="/aap"
            />
          </div>

          <PeriodPicker
            period={period}
            onPeriodChange={setPeriod}
            startDate={customStartDate}
            onStartDateChange={setCustomStartDate}
            endDate={customEndDate}
            onEndDateChange={setCustomEndDate}
          />

          <div className="w-full sm:w-auto min-w-[180px]">
            <Select
              size="small"
              label="Karttype"
              value={visualizationMode}
              onChange={(event) => handleVisualizationModeChange(event.target.value as VisualizationMode)}
            >
              <option value="clickmap">Klikkkart</option>
              <option value="heatmap">Varmekart</option>
              <option value="scrollmap">Scrollkart</option>
            </Select>
          </div>

          <div className="self-end pb-[2px]">
            <Button
              onClick={() => {
                const nextPath = urlInput.trim()
                setUrlPath(nextPath)
                void fetchData(nextPath)
              }}
              disabled={
                !selectedWebsite || loading || !urlInput.trim() || (!hasUnappliedFilterChanges && !hasPendingUrlChange)
              }
              loading={loading}
              size="small"
            >
              {showButtonLabel}
            </Button>
          </div>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {isClickmap && (
            <div className="text-sm">
              <span className="text-[var(--ax-text-subtle)]">Totale klikk:</span>{' '}
              <span className="font-semibold">{totalClicks.toLocaleString('nb-NO')}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-3">
          {isClickmap && (
            <Switch
              size="small"
              checked={badgeMode === 'percent'}
              onChange={(event) => setBadgeMode(event.target.checked ? 'percent' : 'count')}
            >
              Vis prosent
            </Switch>
          )}
          {isClickmap && (
            <Button size="small" variant="secondary" onClick={() => setIsTopListOpen((current) => !current)}>
              {isTopListOpen ? 'Skjul toppliste / filter' : 'Vis toppliste / filter'}
            </Button>
          )}
        </div>
      </div>

      {isScrollmap && (
        <section className="mb-4 space-y-3">
          <ExpansionCard aria-label="Oppsummering for scrollkart" defaultOpen size="small">
            <ExpansionCard.Header>
              <ExpansionCard.Title as="h3" size="small">
                Oppsummering
              </ExpansionCard.Title>
            </ExpansionCard.Header>
            <ExpansionCard.Content>
              <div className="space-y-3 text-sm leading-6">
                <p className="text-base font-medium text-[var(--ax-text-subtle)]">
                  Scrollkartet estimerer scroll-dybde fra klikkposisjoner.
                </p>

                {scrollmapSummary && scrollmapSummary.breakpoints.length > 0 ? (
                  <>
                    <p className="text-base font-medium">
                      Basert på ca. <strong>{scrollmapSummary.totalEstimatedClicks.toLocaleString('nb-NO')}</strong>{' '}
                      klikk i visningen.
                    </p>
                    <div className="overflow-x-auto rounded-md border border-[var(--ax-border-neutral-subtle)]">
                      <table className="w-full text-sm">
                        <caption className="sr-only">Scrollkart breakpoints med estimert nådd andel</caption>
                        <thead>
                          <tr className="bg-[var(--ax-bg-neutral-soft)] text-left">
                            <th scope="col" className="px-3 py-2 font-semibold">
                              Dybde
                            </th>
                            <th scope="col" className="px-3 py-2 font-semibold">
                              Andel nådd
                            </th>
                            <th scope="col" className="px-3 py-2 font-semibold">
                              Klikk
                            </th>
                            <th scope="col" className="px-3 py-2 font-semibold">
                              Detaljer
                            </th>
                          </tr>
                        </thead>
                        <tbody aria-live="polite">
                          {scrollmapSummary.breakpoints.map((item) => {
                            return (
                              <tr key={item.depthPercent} className="border-t border-[var(--ax-border-neutral-subtle)]">
                                <th scope="row" className="px-3 py-2 text-left font-semibold">
                                  {item.depthPercent}% dybde
                                </th>
                                <td className="px-3 py-2 text-[var(--ax-text-subtle)]">
                                  {item.estimatedReachPercent.toLocaleString('nb-NO', {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })}
                                  %
                                </td>
                                <td className="px-3 py-2 text-[var(--ax-text-subtle)]">
                                  {item.estimatedClicksReached.toLocaleString('nb-NO')} klikk
                                </td>
                                <td className="px-3 py-2 text-[var(--ax-text-subtle)]">
                                  <Button
                                    size="xsmall"
                                    variant="secondary"
                                    onClick={() =>
                                      setSelectedScrollmapDepth({
                                        depthPercent: item.depthPercent,
                                        categoryCounts: item.categoryCounts,
                                      })
                                    }
                                    disabled={
                                      item.categoryCounts.linkClicks +
                                        item.categoryCounts.accordionClicks +
                                        item.categoryCounts.otherClicks ===
                                      0
                                    }
                                  >
                                    Vis klikkdetaljer
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3 text-[var(--ax-text-subtle)]" aria-live="polite">
                    <Loader size="small" title="Beregner estimater..." />
                    <p className="text-base">Beregner estimater ...</p>
                  </div>
                )}

                <div className="pt-2">
                  <ReadMore header="Hvordan beregnes dette?">
                    <div className="max-w-prose space-y-3 text-base leading-7 text-[var(--ax-text-subtle)]">
                      <p>
                        Et klikk på et element tolkes som at brukeren minst har nådd den høyden på siden. Dette er en
                        indirekte estimering, ikke faktisk målt scroll.
                      </p>
                      <p>
                        Siden deles inn i 10 dybdebånd: 0-10%, 10-20%, 20-30%, 30-40%, 40-50%, 50-60%, 60-70%, 70-80%,
                        80-90% og 90-100%.
                      </p>
                      <p>
                        Median dybde (halvparten når hit) viser nivået der omtrent halvparten estimeres å ha nådd minst
                        dette punktet.
                      </p>
                      <p>
                        Eksempel: Klikk på tittelområdet i en accordion teller som at brukeren nådde kortets posisjon.
                        Det betyr ikke nødvendigvis at innholdet i accordionen ble lest.
                      </p>
                    </div>
                  </ReadMore>
                </div>
              </div>
            </ExpansionCard.Content>
          </ExpansionCard>
        </section>
      )}

      {isHeatmap && (
        <section className="mb-4">
          <ExpansionCard aria-label="Hvordan varmekartet fungerer" defaultOpen size="small">
            <ExpansionCard.Header>
              <ExpansionCard.Title as="h3" size="small">
                Hvordan varmekartet fungerer
              </ExpansionCard.Title>
            </ExpansionCard.Header>
            <ExpansionCard.Content>
              <div className="max-w-prose space-y-3 text-base leading-7 text-[var(--ax-text-subtle)]">
                <p>Varmekartet viser hvor folk faktisk har klikket eller tappet.</p>
                <p>
                  Hvis noen bare beveger musen, scroller, eller trykker andre steder på skjermen uten at det registreres
                  som klikk, vises det ikke her.
                </p>
                <p>
                  Dette er derfor ikke som et opptaksverktøy (for eksempel Hotjar). Det er kun en oversikt over
                  registrerte klikk/tapp.
                </p>
              </div>
            </ExpansionCard.Content>
          </ExpansionCard>
        </section>
      )}

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {!urlPath && !loading && (
        <Alert variant="info" className="mb-4">
          Legg inn en URL-sti for å hente data og vise sidevisning med markering.
        </Alert>
      )}

      {loading && (
        <div className="flex justify-center items-center h-full">
          <Loader
            size="xlarge"
            title={isHeatmap ? 'Henter varmekart...' : isScrollmap ? 'Henter scrollmap...' : 'Henter klikk-kart...'}
          />
        </div>
      )}

      {!loading && hasSearched && data.length === 0 && !error && (
        <Alert variant="warning" className="mb-4">
          Fant ingen hendelser for valgt filter.
        </Alert>
      )}

      {!loading && hasSearched && data.length > 0 && (
        <div
          className={showRightSidebar ? 'grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]' : 'grid gap-6'}
        >
          <section className="border border-[var(--ax-border-neutral-subtle)] rounded-md overflow-hidden bg-white">
            {iframeSrc ? (
              <iframe
                ref={iframeRef}
                title={
                  isHeatmap ? 'Varmekart sidevisning' : isScrollmap ? 'Scrollmap sidevisning' : 'Klikk-kart sidevisning'
                }
                src={iframeSrc}
                className="w-full h-[920px]"
                sandbox="allow-same-origin allow-scripts allow-forms"
              />
            ) : (
              <div className="p-4">
                <Alert variant="info">Kunne ikke bygge forhåndsvisning for valgt domene/URL.</Alert>
              </div>
            )}
          </section>

          <section
            className={`${showRightSidebar ? '' : 'hidden'} border border-[var(--ax-border-neutral-subtle)] rounded-md p-4 bg-[var(--ax-bg-default)]`}
          >
            <div className="mb-3">
              <div className="grid gap-3">
                <Select
                  size="small"
                  label="Toppliste"
                  value={listTypeFilter}
                  onChange={(event) => setListTypeFilter(event.target.value)}
                >
                  {listTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Search
                  size="small"
                  label="Søk i toppliste"
                  variant="simple"
                  value={listSearch}
                  onChange={setListSearch}
                  onClear={() => setListSearch('')}
                />
              </div>
            </div>
            <div className="max-h-[760px] overflow-y-auto space-y-2 pr-1">
              {visibleTopListItems.slice(0, 60).map((item, index) => {
                const barWidth = Math.max(4, Math.round((item.count / topListMaxCount) * 100))
                const itemKey = `${item.sourcePath}-${item.linkText}-${item.destination}-${index}`
                const isActive = activeTopListItemKey === itemKey

                return (
                  <button
                    type="button"
                    key={itemKey}
                    className={`w-full rounded-md border p-2 text-left transition-colors ${
                      isActive
                        ? 'border-red-700 bg-[var(--ax-bg-neutral-soft)] shadow-[0_0_0_2px_rgba(220,38,38,0.28)_inset]'
                        : 'hover:bg-[var(--ax-bg-neutral-soft)]'
                    }`}
                    onClick={() => handleFocusTopListItem(item, index)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{item.linkText || '(uten lenketekst)'}</div>
                        {item.destination && (
                          <div className="text-xs text-[var(--ax-text-subtle)] break-all">{item.destination}</div>
                        )}
                        {item.section && (
                          <div className="text-xs text-[var(--ax-text-subtle)]">Seksjon: {item.section}</div>
                        )}
                        {item.sourcePath && (
                          <div className="text-xs text-[var(--ax-text-subtle)]">Kilde: {item.sourcePath}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-[var(--ax-text-subtle)]">
                          {badgeMode === 'percent' ? 'Andel' : 'Antall klikk'}
                        </div>
                        <div className="text-base font-semibold">
                          {badgeMode === 'percent'
                            ? `${formatPercentBadge(item.count, totalClicks)} (${item.count.toLocaleString('nb-NO')} klikk)`
                            : `${item.count.toLocaleString('nb-NO')} (${formatPercentBadge(item.count, totalClicks)})`}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded bg-[var(--ax-bg-neutral-moderate)] overflow-hidden">
                      <div className="h-full rounded bg-red-700" style={{ width: `${barWidth}%` }} />
                    </div>
                  </button>
                )
              })}
              {visibleTopListItems.length === 0 && (
                <div className="rounded-md border border-dashed p-3 text-sm text-[var(--ax-text-subtle)]">
                  Ingen treff for valgt filter/søk.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {!loading && !error && queryStats?.totalBytesProcessedGB !== undefined && (
        <div className="text-sm text-[var(--ax-text-subtle)] text-right mt-4">
          Data prosessert: {queryStats.totalBytesProcessedGB} GB
        </div>
      )}

      <Modal
        open={!!pendingLinkNavigation}
        onClose={() => setPendingLinkNavigation(null)}
        header={{ heading: `Åpne ${chartLabel.toLowerCase()} for denne siden?`, closeButton: true }}
      >
        <Modal.Body>
          {pendingLinkNavigation && (
            <div className="space-y-4">
              <div className="bg-[var(--ax-bg-neutral-soft)] p-3 rounded-md text-sm break-all">
                {pendingLinkNavigation.destination || pendingLinkNavigation.path}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleConfirmLinkNavigation}>Ja, vis {chartLabel.toLowerCase()}</Button>
          <Button variant="secondary" onClick={() => setPendingLinkNavigation(null)}>
            Bli her
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={!!previewNotice}
        onClose={() => setPreviewNotice(null)}
        header={{ heading: previewNotice?.title || '' }}
      >
        <Modal.Body>
          {previewNotice && (
            <div className="space-y-4">
              <p>{previewNotice.description}</p>
              {previewNotice.path && (
                <div className="bg-[var(--ax-bg-neutral-soft)] p-3 rounded-md text-sm break-all">
                  {previewNotice.path}
                </div>
              )}
              {previewNotice.details && (
                <p className="text-sm text-[var(--ax-text-subtle)] break-all">{previewNotice.details}</p>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => setPreviewNotice(null)}>Lukk</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={!!selectedScrollmapDepth}
        onClose={() => setSelectedScrollmapDepth(null)}
        header={{
          heading: selectedScrollmapDepth ? `Klikkategorier ved ${selectedScrollmapDepth.depthPercent}% dybde` : '',
          closeButton: true,
        }}
      >
        <Modal.Body>
          {selectedScrollmapDepth && (
            <div className="space-y-3">
              {selectedScrollmapDepth.categoryCounts.linkClicks +
                selectedScrollmapDepth.categoryCounts.accordionClicks +
                selectedScrollmapDepth.categoryCounts.otherClicks >
              0 ? (
                <div className="overflow-x-auto rounded-md border border-[var(--ax-border-neutral-subtle)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--ax-bg-neutral-soft)] text-left">
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Kategori
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Klikk
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedScrollmapDepth.categoryCounts.linkClicks > 0 && (
                        <tr className="border-t border-[var(--ax-border-neutral-subtle)]">
                          <th scope="row" className="px-3 py-2 text-left font-semibold">
                            Lenkeklikk
                          </th>
                          <td className="px-3 py-2">
                            {selectedScrollmapDepth.categoryCounts.linkClicks.toLocaleString('nb-NO')}
                          </td>
                        </tr>
                      )}
                      {selectedScrollmapDepth.categoryCounts.accordionClicks > 0 && (
                        <tr className="border-t border-[var(--ax-border-neutral-subtle)]">
                          <th scope="row" className="px-3 py-2 text-left font-semibold">
                            Accordion-klikk
                          </th>
                          <td className="px-3 py-2">
                            {selectedScrollmapDepth.categoryCounts.accordionClicks.toLocaleString('nb-NO')}
                          </td>
                        </tr>
                      )}
                      {selectedScrollmapDepth.categoryCounts.otherClicks > 0 && (
                        <tr className="border-t border-[var(--ax-border-neutral-subtle)]">
                          <th scope="row" className="px-3 py-2 text-left font-semibold">
                            Andre
                          </th>
                          <td className="px-3 py-2">
                            {selectedScrollmapDepth.categoryCounts.otherClicks.toLocaleString('nb-NO')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Ingen klikk-kategorier for dette dybdepunktet.</p>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => setSelectedScrollmapDepth(null)}>Lukk</Button>
        </Modal.Footer>
      </Modal>
    </ChartLayout>
  )
}

export default Clickmap
