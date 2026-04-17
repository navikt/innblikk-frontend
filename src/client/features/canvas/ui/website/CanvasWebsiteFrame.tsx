import { Alert, Link, Loader } from '@navikt/ds-react'
import { ExternalLink } from 'lucide-react'
import type { PageMetricRow } from '../../../traffic/model/types.ts'

type CanvasWebsiteFrameData = {
  id: string
  label: string
  src?: string
  displayUrl?: string
  targetUrl?: string
  refreshNonce: number
}

type CanvasWebsiteInsight = {
  loading: boolean
  error: string | null
  data: PageMetricRow | null
}

type CanvasWebsiteFrameProps = {
  frame: CanvasWebsiteFrameData
  isInsightOpen: boolean
  activeInsightPeriodLabel: string
  websiteInsight?: CanvasWebsiteInsight
  isInteractionLocked?: boolean
  onIframeRef: (frameId: string, node: HTMLIFrameElement | null) => void
  onIframeLoad: () => void
  formatCanvasPathLabel: (targetUrl?: string, fallbackText?: string) => string
  isImagePreviewUrl: (value: string) => boolean
}

const CanvasWebsiteInsightPanel = ({
  activeInsightPeriodLabel,
  websiteInsight,
}: {
  activeInsightPeriodLabel: string
  websiteInsight?: CanvasWebsiteInsight
}) => (
  <div className="shrink-0 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3">
    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ax-text-subtle)]">Sideinnsikt</div>
    <div className="mt-1 text-sm text-[var(--ax-text-subtle)]">Periode: {activeInsightPeriodLabel}</div>
    {websiteInsight?.loading ? (
      <div className="mt-2 flex items-center gap-2 text-sm text-[var(--ax-text-subtle)]">
        <Loader size="xsmall" />
        <span>Henter innsikt...</span>
      </div>
    ) : websiteInsight?.error ? (
      <div className="mt-2">
        <Alert variant="error" size="small">
          {websiteInsight.error}
        </Alert>
      </div>
    ) : websiteInsight?.data ? (
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2">
          <div className="text-xs text-[var(--ax-text-subtle)]">Brukere</div>
          <div className="text-sm font-semibold text-[var(--ax-text-default)]">
            {websiteInsight.data.visitors.toLocaleString('nb-NO')}
          </div>
        </div>
        <div className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2">
          <div className="text-xs text-[var(--ax-text-subtle)]">Sidevisninger</div>
          <div className="text-sm font-semibold text-[var(--ax-text-default)]">
            {websiteInsight.data.pageviews.toLocaleString('nb-NO')}
          </div>
        </div>
        <div className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2">
          <div className="text-xs text-[var(--ax-text-subtle)]">Andel</div>
          <div className="text-sm font-semibold text-[var(--ax-text-default)]">
            {(websiteInsight.data.proportion * 100).toLocaleString('nb-NO', { maximumFractionDigits: 1 })}%
          </div>
        </div>
      </div>
    ) : (
      <div className="mt-2 text-sm text-[var(--ax-text-subtle)]">
        Ingen trafikk funnet for denne siden i valgt periode.
      </div>
    )}
  </div>
)

const CanvasWebsiteFrame = ({
  frame,
  isInsightOpen,
  activeInsightPeriodLabel,
  websiteInsight,
  isInteractionLocked = false,
  onIframeRef,
  onIframeLoad,
  formatCanvasPathLabel,
  isImagePreviewUrl,
}: CanvasWebsiteFrameProps) => {
  const hasRenderableContent = Boolean(frame.src && frame.displayUrl)
  const iframeSkipTargetId = `canvas-website-frame-end-${frame.id}`

  return (
    <div className="flex h-full flex-col bg-white">
      {isInsightOpen && (
        <CanvasWebsiteInsightPanel
          activeInsightPeriodLabel={activeInsightPeriodLabel}
          websiteInsight={websiteInsight}
        />
      )}

      {hasRenderableContent ? (
        <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
          {isImagePreviewUrl(frame.displayUrl!) ? (
            <img
              key={`${frame.id}-${frame.refreshNonce}`}
              alt={frame.label}
              src={frame.src}
              className="block h-auto w-full max-w-full"
              loading="lazy"
            />
          ) : (
            <>
              <a
                href={`#${iframeSkipTargetId}`}
                className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-20 focus:rounded-sm focus:bg-[var(--ax-bg-default)] focus:px-2 focus:py-1 focus:text-sm focus:font-medium focus:text-[var(--ax-text-default)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--ax-border-accent)]"
              >
                Hopp over innebygd side
              </a>
              <iframe
                key={`${frame.id}-${frame.refreshNonce}`}
                title={`Canvas-side ${frame.label}`}
                src={frame.src}
                className="h-full w-full"
                loading="lazy"
                sandbox="allow-same-origin allow-scripts allow-forms"
                tabIndex={isInteractionLocked ? -1 : undefined}
                ref={(node) => {
                  onIframeRef(frame.id, node)
                }}
                onLoad={onIframeLoad}
              />
              <div id={iframeSkipTargetId} tabIndex={-1} />
            </>
          )}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <div className="w-full max-w-none space-y-2">
            {frame.targetUrl && (
              <Link
                href={frame.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium break-words text-left"
              >
                <span>{formatCanvasPathLabel(frame.targetUrl, frame.displayUrl)}</span>
                <ExternalLink size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default CanvasWebsiteFrame
