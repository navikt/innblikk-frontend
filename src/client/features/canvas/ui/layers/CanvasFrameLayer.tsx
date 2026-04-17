import { Button, HelpText, Loader, Select } from '@navikt/ds-react'
import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type { Website } from '../../../../shared/types/website.ts'
import { DashboardWidget } from '../../../dashboard'
import type { CanvasFrame, CanvasPageInsight, ConnectionAnchorSide, ConnectionDragState } from '../../model/types.ts'
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
} from '../../utils/canvasUtils.ts'
import { DEFAULT_CANVAS_ICON_COLOR } from '../icon/CanvasIconRegistry.ts'
import CanvasFrameActionPoints from '../controls/CanvasFrameActionPoints.tsx'
import CanvasDrawingFrame from '../drawing/CanvasDrawingFrame.tsx'
import CanvasFigureFrame from '../figure/CanvasFigureFrame.tsx'
import CanvasHeadingFrame from '../heading/CanvasHeadingFrame.tsx'
import CanvasIconFrame from '../icon/CanvasIconFrame.tsx'
import CanvasImageFrame from '../image/CanvasImageFrame.tsx'
import { isIllustrationImageFrame } from '../image/CanvasImageUtils.ts'
import CanvasStickyFrame from '../sticky/CanvasStickyFrame.tsx'
import { getCanvasStickyColorOptionById } from '../sticky/CanvasStickyColorRegistry.ts'
import CanvasTextFrame from '../text/CanvasTextFrame.tsx'
import CanvasLinkFrame from '../link/CanvasLinkFrame.tsx'
import CanvasSqlEditorFrame from '../sql/CanvasSqlEditorFrame.tsx'
import CanvasWebsiteActionMenu from '../website/CanvasWebsiteActionMenu.tsx'
import CanvasWebsiteFrame from '../website/CanvasWebsiteFrame.tsx'
import WebsitePicker from '../../../analysis/ui/WebsitePicker.tsx'
import type { ClickmapItem } from '../../../clickmap/model/types.ts'

type CanvasFrameItem = CanvasFrame & {
  displayUrl?: string
  src: string
}

type ResizeHandleDirection = 'se' | 'sw' | 'ne' | 'nw'

const RESIZE_HANDLE_CONFIGS: Array<{
  dir: ResizeHandleDirection
  title: string
  ariaLabel: string
  className: string
}> = [
  {
    dir: 'nw',
    title: 'Endre størrelse fra øvre venstre hjørne',
    ariaLabel: 'Endre størrelse fra øvre venstre hjørne',
    className: '-left-2 -top-2 cursor-nwse-resize',
  },
  {
    dir: 'ne',
    title: 'Endre størrelse fra øvre høyre hjørne',
    ariaLabel: 'Endre størrelse fra øvre høyre hjørne',
    className: '-right-2 -top-2 cursor-nesw-resize',
  },
  {
    dir: 'sw',
    title: 'Endre størrelse fra nedre venstre hjørne',
    ariaLabel: 'Endre størrelse fra nedre venstre hjørne',
    className: '-bottom-2 -left-2 cursor-nesw-resize',
  },
  {
    dir: 'se',
    title: 'Endre størrelse fra nedre høyre hjørne',
    ariaLabel: 'Endre størrelse fra nedre høyre hjørne',
    className: '-bottom-2 -right-2 cursor-nwse-resize',
  },
]

const getVoteLabel = (voteCount: number): 'stemme' | 'stemmer' => (voteCount === 1 ? 'stemme' : 'stemmer')

type CanvasResizeHandlesProps = {
  frame: CanvasFrame
  isVisible: boolean
  handleResizeStart: (event: React.MouseEvent, frame: CanvasFrame, dir?: ResizeHandleDirection) => void
  size?: 'default' | 'large'
  groupScope?: 'frame' | 'section'
}

const CanvasResizeHandles = ({
  frame,
  isVisible,
  handleResizeStart,
  size = 'default',
  groupScope = 'frame',
}: CanvasResizeHandlesProps) => {
  const sizeClassName = size === 'large' ? 'h-6 w-6 border-[4px]' : 'h-5 w-5 border-[3px]'
  const visibilityClassName = isVisible
    ? 'opacity-100'
    : groupScope === 'section'
      ? 'opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100'
      : 'opacity-0 group-hover/frame:opacity-100 group-focus-within/frame:opacity-100'

  return (
    <>
      {RESIZE_HANDLE_CONFIGS.map((handle) => (
        <button
          key={handle.dir}
          type="button"
          onMouseDown={(event) => handleResizeStart(event, frame, handle.dir)}
          title={handle.title}
          aria-label={handle.ariaLabel}
          className={`absolute ${handle.className} ${sizeClassName} rounded-sm border-[#1f8fff] bg-white shadow-[0_0_0_2px_white] transition-opacity ${visibilityClassName}`}
        />
      ))}
    </>
  )
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
  focusWebsiteTopListItem: (frameId: string, item: ClickmapItem) => void
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
  handleOpenEditLinkModal: (frame: CanvasFrame) => void
  handleOpenEditTableModal: (frame: CanvasFrame) => void
  handleOpenEditIllustrationModal: (frame: CanvasFrame) => void
  handleOpenEditIconModal: (frame: CanvasFrame) => void
  handleDuplicateIconCard: (frame: CanvasFrame) => Promise<void>
  handleRotateIconFrame: (id: string, delta: number) => void
  handleOpenEditFigureModal: (frame: CanvasFrame) => void
  handleDuplicateFigureCard: (frame: CanvasFrame) => Promise<void>
  handleDuplicateSectionCard: (frame: CanvasFrame) => Promise<void>
  handleDuplicateStickyCard: (frame: CanvasFrame) => Promise<void>
  handleDuplicateTextCard: (frame: CanvasFrame) => Promise<void>
  handleDuplicateHeadingCard: (frame: CanvasFrame) => Promise<void>
  handleDuplicateDrawingCard: (frame: CanvasFrame) => Promise<void>
  handleDuplicateImageCard: (frame: CanvasFrame) => Promise<void>
  handleAdjustHeadingFontSize: (id: string, delta: number) => void
  handleRotateIllustrationFrame: (id: string, delta: number) => void
  handleRotateFigureFrame: (id: string, delta: number) => void
  handleRotateDrawingFrame: (id: string, delta: number) => void
  handleToggleSectionLayout: (id: string) => void
  handleMoveFrameToSection: (frameId: string, sectionId: string) => void
  handleSetStickyColor: (frameId: string, colorId: string) => void
  handleRequestRemoveFrame: (frame: CanvasFrame) => void
  startConnectionDrag: (event: React.MouseEvent, frame: CanvasFrame, side: ConnectionAnchorSide) => void
  handleAssignWebsiteToChart: (frame: CanvasFrame, website: Website | null) => Promise<void>
  handleOpenEditChartModal: (frame: CanvasFrame) => void
  handleOpenDeleteChartModal: (frame: CanvasFrame) => void
  handlePersistSqlEditorFrame: (id: string) => Promise<void> | void
  handleEditableFrameChange: (id: string, nextValue: string) => void
  handleEditableFrameBlur: (id: string) => void
  handleStartEditingFrame: (id: string) => void
  handleResizeStart: (event: React.MouseEvent, frame: CanvasFrame, dir?: 'se' | 'sw' | 'ne' | 'nw') => void
  isDotVotingActive?: boolean
  dotVotingTargetSectionId?: string | null
  dotVotingTotalVotesByFrameId?: Record<string, number>
  dotVotingMyVotesByFrameId?: Record<string, number>
  shouldRevealDotVotingTotals?: boolean
  onVoteSticky?: (stickyId: string) => void
  onClearStickyVoteSnapshot?: (stickyId: string) => void
  isCanvasLocked?: boolean
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
  focusWebsiteTopListItem,
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
  handleOpenEditLinkModal,
  handleOpenEditTableModal,
  handleOpenEditIllustrationModal,
  handleOpenEditIconModal,
  handleDuplicateIconCard,
  handleRotateIconFrame,
  handleOpenEditFigureModal,
  handleDuplicateFigureCard,
  handleDuplicateSectionCard,
  handleDuplicateStickyCard,
  handleDuplicateTextCard,
  handleDuplicateHeadingCard,
  handleDuplicateDrawingCard,
  handleDuplicateImageCard,
  handleAdjustHeadingFontSize,
  handleRotateIllustrationFrame,
  handleRotateFigureFrame,
  handleRotateDrawingFrame,
  handleToggleSectionLayout,
  handleMoveFrameToSection,
  handleSetStickyColor,
  handleRequestRemoveFrame,
  startConnectionDrag,
  handleAssignWebsiteToChart,
  handleOpenEditChartModal,
  handleOpenDeleteChartModal,
  handlePersistSqlEditorFrame,
  handleEditableFrameChange,
  handleEditableFrameBlur,
  handleStartEditingFrame,
  handleResizeStart,
  isDotVotingActive = false,
  dotVotingTargetSectionId = null,
  dotVotingTotalVotesByFrameId = {},
  dotVotingMyVotesByFrameId = {},
  shouldRevealDotVotingTotals = false,
  onVoteSticky,
  onClearStickyVoteSnapshot,
  isCanvasLocked = false,
}: CanvasFrameLayerProps) => {
  const [topListFilterByFrameId, setTopListFilterByFrameId] = useState<Record<string, string>>({})
  const [activeTopListItemKeyByFrameId, setActiveTopListItemKeyByFrameId] = useState<Record<string, string | null>>({})

  const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()

  const isAccordionLike = (value: string): boolean => {
    const cleaned = cleanText(value)
    return cleaned.includes('accordion') || cleaned.includes('trekkspill')
  }
  const isFrameInteractionLocked = isDotVotingActive || isCanvasLocked

  return (
    <>
      {isDotVotingActive && (
        <div className="pointer-events-auto absolute inset-0 z-20 bg-black/55" aria-hidden="true" />
      )}
      {frameItems.map((frame) =>
        (() => {
          const defaults = getDefaultFrameSize(frame)
          const isIllustrationFrame = isIllustrationImageFrame(frame)
          const isSelectedFrame = selectedFrameIds.includes(frame.id)
          const isWebsiteInsightOpen = frame.kind === 'website' && activeInsightFrameId === frame.id
          const websiteInsight = pageInsights[frame.id]
          const visualizationMode = frame.kind === 'website' ? getCanvasFrameVisualizationMode(frame) : ''
          const visualizationData = frame.kind === 'website' ? frameVisualizationData[frame.id] : undefined
          const componentFilterOptions = Array.from(
            new Set(
              (visualizationData?.items ?? [])
                .map((item) => item.component?.trim())
                .filter((value): value is string => !!value),
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
          const requestedTopListFilter = topListFilterByFrameId[frame.id] ?? 'all'
          const topListFilter = topListFilterOptions.some((option) => option.value === requestedTopListFilter)
            ? requestedTopListFilter
            : 'all'
          const topListItems =
            frame.kind === 'website' && visualizationMode === 'clickmap'
              ? (visualizationData?.items ?? []).filter((item) => {
                  if (topListFilter === 'all') return true
                  if (topListFilter === 'accordion') return isAccordionLike(item.component || '')
                  if (topListFilter.startsWith('component:')) {
                    return item.component === topListFilter.replace('component:', '')
                  }
                  return !isAccordionLike(item.component || '')
                })
              : []
          const sortedTopListItems = [...topListItems].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 40)
          const topListMaxCount = Math.max(
            1,
            ...sortedTopListItems.map((item) => (Number.isFinite(item.count) ? item.count : 0)),
          )
          const editLockStatus =
            frame.kind === 'heading' ||
            frame.kind === 'text' ||
            frame.kind === 'sticky' ||
            frame.kind === 'section' ||
            frame.kind === 'sql-editor'
              ? getFrameLockStatus(frame)
              : { isLockedByOther: false, ownerLabel: null }
          const currentSectionId = frameContainingSectionIdByFrameId[frame.id]
          const parentSectionFrame =
            currentSectionId && frame.kind !== 'section'
              ? frameItems.find((item) => item.id === currentSectionId && item.kind === 'section')
              : undefined
          const parentSectionHasTitle = Boolean(parentSectionFrame?.label?.trim())
          const contextualHeadingLevel: 2 | 3 | 4 = currentSectionId ? (parentSectionHasTitle ? 4 : 2) : 2
          const sectionPortalTarget =
            currentSectionId && typeof document !== 'undefined'
              ? document.querySelector<HTMLElement>(`[data-canvas-section-id="${currentSectionId}"]`)
              : null
          const shouldRenderInsideSectionDuringInteraction = dragState !== null || resizeState !== null
          const renderInsideSection = Boolean(
            frame.kind !== 'section' &&
            parentSectionFrame &&
            sectionPortalTarget &&
            !shouldRenderInsideSectionDuringInteraction,
          )
          const sectionMoveOptionsForFrame =
            frame.kind === 'sticky' || frame.kind === 'text'
              ? sectionMoveOptions.filter((option) => option.id !== currentSectionId)
              : sectionMoveOptions
          const stickyColorOption = frame.kind === 'sticky' ? getCanvasStickyColorOptionById(frame.stickyColor) : null
          const isInVotingScope =
            !isDotVotingActive ||
            (frame.kind === 'section'
              ? frame.id === dotVotingTargetSectionId
              : frameContainingSectionIdByFrameId[frame.id] === dotVotingTargetSectionId)
          const isTargetVotingSection =
            isDotVotingActive && frame.kind === 'section' && frame.id === dotVotingTargetSectionId
          const shouldDimFrame = isDotVotingActive && !isInVotingScope
          const stickyTotalVotes = frame.kind === 'sticky' ? (dotVotingTotalVotesByFrameId[frame.id] ?? 0) : 0
          const stickyMyVotes = frame.kind === 'sticky' ? (dotVotingMyVotesByFrameId[frame.id] ?? 0) : 0
          const stickyFinalVoteCount =
            frame.kind === 'sticky' && Number.isFinite(frame.finalVoteCount) ? Number(frame.finalVoteCount) : null
          const sectionItemCount = sectionItemCountsById[frame.id] ?? 0
          const shouldShowSectionItemCount = frame.kind === 'section' && sectionItemCount >= 8
          const FrameContainerTag = frame.kind === 'section' ? 'section' : 'div'
          const frameGroupClass = frame.kind === 'section' ? 'group/section' : 'group/frame'
          const hoverRevealClass =
            frame.kind === 'section'
              ? 'group-hover/section:opacity-100 group-focus-within/section:opacity-100'
              : 'group-hover/frame:opacity-100 group-focus-within/frame:opacity-100'
          const actionButtonClassName = CARD_ACTION_BUTTON_CLASSNAME.replace(
            'group-hover:opacity-100 group-focus-within:opacity-100',
            hoverRevealClass,
          )

          const frameNode = (
            <FrameContainerTag
              key={frame.id}
              data-canvas-frame-root="true"
              role={frame.kind === 'section' ? 'region' : undefined}
              aria-label={
                frame.kind === 'section'
                  ? `${frame.label || 'Seksjon'}. Oppsett ${
                      frame.sectionLayout === 'grid' ? 'rutenett' : 'friform'
                    }${shouldShowSectionItemCount ? `. ${sectionItemCount} elementer.` : '.'}`
                  : undefined
              }
              data-canvas-section-id={frame.kind === 'section' ? frame.id : undefined}
              className={`focus:outline-none transition-opacity ${
                frame.kind === 'website' || frame.kind === 'image'
                  ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-lg border ${
                      connectionDragState?.sourceFrameId === frame.id ||
                      connectionDragState?.currentTargetFrameId === frame.id
                        ? 'border-[var(--ax-border-accent)] ring-2 ring-[var(--ax-border-accent)]/20'
                        : isIllustrationFrame
                          ? 'border-transparent'
                          : 'border-[var(--ax-border-neutral-subtle)]'
                    } ${isIllustrationFrame ? 'bg-transparent shadow-none' : 'bg-white shadow-sm'}`
                  : frame.kind === 'section'
                    ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-2xl border-2 border-dashed shadow-none ${
                        isTargetVotingSection ? 'border-[#5f8fc7] bg-transparent' : 'border-[#8eb2de] bg-transparent'
                      }`
                    : frame.kind === 'chart'
                      ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none`
                      : frame.kind === 'heading'
                        ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none`
                        : frame.kind === 'text'
                          ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-xl border border-transparent bg-transparent shadow-none`
                          : frame.kind === 'link'
                            ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-xl border border-transparent bg-transparent shadow-none`
                            : frame.kind === 'icon'
                              ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none`
                              : frame.kind === 'figure'
                                ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none`
                                : frame.kind === 'drawing'
                                  ? `${frameGroupClass} absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none`
                                  : frame.kind === 'sql-editor'
                                    ? `${frameGroupClass} absolute flex flex-col overflow-hidden rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] shadow-sm`
                                    : `${frameGroupClass} absolute flex flex-col overflow-visible rounded-xl border shadow-sm`
              } ${isSelectedFrame ? 'ring-2 ring-[var(--ax-border-accent)]/60' : ''} ${isTargetVotingSection ? 'ring-4 ring-[var(--ax-border-accent)]/40' : ''} ${isDotVotingActive && frame.kind === 'sticky' && isInVotingScope ? 'ring-1 ring-white/80 shadow-md' : ''} ${shouldDimFrame ? 'opacity-20' : 'opacity-100'}`}
              style={{
                left: `${frame.x - (renderInsideSection ? parentSectionFrame!.x : 0)}px`,
                top: `${frame.y - (renderInsideSection ? parentSectionFrame!.y : 0)}px`,
                zIndex: isDotVotingActive
                  ? isInVotingScope
                    ? frame.kind === 'section'
                      ? 25
                      : 26
                    : 10
                  : resizeState?.id === frame.id
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
              {frame.kind === 'website' && !frame.isInternalDashboard && !isDotVotingActive && (
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
                      showVisualizationOption={!frame.isInternalDashboard}
                      onOpenVisualization={() => handleOpenEditWebsiteModal(frame)}
                      showInsightOption={!frame.isInternalDashboard}
                      isInsightOpen={isWebsiteInsightOpen}
                      insightDisabled={!selectedWebsite}
                      onToggleInsight={() => handleToggleInsightPanel(frame)}
                      showTopListOption={visualizationMode === 'clickmap'}
                      isTopListEnabled={websiteTopListEnabled}
                      onToggleTopList={onToggleWebsiteTopList}
                      onRefresh={() => handleRefreshFrame(frame.id)}
                      onDuplicate={() => handleDuplicateWebsiteCard(frame)}
                      isEditingLocked={isCanvasLocked}
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
              {frame.kind === 'chart' && !isFrameInteractionLocked && (
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
              {!isFrameInteractionLocked &&
                (frame.kind === 'sticky' ||
                  frame.kind === 'text' ||
                  frame.kind === 'link' ||
                  frame.kind === 'heading' ||
                  frame.kind === 'section' ||
                  frame.kind === 'icon' ||
                  frame.kind === 'figure' ||
                  frame.kind === 'drawing' ||
                  frame.kind === 'sql-editor' ||
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
                      actionButtonClassName={actionButtonClassName}
                      onEditImage={() => handleOpenEditImageModal(frame)}
                      onEditLink={() => handleOpenEditLinkModal(frame)}
                      onEditTable={() => handleOpenEditTableModal(frame)}
                      isTableFrame={
                        frame.kind === 'text' && Array.isArray(frame.tableHeaders) && frame.tableHeaders.length > 0
                      }
                      onEditIllustration={() => handleOpenEditIllustrationModal(frame)}
                      onEditDashboard={() => handleOpenEditDashboardModal(frame)}
                      onEditIcon={() => handleOpenEditIconModal(frame)}
                      onDuplicateIcon={() => void handleDuplicateIconCard(frame)}
                      onRotateIconLeft={() => handleRotateIconFrame(frame.id, -ICON_ROTATION_STEP_DEG)}
                      onRotateIconRight={() => handleRotateIconFrame(frame.id, ICON_ROTATION_STEP_DEG)}
                      onEditFigure={() => handleOpenEditFigureModal(frame)}
                      onDuplicateFigure={() => void handleDuplicateFigureCard(frame)}
                      onDuplicateSection={() => void handleDuplicateSectionCard(frame)}
                      onDuplicateSticky={() => void handleDuplicateStickyCard(frame)}
                      onDuplicateText={() => void handleDuplicateTextCard(frame)}
                      onDuplicateHeading={() => void handleDuplicateHeadingCard(frame)}
                      onDuplicateDrawing={() => void handleDuplicateDrawingCard(frame)}
                      onDuplicateImage={() => void handleDuplicateImageCard(frame)}
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
                      onRotateFigureLeft={() => handleRotateFigureFrame(frame.id, -ICON_ROTATION_STEP_DEG)}
                      onRotateFigureRight={() => handleRotateFigureFrame(frame.id, ICON_ROTATION_STEP_DEG)}
                      onRotateDrawingLeft={() => handleRotateDrawingFrame(frame.id, -ICON_ROTATION_STEP_DEG)}
                      onRotateDrawingRight={() => handleRotateDrawingFrame(frame.id, ICON_ROTATION_STEP_DEG)}
                      onRemoveFrame={() => handleRequestRemoveFrame(frame)}
                    />
                  </>
                )}
              {!isFrameInteractionLocked &&
                (frame.kind === 'heading' ||
                  frame.kind === 'text' ||
                  frame.kind === 'link' ||
                  frame.kind === 'section' ||
                  frame.kind === 'icon' ||
                  frame.kind === 'figure' ||
                  frame.kind === 'drawing' ||
                  frame.kind === 'sql-editor') && (
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute z-10 opacity-0 transition-opacity ${hoverRevealClass} ${
                      frame.kind === 'text' || frame.kind === 'link'
                        ? 'inset-[2px] rounded-lg border border-[#9bc4ff]'
                        : 'inset-0 rounded-lg border-2 border-[#7fb7ff]'
                    }`}
                  />
                )}
              {!isFrameInteractionLocked && frame.kind === 'image' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 border-2 border-[#7fb7ff] opacity-0 transition-opacity group-hover/frame:opacity-100 group-focus-within/frame:opacity-100 rounded-xl"
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
                              : frame.kind === 'sql-editor'
                                ? 'overflow-hidden bg-[var(--ax-bg-default)]'
                                : frame.kind === 'heading'
                                  ? 'pt-1'
                                  : frame.kind === 'link'
                                    ? 'overflow-visible bg-transparent'
                                    : 'px-2 pb-2'
                }`}
              >
                {frame.kind === 'website' && !frame.isInternalDashboard && !isCanvasLocked && (
                  <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-20 overflow-visible">
                    <button
                      type="button"
                      className={`pointer-events-auto absolute left-[-12px] top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover/frame:opacity-100 group-focus-within/frame:opacity-100 ${
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
                      className={`pointer-events-auto absolute right-[-12px] top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover/frame:opacity-100 group-focus-within/frame:opacity-100 ${
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
                      className={`pointer-events-auto absolute left-1/2 top-[-12px] flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover/frame:opacity-100 group-focus-within/frame:opacity-100 ${
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
                      className={`pointer-events-auto absolute bottom-[-12px] left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover/frame:opacity-100 group-focus-within/frame:opacity-100 ${
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
                          headingLevel={contextualHeadingLevel}
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
                        iconRotationDeg={frame.iconRotationDeg}
                        figureOrientation={frame.figureOrientation}
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
                        rotationDeg={frame.drawingRotationDeg}
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
                    headingLevel={contextualHeadingLevel}
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
                ) : frame.kind === 'link' ? (
                  <CanvasLinkFrame title={frame.label} href={frame.targetUrl || ''} description={frame.textContent} />
                ) : frame.kind === 'sql-editor' ? (
                  <CanvasSqlEditorFrame
                    id={frame.id}
                    sqlQuery={frame.sqlQuery}
                    websiteId={frame.websiteId || selectedWebsite?.id}
                    isLockedByOther={editLockStatus.isLockedByOther}
                    lockOwnerLabel={editLockStatus.ownerLabel}
                    onChange={handleEditableFrameChange}
                    onPersist={handlePersistSqlEditorFrame}
                  />
                ) : frame.kind === 'sticky' ? (
                  <div className="relative h-full">
                    <CanvasStickyFrame
                      id={frame.id}
                      textContent={frame.textContent}
                      stickyColor={frame.stickyColor}
                      isEditing={!isFrameInteractionLocked && activeEditableFrameId === frame.id}
                      isLockedByOther={!isFrameInteractionLocked && editLockStatus.isLockedByOther}
                      lockOwnerLabel={!isFrameInteractionLocked ? editLockStatus.ownerLabel : null}
                      onChange={handleEditableFrameChange}
                      onBlur={handleEditableFrameBlur}
                      onStartEditing={
                        isDotVotingActive && isInVotingScope ? () => onVoteSticky?.(frame.id) : handleStartEditingFrame
                      }
                    />
                    {isDotVotingActive && isInVotingScope && (
                      <>
                        <button
                          type="button"
                          className="absolute inset-0 z-20 cursor-pointer rounded-xl border-2 border-transparent transition-colors hover:border-[var(--ax-border-accent)] focus-visible:border-[var(--ax-border-accent)] focus-visible:outline-none"
                          onClick={() => onVoteSticky?.(frame.id)}
                          aria-label={`Stem på lapp: ${frame.label || frame.textContent || frame.id}`}
                          title="Klikk for å stemme"
                        />
                      </>
                    )}
                    {isDotVotingActive && isInVotingScope && (
                      <div className="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-1">
                        {shouldRevealDotVotingTotals && (
                          <span className="rounded-full border border-[var(--ax-border-neutral-subtle)] bg-white/95 px-2 py-0.5 text-xs font-semibold text-[var(--ax-text-default)]">
                            {stickyTotalVotes} {getVoteLabel(stickyTotalVotes)} totalt
                          </span>
                        )}
                        {stickyMyVotes > 0 && (
                          <span className="rounded-full border border-[var(--ax-border-accent)] bg-[var(--ax-border-accent)] px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
                            {stickyMyVotes} {getVoteLabel(stickyMyVotes)} fra deg
                          </span>
                        )}
                      </div>
                    )}
                    {!isDotVotingActive && stickyFinalVoteCount !== null && stickyFinalVoteCount > 0 && (
                      <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded-full border border-emerald-300 bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm transition-colors hover:border-red-400 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ax-border-accent)]"
                          onClick={(event) => {
                            event.stopPropagation()
                            onClearStickyVoteSnapshot?.(frame.id)
                          }}
                          aria-label={`${stickyFinalVoteCount} ${getVoteLabel(stickyFinalVoteCount)} – klikk for å fjerne`}
                          title="Klikk for å fjerne lagret stemmeresultat"
                        >
                          {stickyFinalVoteCount} {getVoteLabel(stickyFinalVoteCount)}
                        </button>
                      </div>
                    )}
                  </div>
                ) : frame.kind === 'section' ? (
                  <div className="flex h-full flex-col gap-2 p-3">
                    {!isCanvasLocked && activeEditableFrameId === frame.id ? (
                      <textarea
                        value={frame.label}
                        onMouseDown={(event) => event.stopPropagation()}
                        onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                        onBlur={() => handleEditableFrameBlur(frame.id)}
                        className="w-full resize-none rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]/95 px-2 py-1 text-sm font-semibold text-[var(--ax-text-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
                        rows={2}
                        autoFocus
                      />
                    ) : (
                      <h3 className="m-0">
                        {isCanvasLocked ? (
                          <span className="inline-block w-fit max-w-full rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]/90 px-2 py-1 text-left text-sm font-semibold text-[var(--ax-text-default)]">
                            <span className="block truncate">{frame.label || 'Seksjon'}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="w-fit max-w-full rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]/90 px-2 py-1 text-left text-sm font-semibold text-[var(--ax-text-default)]"
                            onMouseDown={(event) => event.stopPropagation()}
                            onDoubleClick={() => {
                              handleStartEditingFrame(frame.id)
                            }}
                            title="Dobbeltklikk for å gi seksjonen navn"
                          >
                            <span className="block truncate">{frame.label || 'Seksjon'}</span>
                          </button>
                        )}
                      </h3>
                    )}
                    {shouldShowSectionItemCount && (
                      <p className="text-xs text-[var(--ax-text-subtle)]">{sectionItemCount} elementer.</p>
                    )}
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
                !isDotVotingActive &&
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
                            [frame.id]: event.target.value,
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
                          const isActive = activeTopListItemKeyByFrameId[frame.id] === itemKey
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
                                  [frame.id]: itemKey,
                                }))
                                focusWebsiteTopListItem(frame.id, item)
                              }}
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
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </aside>
                )}
              {!isFrameInteractionLocked && (
                <CanvasResizeHandles
                  frame={frame}
                  isVisible={isSelectedFrame || resizeState?.id === frame.id}
                  handleResizeStart={handleResizeStart}
                  size={frame.kind === 'section' ? 'large' : 'default'}
                  groupScope={frame.kind === 'section' ? 'section' : 'frame'}
                />
              )}
            </FrameContainerTag>
          )

          if (renderInsideSection && sectionPortalTarget) {
            return createPortal(frameNode, sectionPortalTarget)
          }

          return frameNode
        })(),
      )}
    </>
  )
}

export default CanvasFrameLayer
