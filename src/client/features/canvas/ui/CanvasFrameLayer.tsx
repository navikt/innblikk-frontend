import { Button, HelpText, Loader, Select } from '@navikt/ds-react'
import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { Website } from '../../../shared/types/website.ts'
import { DashboardWidget } from '../../dashboard'
import type { CanvasFrame, CanvasPageInsight, ConnectionAnchorSide, ConnectionDragState } from '../model/types.ts'
import {
  CANVAS_TABLE_ROWS_PER_PAGE,
  CARD_ACTION_BUTTON_CLASSNAME,
  DEFAULT_DRAWING_STROKE_WIDTH,
  HEADING_CARD_HEADER_HEIGHT,
  HEADING_FONT_SIZE_STEP,
  HEADING_TEXT_MIN_WIDTH,
  ICON_ROTATION_STEP_DEG,
  WEBSITE_CARD_HEADER_HEIGHT,
  getCanvasFrameVisualizationMode,
  getVisualizationModeLabel,
} from '../utils/canvasUtils.ts'
import { DEFAULT_CANVAS_ICON_COLOR } from './icon/CanvasIconRegistry.ts'
import CanvasFrameActionPoints from './controls/CanvasFrameActionPoints.tsx'
import CanvasDrawingFrame from './drawing/CanvasDrawingFrame.tsx'
import CanvasFigureFrame from './figure/CanvasFigureFrame.tsx'
import CanvasHeadingFrame from './heading/CanvasHeadingFrame.tsx'
import CanvasIconFrame from './icon/CanvasIconFrame.tsx'
import CanvasImageFrame from './image/CanvasImageFrame.tsx'
import { isIllustrationImageFrame } from './image/CanvasImageUtils.ts'
import CanvasStickyFrame from './sticky/CanvasStickyFrame.tsx'
import { getCanvasStickyColorOptionById } from './sticky/CanvasStickyColorRegistry.ts'
import CanvasTextFrame from './text/CanvasTextFrame.tsx'
import CanvasWebsiteActionMenu from './website/CanvasWebsiteActionMenu.tsx'
import CanvasWebsiteFrame from './website/CanvasWebsiteFrame.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import type { ClickmapItem } from '../../clickmap/model/types.ts'

type CanvasFrameItem = CanvasFrame & {
  displayUrl?: string
  src: string
}

type CanvasFrameLayerProps = {
  frameItems: CanvasFrameItem[]
  sectionItemCountsById: Record<string, number>
  sectionMoveOptions: Array<{ id: string; label: string }>
  frameContainingSectionIdByFrameId: Record<string, string>
  stickyColorOptions: Array<{ id: string; label: string; color: string }>
  selectedFrameIds: string[]
  activeInsightFrameId: string | null
  pageInsights: Record<string, CanvasPageInsight>
  frameVisualizationData: Record<
    string,
    {
      loading: boolean
      error: string | null
      items: ClickmapItem[]
    }
  >
  websiteTopListEnabled: boolean
  onToggleWebsiteTopList: () => void
  connectionDragState: ConnectionDragState | null
  resizeState: { id: string } | null
  dragState: { ids: string[] } | null
  activeEditableFrameId: string | null
  selectedWebsite: Website | null
  availableWebsites: Website[]
  pendingChartWebsiteByFrameId: Record<string, Website | null>
  dashboardWidgetFilters: React.ComponentProps<typeof DashboardWidget>['filters']
  chartContentRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  failedImageFrameIds: Record<string, boolean>
  setFailedImageFrameIds: Dispatch<SetStateAction<Record<string, boolean>>>
  frameTablePages: Record<string, number>
  setFrameTablePages: Dispatch<SetStateAction<Record<string, number>>>
  setPendingChartWebsiteByFrameId: Dispatch<SetStateAction<Record<string, Website | null>>>
  activeInsightPeriodLabel: string
  setWebsiteIframeRef: (frameId: string, node: HTMLIFrameElement | null) => void
  handleWebsiteFrameLoad: (frame: CanvasFrame) => void
  getDefaultFrameSize: (frameOrKind: CanvasFrame | CanvasFrame['kind']) => {
    width: number
    height: number
    minWidth: number
    minHeight: number
  }
  getHeadingFrameFontSize: (frame: CanvasFrame) => number
  getHeadingFrameWidth: (frame: CanvasFrame) => number
  getHeadingFrameHeight: (frame: CanvasFrame) => number
  getFrameLockStatus: (frame: CanvasFrame) => { isLockedByOther: boolean; ownerLabel: string | null }
  formatCanvasPathLabel: (targetUrl?: string, fallbackText?: string) => string
  isImagePreviewUrl: (value: string) => boolean
  handleDragStart: (event: React.MouseEvent | React.TouchEvent, frame: CanvasFrame) => void
  handleToggleInsightPanel: (frame: CanvasFrame) => void
  handleRefreshFrame: (id: string) => void
  handleDuplicateWebsiteCard: (frame: CanvasFrame) => void
  handleOpenEditDashboardModal: (frame: CanvasFrame) => void
  handleOpenEditWebsiteModal: (frame: CanvasFrame) => void
  handleOpenEditImageModal: (frame: CanvasFrame) => void
  handleOpenEditIllustrationModal: (frame: CanvasFrame) => void
  handleOpenEditIconModal: (frame: CanvasFrame) => void
  handleDuplicateIconCard: (frame: CanvasFrame) => Promise<void>
  handleRotateIconFrame: (id: string, delta: number) => void
  handleOpenEditFigureModal: (frame: CanvasFrame) => void
  handleDuplicateFigureCard: (frame: CanvasFrame) => Promise<void>
  handleDuplicateSectionCard: (frame: CanvasFrame) => Promise<void>
  handleAdjustHeadingFontSize: (id: string, delta: number) => void
  handleRotateIllustrationFrame: (id: string, delta: number) => void
  handleToggleSectionLayout: (id: string) => void
  handleMoveFrameToSection: (frameId: string, sectionId: string) => void
  handleSetStickyColor: (frameId: string, colorId: string) => void
  handleRequestRemoveFrame: (frame: CanvasFrame) => void
  startConnectionDrag: (event: React.MouseEvent, frame: CanvasFrame, side: ConnectionAnchorSide) => void
  handleAssignWebsiteToChart: (frame: CanvasFrame, website: Website | null) => Promise<void>
  handleOpenEditChartModal: (frame: CanvasFrame) => void
  handleOpenDeleteChartModal: (frame: CanvasFrame) => void
  handleEditableFrameChange: (id: string, nextValue: string) => void
  handleEditableFrameBlur: (id: string) => void
  handleStartEditingFrame: (id: string) => void
  handleResizeStart: (event: React.MouseEvent, frame: CanvasFrame) => void
}

const CanvasFrameLayer = ({
  frameItems,
  sectionItemCountsById,
  sectionMoveOptions,
  frameContainingSectionIdByFrameId,
  stickyColorOptions,
  selectedFrameIds,
  activeInsightFrameId,
  pageInsights,
  frameVisualizationData,
  websiteTopListEnabled,
  onToggleWebsiteTopList,
  connectionDragState,
  resizeState,
  dragState,
  activeEditableFrameId,
  selectedWebsite,
  availableWebsites,
  pendingChartWebsiteByFrameId,
  dashboardWidgetFilters,
  chartContentRefs,
  failedImageFrameIds,
  setFailedImageFrameIds,
  frameTablePages,
  setFrameTablePages,
  setPendingChartWebsiteByFrameId,
  activeInsightPeriodLabel,
  setWebsiteIframeRef,
  handleWebsiteFrameLoad,
  getDefaultFrameSize,
  getHeadingFrameFontSize,
  getHeadingFrameWidth,
  getHeadingFrameHeight,
  getFrameLockStatus,
  formatCanvasPathLabel,
  isImagePreviewUrl,
  handleDragStart,
  handleToggleInsightPanel,
  handleRefreshFrame,
  handleDuplicateWebsiteCard,
  handleOpenEditDashboardModal,
  handleOpenEditWebsiteModal,
  handleOpenEditImageModal,
  handleOpenEditIllustrationModal,
  handleOpenEditIconModal,
  handleDuplicateIconCard,
  handleRotateIconFrame,
  handleOpenEditFigureModal,
  handleDuplicateFigureCard,
  handleDuplicateSectionCard,
  handleAdjustHeadingFontSize,
  handleRotateIllustrationFrame,
  handleToggleSectionLayout,
  handleMoveFrameToSection,
  handleSetStickyColor,
  handleRequestRemoveFrame,
  startConnectionDrag,
  handleAssignWebsiteToChart,
  handleOpenEditChartModal,
  handleOpenDeleteChartModal,
  handleEditableFrameChange,
  handleEditableFrameBlur,
  handleStartEditingFrame,
  handleResizeStart,
}: CanvasFrameLayerProps) => {
  const [topListFilterByFrameId, setTopListFilterByFrameId] = useState<Record<string, 'all' | 'links' | 'accordion'>>(
    {},
  )

  const isAccordionLike = (value: string): boolean => {
    const cleaned = value.replace(/\s+/g, ' ').trim().toLowerCase()
    return cleaned.includes('accordion') || cleaned.includes('trekkspill')
  }

  return (
    <>
      {frameItems.map((frame) =>
        (() => {
          const defaults = getDefaultFrameSize(frame)
          const isIllustrationFrame = isIllustrationImageFrame(frame)
          const isSelectedFrame = selectedFrameIds.includes(frame.id)
          const isWebsiteInsightOpen = frame.kind === 'website' && activeInsightFrameId === frame.id
          const websiteInsight = pageInsights[frame.id]
          const visualizationMode = frame.kind === 'website' ? getCanvasFrameVisualizationMode(frame) : ''
          const visualizationData = frame.kind === 'website' ? frameVisualizationData[frame.id] : undefined
          const topListFilter = topListFilterByFrameId[frame.id] ?? 'all'
          const topListItems =
            frame.kind === 'website' && visualizationMode === 'clickmap'
              ? (visualizationData?.items ?? []).filter((item) => {
                  if (topListFilter === 'all') return true
                  if (topListFilter === 'accordion') return isAccordionLike(item.component || '')
                  return !isAccordionLike(item.component || '')
                })
              : []
          const sortedTopListItems = [...topListItems].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 40)
          const topListMaxCount = Math.max(
            1,
            ...sortedTopListItems.map((item) => (Number.isFinite(item.count) ? item.count : 0)),
          )
          const isTableTextFrame =
            frame.kind === 'text' &&
            Array.isArray(frame.tableHeaders) &&
            frame.tableHeaders.length > 0 &&
            Array.isArray(frame.tableRows)
          const editLockStatus =
            frame.kind === 'heading' || frame.kind === 'text' || frame.kind === 'sticky' || frame.kind === 'section'
              ? getFrameLockStatus(frame)
              : { isLockedByOther: false, ownerLabel: null }
          const currentSectionId = frameContainingSectionIdByFrameId[frame.id]
          const sectionMoveOptionsForFrame =
            frame.kind === 'sticky' || frame.kind === 'text'
              ? sectionMoveOptions.filter((option) => option.id !== currentSectionId)
              : sectionMoveOptions
          const stickyColorOption = frame.kind === 'sticky' ? getCanvasStickyColorOptionById(frame.stickyColor) : null
          return (
            <article
              key={frame.id}
              tabIndex={0}
              role={frame.kind === 'section' ? 'region' : undefined}
              aria-label={
                frame.kind === 'section'
                  ? `${frame.label || 'Seksjon'}. Oppsett ${
                      frame.sectionLayout === 'grid' ? 'rutenett' : 'friform'
                    }. Inneholder ${sectionItemCountsById[frame.id] ?? 0} elementer.`
                  : undefined
              }
              className={`focus:outline-none ${
                frame.kind === 'website' || frame.kind === 'image'
                  ? `group absolute flex flex-col overflow-visible rounded-lg border ${
                      connectionDragState?.sourceFrameId === frame.id ||
                      connectionDragState?.currentTargetFrameId === frame.id
                        ? 'border-[var(--ax-border-accent)] ring-2 ring-[var(--ax-border-accent)]/20'
                        : isIllustrationFrame
                          ? 'border-transparent'
                          : 'border-[var(--ax-border-neutral-subtle)]'
                    } ${isIllustrationFrame ? 'bg-transparent shadow-none' : 'bg-white shadow-sm'}`
                  : frame.kind === 'section'
                    ? 'group absolute flex flex-col overflow-hidden rounded-2xl border-2 border-dashed border-[#8eb2de] bg-[#edf4ff]/70 shadow-none'
                    : frame.kind === 'chart'
                      ? 'group absolute flex flex-col overflow-hidden rounded-lg border border-transparent bg-transparent shadow-none'
                      : frame.kind === 'heading'
                        ? 'group absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none'
                        : frame.kind === 'text'
                          ? 'group absolute flex flex-col overflow-hidden rounded-xl border border-transparent bg-transparent shadow-none'
                          : frame.kind === 'icon'
                            ? 'group absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none'
                            : frame.kind === 'figure'
                              ? 'group absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none'
                              : frame.kind === 'drawing'
                                ? 'group absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none'
                                : 'group absolute flex flex-col overflow-hidden rounded-xl border shadow-sm'
              } ${isSelectedFrame ? 'ring-2 ring-[var(--ax-border-accent)]/60' : ''}`}
              style={{
                left: `${frame.x}px`,
                top: `${frame.y}px`,
                zIndex:
                  resizeState?.id === frame.id
                    ? 90
                    : dragState?.ids.includes(frame.id)
                      ? 80
                      : isSelectedFrame
                        ? 72
                        : activeEditableFrameId === frame.id
                          ? 70
                          : isIllustrationFrame
                            ? 50
                            : frame.kind === 'icon'
                              ? 60
                              : frame.kind === 'figure' || frame.kind === 'drawing'
                                ? 60
                                : undefined,
                width:
                  frame.kind === 'heading' ? `${getHeadingFrameWidth(frame)}px` : `${frame.width ?? defaults.width}px`,
                height:
                  frame.kind === 'heading'
                    ? `${getHeadingFrameHeight(frame) + HEADING_CARD_HEADER_HEIGHT}px`
                    : `${frame.height ?? defaults.height}px`,
                minWidth: frame.kind === 'heading' ? `${HEADING_TEXT_MIN_WIDTH}px` : `${defaults.minWidth}px`,
                minHeight:
                  frame.kind === 'heading' ? `${HEADING_CARD_HEADER_HEIGHT + 12}px` : `${defaults.minHeight}px`,
                borderColor: frame.kind === 'sticky' ? stickyColorOption?.border : undefined,
                backgroundColor: frame.kind === 'sticky' ? stickyColorOption?.background : undefined,
              }}
            >
              {frame.kind === 'website' && !frame.isInternalDashboard && (
                <header
                  className={
                    'flex cursor-move items-start justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-2'
                  }
                  onMouseDown={(event) => handleDragStart(event, frame)}
                  onTouchStart={(event) => handleDragStart(event, frame)}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <div className="min-w-0">
                      <div
                        className="min-w-0 break-words text-sm font-semibold leading-tight text-[var(--ax-text-default)]"
                        title={frame.label}
                      >
                        {frame.label}
                      </div>
                      {visualizationMode && (
                        <div className="flex min-w-0 items-center gap-1 text-xs text-[var(--ax-text-subtle)]">
                          <span className="break-words">
                            Visualisering: {getVisualizationModeLabel(visualizationMode)}
                          </span>
                          <div onMouseDown={(event) => event.stopPropagation()}>
                            <HelpText title="Datagrunnlag" strategy="fixed" placement="top">
                              Visualiseringen er basert på totale klikk på interaktive elementer, ikke antall brukere.
                            </HelpText>
                          </div>
                        </div>
                      )}
                    </div>
                    {visualizationMode && (
                      <div className="flex h-4 w-4 items-center justify-center">
                        {visualizationData?.loading ? <Loader size="xsmall" title="Henter kartdata..." /> : null}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <CanvasWebsiteActionMenu
                      isInternalDashboard={frame.isInternalDashboard}
                      showInsightOption={!frame.isInternalDashboard}
                      isInsightOpen={isWebsiteInsightOpen}
                      insightDisabled={!selectedWebsite}
                      onToggleInsight={() => handleToggleInsightPanel(frame)}
                      showTopListOption={visualizationMode === 'clickmap'}
                      isTopListEnabled={websiteTopListEnabled}
                      onToggleTopList={onToggleWebsiteTopList}
                      onRefresh={() => handleRefreshFrame(frame.id)}
                      onDuplicate={() => handleDuplicateWebsiteCard(frame)}
                      onEdit={() => {
                        if (frame.isInternalDashboard) {
                          handleOpenEditDashboardModal(frame)
                        } else {
                          handleOpenEditWebsiteModal(frame)
                        }
                      }}
                      onRemove={() => handleRequestRemoveFrame(frame)}
                    />
                  </div>
                </header>
              )}
              {frame.kind === 'chart' && (
                <div className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden="true">
                  <div
                    className="pointer-events-auto absolute inset-x-2 top-0 h-3 cursor-move"
                    onMouseDown={(event) => handleDragStart(event, frame)}
                    onTouchStart={(event) => handleDragStart(event, frame)}
                  />
                  <div
                    className="pointer-events-auto absolute inset-x-2 bottom-0 h-3 cursor-move"
                    onMouseDown={(event) => handleDragStart(event, frame)}
                    onTouchStart={(event) => handleDragStart(event, frame)}
                  />
                  <div
                    className="pointer-events-auto absolute inset-y-2 left-0 w-3 cursor-move"
                    onMouseDown={(event) => handleDragStart(event, frame)}
                    onTouchStart={(event) => handleDragStart(event, frame)}
                  />
                  <div
                    className="pointer-events-auto absolute inset-y-2 right-0 w-3 cursor-move"
                    onMouseDown={(event) => handleDragStart(event, frame)}
                    onTouchStart={(event) => handleDragStart(event, frame)}
                  />
                </div>
              )}
              {(frame.kind === 'sticky' ||
                frame.kind === 'text' ||
                frame.kind === 'heading' ||
                frame.kind === 'section' ||
                frame.kind === 'icon' ||
                frame.kind === 'figure' ||
                frame.kind === 'drawing' ||
                frame.kind === 'image' ||
                frame.kind === 'website') && (
                <>
                  <div className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden="true">
                    {frame.kind !== 'website' && (
                      <div
                        className="pointer-events-auto absolute inset-x-2 top-0 h-3 cursor-move"
                        onMouseDown={(event) => handleDragStart(event, frame)}
                      />
                    )}
                    <div
                      className="pointer-events-auto absolute inset-x-2 bottom-0 h-3 cursor-move"
                      onMouseDown={(event) => handleDragStart(event, frame)}
                      onTouchStart={(event) => handleDragStart(event, frame)}
                    />
                    <div
                      className="pointer-events-auto absolute inset-y-2 left-0 w-3 cursor-move"
                      onMouseDown={(event) => handleDragStart(event, frame)}
                      onTouchStart={(event) => handleDragStart(event, frame)}
                    />
                    <div
                      className="pointer-events-auto absolute inset-y-2 right-0 w-3 cursor-move"
                      onMouseDown={(event) => handleDragStart(event, frame)}
                      onTouchStart={(event) => handleDragStart(event, frame)}
                    />
                  </div>
                  <CanvasFrameActionPoints
                    frameKind={frame.kind}
                    isInternalDashboard={frame.isInternalDashboard}
                    isIllustrationFrame={isIllustrationFrame}
                    actionButtonClassName={CARD_ACTION_BUTTON_CLASSNAME}
                    onEditImage={() => handleOpenEditImageModal(frame)}
                    onEditIllustration={() => handleOpenEditIllustrationModal(frame)}
                    onEditDashboard={() => handleOpenEditDashboardModal(frame)}
                    onEditIcon={() => handleOpenEditIconModal(frame)}
                    onDuplicateIcon={() => void handleDuplicateIconCard(frame)}
                    onRotateIconLeft={() => handleRotateIconFrame(frame.id, -ICON_ROTATION_STEP_DEG)}
                    onRotateIconRight={() => handleRotateIconFrame(frame.id, ICON_ROTATION_STEP_DEG)}
                    onEditFigure={() => handleOpenEditFigureModal(frame)}
                    onDuplicateFigure={() => void handleDuplicateFigureCard(frame)}
                    onDuplicateSection={() => void handleDuplicateSectionCard(frame)}
                    onDecreaseHeadingFontSize={() => handleAdjustHeadingFontSize(frame.id, -HEADING_FONT_SIZE_STEP)}
                    onIncreaseHeadingFontSize={() => handleAdjustHeadingFontSize(frame.id, HEADING_FONT_SIZE_STEP)}
                    onRotateIllustrationLeft={() => handleRotateIllustrationFrame(frame.id, -ICON_ROTATION_STEP_DEG)}
                    onRotateIllustrationRight={() => handleRotateIllustrationFrame(frame.id, ICON_ROTATION_STEP_DEG)}
                    sectionLayoutMode={frame.sectionLayout === 'grid' ? 'grid' : 'freeform'}
                    onToggleSectionLayout={() => handleToggleSectionLayout(frame.id)}
                    sectionMoveOptions={sectionMoveOptionsForFrame}
                    stickyColorOptions={stickyColorOptions}
                    onSetStickyColor={(colorId) => handleSetStickyColor(frame.id, colorId)}
                    onMoveToSection={(sectionId) => handleMoveFrameToSection(frame.id, sectionId)}
                    onRemoveFrame={() => handleRequestRemoveFrame(frame)}
                  />
                </>
              )}
              {(frame.kind === 'heading' ||
                frame.kind === 'text' ||
                frame.kind === 'section' ||
                frame.kind === 'icon' ||
                frame.kind === 'figure' ||
                frame.kind === 'drawing') && (
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
                    frame.kind === 'text'
                      ? 'inset-[2px] rounded-lg border border-[#9bc4ff]'
                      : 'inset-0 rounded-lg border-2 border-[#7fb7ff]'
                  }`}
                />
              )}
              {frame.kind === 'image' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 border-2 border-[#7fb7ff] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 rounded-xl"
                />
              )}

              <div
                className={`relative flex-1 ${
                  frame.kind === 'website'
                    ? `overflow-visible ${isIllustrationFrame ? 'bg-transparent' : 'bg-white'}`
                    : frame.kind === 'image'
                      ? `overflow-hidden ${isIllustrationFrame ? 'bg-transparent' : 'bg-white'}`
                      : frame.kind === 'chart'
                        ? 'overflow-visible bg-transparent'
                        : frame.kind === 'icon'
                          ? 'overflow-visible bg-transparent'
                          : frame.kind === 'figure'
                            ? 'overflow-visible bg-transparent'
                            : frame.kind === 'drawing'
                              ? 'overflow-visible bg-transparent'
                              : frame.kind === 'heading'
                                ? 'pt-1'
                                : 'px-2 pb-2'
                }`}
              >
                {frame.kind === 'website' && !frame.isInternalDashboard && (
                  <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-20 overflow-visible">
                    <button
                      type="button"
                      className={`pointer-events-auto absolute left-[-12px] top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100 ${
                        connectionDragState?.sourceFrameId === frame.id ? 'opacity-100' : ''
                      }`}
                      aria-label="Kobling"
                      title="Dra for å koble"
                      onMouseDown={(event) => startConnectionDrag(event, frame, 'left')}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none h-3.5 w-3.5 rounded-full border border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] shadow-sm ${
                          connectionDragState?.sourceFrameId === frame.id ? 'bg-[var(--ax-border-accent)]' : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      className={`pointer-events-auto absolute right-[-12px] top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100 ${
                        connectionDragState?.sourceFrameId === frame.id ? 'opacity-100' : ''
                      }`}
                      aria-label="Kobling"
                      title="Dra for å koble"
                      onMouseDown={(event) => startConnectionDrag(event, frame, 'right')}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none h-3.5 w-3.5 rounded-full border border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] shadow-sm ${
                          connectionDragState?.sourceFrameId === frame.id ? 'bg-[var(--ax-border-accent)]' : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      className={`pointer-events-auto absolute left-1/2 top-[-12px] flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100 ${
                        connectionDragState?.sourceFrameId === frame.id ? 'opacity-100' : ''
                      }`}
                      style={{ top: `${-2 - WEBSITE_CARD_HEADER_HEIGHT}px` }}
                      aria-label="Kobling"
                      title="Dra for å koble"
                      onMouseDown={(event) => startConnectionDrag(event, frame, 'top')}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none h-3.5 w-3.5 rounded-full border border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] shadow-sm ${
                          connectionDragState?.sourceFrameId === frame.id ? 'bg-[var(--ax-border-accent)]' : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      className={`pointer-events-auto absolute bottom-[-12px] left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100 ${
                        connectionDragState?.sourceFrameId === frame.id ? 'opacity-100' : ''
                      }`}
                      aria-label="Kobling"
                      title="Dra for å koble"
                      onMouseDown={(event) => startConnectionDrag(event, frame, 'bottom')}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none h-3.5 w-3.5 rounded-full border border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] shadow-sm ${
                          connectionDragState?.sourceFrameId === frame.id ? 'bg-[var(--ax-border-accent)]' : ''
                        }`}
                      />
                    </button>
                  </div>
                )}
                {frame.kind === 'image' && (
                  <CanvasImageFrame
                    id={frame.id}
                    src={frame.src || ''}
                    label={frame.label}
                    refreshNonce={frame.refreshNonce}
                    isIllustrationFrame={isIllustrationFrame}
                    imageRotationDeg={frame.imageRotationDeg}
                    hasFailedImage={Boolean(failedImageFrameIds[frame.id])}
                    onLoadError={(imageFrameId) => {
                      setFailedImageFrameIds((current) => ({ ...current, [imageFrameId]: true }))
                    }}
                    onLoadSuccess={(imageFrameId) => {
                      setFailedImageFrameIds((current) => {
                        if (!current[imageFrameId]) return current
                        const next = { ...current }
                        delete next[imageFrameId]
                        return next
                      })
                    }}
                  />
                )}
                {frame.kind === 'website' ? (
                  <CanvasWebsiteFrame
                    frame={frame}
                    isInsightOpen={isWebsiteInsightOpen}
                    activeInsightPeriodLabel={activeInsightPeriodLabel}
                    websiteInsight={websiteInsight}
                    onIframeRef={setWebsiteIframeRef}
                    onIframeLoad={() => handleWebsiteFrameLoad(frame)}
                    formatCanvasPathLabel={formatCanvasPathLabel}
                    isImagePreviewUrl={isImagePreviewUrl}
                  />
                ) : frame.kind === 'chart' && frame.chartSql && frame.chartType ? (
                  (() => {
                    const chartWebsiteId = frame.websiteId?.trim() || ''
                    if (!chartWebsiteId) {
                      const frameSelectedWebsite = frame.websiteId
                        ? (availableWebsites.find((website) => website.id === frame.websiteId) ?? null)
                        : null
                      const pendingSelectedWebsite = pendingChartWebsiteByFrameId[frame.id]
                      const pickerSelectedWebsite = pendingSelectedWebsite ?? frameSelectedWebsite
                      return (
                        <div
                          className="h-full p-3"
                          data-chart-frame-id={frame.id}
                          ref={(node) => {
                            chartContentRefs.current[frame.id] = node
                          }}
                        >
                          <div className="flex h-full items-center justify-center rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-4 py-5 shadow-sm">
                            <div className="w-full max-w-sm space-y-4 text-left">
                              <div className="space-y-1.5">
                                <span className="inline-flex rounded-full bg-[var(--ax-bg-neutral-moderate)] px-2.5 py-1 text-xs font-medium text-[var(--ax-text-subtle)]">
                                  Mangler nettside
                                </span>
                                <div
                                  className="truncate text-base font-semibold text-[var(--ax-text-default)]"
                                  title={frame.label}
                                >
                                  {frame.label || 'Graf'}
                                </div>
                                <p className="text-sm text-[var(--ax-text-subtle)]">
                                  Velg nettside for å vise grafdata.
                                </p>
                              </div>
                              <div>
                                <WebsitePicker
                                  selectedWebsite={pickerSelectedWebsite}
                                  onWebsiteChange={(website) => {
                                    setPendingChartWebsiteByFrameId((current) => ({
                                      ...current,
                                      [frame.id]: website,
                                    }))
                                  }}
                                  disableAutoRestore
                                  variant="default"
                                  customLabel="Velg nettside"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="xsmall"
                                  onClick={() => void handleAssignWebsiteToChart(frame, pickerSelectedWebsite ?? null)}
                                  disabled={!pickerSelectedWebsite?.id}
                                >
                                  Velg nettside
                                </Button>
                                <Button
                                  size="xsmall"
                                  variant="tertiary"
                                  onClick={() => handleOpenEditChartModal(frame)}
                                >
                                  Rediger graf
                                </Button>
                                <Button
                                  size="xsmall"
                                  variant="secondary"
                                  onClick={() => handleRequestRemoveFrame(frame)}
                                >
                                  Fjern graf
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div
                        className="h-full p-2"
                        data-chart-frame-id={frame.id}
                        ref={(node) => {
                          chartContentRefs.current[frame.id] = node
                        }}
                      >
                        <DashboardWidget
                          chart={{
                            id: `canvas-chart-${frame.id}`,
                            title: frame.label,
                            type: frame.chartType,
                            sql: frame.chartSql,
                          }}
                          websiteId={chartWebsiteId}
                          filters={dashboardWidgetFilters}
                          chartLinksEnabled={false}
                          compactMode
                          chartHeightPx={Math.max(160, (frame.height ?? defaults.height) - 116)}
                          onEditChart={() => handleOpenEditChartModal(frame)}
                          onDeleteChart={() => handleOpenDeleteChartModal(frame)}
                        />
                      </div>
                    )
                  })()
                ) : frame.kind === 'icon' ? (
                  (() => {
                    const width = frame.width ?? defaults.width
                    const height = frame.height ?? defaults.height
                    return (
                      <CanvasIconFrame
                        width={width}
                        height={height}
                        iconName={frame.iconName}
                        iconRotationDeg={frame.iconRotationDeg}
                        iconColor={frame.iconColor}
                      />
                    )
                  })()
                ) : frame.kind === 'figure' ? (
                  (() => {
                    const width = frame.width ?? defaults.width
                    const height = frame.height ?? defaults.height
                    return (
                      <CanvasFigureFrame
                        id={frame.id}
                        width={width}
                        height={height}
                        figureType={frame.figureType}
                        figureColor={frame.figureColor}
                        label={frame.label}
                      />
                    )
                  })()
                ) : frame.kind === 'drawing' ? (
                  (() => {
                    const width = frame.width ?? defaults.width
                    const height = frame.height ?? defaults.height
                    return (
                      <CanvasDrawingFrame
                        width={width}
                        height={height}
                        drawingPath={frame.drawingPath}
                        drawingStrokeStyles={frame.drawingStrokeStyles}
                        strokeColor={frame.drawingColor || DEFAULT_CANVAS_ICON_COLOR}
                        strokeWidth={frame.drawingStrokeWidth ?? DEFAULT_DRAWING_STROKE_WIDTH}
                        label={frame.label}
                      />
                    )
                  })()
                ) : frame.kind === 'heading' ? (
                  <CanvasHeadingFrame
                    id={frame.id}
                    headingText={frame.headingText}
                    label={frame.label}
                    fontSizePx={getHeadingFrameFontSize(frame)}
                    isEditing={activeEditableFrameId === frame.id}
                    isLockedByOther={editLockStatus.isLockedByOther}
                    lockOwnerLabel={editLockStatus.ownerLabel}
                    onChange={handleEditableFrameChange}
                    onBlur={handleEditableFrameBlur}
                    onStartEditing={handleStartEditingFrame}
                  />
                ) : frame.kind === 'text' ? (
                  <CanvasTextFrame
                    id={frame.id}
                    textContent={frame.textContent}
                    tableHeaders={frame.tableHeaders}
                    tableRows={frame.tableRows}
                    isEditing={activeEditableFrameId === frame.id}
                    isLockedByOther={editLockStatus.isLockedByOther}
                    lockOwnerLabel={editLockStatus.ownerLabel}
                    tableRowsPerPage={CANVAS_TABLE_ROWS_PER_PAGE}
                    tablePage={frameTablePages[frame.id] ?? 1}
                    onTablePageChange={(id, nextPage) =>
                      setFrameTablePages((current) => ({
                        ...current,
                        [id]: nextPage,
                      }))
                    }
                    onChange={handleEditableFrameChange}
                    onBlur={handleEditableFrameBlur}
                    onStartEditing={handleStartEditingFrame}
                  />
                ) : frame.kind === 'sticky' ? (
                  <CanvasStickyFrame
                    id={frame.id}
                    textContent={frame.textContent}
                    stickyColor={frame.stickyColor}
                    isEditing={activeEditableFrameId === frame.id}
                    isLockedByOther={editLockStatus.isLockedByOther}
                    lockOwnerLabel={editLockStatus.ownerLabel}
                    onChange={handleEditableFrameChange}
                    onBlur={handleEditableFrameBlur}
                    onStartEditing={handleStartEditingFrame}
                  />
                ) : frame.kind === 'section' ? (
                  <div className="flex h-full flex-col gap-2 p-3">
                    {activeEditableFrameId === frame.id ? (
                      <textarea
                        value={frame.label}
                        onMouseDown={(event) => event.stopPropagation()}
                        onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                        onBlur={() => handleEditableFrameBlur(frame.id)}
                        className="w-full resize-none rounded-md border border-[var(--ax-border-neutral-subtle)] bg-white/95 px-2 py-1 text-sm font-semibold text-[var(--ax-text-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
                        rows={2}
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className="w-fit max-w-full rounded-md border border-[var(--ax-border-neutral-subtle)] bg-white/90 px-2 py-1 text-left text-sm font-semibold text-[var(--ax-text-default)]"
                        onMouseDown={(event) => event.stopPropagation()}
                        onDoubleClick={() => handleStartEditingFrame(frame.id)}
                        title="Dobbeltklikk for å gi seksjonen navn"
                      >
                        <span className="block truncate">{frame.label || 'Seksjon'}</span>
                      </button>
                    )}
                    <p className="text-xs text-[var(--ax-text-subtle)]">
                      Inneholder {sectionItemCountsById[frame.id] ?? 0} elementer.
                    </p>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--ax-text-subtle)]">
                    Kunne ikke lage forhåndsvisning for denne siden.
                  </div>
                )}
              </div>
              {frame.kind === 'website' &&
                !frame.isInternalDashboard &&
                visualizationMode === 'clickmap' &&
                websiteTopListEnabled && (
                  <aside
                    className="absolute left-[calc(100%+12px)] top-0 z-[75] flex h-full w-[300px] min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] shadow-md"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <div className="border-b border-[var(--ax-border-neutral-subtle)] px-3 py-2">
                      <Select
                        size="small"
                        label="Filter"
                        value={topListFilter}
                        onChange={(event) =>
                          setTopListFilterByFrameId((current) => ({
                            ...current,
                            [frame.id]: event.target.value as 'all' | 'links' | 'accordion',
                          }))
                        }
                      >
                        <option value="all">Alle treff</option>
                        <option value="links">Lenker</option>
                        <option value="accordion">Trekkspill/accordion</option>
                      </Select>
                    </div>
                    {visualizationData?.loading ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--ax-text-subtle)]">
                        <Loader size="xsmall" title="Henter toppliste..." />
                        Henter toppliste...
                      </div>
                    ) : visualizationData?.error ? (
                      <div className="px-3 py-3 text-sm text-[var(--ax-text-danger)]">{visualizationData.error}</div>
                    ) : sortedTopListItems.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-[var(--ax-text-subtle)]">Ingen treff for valgt side.</div>
                    ) : (
                      <div className="min-h-0 space-y-2 overflow-y-auto p-2">
                        {sortedTopListItems.map((item, index) => {
                          const itemKey = `${item.sourcePath}-${item.linkText}-${item.destination}-${index}`
                          const barWidth = Math.max(4, Math.round((item.count / topListMaxCount) * 100))
                          return (
                            <div
                              key={itemKey}
                              className="rounded-md border border-[var(--ax-border-neutral-subtle)] p-2"
                            >
                              <div className="text-xs font-medium text-[var(--ax-text-default)]">
                                {item.linkText || '(uten lenketekst)'}
                              </div>
                              {item.destination && (
                                <div className="mt-0.5 break-all text-[11px] text-[var(--ax-text-subtle)]">
                                  {item.destination}
                                </div>
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
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </aside>
                )}
              <button
                type="button"
                onMouseDown={(event) => handleResizeStart(event, frame)}
                title="Endre størrelse"
                aria-label="Endre størrelse"
                className={`absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-sm border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] transition-opacity ${
                  frame.kind === 'text' && !isTableTextFrame
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                }`}
              >
                <span
                  className="pointer-events-none absolute bottom-[2px] right-[2px] h-2.5 w-2.5"
                  style={{
                    background:
                      'linear-gradient(135deg, transparent 35%, var(--ax-text-subtle) 35%, var(--ax-text-subtle) 45%, transparent 45%, transparent 55%, var(--ax-text-subtle) 55%, var(--ax-text-subtle) 65%, transparent 65%)',
                  }}
                />
              </button>
            </article>
          )
        })(),
      )}
    </>
  )
}

export default CanvasFrameLayer
