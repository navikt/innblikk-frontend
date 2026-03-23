import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Loader, Modal, Select, TextField } from '@navikt/ds-react'
import ChartLayout from '../../analysis/ui/ChartLayout.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import { normalizeUrlToPath } from '../../../shared/lib/utils.ts'
import { useClickmap } from '../hooks/useClickmap.ts'

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

type PreviewNotice = {
  title: string
  description: string
  path?: string
  details?: string
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

const Clickmap = () => {
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
  } = useClickmap()

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const showRightSidebar = false
  const [badgeMode, setBadgeMode] = useState<'count' | 'percent'>('count')
  const [urlInput, setUrlInput] = useState(urlPath)
  const [pendingLinkNavigation, setPendingLinkNavigation] = useState<PendingLinkNavigation | null>(null)
  const [previewNotice, setPreviewNotice] = useState<PreviewNotice | null>(null)

  useEffect(() => {
    setUrlInput(urlPath)
  }, [urlPath])

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

  const maxCount = useMemo(
    () => Math.max(1, ...clickmapDataForPreview.map((item) => (Number.isFinite(item.count) ? item.count : 0))),
    [clickmapDataForPreview],
  )

  const clickmapDataWithBadgeLabel = useMemo(
    () =>
      clickmapDataForPreview.map((item) => ({
        ...item,
        badgeLabel: getBadgeLabel(item.count),
      })),
    [clickmapDataForPreview, getBadgeLabel],
  )

  const sendHeatmapDataToIframe = useCallback(() => {
    const contentWindow = iframeRef.current?.contentWindow
    if (!contentWindow) return

    contentWindow.postMessage(
      {
        type: 'umami-clickmap-data',
        items: clickmapDataWithBadgeLabel,
        zeroBadgeLabel: badgeMode === 'percent' ? '0,0%' : '0',
      },
      '*',
    )
  }, [clickmapDataWithBadgeLabel, badgeMode])

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
        setPreviewNotice({
          title: 'Siden kan ikke vises i klikk-kart',
          description: 'Klikk-kart kan foreløpig bare vise åpne sider.',
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
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [urlPath])

  const handleConfirmLinkNavigation = useCallback(() => {
    if (!pendingLinkNavigation) return
    const nextPath = pendingLinkNavigation.path
    setPendingLinkNavigation(null)
    setUrlPath(nextPath)
    void fetchData(nextPath)
  }, [pendingLinkNavigation, setUrlPath, fetchData])

  return (
    <ChartLayout
      title="Klikk-kart"
      description="Viser hvor brukere klikker basert på egendefinerte hendelser, med visuell markering på siden."
      currentPage="clickmap"
      websiteDomain={selectedWebsite?.domain}
      websiteName={selectedWebsite?.name}
      sidebarContent={<WebsitePicker selectedWebsite={selectedWebsite} onWebsiteChange={setSelectedWebsite} />}
      filters={
        <>
          <div className="w-full sm:w-[350px]">
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
              label="Visning"
              value={badgeMode}
              onChange={(e) => setBadgeMode(e.target.value as 'count' | 'percent')}
            >
              <option value="count">Antall klikk</option>
              <option value="percent">Andel (%)</option>
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
              Vis klikk-kart
            </Button>
          </div>
        </>
      }
    >
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {!urlPath && !loading && (
        <Alert variant="info" className="mb-4">
          Legg inn en URL-sti for å hente klikkdata og vise sidevisning med markering.
        </Alert>
      )}

      {loading && (
        <div className="flex justify-center items-center h-full">
          <Loader size="xlarge" title="Henter klikk-kart..." />
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
                title="Klikk-kart sidevisning"
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
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-md bg-[var(--ax-bg-neutral-soft)] p-3">
                <div className="text-xs text-[var(--ax-text-subtle)]">Totale klikk</div>
                <div className="text-xl font-semibold">{totalClicks.toLocaleString('nb-NO')}</div>
              </div>
              <div className="rounded-md bg-[var(--ax-bg-neutral-soft)] p-3">
                <div className="text-xs text-[var(--ax-text-subtle)]">Unike treff</div>
                <div className="text-xl font-semibold">{clickmapDataForPreview.length.toLocaleString('nb-NO')}</div>
              </div>
              <div className="rounded-md bg-[var(--ax-bg-neutral-soft)] p-3">
                <div className="text-xs text-[var(--ax-text-subtle)]">Maks klikk</div>
                <div className="text-xl font-semibold">{maxCount.toLocaleString('nb-NO')}</div>
              </div>
            </div>

            <h3 className="text-sm font-semibold mb-2">Toppliste lenker</h3>
            <div className="max-h-[760px] overflow-y-auto space-y-2 pr-1">
              {clickmapDataForPreview.slice(0, 60).map((item, index) => {
                const barWidth = Math.max(4, Math.round((item.count / maxCount) * 100))

                return (
                  <div
                    key={`${item.sourcePath}-${item.linkText}-${item.destination}-${index}`}
                    className="rounded-md border p-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{item.linkText || '(uten lenketekst)'}</div>
                        <div className="text-xs text-[var(--ax-text-subtle)] break-all">
                          {item.destination || 'Ukjent destinasjon'}
                        </div>
                        {item.section && (
                          <div className="text-xs text-[var(--ax-text-subtle)]">Seksjon: {item.section}</div>
                        )}
                        {item.sourcePath && (
                          <div className="text-xs text-[var(--ax-text-subtle)]">Kilde: {item.sourcePath}</div>
                        )}
                      </div>
                      <div className="text-sm font-semibold">{getBadgeLabel(item.count)}</div>
                    </div>
                    <div className="mt-2 h-1.5 rounded bg-[var(--ax-bg-neutral-moderate)] overflow-hidden">
                      <div className="h-full rounded bg-red-700" style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                )
              })}
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
        header={{ heading: 'Åpne klikk-kart for denne siden?', closeButton: true }}
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
          <Button onClick={handleConfirmLinkNavigation}>Ja, vis klikk-kart</Button>
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
    </ChartLayout>
  )
}

export default Clickmap
