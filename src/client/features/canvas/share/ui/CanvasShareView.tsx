import { ThemeIcon } from '@navikt/aksel-icons'
import { ActionMenu, Alert, BodyLong, BodyShort, Button, Heading, Link, Loader, Select, Table } from '@navikt/ds-react'
import { ArrowLeft, ExternalLink, EyeOff, Link2, MoreVertical } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DashboardWidget } from '../../../dashboard'
import { copyToClipboard } from '../../../../shared/lib/clipboard.ts'
import { getCanvasStickyColorOptionById } from '../../ui/sticky/CanvasStickyColorRegistry.ts'
import { isIllustrationImageFrame } from '../../ui/image/CanvasImageUtils.ts'
import CanvasSqlEditorFrame from '../../ui/sql/CanvasSqlEditorFrame.tsx'
import useCanvasWebsiteVisualization from '../../ui/website/useCanvasWebsiteVisualization.ts'
import type { ClickmapItem } from '../../../clickmap/model/types.ts'
import {
  CANVAS_TABLE_ROWS_PER_PAGE,
  CLICKMAP_EVENTS,
  formatCanvasPathLabel,
  getCanvasCategoryDisplayName,
  getCanvasFrameVisualizationMode,
  getVisualizationModeLabel,
  getWebsiteFrameDisplayUrl,
  getWebsiteFrameRenderSrc,
  isImagePreviewUrl,
} from '../../utils/canvasUtils.ts'
import { markdownToHtml } from '../../utils/canvasMarkdown.ts'
import { buildCanvasHierarchy } from '../../utils/canvasHierarchy.ts'
import type { CanvasFrame } from '../../model/types.ts'
import { useCanvasShareData } from '../hooks/useCanvasShareData.ts'
import {
  buildCanvasShareUrl,
  getCanvasShareFrameBounds,
  parseCanvasShareRouteContext,
} from '../utils/canvasShareLayout.ts'

const WEBSITE_TOP_LIST_VISIBLE_STORAGE_KEY = 'canvas:websiteTopListVisible'

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()

const isAccordionLike = (value: string): boolean => {
  const cleaned = cleanText(value)
  return cleaned.includes('accordion') || cleaned.includes('trekkspill')
}

const getSectionElementLayoutClass = (frame: CanvasFrame): string => {
  if (frame.kind === 'heading') return 'md:col-span-2 md:max-w-[72ch]'
  if (frame.kind === 'text' && Array.isArray(frame.tableHeaders) && frame.tableHeaders.length > 0)
    return 'md:col-span-2'
  if (frame.kind === 'text') return 'md:col-span-2 md:max-w-[62ch]'
  if (frame.kind === 'website') return 'md:col-span-2'
  if (frame.kind === 'image') return 'md:col-span-2'
  if (frame.kind === 'chart') return 'md:col-span-2'
  if (frame.kind === 'sql-editor' || frame.kind === 'code-block') return 'md:col-span-2'
  return ''
}

const CanvasShareView = () => {
  const location = useLocation()
  const [copySuccess, setCopySuccess] = useState(false)
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

  const routeContext = useMemo(() => parseCanvasShareRouteContext(location.search), [location.search])
  const { data, error, isLoading, activeCategoryId } = useCanvasShareData(routeContext)

  const activeCategoryLabel = useMemo(() => {
    if (!data || activeCategoryId === null) return null
    if (data.categories.length <= 1) return null
    const category = data.categories.find((item) => item.id === activeCategoryId)
    return getCanvasCategoryDisplayName(category?.name)
  }, [activeCategoryId, data])

  const categoryFrames = useMemo(() => {
    if (!data || activeCategoryId === null) return []
    return data.frames.filter((frame) => (frame.categoryId ?? null) === activeCategoryId)
  }, [activeCategoryId, data])

  const hiddenCount = useMemo(() => categoryFrames.filter((frame) => frame.hideInShare).length, [categoryFrames])
  const visibleFrames = useMemo(() => categoryFrames.filter((frame) => !frame.hideInShare), [categoryFrames])

  const hierarchy = useMemo(
    () =>
      buildCanvasHierarchy({
        frames: visibleFrames,
        getFrameBounds: getCanvasShareFrameBounds,
      }),
    [visibleFrames],
  )

  const sharePath = useMemo(
    () =>
      buildCanvasShareUrl({
        projectId: routeContext.projectId,
        dashboardId: routeContext.dashboardId,
        categoryId: activeCategoryId,
      }),
    [activeCategoryId, routeContext.dashboardId, routeContext.projectId],
  )

  const canvasPath = useMemo(() => {
    const params = new URLSearchParams()
    if (routeContext.projectId !== null) params.set('projectId', String(routeContext.projectId))
    if (routeContext.dashboardId !== null) params.set('dashboardId', String(routeContext.dashboardId))
    if (activeCategoryId !== null) params.set('categoryId', String(activeCategoryId))
    const query = params.toString()
    return `/canvas${query ? `?${query}` : ''}`
  }, [activeCategoryId, routeContext.dashboardId, routeContext.projectId])

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

  const handleCopyShareLink = async () => {
    const absoluteUrl = `${window.location.origin}${sharePath}`
    const copied = await copyToClipboard(absoluteUrl)
    setCopySuccess(copied)
    if (copied) {
      window.setTimeout(() => setCopySuccess(false), 2500)
    }
  }

  const navigateBackToCanvas = () => {
    window.location.assign(canvasPath)
  }

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

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement
    const themeElement = document.querySelector('.aksel-theme')

    root.classList.remove('light', 'dark')
    themeElement?.classList.remove('light', 'dark')

    root.classList.add(nextTheme)
    themeElement?.classList.add(nextTheme)

    localStorage.setItem('umami-theme', nextTheme)
    setTheme(nextTheme)
    window.dispatchEvent(new CustomEvent('themeChange', { detail: nextTheme }))
  }

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
      return (
        <Heading
          level={headingLevelStr}
          size={headingLevel === 2 ? 'large' : 'medium'}
          className="m-0 max-w-[72ch] whitespace-pre-wrap break-words py-1 text-[var(--ax-text-default)]"
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
              <Table size="small" zebraStripes className="min-w-[720px]">
                <Table.Header>
                  <Table.Row>
                    {headers.map((header, index) => (
                      <Table.HeaderCell key={`share-table-header-${frame.id}-${index}`}>{header}</Table.HeaderCell>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {visibleRows.map((row, rowIndex) => (
                    <Table.Row key={`share-table-row-${frame.id}-${pageStart + rowIndex}`}>
                      {headers.map((_, cellIndex) => (
                        <Table.DataCell key={`share-table-cell-${frame.id}-${pageStart + rowIndex}-${cellIndex}`}>
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
        <div
          className="max-w-[62ch] text-[var(--ax-text-default)] [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mb-3 [&_h1]:mt-0 [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-0 [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-0 [&_h3]:font-semibold [&_ol]:my-0 [&_ol]:list-decimal [&_ol]:pl-[1.1em] [&_p]:m-0 [&_p+p]:mt-3 [&_strong]:font-semibold [&_ul]:my-0 [&_ul]:list-disc [&_ul]:pl-[1.1em] [&_ul>li+li]:mt-2"
          dangerouslySetInnerHTML={{ __html: markdownToHtml((frame.textContent || '').trim() || ' ') }}
        />
      )
    }

    if (frame.kind === 'sticky') {
      const stickyColor = getCanvasStickyColorOptionById(frame.stickyColor)
      return (
        <div
          className="rounded-2xl border px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.07)]"
          style={{
            backgroundColor: stickyColor.background,
            borderColor: stickyColor.border,
          }}
        >
          <BodyLong
            className="m-0 whitespace-pre-wrap break-words text-[1rem] leading-7"
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
        <div className={`space-y-2 ${isIllustration ? 'w-full max-w-[640px]' : ''}`}>
          <img
            src={src}
            alt={frame.imageAltText ?? frame.label ?? 'Bilde'}
            className={`object-contain ${
              isIllustration
                ? 'rounded-xl border-0 bg-transparent shadow-none'
                : 'rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-white shadow-[0_10px_32px_rgba(0,0,0,0.06)]'
            } ${isIllustration ? 'h-auto max-h-[420px] w-auto max-w-full' : 'max-h-[420px] w-full max-w-full'}`}
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

    if (frame.kind === 'sql-editor') {
      return (
        <div className="w-full max-w-[1100px] rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2 sm:p-3">
          <CanvasSqlEditorFrame
            id={frame.id}
            sqlQuery={frame.sqlQuery}
            websiteId={frame.websiteId || data?.canvasConfiguredWebsiteId || undefined}
            isInteractionLocked
            onChange={() => undefined}
            onPersist={() => undefined}
          />
        </div>
      )
    }

    if (frame.kind === 'code-block') {
      return (
        <div className="w-full max-w-[1100px] rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2 sm:p-3">
          <CanvasSqlEditorFrame
            id={frame.id}
            sqlQuery={frame.sqlQuery}
            showTabs={false}
            showResultTab={false}
            showFormatButton={false}
            showEditorContainerBorder={false}
            codeLanguage="text"
            usePlainCodeStyle
            sqlTabLabel="KODE"
            isInteractionLocked
            onChange={() => undefined}
            onPersist={() => undefined}
          />
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
          Delingsvisning krever både <code>projectId</code> og <code>dashboardId</code> i URL.
        </Alert>
      </main>
    )
  }

  return (
    <section
      className="min-h-screen bg-[var(--ax-bg-neutral-soft)]"
      style={theme === 'dark' ? { backgroundColor: '#101b30' } : undefined}
    >
      <main
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:max-w-4xl sm:py-10 xl:max-w-[60rem]"
        aria-label="Canvas delingsvisning"
      >
        <header className="px-1 py-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              {data?.dashboardTitle ? (
                <Heading level="1" size="xlarge" className="m-0">
                  {data.dashboardTitle}
                </Heading>
              ) : (
                <div className="h-12" aria-hidden="true" />
              )}
              {activeCategoryLabel && (
                <BodyShort className="mt-1 text-[var(--ax-text-subtle)]">Fane: {activeCategoryLabel}</BodyShort>
              )}
            </div>
            <ActionMenu>
              <ActionMenu.Trigger>
                <Button
                  size="small"
                  variant="tertiary"
                  icon={<MoreVertical size={16} />}
                  aria-label="Flere handlinger"
                />
              </ActionMenu.Trigger>
              <ActionMenu.Content align="end">
                <ActionMenu.Item onClick={navigateBackToCanvas}>
                  <span className="inline-flex items-center gap-2">
                    <ArrowLeft size={14} />
                    Til canvas
                  </span>
                </ActionMenu.Item>
                <ActionMenu.Item onClick={() => void handleCopyShareLink()}>
                  <span className="inline-flex items-center gap-2">
                    <Link2 size={14} />
                    {copySuccess ? 'Lenke kopiert' : 'Kopier lenke'}
                  </span>
                </ActionMenu.Item>
                <ActionMenu.Divider />
                <ActionMenu.Item onClick={toggleTheme}>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <ThemeIcon aria-hidden fontSize="1rem" />
                    Bytt til {theme === 'dark' ? 'lyst' : 'mørkt'} tema
                  </span>
                </ActionMenu.Item>
              </ActionMenu.Content>
            </ActionMenu>
          </div>
        </header>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader title="Laster delingsvisning" size="xlarge" />
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {!isLoading && !error && (
          <>
            {hiddenCount > 0 && (
              <Alert variant="info" size="small">
                <span className="inline-flex items-center gap-2">
                  <EyeOff size={14} aria-hidden="true" />
                  {hiddenCount} element{hiddenCount === 1 ? '' : 'er'} er skjult i delingsvisning.
                </span>
              </Alert>
            )}

            {hierarchy.nodes.length === 0 ? (
              <Alert variant="warning">Ingen synlige elementer i denne fanen.</Alert>
            ) : (
              <article className="space-y-6 sm:space-y-8" aria-label="Canvas innhold">
                {hierarchy.nodes.map((node) =>
                  node.type === 'section' ? (
                    <section
                      key={node.id}
                      aria-labelledby={`share-section-${node.id}`}
                      className="space-y-5 rounded-3xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-6 shadow-[0_12px_32px_rgba(0,0,0,0.05)] sm:p-8"
                    >
                      <Heading level="2" size="large" id={`share-section-${node.id}`} className="m-0 pb-2">
                        {node.label}
                      </Heading>
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        {node.elements.length === 0 ? (
                          <BodyShort className="text-[var(--ax-text-subtle)] md:col-span-2">
                            Ingen synlige elementer i denne seksjonen.
                          </BodyShort>
                        ) : (
                          node.elements.map((element) => (
                            <section
                              key={element.id}
                              className={`space-y-2 ${getSectionElementLayoutClass(element.frame)}`}
                            >
                              {renderFrame(element.frame, { headingLevel: 3 })}
                            </section>
                          ))
                        )}
                      </div>
                    </section>
                  ) : node.frame.kind === 'heading' ? (
                    <section key={node.id} className="max-w-[72ch] px-1">
                      {renderFrame(node.frame, { headingLevel: 2 })}
                    </section>
                  ) : node.frame.kind === 'text' ? (
                    <section key={node.id} className="max-w-[62ch] space-y-2">
                      {renderFrame(node.frame)}
                    </section>
                  ) : (
                    <section
                      key={node.id}
                      className="space-y-2 rounded-3xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.05)] sm:p-7"
                    >
                      {renderFrame(node.frame)}
                    </section>
                  ),
                )}
              </article>
            )}
          </>
        )}
      </main>
    </section>
  )
}

export default CanvasShareView
