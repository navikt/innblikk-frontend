import { Loader } from '@navikt/ds-react'
import { Plus } from 'lucide-react'
import type { CanvasFrame, PendingCanvasFrameDraft, PendingCsvStickyImport } from '../../model/types.ts'

type CanvasPlacementModeBannerProps = {
  topOffsetPx: number
  pendingFrameDraft: PendingCanvasFrameDraft | null
  pendingCsvStickyImport: PendingCsvStickyImport | null
  pendingFramePlacementLabel: string | null
  isImportingStickyCsv: boolean
  importStickyProgressCurrent: number
  importStickyProgressTotal: number
}

export const CanvasPlacementModeBanner = ({
  topOffsetPx,
  pendingFrameDraft,
  pendingCsvStickyImport,
  pendingFramePlacementLabel,
  isImportingStickyCsv,
  importStickyProgressCurrent,
  importStickyProgressTotal,
}: CanvasPlacementModeBannerProps) => {
  if (!pendingFrameDraft && !pendingCsvStickyImport) return null

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[120] w-[min(96vw,44rem)] -translate-x-1/2 rounded-xl border-2 border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] px-3 py-2 text-sm font-semibold leading-tight text-[var(--ax-text-default)] shadow-lg sm:px-4 sm:py-2.5 sm:text-base"
      style={{ top: `${topOffsetPx}px` }}
    >
      {pendingCsvStickyImport && isImportingStickyCsv ? (
        <span className="inline-flex items-center gap-2">
          <Loader size="xsmall" />
          {importStickyProgressTotal > 0
            ? `Importerer ${Math.min(importStickyProgressCurrent, importStickyProgressTotal)} av ${importStickyProgressTotal}`
            : pendingCsvStickyImport.tableHeaders && pendingCsvStickyImport.tableRows
              ? 'Importerer tabell til canvas...'
              : pendingCsvStickyImport.aggregatedRatingsText
                ? 'Importerer aggregert vurdering til canvas...'
                : 'Importerer CSV-lapper til canvas...'}
        </span>
      ) : (
        <>
          <span className="sm:hidden">
            Plasseringsmodus: trykk for å plassere {pendingFramePlacementLabel || 'element'}.
          </span>
          <span className="hidden sm:inline">
            Plasseringsmodus: klikk for å plassere {pendingFramePlacementLabel || 'element'}. Trykk Esc for å avbryte.
          </span>
        </>
      )}
    </div>
  )
}

type CanvasPlacementModeLayerProps = {
  pendingFrameDraft: PendingCanvasFrameDraft | null
  pendingCsvStickyImport: PendingCsvStickyImport | null
  pendingFramePointer: { x: number; y: number } | null
  pendingFramePlacementLabel: string | null
  getPendingFrameContentAnchorOffset: (draft: PendingCanvasFrameDraft) => { x: number; y: number }
  getDefaultFrameSize: (frameOrKind: CanvasFrame | CanvasFrame['kind']) => {
    width: number
    height: number
    minWidth: number
    minHeight: number
  }
  getHeadingFrameHeight: (frame: CanvasFrame) => number
  getHeadingFrameFontSize: (frame: CanvasFrame) => number
  headingCardHeaderHeight: number
}

const CanvasPlacementModeLayer = ({
  pendingFrameDraft,
  pendingCsvStickyImport,
  pendingFramePointer,
  pendingFramePlacementLabel,
  getPendingFrameContentAnchorOffset,
  getDefaultFrameSize,
  getHeadingFrameHeight,
  getHeadingFrameFontSize,
  headingCardHeaderHeight,
}: CanvasPlacementModeLayerProps) => {
  const isPlacementModeActive = Boolean(pendingFrameDraft || pendingCsvStickyImport)

  if (!isPlacementModeActive) return null

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[44] bg-black/10" />
      <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-[45] w-0 border-l-2 border-dashed border-[var(--ax-border-accent)]/90" />
      <span className="pointer-events-none absolute left-2 top-2 z-[45] rounded-md bg-[var(--ax-bg-default)]/95 px-2 py-1 text-xs font-semibold text-[var(--ax-text-default)] shadow-sm">
        Venstre grense
      </span>

      {pendingFramePointer && (
        <div
          className="pointer-events-none absolute z-[46]"
          style={{
            left: `${pendingFramePointer.x - (pendingFrameDraft ? getPendingFrameContentAnchorOffset(pendingFrameDraft).x : 0)}px`,
            top: `${pendingFramePointer.y - (pendingFrameDraft ? getPendingFrameContentAnchorOffset(pendingFrameDraft).y : 0)}px`,
          }}
        >
          {pendingFrameDraft
            ? (() => {
                const defaults = getDefaultFrameSize(pendingFrameDraft.kind)
                const ghostWidth = pendingFrameDraft.width ?? defaults.width
                const ghostHeight =
                  pendingFrameDraft.kind === 'heading'
                    ? getHeadingFrameHeight(pendingFrameDraft as CanvasFrame) + headingCardHeaderHeight
                    : (pendingFrameDraft.height ?? defaults.height)
                const ghostLabel =
                  pendingFrameDraft.headingText || pendingFrameDraft.label || pendingFramePlacementLabel || ''
                const isTextLikeGhost =
                  pendingFrameDraft.kind === 'heading' ||
                  pendingFrameDraft.kind === 'text' ||
                  pendingFrameDraft.kind === 'sticky'
                const ghostClassName =
                  pendingFrameDraft.kind === 'section'
                    ? 'rounded-2xl border-2 border-dashed border-[#8eb2de] bg-[#edf4ff]/70'
                    : pendingFrameDraft.kind === 'heading'
                      ? 'rounded-lg border-2 border-[var(--ax-border-accent)] bg-transparent'
                      : pendingFrameDraft.kind === 'text' || pendingFrameDraft.kind === 'sticky'
                        ? 'rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-white'
                        : pendingFrameDraft.kind === 'icon' ||
                            pendingFrameDraft.kind === 'figure' ||
                            pendingFrameDraft.kind === 'drawing'
                          ? 'rounded-lg border-2 border-dashed border-[var(--ax-border-accent)] bg-transparent'
                          : 'rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-white'
                return (
                  <div
                    className={`${isTextLikeGhost ? '' : 'flex flex-col items-center justify-center'} opacity-70 shadow-sm ${ghostClassName}`}
                    style={{ width: `${ghostWidth}px`, height: `${ghostHeight}px` }}
                  >
                    {pendingFrameDraft.kind === 'heading' ? (
                      <div className="h-full w-full overflow-hidden pt-1">
                        <div className="h-full w-full overflow-hidden px-4 py-2">
                          <span
                            className="block select-none overflow-hidden whitespace-pre-wrap break-words font-bold text-[var(--ax-text-default)]"
                            style={{
                              fontSize: `${getHeadingFrameFontSize(pendingFrameDraft as CanvasFrame)}px`,
                              lineHeight: 1.05,
                            }}
                          >
                            {ghostLabel}
                          </span>
                        </div>
                      </div>
                    ) : pendingFrameDraft.kind === 'text' ? (
                      <div className="h-full w-full overflow-hidden px-2 pb-2">
                        <div className="h-full w-full overflow-hidden px-2 pb-2">
                          <span
                            className="block select-none overflow-hidden whitespace-pre-wrap break-words text-[var(--ax-text-default)]"
                            style={{ fontSize: '24px', lineHeight: 1.3, fontWeight: 500 }}
                          >
                            {pendingFrameDraft.textContent || 'Skriv tekst'}
                          </span>
                        </div>
                      </div>
                    ) : pendingFrameDraft.kind === 'sticky' ? (
                      <div className="h-full w-full overflow-hidden px-2 pb-2">
                        <div className="h-full w-full overflow-hidden p-4 pt-6">
                          <span className="block select-none overflow-hidden whitespace-pre-wrap break-words text-base leading-7 text-[var(--ax-text-default)]">
                            {pendingFrameDraft.textContent || 'Skriv Post-it-lapp'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-[var(--ax-text-subtle)]">
                        <Plus size={18} />
                        <span className="text-xs">{pendingFramePlacementLabel || ghostLabel}</span>
                      </span>
                    )}
                  </div>
                )
              })()
            : (() => {
                const sectionDefaults = getDefaultFrameSize('section')
                const csvGhostLabel =
                  pendingFramePlacementLabel || pendingCsvStickyImport?.sectionTitle?.trim() || 'CSV-import'
                return (
                  <div
                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#8eb2de] bg-[#edf4ff]/70 opacity-70 shadow-sm"
                    style={{ width: `${sectionDefaults.width}px`, height: `${sectionDefaults.height}px` }}
                  >
                    <span className="flex flex-col items-center gap-1 text-[var(--ax-text-subtle)]">
                      <Plus size={18} />
                      <span className="text-xs">{csvGhostLabel}</span>
                    </span>
                  </div>
                )
              })()}
        </div>
      )}
    </>
  )
}

export default CanvasPlacementModeLayer
