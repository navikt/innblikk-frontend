import { ThemeIcon } from '@navikt/aksel-icons'
import { ActionMenu, Alert, BodyLong, BodyShort, Button, Heading, Link, Loader, Table } from '@navikt/ds-react'
import { ArrowLeft, ExternalLink, EyeOff, Link2, MoreVertical } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DashboardWidget } from '../../../dashboard'
import { copyToClipboard } from '../../../../shared/lib/clipboard.ts'
import { getCanvasStickyColorOptionById } from '../../ui/sticky/CanvasStickyColorRegistry.ts'
import {
  CANVAS_TABLE_ROWS_PER_PAGE,
  formatCanvasPathLabel,
  getCanvasCategoryDisplayName,
  isImagePreviewUrl,
} from '../../utils/canvasUtils.ts'
import { buildCanvasHierarchy } from '../../utils/canvasHierarchy.ts'
import type { CanvasFrame } from '../../model/types.ts'
import { useCanvasShareData } from '../hooks/useCanvasShareData.ts'
import {
  buildCanvasShareUrl,
  getCanvasShareFrameBounds,
  parseCanvasShareRouteContext,
} from '../utils/canvasShareLayout.ts'

const getSectionElementLayoutClass = (frame: CanvasFrame): string => {
  if (frame.kind === 'heading') return 'md:col-span-2 md:max-w-[58ch]'
  if (frame.kind === 'text' && Array.isArray(frame.tableHeaders) && frame.tableHeaders.length > 0)
    return 'md:col-span-2'
  if (frame.kind === 'text') return 'md:col-span-2 md:max-w-[62ch]'
  if (frame.kind === 'website') return 'md:col-span-2'
  if (frame.kind === 'image') return 'md:col-span-2'
  if (frame.kind === 'chart') return 'md:col-span-2'
  if (frame.kind === 'sql-editor') return 'md:col-span-2'
  return ''
}

const CanvasShareView = () => {
  const location = useLocation()
  const [copySuccess, setCopySuccess] = useState(false)
  const [tablePageByFrameId, setTablePageByFrameId] = useState<Record<string, number>>({})
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

  const renderFrame = (frame: CanvasFrame) => {
    if (frame.kind === 'heading') {
      return (
        <Heading
          level="3"
          size="medium"
          className="m-0 max-w-[58ch] whitespace-pre-wrap break-words text-[var(--ax-text-default)]"
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
            <Table size="small" zebraStripes>
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
        <BodyLong className="m-0 max-w-[62ch] whitespace-pre-wrap break-words text-[1.05rem] leading-8">
          {(frame.textContent || '').trim() || ' '}
        </BodyLong>
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

      return (
        <div className="space-y-2">
          <img
            src={src}
            alt={frame.label || 'Bilde'}
            className="w-full max-w-full rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-white object-contain shadow-[0_10px_32px_rgba(0,0,0,0.06)] max-h-[420px]"
            loading="lazy"
          />
        </div>
      )
    }

    if (frame.kind === 'website') {
      const displayUrl = frame.renderWebsite === false ? frame.previewUrl : frame.targetUrl
      const src =
        frame.renderWebsite === false
          ? frame.previewUrl
          : frame.targetUrl
            ? `/api/clickmap-preview?url=${encodeURIComponent(frame.targetUrl)}`
            : undefined
      if (!displayUrl && !src) return null
      const shouldRenderAsImage = Boolean(displayUrl && isImagePreviewUrl(displayUrl))

      return (
        <div className="space-y-3">
          {src &&
            (shouldRenderAsImage ? (
              <img
                src={src}
                alt={frame.label || formatCanvasPathLabel(frame.targetUrl, displayUrl)}
                className="w-full rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-white shadow-[0_10px_32px_rgba(0,0,0,0.06)]"
                loading="lazy"
              />
            ) : (
              <iframe
                title={`Forhåndsvisning av ${frame.label || 'nettside'}`}
                src={src}
                className="h-[420px] w-full rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-white"
                loading="lazy"
                sandbox="allow-same-origin allow-scripts allow-forms"
              />
            ))}
          {(frame.targetUrl || displayUrl) && (
            <Link
              href={frame.targetUrl || displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5"
            >
              {formatCanvasPathLabel(frame.targetUrl, displayUrl)}
              <ExternalLink size={14} aria-hidden="true" />
            </Link>
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
        <div className="rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-3 sm:p-4">
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
        </div>
      )
    }

    if (frame.kind === 'sql-editor') {
      return (
        <div className="rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4 sm:p-5">
          <BodyShort className="m-0 whitespace-pre-wrap break-words text-[var(--ax-text-subtle)]">
            {(frame.sqlQuery || '').trim() || 'SQL-editor'}
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
          Delingsvisning krever både <code>projectId</code> og <code>dashboardId</code> i URL.
        </Alert>
      </main>
    )
  }

  return (
    <section className="min-h-screen bg-[var(--ax-bg-neutral-soft)]">
      <main
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-10"
        aria-label="Canvas delingsvisning"
      >
        <header className="px-1 py-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Heading level="1" size="large" className="m-0">
                {data?.dashboardTitle || 'Canvas'}
              </Heading>
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
                      className="space-y-4 rounded-3xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.05)] sm:p-7"
                    >
                      <Heading level="2" size="medium" id={`share-section-${node.id}`} className="m-0">
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
                              {renderFrame(element.frame)}
                            </section>
                          ))
                        )}
                      </div>
                    </section>
                  ) : node.frame.kind === 'heading' ? (
                    <section key={node.id} className="px-1 max-w-[58ch]">
                      {renderFrame(node.frame)}
                    </section>
                  ) : node.frame.kind === 'text' ? (
                    <section key={node.id} className="space-y-2 max-w-[62ch]">
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
