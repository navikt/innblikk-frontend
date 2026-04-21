import { Alert, BodyLong, BodyShort, Button, Heading, Link, Loader, Select, Table } from '@navikt/ds-react'
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DashboardWidget } from '../../../dashboard'
import { getCanvasStickyColorOptionById } from '../../ui/sticky/CanvasStickyColorRegistry.ts'
import { isIllustrationImageFrame } from '../../ui/image/CanvasImageUtils.ts'
import useCanvasWebsiteVisualization from '../../ui/website/useCanvasWebsiteVisualization.ts'
import type { ClickmapItem } from '../../../clickmap/model/types.ts'
import {
  CANVAS_TABLE_ROWS_PER_PAGE,
  CLICKMAP_EVENTS,
  formatCanvasPathLabel,
  getCanvasFrameVisualizationMode,
  getVisualizationModeLabel,
  getWebsiteFrameDisplayUrl,
  getWebsiteFrameRenderSrc,
  isImagePreviewUrl,
} from '../../utils/canvasUtils.ts'
import { buildCanvasHierarchy } from '../../utils/canvasHierarchy.ts'
import type { CanvasFrame } from '../../model/types.ts'
import { useCanvasShareData } from '../hooks/useCanvasShareData.ts'
import { getCanvasShareFrameBounds, parseCanvasShareRouteContext } from '../utils/canvasShareLayout.ts'

const WEBSITE_TOP_LIST_VISIBLE_STORAGE_KEY = 'canvas:websiteTopListVisible'

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()

const isAccordionLike = (value: string): boolean => {
  const cleaned = cleanText(value)
  return cleaned.includes('accordion') || cleaned.includes('trekkspill')
}

const getSectionElementLayoutClass = (frame: CanvasFrame): string => {
  if (frame.kind === 'heading') return 'w-full max-w-[72ch]'
  if (frame.kind === 'text' && Array.isArray(frame.tableHeaders) && frame.tableHeaders.length > 0)
    return 'w-full max-w-[1100px]'
  if (frame.kind === 'text') return 'w-full max-w-[62ch]'
  if (frame.kind === 'sticky') return 'w-full max-w-[520px]'
  if (frame.kind === 'website') return 'w-full max-w-[1200px]'
  if (frame.kind === 'image') return 'mx-auto w-full max-w-[1440px]'
  if (frame.kind === 'chart') return 'w-full max-w-[1100px]'
  if (frame.kind === 'sql-editor' || frame.kind === 'code-block') return 'w-full max-w-[1100px]'
  return 'w-full max-w-[960px]'
}

const getSectionElementGridClass = (frame: CanvasFrame): string => {
  if (frame.kind === 'sticky') return 'md:col-span-1'
  return 'md:col-span-2'
}

const parseSlideFromSearch = (search: string): number => {
  const params = new URLSearchParams(search)
  const parsed = Number.parseInt(params.get('slide') ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const CanvasPresentationView = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [tablePageByFrameId, setTablePageByFrameId] = useState<Record<string, number>>({})
  const [topListFilterByFrameId, setTopListFilterByFrameId] = useState<Record<string, string>>({})
  const [activeTopListItemKeyByFrameId, setActiveTopListItemKeyByFrameId] = useState<Record<string, string | null>>({})
  const [websiteTopListEnabled, setWebsiteTopListEnabled] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(WEBSITE_TOP_LIST_VISIBLE_STORAGE_KEY)
      if (stored === null) return true
      return stored !== 'false'
    } catch {
      return true
    }
  })
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storedTheme = localStorage.getItem('umami-theme')
    return storedTheme === 'dark' ? 'dark' : 'light'
  })
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement))

  const routeContext = useMemo(() => parseCanvasShareRouteContext(location.search), [location.search])
  const { data, error, isLoading, activeCategoryId } = useCanvasShareData(routeContext)

  const categoryFrames = useMemo(() => {
    if (!data || activeCategoryId === null) return []
    return data.frames.filter((frame) => (frame.categoryId ?? null) === activeCategoryId)
  }, [activeCategoryId, data])

  const visibleFrames = useMemo(() => categoryFrames.filter((frame) => !frame.hideInShare), [categoryFrames])

  const hierarchy = useMemo(
    () =>
      buildCanvasHierarchy({
        frames: visibleFrames,
        getFrameBounds: getCanvasShareFrameBounds,
      }),
    [visibleFrames],
  )

  const slides = useMemo(() => {
    const sectionSlides = hierarchy.nodes
      .filter((node) => node.type === 'section')
      .map((node) => ({ id: node.id, label: node.label, elements: node.elements }))
    if (sectionSlides.length > 0) return sectionSlides

    const fallbackElements = hierarchy.nodes
      .filter((node) => node.type === 'element')
      .map((node) => ({ id: node.id, kindLabel: node.kindLabel, label: node.label, frame: node.frame }))

    if (fallbackElements.length === 0) return []
    return [{ id: 'presentation-fallback-slide', label: data?.dashboardTitle || 'Canvas', elements: fallbackElements }]
  }, [data?.dashboardTitle, hierarchy.nodes])

  const currentSlideIndex = useMemo(() => {
    if (slides.length === 0) return 0
    const requested = Math.max(0, parseSlideFromSearch(location.search) - 1)
    return Math.max(0, Math.min(slides.length - 1, requested))
  }, [location.search, slides.length])

  const currentSlide = slides[currentSlideIndex] ?? null
  const isStickyOnlySlide = Boolean(
    currentSlide &&
    currentSlide.elements.length > 0 &&
    currentSlide.elements.every((element) => element.frame.kind === 'sticky'),
  )
  const isStickyGridSlide = Boolean(
    currentSlide &&
    currentSlide.elements.length > 0 &&
    currentSlide.elements.some((element) => element.frame.kind === 'sticky') &&
    currentSlide.elements.every((element) => element.frame.kind === 'sticky' || element.frame.kind === 'heading'),
  )
  const dashboardWidgetFilters = useMemo(
    () => ({
      urlFilters: [],
      dateRange: data?.defaultPeriod ?? 'last_7_days',
      pathOperator: 'equals',
      metricType: 'visitors' as const,
      customStartDate: data?.defaultCustomStartDate,
      customEndDate: data?.defaultCustomEndDate,
    }),
    [data?.defaultCustomEndDate, data?.defaultCustomStartDate, data?.defaultPeriod],
  )

  const availableWebsites = Array.isArray(data?.availableWebsites) ? data.availableWebsites : []
  const selectedWebsiteDomain = data?.canvasConfiguredWebsiteId
    ? (availableWebsites.find((website) => website.id === data.canvasConfiguredWebsiteId)?.domain ?? null)
    : null

  const frameItemsForVisualization = useMemo(
    () =>
      visibleFrames.map((frame) => ({
        id: frame.id,
        kind: frame.kind,
        websiteId: frame.websiteId,
        targetUrl: frame.targetUrl,
        renderWebsite: frame.renderWebsite,
        isInternalDashboard: frame.isInternalDashboard,
        visualizationMode: frame.visualizationMode,
      })),
    [visibleFrames],
  )

  const { frameVisualizationData, setWebsiteIframeRef, handleWebsiteFrameLoad, focusWebsiteTopListItem } =
    useCanvasWebsiteVisualization({
      frameItems: frameItemsForVisualization,
      availableWebsites,
      selectedWebsiteId: data?.canvasConfiguredWebsiteId ?? null,
      selectedWebsiteDomain,
      canvasConfiguredWebsiteId: data?.canvasConfiguredWebsiteId ?? null,
      period: data?.defaultPeriod ?? 'last_7_days',
      customStartDate: data?.defaultCustomStartDate ?? null,
      customEndDate: data?.defaultCustomEndDate ?? null,
      clickmapEvents: CLICKMAP_EVENTS,
    })

  const navigateToSlideIndex = useCallback(
    (nextSlideIndex: number) => {
      const params = new URLSearchParams(location.search)
      const serializedSlide = String(nextSlideIndex + 1)
      if (params.get('slide') === serializedSlide) return
      params.set('slide', serializedSlide)
      const nextSearch = params.toString()
      void navigate(`${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true })
    },
    [location.search, navigate],
  )

  const goToPreviousSlide = useCallback(
    () => navigateToSlideIndex(Math.max(0, currentSlideIndex - 1)),
    [currentSlideIndex, navigateToSlideIndex],
  )

  const goToNextSlide = useCallback(() => {
    if (slides.length === 0) return
    navigateToSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))
  }, [currentSlideIndex, navigateToSlideIndex, slides.length])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName.toLowerCase()
      const isEditingContext =
        Boolean(target?.isContentEditable) || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
      if (isEditingContext) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPreviousSlide()
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToNextSlide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [goToNextSlide, goToPreviousSlide])

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<'light' | 'dark'>
      setTheme(customEvent.detail === 'dark' ? 'dark' : 'light')
    }

    window.addEventListener('themeChange', handleThemeChange as EventListener)
    return () => {
      window.removeEventListener('themeChange', handleThemeChange as EventListener)
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useLayoutEffect(() => {
    const root = document.documentElement
    const themeElement = document.querySelector('.aksel-theme')

    root.classList.remove('light', 'dark')
    themeElement?.classList.remove('light', 'dark')
    root.classList.add(theme)
    themeElement?.classList.add(theme)
  }, [theme])

  useEffect(() => {
    try {
      window.localStorage.setItem(WEBSITE_TOP_LIST_VISIBLE_STORAGE_KEY, websiteTopListEnabled ? 'true' : 'false')
    } catch {
      return
    }
  }, [websiteTopListEnabled])

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      return
    }
    await document.exitFullscreen()
  }, [])

  const renderClickmapTopList = (
    frameId: string,
    visualizationData: {
      loading: boolean
      error: string | null
      items: ClickmapItem[]
    },
  ) => {
    const componentFilterOptions = Array.from(
      new Set(
        (visualizationData?.items ?? [])
          .map((item) => item.component?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    )
      .filter((component) => !isAccordionLike(component))
      .sort((a, b) => a.localeCompare(b, 'nb'))
      .map((component) => ({
        value: `component:${component}`,
        label: `Komponent: ${component}`,
      }))

    const topListFilterOptions = [
      { value: 'all', label: 'Alle treff' },
      { value: 'links', label: 'Lenker' },
      { value: 'accordion', label: 'Trekkspill/accordion' },
      ...componentFilterOptions,
    ]

    const requestedTopListFilter = topListFilterByFrameId[frameId] ?? 'all'
    const topListFilter = topListFilterOptions.some((option) => option.value === requestedTopListFilter)
      ? requestedTopListFilter
      : 'all'

    const topListItems = (visualizationData?.items ?? []).filter((item) => {
      if (topListFilter === 'all') return true
      if (topListFilter === 'accordion') return isAccordionLike(item.component || '')
      if (topListFilter.startsWith('component:')) {
        return item.component === topListFilter.replace('component:', '')
      }
      return !isAccordionLike(item.component || '')
    })

    const sortedTopListItems = [...topListItems].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 40)
    const topListMaxCount = Math.max(
      1,
      ...sortedTopListItems.map((item) => (Number.isFinite(item.count) ? item.count : 0)),
    )

    return (
      <aside
        aria-label="Klikktoppliste"
        className="min-h-0 border-t border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] xl:max-h-[560px] xl:border-l xl:border-t-0"
      >
        <div className="border-b border-[var(--ax-border-neutral-subtle)] p-3">
          <Select
            size="small"
            label="Filter"
            value={topListFilter}
            onChange={(event) =>
              setTopListFilterByFrameId((current) => ({
                ...current,
                [frameId]: event.target.value,
              }))
            }
          >
            {topListFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {visualizationData.loading ? (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--ax-text-subtle)]">
            <Loader size="xsmall" title="Henter toppliste..." />
            Henter toppliste...
          </div>
        ) : visualizationData.error ? (
          <div className="px-3 py-3 text-sm text-[var(--ax-text-danger)]">{visualizationData.error}</div>
        ) : sortedTopListItems.length === 0 ? (
          <div className="px-3 py-3 text-sm text-[var(--ax-text-subtle)]">Ingen treff for valgt side.</div>
        ) : (
          <div className="max-h-[360px] space-y-2 overflow-y-auto p-2 xl:max-h-[512px]">
            {sortedTopListItems.map((item, index) => {
              const itemKey = `${item.sourcePath}-${item.linkText}-${item.destination}-${index}`
              const barWidth = Math.max(4, Math.round((item.count / topListMaxCount) * 100))
              const isActive = activeTopListItemKeyByFrameId[frameId] === itemKey

              return (
                <button
                  type="button"
                  key={itemKey}
                  className={`w-full rounded-md border p-2 text-left transition-colors ${
                    isActive
                      ? 'border-red-700 bg-[var(--ax-bg-neutral-soft)] shadow-[0_0_0_2px_rgba(220,38,38,0.28)_inset]'
                      : 'border-[var(--ax-border-neutral-subtle)] hover:bg-[var(--ax-bg-neutral-soft)]'
                  }`}
                  onClick={() => {
                    setActiveTopListItemKeyByFrameId((current) => ({
                      ...current,
                      [frameId]: itemKey,
                    }))
                    focusWebsiteTopListItem(frameId, item)
                  }}
                >
                  <div className="text-xs font-medium text-[var(--ax-text-default)]">
                    {item.linkText || '(uten lenketekst)'}
                  </div>
                  {item.destination && (
                    <div className="mt-0.5 break-all text-[11px] text-[var(--ax-text-subtle)]">{item.destination}</div>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--ax-text-subtle)]">Klikk</span>
                    <span className="text-xs font-semibold text-[var(--ax-text-default)]">
                      {item.count.toLocaleString('nb-NO')}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[var(--ax-bg-neutral-moderate)]">
                    <div className="h-full rounded bg-red-700" style={{ width: `${barWidth}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </aside>
    )
  }

  const renderFrame = (frame: CanvasFrame, options?: { headingLevel?: 2 | 3 | 4 }) => {
    const headingLevel = options?.headingLevel ?? 3
    const headingLevelStr = String(headingLevel) as '2' | '3' | '4'

    if (frame.kind === 'heading') {
      const headingStyle =
        headingLevel === 2
          ? {
              fontSize: 'clamp(2.8rem, 4.5vw, 4.4rem)',
              lineHeight: 1.02,
              letterSpacing: '-0.015em',
              fontWeight: 800,
            }
          : {
              fontSize: 'clamp(3.6rem, 6.6vw, 6.6rem)',
              lineHeight: 1.01,
              letterSpacing: '-0.02em',
              fontWeight: 800,
            }
      return (
        <Heading
          level={headingLevelStr}
          size={headingLevel === 2 ? 'xlarge' : 'large'}
          className="m-0 mx-auto max-w-[72ch] whitespace-pre-wrap break-words py-2 text-center text-[var(--ax-text-default)]"
          style={headingStyle}
        >
          {(frame.headingText || frame.label || 'Overskrift').trim() || 'Overskrift'}
        </Heading>
      )
    }

    if (frame.kind === 'text') {
      const hasTable =
        Array.isArray(frame.tableHeaders) && frame.tableHeaders.length > 0 && Array.isArray(frame.tableRows)
      if (hasTable) {
        const headers = frame.tableHeaders ?? []
        const rows = frame.tableRows ?? []
        const totalPages = Math.max(1, Math.ceil(rows.length / CANVAS_TABLE_ROWS_PER_PAGE))
        const currentPage = Math.max(1, Math.min(totalPages, tablePageByFrameId[frame.id] ?? 1))
        const pageStart = (currentPage - 1) * CANVAS_TABLE_ROWS_PER_PAGE
        const visibleRows = rows.slice(pageStart, pageStart + CANVAS_TABLE_ROWS_PER_PAGE)

        return (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-xl border border-[var(--ax-border-neutral-subtle)]">
              <Table size="medium" zebraStripes className="min-w-[720px]">
                <Table.Header>
                  <Table.Row>
                    {headers.map((header, index) => (
                      <Table.HeaderCell
                        key={`share-table-header-${frame.id}-${index}`}
                        className="text-base font-semibold"
                      >
                        {header}
                      </Table.HeaderCell>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {visibleRows.map((row, rowIndex) => (
                    <Table.Row key={`share-table-row-${frame.id}-${pageStart + rowIndex}`}>
                      {headers.map((_, cellIndex) => (
                        <Table.DataCell
                          key={`share-table-cell-${frame.id}-${pageStart + rowIndex}-${cellIndex}`}
                          className="text-base"
                        >
                          {row[cellIndex] || ''}
                        </Table.DataCell>
                      ))}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="xsmall"
                  variant="tertiary"
                  disabled={currentPage <= 1}
                  onClick={() =>
                    setTablePageByFrameId((current) => ({
                      ...current,
                      [frame.id]: Math.max(1, currentPage - 1),
                    }))
                  }
                >
                  Forrige
                </Button>
                <span className="text-xs text-[var(--ax-text-subtle)]">
                  Side {currentPage} av {totalPages}
                </span>
                <Button
                  size="xsmall"
                  variant="tertiary"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setTablePageByFrameId((current) => ({
                      ...current,
                      [frame.id]: Math.min(totalPages, currentPage + 1),
                    }))
                  }
                >
                  Neste
                </Button>
              </div>
            )}
          </div>
        )
      }

      return (
        <BodyLong className="m-0 max-w-[62ch] whitespace-pre-wrap break-words text-[1.2rem] leading-9">
          {(frame.textContent || '').trim() || ' '}
        </BodyLong>
      )
    }

    if (frame.kind === 'sticky') {
      const stickyColor = getCanvasStickyColorOptionById(frame.stickyColor)
      return (
        <div
          className="rounded-2xl border px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.07)]"
          style={{
            backgroundColor: stickyColor.background,
            borderColor: stickyColor.border,
          }}
        >
          <BodyLong
            className="m-0 whitespace-pre-wrap break-words text-[1.1rem] leading-7"
            style={{ color: stickyColor.text }}
          >
            {(frame.textContent || frame.label || '').trim()}
          </BodyLong>
        </div>
      )
    }

    if (frame.kind === 'link') {
      const href = frame.targetUrl || ''
      return (
        <div className="rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4 sm:p-5">
          <Link href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
            {frame.label || formatCanvasPathLabel(frame.targetUrl, href)}
            <ExternalLink size={14} aria-hidden="true" />
          </Link>
          {frame.textContent && (
            <BodyShort className="mt-2 text-[var(--ax-text-subtle)]">{frame.textContent}</BodyShort>
          )}
        </div>
      )
    }

    if (frame.kind === 'image') {
      const src = frame.targetUrl
      if (!src) return null
      const isIllustration = isIllustrationImageFrame(frame)

      return (
        <div className={`flex w-full justify-center ${isIllustration ? 'max-w-[760px]' : ''}`}>
          <img
            src={src}
            alt={frame.imageAltText ?? frame.label ?? 'Bilde'}
            className={`object-contain ${
              isIllustration
                ? 'rounded-xl border-0 bg-transparent shadow-none'
                : 'h-auto max-h-[68vh] w-auto max-w-full rounded-2xl object-contain object-center shadow-[0_12px_34px_rgba(0,0,0,0.24)]'
            } ${isIllustration ? 'h-auto max-h-[560px] w-auto max-w-full' : ''}`}
            loading="lazy"
          />
        </div>
      )
    }

    if (frame.kind === 'website') {
      const displayUrl = getWebsiteFrameDisplayUrl(frame)
      const src = getWebsiteFrameRenderSrc(frame)
      if (!displayUrl && !src) return null

      const shouldRenderAsImage = Boolean(displayUrl && isImagePreviewUrl(displayUrl))
      const visualizationMode = getCanvasFrameVisualizationMode(frame)
      const visualizationData = frameVisualizationData[frame.id]
      const showClickmapTopList =
        visualizationMode === 'clickmap' &&
        websiteTopListEnabled &&
        !shouldRenderAsImage &&
        Boolean(src) &&
        frame.renderWebsite !== false

      return (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]">
            <div className="flex items-start justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-4 py-2.5">
              <div className="min-w-0">
                <div className="break-words text-sm font-semibold leading-tight text-[var(--ax-text-default)]">
                  {frame.label || formatCanvasPathLabel(frame.targetUrl, displayUrl)}
                </div>
                {visualizationMode && (
                  <div className="mt-0.5 inline-flex items-center gap-2 text-xs text-[var(--ax-text-subtle)]">
                    <span>Visualisering: {getVisualizationModeLabel(visualizationMode)}</span>
                    {visualizationData?.loading ? <Loader size="xsmall" title="Henter kartdata..." /> : null}
                  </div>
                )}
              </div>
              {visualizationMode === 'clickmap' && !shouldRenderAsImage && src && frame.renderWebsite !== false && (
                <Button
                  size="xsmall"
                  variant="tertiary"
                  onClick={() => setWebsiteTopListEnabled((current) => !current)}
                >
                  {websiteTopListEnabled ? 'Skjul toppliste' : 'Vis toppliste'}
                </Button>
              )}
            </div>

            <div className={showClickmapTopList ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]' : ''}>
              <div className="min-w-0">
                {src &&
                  (shouldRenderAsImage ? (
                    <img
                      src={src}
                      alt={frame.label || formatCanvasPathLabel(frame.targetUrl, displayUrl)}
                      className="w-full bg-white shadow-[0_10px_32px_rgba(0,0,0,0.06)]"
                      loading="lazy"
                    />
                  ) : (
                    <iframe
                      title={`Forhandsvisning av ${frame.label || 'nettside'}`}
                      src={src}
                      className="h-[560px] w-full bg-white"
                      loading="lazy"
                      sandbox="allow-same-origin allow-scripts allow-forms"
                      ref={(node) => setWebsiteIframeRef(frame.id, node)}
                      onLoad={() => handleWebsiteFrameLoad(frame)}
                    />
                  ))}
              </div>

              {showClickmapTopList &&
                visualizationData &&
                renderClickmapTopList(frame.id, {
                  loading: visualizationData.loading,
                  error: visualizationData.error,
                  items: visualizationData.items,
                })}
            </div>
          </div>

          {!src && (
            <BodyShort className="text-[var(--ax-text-subtle)]">
              Kunne ikke laste nettside-forhåndsvisning for {formatCanvasPathLabel(frame.targetUrl, displayUrl)}.
            </BodyShort>
          )}
        </div>
      )
    }

    if (frame.kind === 'chart' && frame.chartSql && frame.chartType) {
      const chartWebsiteId = frame.websiteId?.trim() || ''
      if (!chartWebsiteId) {
        return (
          <div className="rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4 sm:p-5">
            <BodyShort className="m-0 text-[var(--ax-text-subtle)]">
              Graf mangler nettsidevalg og kan ikke vises.
            </BodyShort>
          </div>
        )
      }

      return (
        <DashboardWidget
          chart={{
            id: `canvas-share-chart-${frame.id}`,
            title: frame.label,
            type: frame.chartType,
            sql: frame.chartSql,
          }}
          websiteId={chartWebsiteId}
          filters={dashboardWidgetFilters}
          chartLinksEnabled={false}
          compactMode
          headingLevel={4}
          chartHeightPx={300}
        />
      )
    }

    if (frame.kind === 'sql-editor' || frame.kind === 'code-block') {
      return (
        <div className="rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4 sm:p-5">
          <BodyShort className="m-0 whitespace-pre-wrap break-words text-[var(--ax-text-subtle)]">
            {(frame.sqlQuery || '').trim() || (frame.kind === 'code-block' ? 'Kodeblokk' : 'SQL-editor')}
          </BodyShort>
        </div>
      )
    }

    return (
      <div className="rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4 sm:p-5">
        <BodyShort className="m-0 text-[var(--ax-text-subtle)]">{frame.label || frame.kind}</BodyShort>
      </div>
    )
  }

  if (routeContext.projectId === null || routeContext.dashboardId === null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Alert variant="warning">
          Presentasjonsvisning krever både <code>projectId</code> og <code>dashboardId</code> i URL.
        </Alert>
      </main>
    )
  }

  return (
    <section
      className="group/presentation min-h-screen bg-[var(--ax-bg-neutral-soft)]"
      style={theme === 'dark' ? { backgroundColor: '#101b30' } : undefined}
    >
      <main
        className="mx-auto flex min-h-screen w-full max-w-[92rem] items-center justify-center px-3 py-5 sm:px-4 sm:py-7"
        aria-label="Canvas presentasjonsvisning"
      >
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader title="Laster presentasjon" size="xlarge" />
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {!isLoading && !error && (
          <>
            {slides.length === 0 || currentSlide === null ? (
              <Alert variant="warning">Ingen synlige elementer i denne fanen.</Alert>
            ) : (
              <article className="w-full" aria-label="Canvas presentasjon">
                <div className="fixed right-4 top-4 z-30 h-11 w-44 group/corner">
                  <div className="pointer-events-none inline-flex items-center gap-1 rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]/92 p-1 opacity-0 shadow-[0_6px_18px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-opacity duration-200 group-hover/corner:pointer-events-auto group-hover/corner:opacity-100 group-focus-within/corner:pointer-events-auto group-focus-within/corner:opacity-100">
                    <Button
                      size="xsmall"
                      variant="tertiary-neutral"
                      icon={isFullscreen ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
                      onClick={() => {
                        void toggleFullscreen()
                      }}
                      aria-label={isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}
                      title={isFullscreen ? 'Avslutt fullskjerm' : 'Fullskjerm'}
                    />
                    <Button
                      size="xsmall"
                      variant="tertiary-neutral"
                      icon={<ChevronLeft size={16} aria-hidden />}
                      onClick={goToPreviousSlide}
                      disabled={currentSlideIndex <= 0}
                      aria-label="Forrige slide"
                      title="Forrige slide"
                    />
                    <span className="px-1 text-xs font-medium text-[var(--ax-text-subtle)]">
                      {currentSlideIndex + 1}/{slides.length}
                    </span>
                    <Button
                      size="xsmall"
                      variant="tertiary-neutral"
                      icon={<ChevronRight size={16} aria-hidden />}
                      onClick={goToNextSlide}
                      disabled={currentSlideIndex >= slides.length - 1}
                      aria-label="Neste slide"
                      title="Neste slide"
                    />
                  </div>
                </div>
                <section
                  key={currentSlide.id}
                  aria-labelledby={`presentation-slide-${currentSlide.id}`}
                  className="min-h-[calc(100vh-13rem)] p-2 sm:p-4"
                >
                  <div className="flex min-h-[calc(100vh-17rem)] flex-col justify-center">
                    <Heading
                      level="2"
                      size="xlarge"
                      id={`presentation-slide-${currentSlide.id}`}
                      className="m-0 text-center"
                      style={{
                        fontSize: 'clamp(2.8rem, 5.2vw, 4.6rem)',
                        lineHeight: 1.02,
                        letterSpacing: '-0.02em',
                        fontWeight: 800,
                        marginBottom: 'clamp(2.5rem, 5vh, 4.5rem)',
                      }}
                    >
                      {currentSlide.label}
                    </Heading>

                    <div
                      className={`grid grid-cols-1 items-start justify-items-stretch ${
                        isStickyGridSlide
                          ? 'gap-y-3 md:grid-cols-[520px_520px] md:justify-center md:gap-x-3 md:gap-y-4'
                          : isStickyOnlySlide
                            ? 'gap-y-3 md:grid-cols-[520px_520px] md:justify-center md:gap-x-3 md:gap-y-4'
                            : 'gap-5 md:grid-cols-2'
                      }`}
                    >
                      {currentSlide.elements.map((element) => {
                        const headingLayoutClass =
                          element.frame.kind === 'heading' ? 'justify-self-center mb-16 md:mb-24' : ''
                        const imageLayoutClass = element.frame.kind === 'image' ? 'justify-self-center' : ''
                        const tableLayoutClass =
                          element.frame.kind === 'text' &&
                          Array.isArray(element.frame.tableHeaders) &&
                          element.frame.tableHeaders.length > 0
                            ? 'justify-self-center'
                            : ''
                        return (
                          <section
                            key={element.id}
                            className={`space-y-2 ${getSectionElementGridClass(element.frame)} ${getSectionElementLayoutClass(element.frame)} ${headingLayoutClass} ${imageLayoutClass} ${tableLayoutClass}`}
                          >
                            {renderFrame(element.frame, { headingLevel: 3 })}
                          </section>
                        )
                      })}
                    </div>
                  </div>
                </section>
              </article>
            )}
          </>
        )}
      </main>
    </section>
  )
}

export default CanvasPresentationView
