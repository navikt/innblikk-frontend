import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Loader } from '@navikt/ds-react'
import { ChartNoAxesCombined, Plus, Trash2 } from 'lucide-react'
import { computeFunnelStepMetrics } from '../../analysis/utils/horizontalFunnel.ts'
import { fetchPageMetrics } from '../../traffic/api/trafficApi.ts'
import { fetchFunnelData } from '../../funnel/api/funnelApi.ts'
import type { VisualizationMode } from '../../clickmap/model/visualizationMode.ts'
import {
  getCookieCountByParams,
  getDateRangeFromPeriod,
  getStoredPeriod,
  normalizeUrlToPath,
  savePeriodPreference,
} from '../../../shared/lib/utils.ts'
import { mapGraphTypeToChart } from '../../oversikt'
import CanvasIllustrationModal from './illustration/CanvasIllustrationModal.tsx'
import {
  DEFAULT_CANVAS_ILLUSTRATION_PATH,
  getCanvasIllustrationOptionByPath,
} from './illustration/CanvasIllustrationRegistry.ts'
import CanvasIconModal from './icon/CanvasIconModal.tsx'
import CanvasAdminModals from './controls/CanvasAdminModals.tsx'
import CanvasCoreModals from './controls/CanvasCoreModals.tsx'
import CanvasTopBar from './controls/CanvasTopBar.tsx'
import CanvasTimerModal from './controls/CanvasTimerModal.tsx'
import CanvasZoomControls from './controls/CanvasZoomControls.tsx'
import CanvasDrawingToolbar from './drawing/CanvasDrawingToolbar.tsx'
import CanvasDrawingDraftOverlay from './drawing/CanvasDrawingDraftOverlay.tsx'
import CanvasFrameLayer from './CanvasFrameLayer.tsx'
import CanvasImageUrlModal from './image/CanvasImageUrlModal.tsx'
import CanvasFigureModal from './figure/CanvasFigureModal.tsx'
import CanvasHeadingModal from './heading/CanvasHeadingModal.tsx'
import CanvasTextModal from './text/CanvasTextModal.tsx'
import CanvasStickyModal from './sticky/CanvasStickyModal.tsx'
import CanvasImportStickyCsvModal from './sticky/CanvasImportStickyCsvModal.tsx'
import CanvasWebsiteModal from './website/CanvasWebsiteModal.tsx'
import useCanvasWebsiteVisualization from './website/useCanvasWebsiteVisualization.ts'
import useCanvasDrawingTool, { type CanvasDrawingStroke } from './drawing/useCanvasDrawingTool.ts'
import { isIllustrationImageFrame } from './image/CanvasImageUtils.ts'
import {
  CANVAS_ICON_COLOR_OPTIONS,
  DEFAULT_CANVAS_ICON_COLOR,
  DEFAULT_CANVAS_ICON_ID,
  getCanvasIconColor,
  getCanvasIconOptionById,
} from './icon/CanvasIconRegistry.ts'
import {
  createProject,
  createCategory,
  createDashboard,
  deleteCategory,
  createGraph,
  createQuery,
  deleteGraph,
  fetchCategories,
  fetchDashboards,
  fetchProjects,
  updateCategory,
  updateDashboard,
  updateQuery,
} from '../../oversikt/api/oversiktApi.ts'
import type { GraphCategoryDto, GraphType, OversiktChart } from '../../oversikt/model/types.ts'
import EditChartDialog from '../../oversikt/ui/dialogs/EditChartDialog.tsx'
import DeleteChartDialog from '../../oversikt/ui/dialogs/DeleteChartDialog.tsx'
import type { Website } from '../../../shared/types/website.ts'
import { useCookieStartDate, useCookieSupport } from '../../../shared/hooks/useSiteimproveSupport.ts'
import { useLocation } from 'react-router-dom'
import useCanvasCsvImport from '../hooks/useCanvasCsvImport.ts'
import useCanvasBackgroundSync from '../hooks/useCanvasBackgroundSync.ts'
import useCanvasEditLocks from '../hooks/useCanvasEditLocks.ts'
import useCanvasPresence from '../hooks/useCanvasPresence.ts'
import useCanvasTimerSync from '../hooks/useCanvasTimerSync.ts'
import { fetchCanvasStorageData } from '../api/canvasStorageApi.ts'

import type {
  CanvasChartOption,
  CanvasChartReadyMessage,
  CanvasConfigPayload,
  CanvasConnection,
  CanvasConnectionMetric,
  CanvasConnectionVisual,
  CanvasDeleteTarget,
  CanvasFigureType,
  CanvasFrame,
  CanvasPageInsight,
  ConnectionAnchorSide,
  ConnectionDragState,
  PendingCanvasFrameDraft,
  PendingCsvStickyImport,
} from '../model/types.ts'
import {
  CANVAS_DASHBOARD_TOKEN,
  CANVAS_FIGURE_OPTIONS,
  CANVAS_INVENTORY_DETAIL_LIMIT_PER_TYPE,
  CANVAS_INVENTORY_KIND_OPTIONS,
  CANVAS_QUERY_NAME,
  CANVAS_SURFACE_BOTTOM_BUFFER,
  CANVAS_SURFACE_HEIGHT,
  CANVAS_SURFACE_TOP_GAP,
  CANVAS_SURFACE_WIDTH,
  CANVAS_TOP_BUFFER,
  CANVAS_ZOOM_STEP,
  CLICKMAP_EVENTS,
  DEFAULT_DRAWING_STROKE_WIDTH,
  DRAWING_STROKE_WIDTH_OPTIONS,
  HEADING_CARD_HEADER_HEIGHT,
  HEADING_FONT_SIZE_DEFAULT,
  HEADING_FONT_SIZE_MAX,
  HEADING_FONT_SIZE_MIN,
  HEADING_TEXT_CHAR_WIDTH_FACTOR,
  HEADING_TEXT_EXTRA_WIDTH,
  HEADING_TEXT_MAX_WIDTH,
  HEADING_TEXT_MIN_WIDTH,
  HEADING_TEXT_VERTICAL_PADDING,
  PLANNER_COLUMN_LABEL_PREFIX,
  buildCanvasConnectionStorageGraphName,
  buildCanvasDashboardDescription,
  buildCanvasStorageGraphName,
  buildConnectionPath,
  buildFunnelStepFromUrl,
  clampCanvasZoom,
  estimateTableFrameHeight,
  extractCanvasWebsiteIdFromDescription,
  formatCanvasPathLabel,
  getCanvasCategoryDisplayName,
  getCanvasFrameVisualizationMode,
  getCanvasPeriodLabel,
  getComparableUrl,
  getFrameLabel,
  getWebsiteFrameDisplayUrl,
  getWebsiteFrameRenderSrc,
  isCanvasDashboardDescription,
  isImagePreviewUrl,
  mapCanvasChartTypeToGraphType,
  normalizeInputToTargetUrl,
  parseDashboardTargetUrl,
  serializeCanvasConfig,
} from '../utils/canvasUtils.ts'
import {
  getCanvasFrameAnchor,
  getCanvasFrameBounds,
  getDominantConnectionSide,
  getNearestCanvasAnchorSide,
} from '../utils/canvasConnectionUtils.ts'

const getDefaultFrameSize = (
  frameOrKind: CanvasFrame | CanvasFrame['kind'],
): {
  width: number
  height: number
  minWidth: number
  minHeight: number
} => {
  const kind = typeof frameOrKind === 'string' ? frameOrKind : frameOrKind.kind
  const isInternalDashboard = typeof frameOrKind === 'string' ? false : Boolean(frameOrKind.isInternalDashboard)
  const isIllustration = typeof frameOrKind === 'string' ? false : isIllustrationImageFrame(frameOrKind)

  if (kind === 'website' && isInternalDashboard) return { width: 760, height: 620, minWidth: 520, minHeight: 420 }
  if (kind === 'website') return { width: 420, height: 560, minWidth: 220, minHeight: 160 }
  if (kind === 'image' && isIllustration) return { width: 420, height: 420, minWidth: 96, minHeight: 96 }
  if (kind === 'image') return { width: 420, height: 420, minWidth: 240, minHeight: 200 }
  if (kind === 'chart') return { width: 560, height: 360, minWidth: 280, minHeight: 200 }
  if (kind === 'heading') return { width: 420, height: 72, minWidth: 260, minHeight: 48 }
  if (kind === 'text') return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
  if (kind === 'icon') return { width: 280, height: 240, minWidth: 72, minHeight: 72 }
  if (kind === 'figure') return { width: 240, height: 200, minWidth: 120, minHeight: 72 }
  if (kind === 'drawing') return { width: 240, height: 160, minWidth: 28, minHeight: 28 }
  if (kind === 'section') return { width: 640, height: 420, minWidth: 240, minHeight: 180 }
  return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
}

const getNextAutoSectionLabel = (frames: CanvasFrame[], excludeFrameId?: string): string => {
  const usedNumbers = new Set<number>()

  frames.forEach((frame) => {
    if (frame.kind !== 'section') return
    if (excludeFrameId && frame.id === excludeFrameId) return
    const normalized = frame.label.trim()
    const match = normalized.match(/^seksjon\s+(\d+)$/i)
    if (!match) return
    const parsed = Number(match[1])
    if (Number.isFinite(parsed) && parsed > 0) {
      usedNumbers.add(parsed)
    }
  })

  let next = 1
  while (usedNumbers.has(next)) next += 1
  return `Seksjon ${next}`
}

const getFrameBoundsForLayout = (frame: CanvasFrame): { left: number; top: number; right: number; bottom: number } => {
  const defaults = getDefaultFrameSize(frame)
  const width = frame.width ?? defaults.width
  const height = frame.height ?? defaults.height
  return {
    left: frame.x,
    top: frame.y,
    right: frame.x + width,
    bottom: frame.y + height,
  }
}

const Canvas = () => {
  const LAST_PROJECT_STORAGE_KEY = 'projectmanager:lastSelectedProjectId'
  const location = useLocation()
  const routeContext = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const parseNumberParam = (value: string | null): number | null => {
      if (value === null) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    const projectId = parseNumberParam(params.get('projectId'))
    const dashboardId = parseNumberParam(params.get('dashboardId'))
    const categoryId = parseNumberParam(params.get('categoryId'))
    return {
      onlyDirectEntry: params.get('strict') ? params.get('strict') === 'true' : false,
      projectId,
      dashboardId,
      categoryId,
    }
  }, [location.search])
  const { onlyDirectEntry, projectId, dashboardId, categoryId: initialCategoryId } = routeContext
  const canPersistToDashboard = projectId !== null && dashboardId !== null
  const isCanvasFrontpage = projectId === null && dashboardId === null
  const [canvasTitle, setCanvasTitle] = useState('Canvas')
  const [canvasDashboardDescription, setCanvasDashboardDescription] = useState(CANVAS_DASHBOARD_TOKEN)
  const [canvasConfiguredWebsiteId, setCanvasConfiguredWebsiteId] = useState<string | null>(null)
  const [canvasInitMode, setCanvasInitMode] = useState<'checking' | 'existing' | 'create'>(
    canPersistToDashboard ? 'checking' : 'create',
  )
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
  const [availableWebsites, setAvailableWebsites] = useState<Website[]>([])
  const [period, setPeriodState] = useState<string>(() =>
    getStoredPeriod(new URLSearchParams(window.location.search).get('period')),
  )
  const usesCookies = useCookieSupport(selectedWebsite?.domain, selectedWebsite?.id)
  const cookieStartDate = useCookieStartDate(selectedWebsite?.domain, selectedWebsite?.id)
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)
  const [frames, setFrames] = useState<CanvasFrame[]>([])
  const [connections, setConnections] = useState<CanvasConnection[]>([])
  const [isAddPageModalOpen, setIsAddPageModalOpen] = useState(false)
  const [isAddImageModalOpen, setIsAddImageModalOpen] = useState(false)
  const [isAddIllustrationModalOpen, setIsAddIllustrationModalOpen] = useState(false)
  const [isAddDashboardModalOpen, setIsAddDashboardModalOpen] = useState(false)
  const [isAddHeadingModalOpen, setIsAddHeadingModalOpen] = useState(false)
  const [isAddTextModalOpen, setIsAddTextModalOpen] = useState(false)
  const [isAddStickyModalOpen, setIsAddStickyModalOpen] = useState(false)
  const [isImportStickyCsvModalOpen, setIsImportStickyCsvModalOpen] = useState(false)
  const [isAddIconModalOpen, setIsAddIconModalOpen] = useState(false)
  const [isAddFigureModalOpen, setIsAddFigureModalOpen] = useState(false)
  const [isCanvasSettingsModalOpen, setIsCanvasSettingsModalOpen] = useState(false)
  const [canvasSettingsInfo, setCanvasSettingsInfo] = useState<string | null>(null)
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false)
  const [renameCanvasInput, setRenameCanvasInput] = useState('')
  const [renameCanvasError, setRenameCanvasError] = useState<string | null>(null)
  const [isAddChartModalOpen, setIsAddChartModalOpen] = useState(false)
  const [isCreateTabModalOpen, setIsCreateTabModalOpen] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [createTabError, setCreateTabError] = useState<string | null>(null)
  const [creatingTab, setCreatingTab] = useState(false)
  const [isManageTabsModalOpen, setIsManageTabsModalOpen] = useState(false)
  const [manageTabId, setManageTabId] = useState('')
  const [manageTabName, setManageTabName] = useState('')
  const [manageTabError, setManageTabError] = useState<string | null>(null)
  const [savingManageTab, setSavingManageTab] = useState(false)
  const [deletingManageTab, setDeletingManageTab] = useState(false)
  const [isEditWebsiteModalOpen, setIsEditWebsiteModalOpen] = useState(false)
  const [isEditDashboardModalOpen, setIsEditDashboardModalOpen] = useState(false)
  const [isEditImageModalOpen, setIsEditImageModalOpen] = useState(false)
  const [isEditIconModalOpen, setIsEditIconModalOpen] = useState(false)
  const [isEditFigureModalOpen, setIsEditFigureModalOpen] = useState(false)
  const [editWebsiteFrameId, setEditWebsiteFrameId] = useState<string | null>(null)
  const [editDashboardFrameId, setEditDashboardFrameId] = useState<string | null>(null)
  const [editImageFrameId, setEditImageFrameId] = useState<string | null>(null)
  const [editIconFrameId, setEditIconFrameId] = useState<string | null>(null)
  const [editFigureFrameId, setEditFigureFrameId] = useState<string | null>(null)
  const [editIllustrationFrameId, setEditIllustrationFrameId] = useState<string | null>(null)
  const [editWebsitePathInput, setEditWebsitePathInput] = useState('')
  const [editImageUrlInput, setEditImageUrlInput] = useState('')
  const [editWebsitePreviewUrlInput, setEditWebsitePreviewUrlInput] = useState('')
  const [editWebsiteRenderEnabled, setEditWebsiteRenderEnabled] = useState(true)
  const [editWebsiteVisualizationMode, setEditWebsiteVisualizationMode] = useState<VisualizationMode | ''>('')
  const [newPagePathInput, setNewPagePathInput] = useState('')
  const [newImageUrlInput, setNewImageUrlInput] = useState('')
  const [selectedIllustrationPath, setSelectedIllustrationPath] = useState(DEFAULT_CANVAS_ILLUSTRATION_PATH)
  const [newPagePreviewUrlInput, setNewPagePreviewUrlInput] = useState('')
  const [newPageRenderEnabled, setNewPageRenderEnabled] = useState(true)
  const [newPageVisualizationMode, setNewPageVisualizationMode] = useState<VisualizationMode | ''>('')
  const [addPageError, setAddPageError] = useState<string | null>(null)
  const [addImageError, setAddImageError] = useState<string | null>(null)
  const [addIllustrationError, setAddIllustrationError] = useState<string | null>(null)
  const [addDashboardError, setAddDashboardError] = useState<string | null>(null)
  const [editWebsiteError, setEditWebsiteError] = useState<string | null>(null)
  const [editDashboardError, setEditDashboardError] = useState<string | null>(null)
  const [editImageError, setEditImageError] = useState<string | null>(null)
  const [projectOptions, setProjectOptions] = useState<Array<{ id: number; name: string }>>([])
  const [selectedProjectToAddId, setSelectedProjectToAddId] = useState('')
  const [dashboardOptions, setDashboardOptions] = useState<Array<{ id: number; name: string }>>([])
  const [selectedDashboardToAddId, setSelectedDashboardToAddId] = useState('')
  const [isLoadingDashboardOptions, setIsLoadingDashboardOptions] = useState(false)
  const [createCanvasProjectOptions, setCreateCanvasProjectOptions] = useState<Array<{ id: number; name: string }>>([])
  const [createCanvasProjectId, setCreateCanvasProjectId] = useState('')
  const [existingCanvasOptions, setExistingCanvasOptions] = useState<Array<{ id: number; name: string }>>([])
  const [isLoadingExistingCanvasOptions, setIsLoadingExistingCanvasOptions] = useState(false)
  const [existingCanvasError, setExistingCanvasError] = useState<string | null>(null)
  const [createCanvasNameInput, setCreateCanvasNameInput] = useState('')
  const [createCanvasError, setCreateCanvasError] = useState<string | null>(null)
  const [isCreatingCanvas, setIsCreatingCanvas] = useState(false)
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false)
  const [createTeamNameInput, setCreateTeamNameInput] = useState('')
  const [createTeamDescriptionInput, setCreateTeamDescriptionInput] = useState('')
  const [createTeamError, setCreateTeamError] = useState<string | null>(null)
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)
  const [pendingChartWebsiteByFrameId, setPendingChartWebsiteByFrameId] = useState<Record<string, Website | null>>({})
  const [editDashboardProjectOptions, setEditDashboardProjectOptions] = useState<Array<{ id: number; name: string }>>(
    [],
  )
  const [editDashboardSelectedProjectId, setEditDashboardSelectedProjectId] = useState('')
  const [editDashboardOptions, setEditDashboardOptions] = useState<Array<{ id: number; name: string }>>([])
  const [editDashboardSelectedDashboardId, setEditDashboardSelectedDashboardId] = useState('')
  const [isLoadingEditDashboardOptions, setIsLoadingEditDashboardOptions] = useState(false)
  const [headingTextInput, setHeadingTextInput] = useState('')
  const [addHeadingError, setAddHeadingError] = useState<string | null>(null)
  const [textContentInput, setTextContentInput] = useState('')
  const [addTextError, setAddTextError] = useState<string | null>(null)
  const [stickyContentInput, setStickyContentInput] = useState('')
  const [addStickyError, setAddStickyError] = useState<string | null>(null)
  const [frameTablePages, setFrameTablePages] = useState<Record<string, number>>({})
  const [selectedIconId, setSelectedIconId] = useState(DEFAULT_CANVAS_ICON_ID)
  const [selectedIconColor, setSelectedIconColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [addIconError, setAddIconError] = useState<string | null>(null)
  const [editIconSelectedId, setEditIconSelectedId] = useState(DEFAULT_CANVAS_ICON_ID)
  const [editIconSelectedColor, setEditIconSelectedColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [editIconError, setEditIconError] = useState<string | null>(null)
  const [selectedFigureType, setSelectedFigureType] = useState<CanvasFigureType>('rectangle')
  const [selectedFigureColor, setSelectedFigureColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [addFigureError, setAddFigureError] = useState<string | null>(null)
  const [editFigureSelectedType, setEditFigureSelectedType] = useState<CanvasFigureType>('rectangle')
  const [editFigureSelectedColor, setEditFigureSelectedColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [editFigureError, setEditFigureError] = useState<string | null>(null)
  const [chartOptions, _setChartOptions] = useState<CanvasChartOption[]>([])
  const [selectedChartOptionId, setSelectedChartOptionId] = useState('')
  const [isLoadingChartOptions, _setIsLoadingChartOptions] = useState(false)
  const [addChartError, setAddChartError] = useState<string | null>(null)
  const [isGrafbyggerEmbedded, setIsGrafbyggerEmbedded] = useState(false)
  const [editChartFrameId, setEditChartFrameId] = useState<string | null>(null)
  const [editChartTarget, setEditChartTarget] = useState<OversiktChart | null>(null)
  const [deleteChartFrameId, setDeleteChartFrameId] = useState<string | null>(null)
  const [deleteChartTarget, setDeleteChartTarget] = useState<OversiktChart | null>(null)
  const [chartMutationError, setChartMutationError] = useState<string | null>(null)
  const [savingEditChart, setSavingEditChart] = useState(false)
  const [deletingChart, setDeletingChart] = useState(false)
  const [dragState, setDragState] = useState<{
    ids: string[]
    pointerStartX: number
    pointerStartY: number
    frameStartPositions: Record<string, { x: number; y: number }>
  } | null>(null)
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
    additive: boolean
  } | null>(null)
  const [resizeState, setResizeState] = useState<{
    id: string
    startX: number
    startY: number
    startWidth: number
    startHeight: number
  } | null>(null)
  const [canvasCategories, setCanvasCategories] = useState<GraphCategoryDto[]>([])
  const [activeCanvasCategoryId, setActiveCanvasCategoryId] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false)
  const [timerMinutesInput, setTimerMinutesInput] = useState('5')
  const [timerModalError, setTimerModalError] = useState<string | null>(null)
  const [timerModalPendingAction, setTimerModalPendingAction] = useState<
    'start' | 'stop' | 'pause' | 'resume' | 'adjust-minus' | 'adjust-plus' | null
  >(null)
  const [timerA11yAnnouncement, setTimerA11yAnnouncement] = useState('')
  const [, setIsLoadingCanvasItems] = useState(false)
  const [isSavingCanvasItem, setIsSavingCanvasItem] = useState(false)
  const [isImportingStickyCsv, setIsImportingStickyCsv] = useState(false)
  const [connectionMetrics, setConnectionMetrics] = useState<Record<string, CanvasConnectionMetric | null>>({})
  const [connectionDragState, setConnectionDragState] = useState<ConnectionDragState | null>(null)
  const [pageInsights, setPageInsights] = useState<Record<string, CanvasPageInsight>>({})
  const [activeInsightFrameId, setActiveInsightFrameId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CanvasDeleteTarget | null>(null)
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ total: number; completed: number } | null>(null)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [activeEditableFrameId, setActiveEditableFrameId] = useState<string | null>(null)
  const [failedImageFrameIds, setFailedImageFrameIds] = useState<Record<string, boolean>>({})
  const [pendingFrameDraft, setPendingFrameDraft] = useState<PendingCanvasFrameDraft | null>(null)
  const [pendingCsvStickyImport, setPendingCsvStickyImport] = useState<PendingCsvStickyImport | null>(null)
  const [pendingFramePlacementLabel, setPendingFramePlacementLabel] = useState<string | null>(null)
  const [pendingFramePointer, setPendingFramePointer] = useState<{ x: number; y: number } | null>(null)
  const pageInsightsRef = useRef<Record<string, CanvasPageInsight>>({})
  const framesRef = useRef<CanvasFrame[]>([])
  const chartContentRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const isImportingStickyCsvRef = useRef(false)
  const clipboardFramesRef = useRef<CanvasFrame[] | null>(null)
  const clipboardPasteCountRef = useRef(0)
  const previousTimerRunningRef = useRef(false)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const canvasToolbarRef = useRef<HTMLDivElement | null>(null)
  const connectionMetricRequestSignatureRef = useRef<string | null>(null)
  const timerModalReopenBlockedUntilRef = useRef(0)
  const [canvasToolbarHeight, setCanvasToolbarHeight] = useState(120)
  const canvasCanvasTopOffset = canvasToolbarHeight + CANVAS_SURFACE_TOP_GAP
  const shouldShowCreateCanvasModal = canvasInitMode === 'create'
  const lockedFrameIds = useMemo(() => {
    const ids = new Set<string>()
    if (dragState) {
      dragState.ids.forEach((id) => ids.add(id))
    }
    if (resizeState?.id) {
      ids.add(resizeState.id)
    }
    if (activeEditableFrameId) {
      ids.add(activeEditableFrameId)
    }
    return ids
  }, [activeEditableFrameId, dragState, resizeState])
  const canvasFrontpageBackgroundStyle = isCanvasFrontpage
    ? {
        backgroundImage: 'radial-gradient(circle at 1px 1px, var(--ax-border-neutral-subtle) 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }
    : undefined

  const handleCanvasZoomChange = useCallback((nextZoom: number) => {
    setCanvasZoom(clampCanvasZoom(nextZoom))
  }, [])

  const handleCanvasZoomReset = useCallback(() => {
    setCanvasZoom(1)
  }, [])

  const setPeriod = (nextPeriod: string) => {
    setPeriodState(nextPeriod)
    savePeriodPreference(nextPeriod)
  }

  const dashboardWidgetFilters = useMemo(
    () => ({
      urlFilters: [],
      dateRange: period,
      pathOperator: 'equals',
      metricType: 'visitors' as const,
      customStartDate,
      customEndDate,
    }),
    [period, customStartDate, customEndDate],
  )

  const activeInsightFrame = useMemo(
    () => (activeInsightFrameId ? (frames.find((frame) => frame.id === activeInsightFrameId) ?? null) : null),
    [activeInsightFrameId, frames],
  )
  const activeEditableFrame = useMemo(
    () => (activeEditableFrameId ? (frames.find((frame) => frame.id === activeEditableFrameId) ?? null) : null),
    [activeEditableFrameId, frames],
  )

  const {
    timerLabel,
    remainingSeconds,
    isTimerRunning,
    isTimerPaused,
    isSavingTimer,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    adjustTimerMinutes,
    refreshTimer,
  } = useCanvasTimerSync({
    enabled: canPersistToDashboard && projectId !== null && dashboardId !== null && canvasInitMode === 'existing',
    projectId,
    dashboardId,
    onSyncError: (message) => setSyncError(message),
  })

  const canvasSyncContextEnabled =
    canPersistToDashboard && projectId !== null && dashboardId !== null && canvasInitMode === 'existing'
  const { activeParticipantCount, activeOtherParticipantCount, shouldEnableBackgroundSync, participantLabels } =
    useCanvasPresence({
      enabled: canvasSyncContextEnabled,
      projectId,
      dashboardId,
    })

  const activeInsightPeriodLabel = useMemo(
    () => getCanvasPeriodLabel(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate],
  )

  useEffect(() => {
    const wasRunning = previousTimerRunningRef.current
    if (!wasRunning && isTimerRunning) {
      const roundedMinutes = Math.max(1, Math.ceil(remainingSeconds / 60))
      setTimerA11yAnnouncement(`Nedtelling startet. ${roundedMinutes} minutter.`)
    } else if (wasRunning && !isTimerRunning && timerLabel === '00:00') {
      setTimerA11yAnnouncement('Tiden er ute.')
    }
    previousTimerRunningRef.current = isTimerRunning
  }, [isTimerRunning, remainingSeconds, timerLabel])

  useEffect(() => {
    if (!timerA11yAnnouncement) return
    const timeoutId = window.setTimeout(() => setTimerA11yAnnouncement(''), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [timerA11yAnnouncement])

  useEffect(() => {
    pageInsightsRef.current = pageInsights
  }, [pageInsights])

  useEffect(() => {
    framesRef.current = frames
  }, [frames])

  useEffect(() => {
    setSelectedFrameIds((current) => current.filter((id) => frames.some((frame) => frame.id === id)))
  }, [frames])

  useEffect(() => {
    if (!activeEditableFrameId) return
    if (frames.some((frame) => frame.id === activeEditableFrameId)) return
    setActiveEditableFrameId(null)
  }, [activeEditableFrameId, frames])

  useEffect(() => {
    let isActive = true
    fetch('/api/bigquery/websites')
      .then((response) => response.json() as Promise<{ data?: Website[] }>)
      .then((payload) => {
        if (!isActive) return
        const websites = Array.isArray(payload?.data) ? payload.data : []
        setAvailableWebsites(websites)
      })
      .catch(() => {
        // Ignore, manual website picker can still be used.
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (selectedWebsite) return
    const websiteIdFromConfig = canvasConfiguredWebsiteId
    const websiteIdFromUrl = new URLSearchParams(window.location.search).get('websiteId')
    const websiteIdToUse = websiteIdFromConfig || websiteIdFromUrl
    if (!websiteIdToUse) return

    let isActive = true
    fetch('/api/bigquery/websites')
      .then((response) => response.json() as Promise<{ data?: Website[] }>)
      .then((payload) => {
        if (!isActive) return
        const websites = Array.isArray(payload?.data) ? payload.data : []
        setAvailableWebsites(websites)
        const matchedWebsite = websites.find((item) => item.id === websiteIdToUse) ?? null
        if (matchedWebsite) {
          setSelectedWebsite(matchedWebsite)
        }
      })
      .catch(() => {
        // Ignore URL bootstrap errors; user can pick website in settings.
      })

    return () => {
      isActive = false
    }
  }, [canvasConfiguredWebsiteId, selectedWebsite])

  const visibleFrames = useMemo(
    () =>
      activeCanvasCategoryId === null
        ? frames
        : frames.filter((frame) => (frame.categoryId ?? null) === activeCanvasCategoryId),
    [activeCanvasCategoryId, frames],
  )

  const visibleConnections = useMemo(
    () =>
      activeCanvasCategoryId === null
        ? connections
        : connections.filter((connection) => (connection.categoryId ?? null) === activeCanvasCategoryId),
    [activeCanvasCategoryId, connections],
  )

  const inventoryItems = useMemo(() => {
    const byKind = new Map<
      CanvasFrame['kind'],
      {
        count: number
        frames: Array<{ id: string; label: string }>
      }
    >()

    for (const option of CANVAS_INVENTORY_KIND_OPTIONS) {
      byKind.set(option.kind, { count: 0, frames: [] })
    }

    for (const frame of visibleFrames) {
      const entry = byKind.get(frame.kind)
      if (!entry) continue
      entry.count += 1
      if (entry.frames.length >= CANVAS_INVENTORY_DETAIL_LIMIT_PER_TYPE) continue

      const fallbackLabel = frame.label.trim() || `${frame.kind} ${frame.id}`
      let label = fallbackLabel
      if (frame.kind === 'heading') {
        label = frame.headingText?.trim() || fallbackLabel
      } else if (frame.kind === 'text' || frame.kind === 'sticky') {
        label = frame.textContent?.trim() || fallbackLabel
      }
      entry.frames.push({
        id: frame.id,
        label,
      })
    }

    return CANVAS_INVENTORY_KIND_OPTIONS.map((option) => {
      const entry = byKind.get(option.kind)
      const count = entry?.count ?? 0
      const frames = entry?.frames ?? []
      return {
        key: option.kind,
        label: option.label,
        count,
        hasMore: count > frames.length,
        frames,
      }
    })
  }, [visibleFrames])

  const frameItems = useMemo(
    () =>
      [...visibleFrames]
        .sort((a, b) => {
          const aPriority = a.kind === 'section' ? 0 : 1
          const bPriority = b.kind === 'section' ? 0 : 1
          if (aPriority !== bPriority) return aPriority - bPriority
          if (a.y !== b.y) return a.y - b.y
          if (a.x !== b.x) return a.x - b.x
          return a.id.localeCompare(b.id)
        })
        .map((frame) => {
          const displayUrl = getWebsiteFrameDisplayUrl(frame)
          return {
            ...frame,
            displayUrl,
            src: getWebsiteFrameRenderSrc(frame) || '',
          }
        }),
    [visibleFrames],
  )

  const showDateFilter = useMemo(
    () =>
      frameItems.some((frame) => frame.kind === 'chart' || (frame.kind === 'website' && !frame.isInternalDashboard)),
    [frameItems],
  )

  const {
    importStickyCsvFileInputRef,
    importStickyCsvFileName,
    importStickyCsvHeaders,
    importStickyCsvRows,
    importStickyContentColumn,
    importStickyStyle,
    importStickyTableMode,
    importStickySectionTitle,
    importStickyCsvError,
    importStickyPreviewNotes,
    importStickyNumericSummary,
    canChooseNonNumericImportStyle,
    shouldImportStickyAsAggregated,
    importStickyCategoricalSummaryRows,
    importStickyNumericSummaryRows,
    importStickyPrivacyFindings,
    hasImportStickyPrivacyFindings,
    importStickyTablePreviewNoteRows,
    importStickyTablePreviewSummaryRows,
    importStickyTablePreviewNumericSummaryRows,
    importStickyTablePreviewPageCount,
    currentImportStickyTablePreviewPage,
    importStickyPrivacyReviewed,
    setImportStickyPrivacyReviewed,
    clearImportStickyCsvError,
    handleClearImportStickyCsvFile,
    handleImportStickyCsvFileChange,
    handleContentColumnChange,
    handleImportStyleChange,
    handleTableModeChange,
    handlePrevTablePreviewPage,
    handleNextTablePreviewPage,
    handleExcludeRow,
    handleImportStickyCsv,
  } = useCanvasCsvImport({
    onImportPrepared: ({ pendingImport, placementLabel }) => {
      setPendingCsvStickyImport(pendingImport)
      setPendingFramePlacementLabel(placementLabel)
      setPendingFramePointer(null)
    },
  })

  const { frameVisualizationData, setWebsiteIframeRef, handleWebsiteFrameLoad } = useCanvasWebsiteVisualization({
    frameItems,
    availableWebsites,
    selectedWebsiteId: selectedWebsite?.id,
    selectedWebsiteDomain: selectedWebsite?.domain,
    canvasConfiguredWebsiteId,
    period,
    customStartDate: customStartDate ?? null,
    customEndDate: customEndDate ?? null,
    clickmapEvents: CLICKMAP_EVENTS,
  })

  const ensureCanvasCategory = useCallback(async (): Promise<number | null> => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) return null
    if (activeCanvasCategoryId !== null) return activeCanvasCategoryId

    const categories = await fetchCategories(projectId, dashboardId)
    setCanvasCategories(categories)
    if (categories.length > 0) {
      const firstCategoryId = categories[0].id
      setActiveCanvasCategoryId(firstCategoryId)
      return firstCategoryId
    }

    const createdCategory = await createCategory(projectId, dashboardId, 'Fane 1')
    setCanvasCategories([createdCategory])
    setActiveCanvasCategoryId(createdCategory.id)
    return createdCategory.id
  }, [activeCanvasCategoryId, canPersistToDashboard, projectId, dashboardId])

  const loadPageInsight = useCallback(
    async (frame: CanvasFrame) => {
      if (frame.kind !== 'website' || frame.isInternalDashboard) return

      const websiteId = selectedWebsite?.id
      const pagePath = frame.targetUrl ? normalizeUrlToPath(frame.targetUrl) : ''

      const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
      if (!websiteId) {
        setPageInsights((current) => ({
          ...current,
          [frame.id]: {
            requestKey: '',
            loading: false,
            error: 'Velg et nettsted først.',
            data: null,
          },
        }))
        return
      }

      if (!pagePath) {
        setPageInsights((current) => ({
          ...current,
          [frame.id]: {
            requestKey: '',
            loading: false,
            error: 'Fant ikke en gyldig side-sti for dette kortet.',
            data: null,
          },
        }))
        return
      }

      if (!dateRange) {
        setPageInsights((current) => ({
          ...current,
          [frame.id]: {
            requestKey: '',
            loading: false,
            error: 'Ugyldig datoperiode.',
            data: null,
          },
        }))
        return
      }

      const { countBy, countBySwitchAt } = getCookieCountByParams(
        usesCookies,
        cookieStartDate,
        dateRange.startDate,
        dateRange.endDate,
      )
      const requestKey = JSON.stringify({
        websiteId,
        pagePath,
        period,
        customStartDate: customStartDate?.toISOString() ?? null,
        customEndDate: customEndDate?.toISOString() ?? null,
        onlyDirectEntry,
        countBy: countBy ?? null,
        countBySwitchAt: countBySwitchAt ?? null,
      })

      const current = pageInsightsRef.current[frame.id]
      if (current?.requestKey === requestKey && !current.error) {
        setActiveInsightFrameId(frame.id)
        return
      }

      setActiveInsightFrameId(frame.id)
      setPageInsights((currentState) => ({
        ...currentState,
        [frame.id]: {
          requestKey,
          loading: true,
          error: null,
          data: current?.requestKey === requestKey ? current.data : null,
        },
      }))

      try {
        const result = await fetchPageMetrics(
          websiteId,
          dateRange.startDate,
          dateRange.endDate,
          pagePath,
          'equals',
          'visitors',
          {
            countByParams: countBy ? `&countBy=${countBy}` : '',
            countBySwitchAtParam: countBySwitchAt ? `&countBySwitchAt=${countBySwitchAt}` : '',
          },
        )

        const row = result.data?.[0] ?? null
        setPageInsights((currentState) => ({
          ...currentState,
          [frame.id]: {
            requestKey,
            loading: false,
            error: null,
            data: row,
          },
        }))
      } catch (error) {
        setPageInsights((currentState) => ({
          ...currentState,
          [frame.id]: {
            requestKey,
            loading: false,
            error: error instanceof Error ? error.message : 'Kunne ikke hente innsikt',
            data: null,
          },
        }))
      }
    },
    [cookieStartDate, customEndDate, customStartDate, onlyDirectEntry, period, selectedWebsite?.id, usesCookies],
  )

  useEffect(() => {
    if (!activeInsightFrame || activeInsightFrame.kind !== 'website') return
    void loadPageInsight(activeInsightFrame)
  }, [activeInsightFrame, loadPageInsight])

  const persistFrame = useCallback(
    async (frame: CanvasFrame): Promise<CanvasFrame> => {
      if (!canPersistToDashboard || projectId === null || dashboardId === null) return frame

      const categoryId = frame.categoryId || (await ensureCanvasCategory())
      if (!categoryId) return frame

      const payload: CanvasConfigPayload = {
        kind: frame.kind,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        websiteId: frame.websiteId,
        targetUrl: frame.targetUrl,
        previewUrl: frame.previewUrl,
        renderWebsite: frame.renderWebsite,
        isInternalDashboard: frame.isInternalDashboard,
        visualizationMode: frame.visualizationMode,
        headingText: frame.headingText,
        headingFontSize: frame.headingFontSize,
        textContent: frame.textContent,
        sectionLayout: frame.sectionLayout,
        tableHeaders: frame.tableHeaders,
        tableRows: frame.tableRows,
        iconName: frame.iconName,
        iconRotationDeg: frame.iconRotationDeg,
        iconColor: frame.iconColor,
        figureType: frame.figureType,
        figureColor: frame.figureColor,
        drawingPath: frame.drawingPath,
        drawingStrokeStyles: frame.drawingStrokeStyles,
        drawingStrokeWidth: frame.drawingStrokeWidth,
        drawingColor: frame.drawingColor,
        isIllustration: frame.isIllustration,
        imageRotationDeg: frame.imageRotationDeg,
        chartType: frame.chartType,
        chartSql: frame.chartSql,
        label: frame.label,
      }
      const serialized = serializeCanvasConfig(payload)

      if (!frame.graphId) {
        const createdGraph = await createGraph(projectId, dashboardId, categoryId, {
          name: buildCanvasStorageGraphName(frame),
          graphType: 'TEXT',
          width: 100,
          description: CANVAS_DASHBOARD_TOKEN,
        })
        const createdQuery = await createQuery(projectId, dashboardId, categoryId, createdGraph.id, {
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
        })
        return {
          ...frame,
          categoryId,
          graphId: createdGraph.id,
          queryId: createdQuery.id,
        }
      }

      if (frame.queryId) {
        await updateQuery(projectId, dashboardId, categoryId, frame.graphId, frame.queryId, {
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
        })
        return frame
      }

      const createdQuery = await createQuery(projectId, dashboardId, categoryId, frame.graphId, {
        name: CANVAS_QUERY_NAME,
        sqlText: serialized,
      })
      return {
        ...frame,
        categoryId,
        queryId: createdQuery.id,
      }
    },
    [canPersistToDashboard, projectId, dashboardId, ensureCanvasCategory],
  )

  const persistConnection = useCallback(
    async (connection: CanvasConnection): Promise<CanvasConnection> => {
      if (!canPersistToDashboard || projectId === null || dashboardId === null) return connection

      const categoryId = connection.categoryId || (await ensureCanvasCategory())
      if (!categoryId) return connection

      const payload: CanvasConfigPayload = {
        kind: 'connection',
        x: 0,
        y: 0,
        label: 'Connection',
        fromFrameId: connection.fromFrameId,
        toFrameId: connection.toFrameId,
        fromGraphId: connection.fromGraphId,
        toGraphId: connection.toGraphId,
      }
      const serialized = serializeCanvasConfig(payload)

      if (!connection.graphId) {
        const createdGraph = await createGraph(projectId, dashboardId, categoryId, {
          name: buildCanvasConnectionStorageGraphName(connection),
          graphType: 'TEXT',
          width: 100,
          description: CANVAS_DASHBOARD_TOKEN,
        })
        const createdQuery = await createQuery(projectId, dashboardId, categoryId, createdGraph.id, {
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
        })
        return {
          ...connection,
          categoryId,
          graphId: createdGraph.id,
          queryId: createdQuery.id,
        }
      }

      if (connection.queryId) {
        await updateQuery(projectId, dashboardId, categoryId, connection.graphId, connection.queryId, {
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
        })
        return connection
      }

      const createdQuery = await createQuery(projectId, dashboardId, categoryId, connection.graphId, {
        name: CANVAS_QUERY_NAME,
        sqlText: serialized,
      })
      return {
        ...connection,
        categoryId,
        queryId: createdQuery.id,
      }
    },
    [canPersistToDashboard, projectId, dashboardId, ensureCanvasCategory],
  )

  useEffect(() => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null || canvasInitMode !== 'existing') {
      setFrames((prev) => (prev.length > 0 ? [] : prev))
      setConnections((prev) => (prev.length > 0 ? [] : prev))
      setCanvasCategories([])
      setActiveCanvasCategoryId(null)
      return
    }

    let isActive = true
    const loadCanvasItems = async () => {
      setIsLoadingCanvasItems(true)
      setSyncError(null)
      try {
        const data = await fetchCanvasStorageData(projectId, dashboardId)
        if (!isActive) return
        setCanvasCategories(data.categories)
        if (data.categories.length > 0) {
          setActiveCanvasCategoryId((current) =>
            current && data.categories.some((category) => category.id === current)
              ? current
              : initialCategoryId && data.categories.some((category) => category.id === initialCategoryId)
                ? initialCategoryId
                : data.categories[0].id,
          )
        } else {
          setActiveCanvasCategoryId(null)
        }

        if (!isActive) return
        setFrames(data.frames)
        setConnections(data.connections)
      } catch (error) {
        if (!isActive) return
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke laste canvas-data')
      } finally {
        if (isActive) setIsLoadingCanvasItems(false)
      }
    }

    void loadCanvasItems()
    return () => {
      isActive = false
    }
  }, [canPersistToDashboard, projectId, dashboardId, canvasInitMode, initialCategoryId])

  useCanvasBackgroundSync({
    enabled: canvasSyncContextEnabled && shouldEnableBackgroundSync,
    projectId,
    dashboardId,
    initialCategoryId,
    activeCanvasCategoryId,
    lockedFrameIds,
    setCanvasCategories,
    setActiveCanvasCategoryId,
    setFrames,
    setConnections,
    setSyncError,
  })

  const {
    acquireLock: acquireEditLock,
    releaseLock: releaseEditLock,
    getFrameLockStatus,
  } = useCanvasEditLocks({
    enabled: canvasSyncContextEnabled && (shouldEnableBackgroundSync || activeEditableFrameId !== null),
    projectId,
    dashboardId,
    activeEditableFrame,
    onLostActiveLock: () => {
      setActiveEditableFrameId(null)
      setSyncError('Kortet blir redigert av en kollega akkurat nå.')
    },
  })

  useEffect(() => {
    if (!canPersistToDashboard) return
    const firstCategoryId = canvasCategories[0]?.id ?? null
    const shouldPersistCategoryId =
      activeCanvasCategoryId !== null && firstCategoryId !== null && activeCanvasCategoryId !== firstCategoryId
    const nextCategoryId = shouldPersistCategoryId ? String(activeCanvasCategoryId) : null
    const params = new URLSearchParams(window.location.search)
    const currentCategoryId = params.get('categoryId')
    if (currentCategoryId === nextCategoryId) return

    if (nextCategoryId) params.set('categoryId', nextCategoryId)
    else params.delete('categoryId')

    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [activeCanvasCategoryId, canPersistToDashboard, canvasCategories])

  useEffect(() => {
    if (canvasCategories.length === 0) {
      if (activeCanvasCategoryId !== null) {
        setActiveCanvasCategoryId(null)
      }
      return
    }
    if (activeCanvasCategoryId !== null && canvasCategories.some((category) => category.id === activeCanvasCategoryId))
      return
    setActiveCanvasCategoryId(canvasCategories[0].id)
  }, [activeCanvasCategoryId, canvasCategories])

  useEffect(() => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) {
      setCanvasInitMode('create')
      setCanvasTitle('Innblikk')
      setCanvasDashboardDescription(CANVAS_DASHBOARD_TOKEN)
      setCanvasConfiguredWebsiteId(null)
      return
    }
    let isActive = true
    setCanvasInitMode('checking')

    const loadCanvasTitle = async () => {
      try {
        const dashboards = await fetchDashboards(projectId)
        if (!isActive) return
        const dashboard = dashboards.find((item) => item.id === dashboardId)
        if (!dashboard) {
          setCanvasInitMode('create')
          setCanvasTitle('Canvas')
          setCanvasDashboardDescription(CANVAS_DASHBOARD_TOKEN)
          setCanvasConfiguredWebsiteId(null)
          return
        }
        setCanvasInitMode('existing')
        setCanvasTitle(dashboard.name?.trim() || 'Canvas')
        const dashboardDescription = dashboard.description || CANVAS_DASHBOARD_TOKEN
        setCanvasDashboardDescription(dashboardDescription)
        setCanvasConfiguredWebsiteId(extractCanvasWebsiteIdFromDescription(dashboardDescription))
      } catch {
        if (!isActive) return
        setCanvasInitMode('create')
        setCanvasTitle('Canvas')
        setCanvasDashboardDescription(CANVAS_DASHBOARD_TOKEN)
        setCanvasConfiguredWebsiteId(null)
      }
    }

    void loadCanvasTitle()
    return () => {
      isActive = false
    }
  }, [canPersistToDashboard, isCanvasFrontpage, projectId, dashboardId])

  const loadExistingCanvasOptions = useCallback(async (projectIdToLoad: number | null) => {
    if (projectIdToLoad === null) {
      setExistingCanvasOptions([])
      setExistingCanvasError(null)
      return
    }

    setIsLoadingExistingCanvasOptions(true)
    setExistingCanvasError(null)
    try {
      const dashboards = await fetchDashboards(projectIdToLoad)
      const options = dashboards
        .filter((dashboard) => isCanvasDashboardDescription(dashboard.description))
        .map((dashboard) => ({
          id: dashboard.id,
          name: dashboard.name?.trim() || `Canvas ${dashboard.id}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'nb', { sensitivity: 'base' }))
      setExistingCanvasOptions(options)
    } catch (error) {
      setExistingCanvasOptions([])
      setExistingCanvasError(error instanceof Error ? error.message : 'Kunne ikke laste canvas')
    } finally {
      setIsLoadingExistingCanvasOptions(false)
    }
  }, [])

  useEffect(() => {
    if (!shouldShowCreateCanvasModal) return
    let isActive = true
    setCreateCanvasError(null)

    void (async () => {
      try {
        const projects = await fetchProjects()
        if (!isActive) return
        const options = projects.map((item) => ({
          id: item.id,
          name: item.name?.trim() || `Team ${item.id}`,
        }))
        options.sort((a, b) => a.name.localeCompare(b.name, 'nb', { sensitivity: 'base' }))
        setCreateCanvasProjectOptions(options)
        const lastVisitedProjectId = (() => {
          if (typeof window === 'undefined') return null
          const raw = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)
          const parsed = Number(raw)
          return Number.isFinite(parsed) ? parsed : null
        })()
        const preferredProjectId =
          projectId !== null && options.some((option) => option.id === projectId)
            ? projectId
            : lastVisitedProjectId !== null && options.some((option) => option.id === lastVisitedProjectId)
              ? lastVisitedProjectId
              : null
        setCreateCanvasProjectId(preferredProjectId ? String(preferredProjectId) : '')
        await loadExistingCanvasOptions(preferredProjectId)
      } catch (error) {
        if (!isActive) return
        setCreateCanvasProjectOptions([])
        setCreateCanvasProjectId('')
        setExistingCanvasOptions([])
        setExistingCanvasError(null)
        setCreateCanvasError(error instanceof Error ? error.message : 'Kunne ikke laste team')
      }
    })()
    return () => {
      isActive = false
    }
  }, [loadExistingCanvasOptions, projectId, shouldShowCreateCanvasModal])

  useEffect(() => {
    if (canvasInitMode !== 'existing') {
      setSyncError(null)
    }
  }, [canvasInitMode])

  useEffect(() => {
    const toolbar = canvasToolbarRef.current
    if (!toolbar) return

    const updateToolbarHeight = () => {
      setCanvasToolbarHeight(Math.ceil(toolbar.getBoundingClientRect().height))
    }

    updateToolbarHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateToolbarHeight)
      return () => window.removeEventListener('resize', updateToolbarHeight)
    }

    const observer = new ResizeObserver(() => updateToolbarHeight())
    observer.observe(toolbar)

    return () => {
      observer.disconnect()
    }
  }, [])

  const queueFrameForPlacement = useCallback((draft: PendingCanvasFrameDraft, label: string) => {
    setPendingFrameDraft(draft)
    setPendingFramePlacementLabel(label)
    setPendingFramePointer(null)
  }, [])

  const cancelPendingFramePlacement = useCallback(() => {
    setPendingFrameDraft(null)
    setPendingCsvStickyImport(null)
    setPendingFramePlacementLabel(null)
    setPendingFramePointer(null)
  }, [])

  useEffect(() => {
    if (!pendingFrameDraft && !pendingCsvStickyImport) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelPendingFramePlacement()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancelPendingFramePlacement, pendingCsvStickyImport, pendingFrameDraft])

  const handleAddPage = () => {
    const websiteId = selectedWebsite?.id || canvasConfiguredWebsiteId
    if (!websiteId) {
      setAddPageError('Velg nettside.')
      return
    }

    const targetUrl = normalizeInputToTargetUrl(newPagePathInput, selectedWebsite?.domain)
    if (!targetUrl) {
      setAddPageError('Legg inn en gyldig URL, for eksempel https://www.nav.no/aap.')
      return
    }

    const previewInput = newPagePreviewUrlInput.trim()
    const previewUrl = previewInput ? normalizeInputToTargetUrl(previewInput, selectedWebsite?.domain) : undefined
    if (!newPageRenderEnabled && previewInput && !previewUrl) {
      setAddPageError('Legg inn en gyldig visnings-URL, for eksempel https://www.nav.no/...')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'website',
      websiteId,
      targetUrl,
      previewUrl: newPageRenderEnabled ? undefined : (previewUrl ?? undefined),
      renderWebsite: newPageRenderEnabled,
      visualizationMode: newPageVisualizationMode || undefined,
      label: getFrameLabel(targetUrl),
      width: 420,
      height: 560,
      refreshNonce: 1,
    }
    queueFrameForPlacement(frameDraft, 'nettside')
    setNewPagePathInput('')
    setNewPagePreviewUrlInput('')
    setNewPageVisualizationMode('')
    setAddPageError(null)
    setIsAddPageModalOpen(false)
  }

  const handleAddImage = () => {
    const imageUrl = normalizeInputToTargetUrl(newImageUrlInput, selectedWebsite?.domain)
    if (!imageUrl) {
      setAddImageError('Legg inn en gyldig bilde-URL, for eksempel https://www.nav.no/bilde.png.')
      return
    }

    const comparableUrl = getComparableUrl(imageUrl)
    if (
      frames.some(
        (frame) => frame.kind === 'image' && frame.targetUrl && getComparableUrl(frame.targetUrl) === comparableUrl,
      )
    ) {
      setAddImageError('Bildet er allerede lagt til i canvaset.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'image',
      targetUrl: imageUrl,
      label: getFrameLabel(imageUrl),
      width: 420,
      height: 420,
      refreshNonce: 1,
    }
    queueFrameForPlacement(frameDraft, 'bilde')
    setNewImageUrlInput('')
    setAddImageError(null)
    setIsAddImageModalOpen(false)
  }

  const handleAddIllustration = async () => {
    const selectedIllustration = getCanvasIllustrationOptionByPath(selectedIllustrationPath)
    if (!selectedIllustration) {
      setAddIllustrationError('Fant ingen illustrasjon å legge til.')
      return
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      if (editIllustrationFrameId) {
        const currentFrame = frames.find((frame) => frame.id === editIllustrationFrameId)
        if (!currentFrame || currentFrame.kind !== 'image') return
        const updatedFrame: CanvasFrame = {
          ...currentFrame,
          targetUrl: selectedIllustration.path,
          label: selectedIllustration.label,
          isIllustration: true,
          imageRotationDeg: currentFrame.imageRotationDeg ?? 0,
          refreshNonce: currentFrame.refreshNonce + 1,
        }
        const persistedFrame = await persistFrame(updatedFrame)
        setFrames((prev) => prev.map((frame) => (frame.id === editIllustrationFrameId ? persistedFrame : frame)))
      } else {
        const frameDraft: PendingCanvasFrameDraft = {
          kind: 'image',
          targetUrl: selectedIllustration.path,
          label: selectedIllustration.label,
          isIllustration: true,
          imageRotationDeg: 0,
          width: 420,
          height: 420,
          refreshNonce: 1,
        }
        queueFrameForPlacement(frameDraft, 'illustrasjon')
      }
      setAddIllustrationError(null)
      setEditIllustrationFrameId(null)
      setIsAddIllustrationModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre illustrasjon i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const loadDashboardOptions = useCallback(async (projectIdToLoad: number | null) => {
    if (projectIdToLoad === null) {
      setDashboardOptions([])
      setSelectedDashboardToAddId('')
      return
    }

    setIsLoadingDashboardOptions(true)
    setAddDashboardError(null)

    try {
      const dashboards = (await fetchDashboards(projectIdToLoad)).filter(
        (dashboard) => !isCanvasDashboardDescription(dashboard.description),
      )
      const options = dashboards.map((dashboard) => ({
        id: dashboard.id,
        name: dashboard.name?.trim() || `Dashboard ${dashboard.id}`,
      }))
      setDashboardOptions(options)
      setSelectedDashboardToAddId((prev) => {
        if (prev && options.some((option) => String(option.id) === prev)) return prev
        return options[0] ? String(options[0].id) : ''
      })
    } catch (error) {
      setDashboardOptions([])
      setSelectedDashboardToAddId('')
      setAddDashboardError(error instanceof Error ? error.message : 'Kunne ikke laste dashboards')
    } finally {
      setIsLoadingDashboardOptions(false)
    }
  }, [])

  const handleOpenAddDashboardModal = () => {
    setAddDashboardError(null)
    setIsAddDashboardModalOpen(true)
    void (async () => {
      setIsLoadingDashboardOptions(true)
      try {
        const projects = await fetchProjects()
        const options = projects.map((item) => ({
          id: item.id,
          name: item.name?.trim() || `Team ${item.id}`,
        }))
        setProjectOptions(options)
        const preferredProjectId =
          projectId !== null && options.some((option) => option.id === projectId) ? projectId : (options[0]?.id ?? null)
        setSelectedProjectToAddId(preferredProjectId ? String(preferredProjectId) : '')
        await loadDashboardOptions(preferredProjectId)
      } catch (error) {
        setProjectOptions([])
        setSelectedProjectToAddId('')
        setDashboardOptions([])
        setSelectedDashboardToAddId('')
        setAddDashboardError(error instanceof Error ? error.message : 'Kunne ikke laste team')
      } finally {
        setIsLoadingDashboardOptions(false)
      }
    })()
  }

  const handleAddDashboardCard = () => {
    const selectedDashboard = dashboardOptions.find((option) => String(option.id) === selectedDashboardToAddId)
    if (!selectedDashboard) {
      setAddDashboardError('Velg et dashboard.')
      return
    }

    const selectedProjectId = Number(selectedProjectToAddId)
    const normalizedProjectId = Number.isFinite(selectedProjectId) ? selectedProjectId : null
    const dashboardUrl =
      normalizedProjectId !== null
        ? `/dashboard/${selectedDashboard.id}?projectId=${normalizedProjectId}&focused=true`
        : null
    if (!dashboardUrl) {
      setAddDashboardError('Mangler prosjekt-kontekst. Åpne canvas fra ProjectManager.')
      return
    }

    const comparableUrl = getComparableUrl(window.location.origin + dashboardUrl)
    if (
      frames.some(
        (frame) =>
          frame.kind === 'website' &&
          frame.targetUrl &&
          getComparableUrl(
            frame.targetUrl.startsWith('/') ? window.location.origin + frame.targetUrl : frame.targetUrl,
          ) === comparableUrl,
      )
    ) {
      setAddDashboardError('Dashboardet er allerede lagt til i canvaset.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'website',
      targetUrl: dashboardUrl,
      previewUrl: dashboardUrl,
      renderWebsite: false,
      isInternalDashboard: true,
      label: selectedDashboard.name,
      width: 760,
      height: 620,
      refreshNonce: 1,
    }
    queueFrameForPlacement(frameDraft, 'dashboard')
    setAddDashboardError(null)
    setIsAddDashboardModalOpen(false)
  }

  const loadEditDashboardOptions = useCallback(async (projectIdToLoad: number | null) => {
    if (projectIdToLoad === null) {
      setEditDashboardOptions([])
      setEditDashboardSelectedDashboardId('')
      return
    }

    setIsLoadingEditDashboardOptions(true)
    setEditDashboardError(null)

    try {
      const dashboards = (await fetchDashboards(projectIdToLoad)).filter(
        (dashboard) => !isCanvasDashboardDescription(dashboard.description),
      )
      const options = dashboards.map((dashboard) => ({
        id: dashboard.id,
        name: dashboard.name?.trim() || `Dashboard ${dashboard.id}`,
      }))
      setEditDashboardOptions(options)
      setEditDashboardSelectedDashboardId((prev) => {
        if (prev && options.some((option) => String(option.id) === prev)) return prev
        return options[0] ? String(options[0].id) : ''
      })
    } catch (error) {
      setEditDashboardOptions([])
      setEditDashboardSelectedDashboardId('')
      setEditDashboardError(error instanceof Error ? error.message : 'Kunne ikke laste dashboards')
    } finally {
      setIsLoadingEditDashboardOptions(false)
    }
  }, [])

  const handleOpenEditWebsiteModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'website' || frame.isInternalDashboard) return
    setEditWebsiteFrameId(frame.id)
    setEditWebsitePathInput(frame.targetUrl || '')
    setEditWebsitePreviewUrlInput(frame.previewUrl || '')
    setEditWebsiteRenderEnabled(frame.renderWebsite !== false)
    setEditWebsiteVisualizationMode(getCanvasFrameVisualizationMode(frame))
    setEditWebsiteError(null)
    setIsEditWebsiteModalOpen(true)
  }

  const handleOpenEditDashboardModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'website' || !frame.isInternalDashboard) return
    setEditDashboardFrameId(frame.id)
    setEditDashboardError(null)
    setIsEditDashboardModalOpen(true)

    void (async () => {
      setIsLoadingEditDashboardOptions(true)
      try {
        const projects = await fetchProjects()
        const projectOptions = projects.map((item) => ({
          id: item.id,
          name: item.name?.trim() || `Team ${item.id}`,
        }))
        setEditDashboardProjectOptions(projectOptions)
        const parsedTarget = parseDashboardTargetUrl(frame.targetUrl)
        const preferredProjectId =
          parsedTarget.projectId !== null && projectOptions.some((option) => option.id === parsedTarget.projectId)
            ? parsedTarget.projectId
            : projectId !== null && projectOptions.some((option) => option.id === projectId)
              ? projectId
              : (projectOptions[0]?.id ?? null)
        setEditDashboardSelectedProjectId(preferredProjectId ? String(preferredProjectId) : '')

        const dashboards =
          preferredProjectId !== null
            ? (await fetchDashboards(preferredProjectId)).filter(
                (dashboard) => !isCanvasDashboardDescription(dashboard.description),
              )
            : []
        const dashboardOptions = dashboards.map((dashboard) => ({
          id: dashboard.id,
          name: dashboard.name?.trim() || `Dashboard ${dashboard.id}`,
        }))
        setEditDashboardOptions(dashboardOptions)
        const preferredDashboardId =
          parsedTarget.dashboardId !== null && dashboardOptions.some((option) => option.id === parsedTarget.dashboardId)
            ? parsedTarget.dashboardId
            : (dashboardOptions[0]?.id ?? null)
        setEditDashboardSelectedDashboardId(preferredDashboardId ? String(preferredDashboardId) : '')
      } catch (error) {
        setEditDashboardProjectOptions([])
        setEditDashboardSelectedProjectId('')
        setEditDashboardOptions([])
        setEditDashboardSelectedDashboardId('')
        setEditDashboardError(error instanceof Error ? error.message : 'Kunne ikke laste team')
      } finally {
        setIsLoadingEditDashboardOptions(false)
      }
    })()
  }

  const handleOpenEditImageModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'image') return
    setEditImageFrameId(frame.id)
    setEditImageUrlInput(frame.targetUrl || '')
    setEditImageError(null)
    setIsEditImageModalOpen(true)
  }

  const handleOpenEditIllustrationModal = (frame: CanvasFrame) => {
    if (!isIllustrationImageFrame(frame)) return
    setEditIllustrationFrameId(frame.id)
    setSelectedIllustrationPath(frame.targetUrl || DEFAULT_CANVAS_ILLUSTRATION_PATH)
    setAddIllustrationError(null)
    setIsAddIllustrationModalOpen(true)
  }

  const handleOpenEditIconModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'icon') return
    setEditIconFrameId(frame.id)
    setEditIconSelectedId(frame.iconName || DEFAULT_CANVAS_ICON_ID)
    setEditIconSelectedColor(getCanvasIconColor(frame.iconColor))
    setEditIconError(null)
    setIsEditIconModalOpen(true)
  }

  const handleOpenEditFigureModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'figure') return
    setEditFigureFrameId(frame.id)
    setEditFigureSelectedType(frame.figureType ?? 'rectangle')
    setEditFigureSelectedColor(getCanvasIconColor(frame.figureColor))
    setEditFigureError(null)
    setIsEditFigureModalOpen(true)
  }

  const handleToggleInsightPanel = (frame: CanvasFrame) => {
    if (frame.kind !== 'website' || frame.isInternalDashboard) return
    setActiveInsightFrameId((current) => (current === frame.id ? null : frame.id))
  }

  const handleDuplicateWebsiteCard = (frame: CanvasFrame) => {
    if (frame.kind !== 'website' || frame.isInternalDashboard) return
    setAddPageError(null)
    setNewPagePathInput(frame.targetUrl || '')
    setNewPageRenderEnabled(frame.renderWebsite !== false)
    setNewPagePreviewUrlInput(frame.previewUrl || '')
    setNewPageVisualizationMode(getCanvasFrameVisualizationMode(frame))
    setIsAddPageModalOpen(true)
  }

  const handleDuplicateIconCard = async (frame: CanvasFrame) => {
    if (frame.kind !== 'icon') return

    const defaults = getDefaultFrameSize(frame)
    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
      width: frame.width ?? defaults.width,
      height: frame.height ?? defaults.height,
      graphId: undefined,
      queryId: undefined,
      refreshNonce: 0,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(duplicatedFrame)
      setFrames((prev) => [...prev, persistedFrame])
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke duplisere ikon')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleDuplicateFigureCard = async (frame: CanvasFrame) => {
    if (frame.kind !== 'figure') return

    const defaults = getDefaultFrameSize(frame)
    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
      width: frame.width ?? defaults.width,
      height: frame.height ?? defaults.height,
      graphId: undefined,
      queryId: undefined,
      refreshNonce: 0,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(duplicatedFrame)
      setFrames((prev) => [...prev, persistedFrame])
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke duplisere figur')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleSaveEditedWebsite = async () => {
    if (!editWebsiteFrameId) return

    const targetUrl = normalizeInputToTargetUrl(editWebsitePathInput, selectedWebsite?.domain)
    if (!targetUrl) {
      setEditWebsiteError('Legg inn en gyldig URL, for eksempel https://www.nav.no/aap.')
      return
    }

    const previewInput = editWebsitePreviewUrlInput.trim()
    const previewUrl = previewInput ? normalizeInputToTargetUrl(previewInput, selectedWebsite?.domain) : undefined
    if (!editWebsiteRenderEnabled && previewInput && !previewUrl) {
      setEditWebsiteError('Legg inn en gyldig visnings-URL, for eksempel https://www.nav.no/...')
      return
    }

    const currentFrame = frames.find((frame) => frame.id === editWebsiteFrameId)
    if (!currentFrame || currentFrame.kind !== 'website') return

    const updatedFrame: CanvasFrame = {
      ...currentFrame,
      websiteId: selectedWebsite?.id || currentFrame.websiteId || canvasConfiguredWebsiteId || undefined,
      targetUrl,
      previewUrl: editWebsiteRenderEnabled ? undefined : (previewUrl ?? undefined),
      renderWebsite: editWebsiteRenderEnabled,
      visualizationMode: editWebsiteVisualizationMode || undefined,
      label: getFrameLabel(targetUrl),
      refreshNonce: currentFrame.refreshNonce + 1,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((frame) => (frame.id === editWebsiteFrameId ? persistedFrame : frame)))
      setIsEditWebsiteModalOpen(false)
      setEditWebsiteFrameId(null)
      setEditWebsitePreviewUrlInput('')
      setEditWebsiteVisualizationMode('')
      setEditWebsiteError(null)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke oppdatere nettside')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleSaveEditedDashboard = async () => {
    if (!editDashboardFrameId) return

    const selectedProjectId = Number(editDashboardSelectedProjectId)
    const selectedDashboardId = Number(editDashboardSelectedDashboardId)
    const normalizedProjectId = Number.isFinite(selectedProjectId) ? selectedProjectId : null
    const normalizedDashboardId = Number.isFinite(selectedDashboardId) ? selectedDashboardId : null

    if (normalizedProjectId === null || normalizedDashboardId === null) {
      setEditDashboardError('Velg team og dashboard.')
      return
    }

    const selectedDashboard = editDashboardOptions.find((option) => option.id === normalizedDashboardId)
    if (!selectedDashboard) {
      setEditDashboardError('Velg et gyldig dashboard.')
      return
    }

    const targetUrl = `/dashboard/${normalizedDashboardId}?projectId=${normalizedProjectId}&focused=true`
    const comparableUrl = getComparableUrl(window.location.origin + targetUrl)
    if (
      frames.some(
        (frame) =>
          frame.id !== editDashboardFrameId &&
          frame.kind === 'website' &&
          frame.targetUrl &&
          getComparableUrl(
            frame.targetUrl.startsWith('/') ? window.location.origin + frame.targetUrl : frame.targetUrl,
          ) === comparableUrl,
      )
    ) {
      setEditDashboardError('Dashboardet er allerede lagt til i canvaset.')
      return
    }

    const currentFrame = frames.find((frame) => frame.id === editDashboardFrameId)
    if (!currentFrame || currentFrame.kind !== 'website' || !currentFrame.isInternalDashboard) return

    const updatedFrame: CanvasFrame = {
      ...currentFrame,
      targetUrl,
      previewUrl: targetUrl,
      renderWebsite: false,
      isInternalDashboard: true,
      label: selectedDashboard.name,
      refreshNonce: currentFrame.refreshNonce + 1,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((frame) => (frame.id === editDashboardFrameId ? persistedFrame : frame)))
      setIsEditDashboardModalOpen(false)
      setEditDashboardFrameId(null)
      setEditDashboardError(null)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke oppdatere dashboard')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleSaveEditedImage = async () => {
    if (!editImageFrameId) return

    const imageUrl = normalizeInputToTargetUrl(editImageUrlInput, selectedWebsite?.domain)
    if (!imageUrl) {
      setEditImageError('Legg inn en gyldig bilde-URL, for eksempel https://www.nav.no/bilde.png.')
      return
    }

    const comparableUrl = getComparableUrl(imageUrl)
    if (
      frames.some(
        (frame) =>
          frame.id !== editImageFrameId &&
          frame.kind === 'image' &&
          frame.targetUrl &&
          getComparableUrl(frame.targetUrl) === comparableUrl,
      )
    ) {
      setEditImageError('Bildet er allerede lagt til i canvaset.')
      return
    }

    const currentFrame = frames.find((frame) => frame.id === editImageFrameId)
    if (!currentFrame || currentFrame.kind !== 'image') return

    const updatedFrame: CanvasFrame = {
      ...currentFrame,
      targetUrl: imageUrl,
      label: getFrameLabel(imageUrl),
      refreshNonce: currentFrame.refreshNonce + 1,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((frame) => (frame.id === editImageFrameId ? persistedFrame : frame)))
      setFailedImageFrameIds((current) => {
        if (!current[editImageFrameId]) return current
        const next = { ...current }
        delete next[editImageFrameId]
        return next
      })
      setIsEditImageModalOpen(false)
      setEditImageFrameId(null)
      setEditImageUrlInput('')
      setEditImageError(null)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke oppdatere bilde')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleSaveEditedIcon = async () => {
    if (!editIconFrameId) return
    const currentFrame = frames.find((frame) => frame.id === editIconFrameId)
    if (!currentFrame || currentFrame.kind !== 'icon') return

    const selectedIcon = getCanvasIconOptionById(editIconSelectedId)
    if (!selectedIcon) {
      setEditIconError('Velg et ikon.')
      return
    }

    const updatedFrame: CanvasFrame = {
      ...currentFrame,
      iconName: selectedIcon.id,
      iconColor: getCanvasIconColor(editIconSelectedColor),
      label: selectedIcon.label,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((frame) => (frame.id === editIconFrameId ? persistedFrame : frame)))
      setIsEditIconModalOpen(false)
      setEditIconFrameId(null)
      setEditIconError(null)
    } catch (error) {
      setEditIconError(error instanceof Error ? error.message : 'Kunne ikke oppdatere ikon')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleSaveEditedFigure = async () => {
    if (!editFigureFrameId) return
    const currentFrame = frames.find((frame) => frame.id === editFigureFrameId)
    if (!currentFrame || currentFrame.kind !== 'figure') return

    const selectedFigure = CANVAS_FIGURE_OPTIONS.find((option) => option.id === editFigureSelectedType)
    if (!selectedFigure) {
      setEditFigureError('Velg en figur.')
      return
    }

    const updatedFrame: CanvasFrame = {
      ...currentFrame,
      figureType: selectedFigure.id,
      figureColor: getCanvasIconColor(editFigureSelectedColor),
      label: selectedFigure.label,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((frame) => (frame.id === editFigureFrameId ? persistedFrame : frame)))
      setIsEditFigureModalOpen(false)
      setEditFigureFrameId(null)
      setEditFigureError(null)
    } catch (error) {
      setEditFigureError(error instanceof Error ? error.message : 'Kunne ikke oppdatere figur')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const getCanvasPointerPosition = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const viewport = canvasViewportRef.current
      if (!viewport) return null

      const rect = viewport.getBoundingClientRect()
      return {
        x: (clientX - rect.left + viewport.scrollLeft) / canvasZoom,
        y: (clientY - rect.top + viewport.scrollTop - canvasCanvasTopOffset) / canvasZoom,
      }
    },
    [canvasCanvasTopOffset, canvasZoom],
  )

  const handleFinalizeDrawing = useCallback(
    async ({ strokes }: { strokes: CanvasDrawingStroke[] }) => {
      const normalizedStrokes = strokes
        .map((stroke) => ({
          ...stroke,
          points: stroke.points.length === 1 ? [stroke.points[0], stroke.points[0]] : stroke.points,
        }))
        .filter((stroke) => stroke.points.length > 0)
      const allPoints = normalizedStrokes.flatMap((stroke) => stroke.points)
      if (allPoints.length === 0) return

      const minX = Math.min(...allPoints.map((point) => point.x))
      const maxX = Math.max(...allPoints.map((point) => point.x))
      const minY = Math.min(...allPoints.map((point) => point.y))
      const maxY = Math.max(...allPoints.map((point) => point.y))
      const maxStrokeWidth = normalizedStrokes.reduce((maxValue, stroke) => Math.max(maxValue, stroke.strokeWidth), 0)
      const padding = Math.max(4, maxStrokeWidth)
      const baseX = minX - padding
      const baseY = minY - padding
      const width = Math.max(28, maxX - minX + padding * 2)
      const height = Math.max(28, maxY - minY + padding * 2)
      const drawingPath = normalizedStrokes
        .map((stroke) =>
          stroke.points.map((point) => `${(point.x - baseX).toFixed(2)},${(point.y - baseY).toFixed(2)}`).join(' '),
        )
        .join(' | ')
      const drawingStrokeStyles = JSON.stringify(
        normalizedStrokes.map((stroke) => ({
          color: getCanvasIconColor(stroke.color),
          strokeWidth: stroke.strokeWidth,
        })),
      )

      const nextFrame: CanvasFrame = {
        id: `${Date.now()}-${Math.random()}`,
        kind: 'drawing',
        drawingPath,
        drawingStrokeStyles,
        drawingStrokeWidth: normalizedStrokes[0]?.strokeWidth ?? DEFAULT_DRAWING_STROKE_WIDTH,
        drawingColor: getCanvasIconColor(normalizedStrokes[0]?.color),
        label: 'Tegning',
        x: Math.max(0, baseX),
        y: Math.max(-CANVAS_TOP_BUFFER, baseY),
        width,
        height,
        refreshNonce: 0,
      }

      try {
        setIsSavingCanvasItem(true)
        setSyncError(null)
        const persistedFrame = await persistFrame(nextFrame)
        setFrames((prev) => [...prev, persistedFrame])
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre tegning')
      } finally {
        setIsSavingCanvasItem(false)
      }
    },
    [persistFrame],
  )

  const {
    isDrawingMode,
    drawingStrokeColor,
    drawingStrokeWidth,
    activeDrawingStroke,
    drawingDraftStrokes,
    setDrawingStrokeColor,
    setDrawingStrokeWidth,
    openDrawingMode,
    exitDrawingMode: handleExitDrawingMode,
    undoDrawingStroke: handleUndoDrawingStroke,
    startDrawingAt,
    continueDrawingAt,
    completeDrawing: handleCompleteDrawing,
  } = useCanvasDrawingTool({
    getCanvasPointerPosition,
    onCompleteDrawing: handleFinalizeDrawing,
    defaultColor: DEFAULT_CANVAS_ICON_COLOR,
    defaultStrokeWidth: DEFAULT_DRAWING_STROKE_WIDTH,
  })

  const handlePlacePendingFrame = useCallback(
    async (clientX: number, clientY: number) => {
      if (!pendingFrameDraft) return
      const pointer = getCanvasPointerPosition(clientX, clientY)
      if (!pointer) return

      const width = pendingFrameDraft.width ?? 240
      const height = pendingFrameDraft.height ?? 180
      const nextFrame: CanvasFrame = {
        ...pendingFrameDraft,
        id: `${Date.now()}-${Math.random()}`,
        x: Math.max(0, pointer.x - width / 2),
        y: Math.max(-CANVAS_TOP_BUFFER, pointer.y - height / 2),
      }

      try {
        setIsSavingCanvasItem(true)
        setSyncError(null)
        const persistedFrame = await persistFrame(nextFrame)
        setFrames((prev) => [...prev, persistedFrame])
        setPendingFrameDraft(null)
        setPendingFramePlacementLabel(null)
        setPendingFramePointer(null)
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre element i canvas')
      } finally {
        setIsSavingCanvasItem(false)
      }
    },
    [getCanvasPointerPosition, pendingFrameDraft, persistFrame],
  )

  const handlePlacePendingCsvImport = useCallback(
    async (clientX: number, clientY: number) => {
      if (!pendingCsvStickyImport) return
      if (isImportingStickyCsvRef.current) return
      const pointer = getCanvasPointerPosition(clientX, clientY)
      if (!pointer) return

      const stickyWidth = 320
      const stickyHeight = 180
      const columnGap = 24
      const stickyGap = 18
      const cardsPerRow = 2
      const sectionTitle = pendingCsvStickyImport.sectionTitle.trim()
      const sectionLabel = sectionTitle || getNextAutoSectionLabel(frames)
      const sectionHeaderHeight = 92
      const sectionPaddingX = 24
      const sectionPaddingBottom = 24
      const baseX = Math.max(0, pointer.x)
      const baseY = Math.max(-CANVAS_TOP_BUFFER, pointer.y)
      const contentStartX = baseX + sectionPaddingX
      const contentStartY = baseY + sectionHeaderHeight
      const timestampSeed = Date.now()
      const importedFrames: CanvasFrame[] = []
      const isTableImport =
        Array.isArray(pendingCsvStickyImport.tableHeaders) &&
        pendingCsvStickyImport.tableHeaders.length > 0 &&
        Array.isArray(pendingCsvStickyImport.tableRows)

      if (isTableImport) {
        const tableRowCount = pendingCsvStickyImport.tableRows?.length ?? 0
        importedFrames.push({
          id: `csv-table-${timestampSeed}`,
          kind: 'text',
          tableHeaders: pendingCsvStickyImport.tableHeaders,
          tableRows: pendingCsvStickyImport.tableRows,
          label: 'Tabell',
          x: contentStartX,
          y: contentStartY,
          width: 700,
          height: estimateTableFrameHeight(tableRowCount),
          refreshNonce: 0,
        })
      } else if (pendingCsvStickyImport.aggregatedRatingsText) {
        const summaryText = pendingCsvStickyImport.aggregatedRatingsText || ''
        importedFrames.push({
          id: `csv-rating-summary-${timestampSeed}`,
          kind: 'sticky',
          textContent: summaryText,
          label: 'Post-it-lapp',
          x: contentStartX,
          y: contentStartY,
          width: stickyWidth,
          height: 320,
          refreshNonce: 0,
        })
      } else {
        pendingCsvStickyImport.noteTexts.forEach((content, rowIndex) => {
          const columnIndex = rowIndex % cardsPerRow
          const gridRowIndex = Math.floor(rowIndex / cardsPerRow)
          importedFrames.push({
            id: `csv-sticky-${timestampSeed}-${rowIndex}`,
            kind: 'sticky',
            textContent: content,
            label: 'Post-it-lapp',
            x: contentStartX + columnIndex * (stickyWidth + columnGap),
            y: contentStartY + gridRowIndex * (stickyHeight + stickyGap),
            width: stickyWidth,
            height: stickyHeight,
            refreshNonce: 0,
          })
        })
      }

      if (importedFrames.length === 0) {
        setSyncError('Ingen rader å importere til canvas')
        return
      }

      const rightEdge = importedFrames.reduce((max, frame) => {
        const defaults = getDefaultFrameSize(frame)
        return Math.max(max, frame.x + (frame.width ?? defaults.width))
      }, baseX)
      const bottomEdge = importedFrames.reduce((max, frame) => {
        const defaults = getDefaultFrameSize(frame)
        return Math.max(max, frame.y + (frame.height ?? defaults.height))
      }, baseY + sectionHeaderHeight)

      const sectionFrame: CanvasFrame = {
        id: `csv-section-${timestampSeed}`,
        kind: 'section',
        label: sectionLabel,
        sectionLayout: 'grid',
        x: baseX,
        y: baseY,
        width: Math.max(420, Math.ceil(rightEdge - baseX + sectionPaddingX)),
        height: Math.max(sectionHeaderHeight + 160, Math.ceil(bottomEdge - baseY + sectionPaddingBottom)),
        refreshNonce: 0,
      }

      const framesToPersist: CanvasFrame[] = [sectionFrame, ...importedFrames]

      try {
        isImportingStickyCsvRef.current = true
        setIsImportingStickyCsv(true)
        setIsSavingCanvasItem(true)
        setSyncError(null)
        const persistedFrames: CanvasFrame[] = []
        for (const frame of framesToPersist) {
          const persistedFrame = await persistFrame(frame)
          persistedFrames.push(persistedFrame)
        }
        setFrames((prev) => [...prev, ...persistedFrames])
        cancelPendingFramePlacement()
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke importere CSV til canvas')
      } finally {
        isImportingStickyCsvRef.current = false
        setIsImportingStickyCsv(false)
        setIsSavingCanvasItem(false)
      }
    },
    [cancelPendingFramePlacement, frames, getCanvasPointerPosition, pendingCsvStickyImport, persistFrame],
  )

  const handleCanvasSurfaceMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (pendingFrameDraft) {
        event.preventDefault()
        event.stopPropagation()
        void handlePlacePendingFrame(event.clientX, event.clientY)
        return
      }
      if (pendingCsvStickyImport) {
        if (isImportingStickyCsvRef.current) return
        event.preventDefault()
        event.stopPropagation()
        void handlePlacePendingCsvImport(event.clientX, event.clientY)
        return
      }
      const target = event.target as HTMLElement
      const clickedInsideFrame = Boolean(target.closest('article'))
      const clickedInteractiveControl = Boolean(target.closest('button, a, input, textarea, select'))
      if (clickedInsideFrame || clickedInteractiveControl) return
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.closest('article')) {
        activeElement.blur()
      }
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return

      if (!isDrawingMode) {
        const additive = event.metaKey || event.ctrlKey
        if (!additive) setSelectedFrameIds([])
        event.preventDefault()
        event.stopPropagation()
        setSelectionBox({
          startX: pointer.x,
          startY: pointer.y,
          currentX: pointer.x,
          currentY: pointer.y,
          additive,
        })
        return
      }

      event.preventDefault()
      event.stopPropagation()
      startDrawingAt(pointer)
    },
    [
      getCanvasPointerPosition,
      handlePlacePendingCsvImport,
      handlePlacePendingFrame,
      isDrawingMode,
      pendingCsvStickyImport,
      pendingFrameDraft,
      startDrawingAt,
    ],
  )

  const handleCanvasSurfaceMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return
      if (isDrawingMode) {
        continueDrawingAt(pointer)
        return
      }
      if (pendingFrameDraft || pendingCsvStickyImport) {
        setPendingFramePointer(pointer)
      }
      if (selectionBox) {
        setSelectionBox((current) => (current ? { ...current, currentX: pointer.x, currentY: pointer.y } : current))
      }
    },
    [
      continueDrawingAt,
      getCanvasPointerPosition,
      isDrawingMode,
      pendingCsvStickyImport,
      pendingFrameDraft,
      selectionBox,
    ],
  )

  const handleCanvasSurfaceMouseLeave = useCallback(() => {
    if (isDrawingMode) return
    if (!pendingFrameDraft && !pendingCsvStickyImport) return
    setPendingFramePointer(null)
  }, [isDrawingMode, pendingCsvStickyImport, pendingFrameDraft])

  const getFrameBounds = useCallback(
    (frame: CanvasFrame): { left: number; top: number; right: number; bottom: number } => {
      return getCanvasFrameBounds(frame, (currentFrame) => {
        const defaults = getDefaultFrameSize(currentFrame)
        return {
          width: currentFrame.width ?? defaults.width,
          height: currentFrame.height ?? defaults.height,
        }
      })
    },
    [],
  )

  const getFrameAnchor = useCallback((frame: CanvasFrame, side: ConnectionAnchorSide): { x: number; y: number } => {
    return getCanvasFrameAnchor(frame, side, (currentFrame) => {
      const defaults = getDefaultFrameSize(currentFrame)
      return {
        width: currentFrame.width ?? defaults.width,
        height: currentFrame.height ?? defaults.height,
      }
    })
  }, [])

  const getDominantDirectionSide = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number): ConnectionAnchorSide => {
      return getDominantConnectionSide(fromX, fromY, toX, toY)
    },
    [],
  )

  const getNearestAnchorSide = useCallback(
    (frame: CanvasFrame, pointX: number, pointY: number): ConnectionAnchorSide => {
      return getNearestCanvasAnchorSide(frame, pointX, pointY, (currentFrame) => {
        const defaults = getDefaultFrameSize(currentFrame)
        return {
          width: currentFrame.width ?? defaults.width,
          height: currentFrame.height ?? defaults.height,
        }
      })
    },
    [],
  )

  const createConnectionBetweenFrames = useCallback(
    async (source: CanvasFrame, target: CanvasFrame) => {
      if (source.kind !== 'website' || target.kind !== 'website') return
      if (source.isInternalDashboard || target.isInternalDashboard) return
      if (source.id === target.id) return

      if (
        connections.some(
          (connection) =>
            (connection.fromFrameId === source.id && connection.toFrameId === target.id) ||
            (source.graphId &&
              target.graphId &&
              connection.fromGraphId === source.graphId &&
              connection.toGraphId === target.graphId),
        )
      ) {
        return
      }

      const newConnection: CanvasConnection = {
        id: `${Date.now()}-${Math.random()}`,
        fromFrameId: source.id,
        toFrameId: target.id,
        fromGraphId: source.graphId,
        toGraphId: target.graphId,
      }

      try {
        setIsSavingCanvasItem(true)
        const persisted = await persistConnection(newConnection)
        setConnections((prev) => [...prev, persisted])
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre kobling')
      } finally {
        setIsSavingCanvasItem(false)
      }
    },
    [connections, persistConnection],
  )

  const startConnectionDrag = useCallback(
    (event: React.MouseEvent, frame: CanvasFrame, side: ConnectionAnchorSide) => {
      if (frame.kind !== 'website' || frame.isInternalDashboard) return
      event.preventDefault()
      event.stopPropagation()

      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return

      setConnectionDragState({
        sourceFrameId: frame.id,
        sourceAnchorSide: side,
        pointerX: pointer.x,
        pointerY: pointer.y,
        currentTargetFrameId: null,
      })
    },
    [getCanvasPointerPosition],
  )

  const handleAddHeadingCard = () => {
    const heading = headingTextInput.trim()
    if (!heading) {
      setAddHeadingError('Legg inn overskrift.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'heading',
      headingText: heading,
      headingFontSize: HEADING_FONT_SIZE_DEFAULT,
      label: heading,
      width: 420,
      height: 160,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'overskrift')
    setHeadingTextInput('')
    setAddHeadingError(null)
    setIsAddHeadingModalOpen(false)
  }

  const handleAddTextCard = () => {
    const content = textContentInput.trim()

    if (!content) {
      setAddTextError('Legg inn tekst.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'text',
      textContent: content,
      label: 'Tekst',
      width: 340,
      height: 170,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'tekst')
    setTextContentInput('')
    setAddTextError(null)
    setIsAddTextModalOpen(false)
  }

  const handleAddStickyCard = () => {
    const content = stickyContentInput.trim()

    if (!content) {
      setAddStickyError('Legg inn tekst.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'sticky',
      textContent: content,
      label: 'Post-it-lapp',
      width: 360,
      height: 180,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'Post-it-lapp')
    setStickyContentInput('')
    setAddStickyError(null)
    setIsAddStickyModalOpen(false)
  }

  const handleAddSectionCard = () => {
    const nextSectionLabel = getNextAutoSectionLabel(frames)
    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'section',
      label: nextSectionLabel,
      sectionLayout: 'freeform',
      width: 640,
      height: 420,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'seksjon')
  }

  const handleAddIconCard = () => {
    const selectedIcon = getCanvasIconOptionById(selectedIconId)
    if (!selectedIcon) {
      setAddIconError('Velg et ikon.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'icon',
      iconName: selectedIcon.id,
      iconRotationDeg: 0,
      iconColor: getCanvasIconColor(selectedIconColor),
      label: selectedIcon.label,
      width: 280,
      height: 240,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'ikon')
    setAddIconError(null)
    setIsAddIconModalOpen(false)
  }

  const handleAddFigureCard = () => {
    const selectedFigure = CANVAS_FIGURE_OPTIONS.find((option) => option.id === selectedFigureType)
    if (!selectedFigure) {
      setAddFigureError('Velg en figur.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'figure',
      figureType: selectedFigure.id,
      figureColor: getCanvasIconColor(selectedFigureColor),
      label: selectedFigure.label,
      width: selectedFigure.id === 'line' || selectedFigure.id === 'arrow' ? 320 : 240,
      height: selectedFigure.id === 'line' || selectedFigure.id === 'arrow' ? 120 : 200,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'figur')
    setAddFigureError(null)
    setIsAddFigureModalOpen(false)
  }

  const openGrafbyggerFromAddMenuDirect = () => {
    setAddChartError(null)
    setIsAddChartModalOpen(false)
    setIsGrafbyggerEmbedded(true)
  }

  const handleOpenGrafbyggerFromAddMenu = () => {
    openGrafbyggerFromAddMenuDirect()
  }

  const handleAddChartCard = () => {
    const selectedOption = chartOptions.find((option) => option.id === selectedChartOptionId)
    if (!selectedOption) {
      setAddChartError('Velg en graf.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'chart',
      label: selectedOption.title,
      chartType: selectedOption.chartType,
      chartSql: selectedOption.sql,
      websiteId: selectedWebsite?.id || canvasConfiguredWebsiteId || undefined,
      width: 560,
      height: 360,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'graf')
    setAddChartError(null)
    setIsAddChartModalOpen(false)
  }

  const getOversiktChartFromCanvasFrame = useCallback(
    (frame: CanvasFrame): OversiktChart | null => {
      if (frame.kind !== 'chart' || !frame.chartSql || !frame.chartType) return null
      return {
        id: `canvas-chart-${frame.id}`,
        title: frame.label || 'Graf',
        type: frame.chartType,
        sql: frame.chartSql,
        width: 'full',
        graphId: frame.graphId ?? 0,
        graphType: mapCanvasChartTypeToGraphType(frame.chartType),
        queryId: frame.queryId ?? 1,
        queryName: CANVAS_QUERY_NAME,
        categoryId: frame.categoryId ?? activeCanvasCategoryId ?? 0,
      }
    },
    [activeCanvasCategoryId],
  )

  const handleOpenEditChartModal = (frame: CanvasFrame) => {
    const chart = getOversiktChartFromCanvasFrame(frame)
    if (!chart) {
      setChartMutationError('Kunne ikke laste graf for redigering')
      return
    }
    setEditChartFrameId(frame.id)
    setEditChartTarget(chart)
    setChartMutationError(null)
  }

  const handleOpenDeleteChartModal = (frame: CanvasFrame) => {
    const chart = getOversiktChartFromCanvasFrame(frame)
    if (!chart) {
      setChartMutationError('Kunne ikke laste graf for sletting')
      return
    }
    setDeleteChartFrameId(frame.id)
    setDeleteChartTarget(chart)
    setChartMutationError(null)
  }

  const handleSaveEditedChart = async (params: {
    name: string
    graphType: GraphType
    sqlText: string
    width: number
    websiteId?: string
    dashboardId?: number
    addAsVariant?: boolean
    variantName?: string
    newVariants?: Array<{ name: string; sqlText: string }>
    targetQueryId?: number
    targetQueryName?: string
  }) => {
    if (!editChartFrameId) return
    const currentFrame = frames.find((frame) => frame.id === editChartFrameId)
    if (!currentFrame || currentFrame.kind !== 'chart') return

    const nextChartType = mapGraphTypeToChart(params.graphType)
    if (nextChartType === 'text' || nextChartType === 'title' || nextChartType === 'siteimprove') {
      setChartMutationError('Ugyldig graftype for canvas')
      return
    }

    const sqlText = params.sqlText.trim()
    if (!sqlText) {
      setChartMutationError('SQL-kode kan ikke være tom')
      return
    }

    const updatedFrame: CanvasFrame = {
      ...currentFrame,
      label: params.name.trim() || currentFrame.label,
      chartType: nextChartType,
      chartSql: sqlText,
      websiteId: params.websiteId?.trim() || currentFrame.websiteId,
      refreshNonce: currentFrame.refreshNonce + 1,
    }

    try {
      setSavingEditChart(true)
      setSyncError(null)
      setChartMutationError(null)
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((frame) => (frame.id === editChartFrameId ? persistedFrame : frame)))
      setEditChartTarget(null)
      setEditChartFrameId(null)
    } catch (error) {
      setChartMutationError(error instanceof Error ? error.message : 'Kunne ikke oppdatere graf')
    } finally {
      setSavingEditChart(false)
    }
  }

  const handleDeleteChart = async () => {
    if (!deleteChartFrameId) return
    try {
      setDeletingChart(true)
      setChartMutationError(null)
      await handleRemovePage(deleteChartFrameId)
      setDeleteChartTarget(null)
      setDeleteChartFrameId(null)
    } catch (error) {
      setChartMutationError(error instanceof Error ? error.message : 'Kunne ikke slette graf')
    } finally {
      setDeletingChart(false)
    }
  }

  const handleDragStart = (event: React.MouseEvent, frame: CanvasFrame) => {
    if (event.button !== 0) return
    const isAdditiveSelection = event.metaKey || event.ctrlKey
    if (isAdditiveSelection) {
      event.preventDefault()
      event.stopPropagation()
      setSelectedFrameIds((current) =>
        current.includes(frame.id) ? current.filter((id) => id !== frame.id) : [...current, frame.id],
      )
      return
    }

    const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
    if (!pointer) return

    const selectedIds = selectedFrameIds.includes(frame.id) ? selectedFrameIds : [frame.id]
    const sectionContainedIds =
      frame.kind === 'section'
        ? visibleFrames
            .filter((candidate) => {
              if (candidate.id === frame.id || candidate.kind === 'section') return false
              const sectionBounds = getFrameBounds(frame)
              const candidateBounds = getFrameBounds(candidate)
              return (
                candidateBounds.left >= sectionBounds.left &&
                candidateBounds.right <= sectionBounds.right &&
                candidateBounds.top >= sectionBounds.top &&
                candidateBounds.bottom <= sectionBounds.bottom
              )
            })
            .map((candidate) => candidate.id)
        : []
    const idsToMove = [...new Set([...selectedIds, ...sectionContainedIds])]
    const frameStartPositions = Object.fromEntries(
      frames.filter((item) => idsToMove.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }] as const),
    )
    setSelectedFrameIds(idsToMove)
    setDragState({
      ids: idsToMove,
      pointerStartX: pointer.x,
      pointerStartY: pointer.y,
      frameStartPositions,
    })
  }

  const autoSizeChartFrame = useCallback(
    (frameId: string, contentHeight: number) => {
      if (!Number.isFinite(contentHeight) || contentHeight <= 0) return

      let frameToPersist: CanvasFrame | null = null
      setFrames((prev) => {
        const target = prev.find((frame) => frame.id === frameId)
        if (!target || target.kind !== 'chart') return prev
        if (resizeState?.id === frameId) return prev

        const defaults = getDefaultFrameSize(target)
        const currentHeight = target.height ?? defaults.height
        const requiredHeight = Math.max(defaults.minHeight, Math.ceil(contentHeight))
        if (requiredHeight <= currentHeight + 1) return prev

        const updatedFrame: CanvasFrame = {
          ...target,
          height: requiredHeight,
        }
        frameToPersist = updatedFrame
        return prev.map((frame) => (frame.id === frameId ? updatedFrame : frame))
      })

      if (frameToPersist) {
        void persistFrame(frameToPersist).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre automatisk høyde for graf')
        })
      }
    },
    [persistFrame, resizeState?.id],
  )

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const frameId = (entry.target as HTMLElement).dataset.chartFrameId
        if (!frameId) return
        autoSizeChartFrame(frameId, entry.target.scrollHeight)
      })
    })

    Object.entries(chartContentRefs.current).forEach(([frameId, node]) => {
      if (!node) return
      observer.observe(node)
      autoSizeChartFrame(frameId, node.scrollHeight)
    })

    return () => observer.disconnect()
  }, [autoSizeChartFrame, frameItems])

  const getHeadingFrameFontSize = useCallback((frame: CanvasFrame): number => {
    if (frame.kind !== 'heading') return HEADING_FONT_SIZE_DEFAULT
    return Math.max(
      HEADING_FONT_SIZE_MIN,
      Math.min(HEADING_FONT_SIZE_MAX, frame.headingFontSize ?? HEADING_FONT_SIZE_DEFAULT),
    )
  }, [])

  const getHeadingFrameWidth = useCallback(
    (frame: CanvasFrame): number => {
      if (frame.kind !== 'heading') return frame.width ?? getDefaultFrameSize(frame).width
      if (Number.isFinite(frame.width)) {
        return Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, Number(frame.width)))
      }

      const headingText = (frame.headingText || frame.label || '').trim()
      const fontSize = getHeadingFrameFontSize(frame)
      const estimatedTextWidth =
        Math.ceil(headingText.length * (fontSize * HEADING_TEXT_CHAR_WIDTH_FACTOR)) + HEADING_TEXT_EXTRA_WIDTH
      return Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, estimatedTextWidth))
    },
    [getHeadingFrameFontSize],
  )

  const getHeadingFrameHeight = useCallback(
    (frame: CanvasFrame): number => {
      if (frame.kind !== 'heading') return frame.height ?? getDefaultFrameSize(frame).height

      const headingText = (frame.headingText || frame.label || '').trim()
      const width = getHeadingFrameWidth(frame)
      const fontSize = getHeadingFrameFontSize(frame)
      const usableWidth = Math.max(width - 4, HEADING_TEXT_MIN_WIDTH)
      const charsPerLine = Math.max(12, Math.floor(usableWidth / (fontSize * HEADING_TEXT_CHAR_WIDTH_FACTOR)))
      const lineCount = headingText
        ? headingText.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
        : 1
      return Math.max(28, lineCount * Math.ceil(fontSize * 1.05) + HEADING_TEXT_VERTICAL_PADDING)
    },
    [getHeadingFrameFontSize, getHeadingFrameWidth],
  )

  const handleResizeStart = (event: React.MouseEvent, frame: CanvasFrame) => {
    event.preventDefault()
    event.stopPropagation()
    const defaults = getDefaultFrameSize(frame)
    setResizeState({
      id: frame.id,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: frame.width ?? defaults.width,
      startHeight: frame.height ?? defaults.height,
    })
  }

  const handleAdjustHeadingFontSize = (id: string, delta: number) => {
    const currentFrame = frames.find((frame) => frame.id === id)
    if (!currentFrame || currentFrame.kind !== 'heading') return

    const currentSize = currentFrame.headingFontSize ?? HEADING_FONT_SIZE_DEFAULT
    const nextSize = Math.max(HEADING_FONT_SIZE_MIN, Math.min(HEADING_FONT_SIZE_MAX, currentSize + delta))
    if (nextSize === currentSize) return

    const nextFrame: CanvasFrame = {
      ...currentFrame,
      headingFontSize: nextSize,
      refreshNonce: currentFrame.refreshNonce + 1,
    }

    setFrames((prev) => prev.map((frame) => (frame.id === id ? nextFrame : frame)))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre skriftstorrelse')
    })
  }

  useEffect(() => {
    if (!dragState) return

    const onMouseMove = (event: MouseEvent) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return
      const deltaX = pointer.x - dragState.pointerStartX
      const deltaY = pointer.y - dragState.pointerStartY

      setFrames((prev) =>
        prev.map((frame) =>
          dragState.ids.includes(frame.id)
            ? {
                ...frame,
                x: Math.max(0, (dragState.frameStartPositions[frame.id]?.x ?? frame.x) + deltaX),
                y: Math.max(-CANVAS_TOP_BUFFER, (dragState.frameStartPositions[frame.id]?.y ?? frame.y) + deltaY),
              }
            : frame,
        ),
      )
    }

    const onMouseUp = () => {
      const movedFrames = framesRef.current.filter((frame) => dragState.ids.includes(frame.id))
      const framesToPersistById = new Map(movedFrames.map((frame) => [frame.id, frame]))
      const originalMovedFramesById = new Map(
        movedFrames.map((frame) => [
          frame.id,
          {
            ...frame,
            x: dragState.frameStartPositions[frame.id]?.x ?? frame.x,
            y: dragState.frameStartPositions[frame.id]?.y ?? frame.y,
          },
        ]),
      )

      const applyStickyColumnSnap = (movedFrame: CanvasFrame): CanvasFrame => {
        if (movedFrame.kind !== 'sticky') return movedFrame
        const getFrameRect = (frame: CanvasFrame) => {
          const fallbackSize =
            frame.kind === 'figure'
              ? { width: 240, height: 200 }
              : frame.kind === 'sticky'
                ? { width: 360, height: 180 }
                : { width: 320, height: 200 }
          const width = frame.width ?? fallbackSize.width
          const height = frame.height ?? fallbackSize.height
          return {
            left: frame.x,
            top: frame.y,
            right: frame.x + width,
            bottom: frame.y + height,
            width,
            height,
          }
        }
        const movedRect = getFrameRect(movedFrame)
        const movedCenterX = movedRect.left + movedRect.width / 2
        const movedCenterY = movedRect.top + movedRect.height / 2

        const targetColumn = framesRef.current.find((frame) => {
          if (
            frame.kind !== 'figure' ||
            frame.figureType !== 'rectangle' ||
            !frame.label.startsWith(PLANNER_COLUMN_LABEL_PREFIX)
          )
            return false
          const columnRect = getFrameRect(frame)
          return (
            movedCenterX >= columnRect.left &&
            movedCenterX <= columnRect.right &&
            movedCenterY >= columnRect.top &&
            movedCenterY <= columnRect.bottom
          )
        })

        if (!targetColumn) return movedFrame
        {
          const targetRect = getFrameRect(targetColumn)
          const stickyGap = 14
          const columnPaddingX = 16
          const columnPaddingTop = 72
          const stickyFramesInColumn = framesRef.current
            .filter((frame) => {
              if (frame.id === movedFrame.id || frame.kind !== 'sticky') return false
              const stickyRect = getFrameRect(frame)
              const stickyCenterX = stickyRect.left + stickyRect.width / 2
              const stickyCenterY = stickyRect.top + stickyRect.height / 2
              return (
                stickyCenterX >= targetRect.left &&
                stickyCenterX <= targetRect.right &&
                stickyCenterY >= targetRect.top &&
                stickyCenterY <= targetRect.bottom
              )
            })
            .sort((a, b) => a.y - b.y)
          const stickyHeight = movedRect.height
          return {
            ...movedFrame,
            x: Math.max(0, targetRect.left + columnPaddingX),
            y: Math.max(
              -CANVAS_TOP_BUFFER,
              targetRect.top + columnPaddingTop + stickyFramesInColumn.length * (stickyHeight + stickyGap),
            ),
          }
        }
      }

      movedFrames.forEach((movedFrame) => {
        const snapped = applyStickyColumnSnap(movedFrame)
        framesToPersistById.set(movedFrame.id, snapped)
      })

      const resolveFrameAfterSnap = (frameId: string): CanvasFrame | null => {
        const moved = framesToPersistById.get(frameId)
        if (moved) return moved
        return framesRef.current.find((frame) => frame.id === frameId) ?? null
      }

      const resolveContainingGridSection = (
        frame: CanvasFrame,
        resolveFrame: (frameId: string) => CanvasFrame | null,
      ): CanvasFrame | null => {
        if (frame.kind === 'section') return null
        const frameBounds = getFrameBoundsForLayout(frame)
        const frameCenterX = (frameBounds.left + frameBounds.right) / 2
        const frameCenterY = (frameBounds.top + frameBounds.bottom) / 2
        return (
          framesRef.current.find((candidate) => {
            const section = resolveFrame(candidate.id)
            if (!section || section.kind !== 'section' || section.sectionLayout !== 'grid') return false
            if ((section.categoryId ?? null) !== (frame.categoryId ?? null)) return false
            const sectionBounds = getFrameBoundsForLayout(section)
            return (
              frameCenterX >= sectionBounds.left &&
              frameCenterX <= sectionBounds.right &&
              frameCenterY >= sectionBounds.top &&
              frameCenterY <= sectionBounds.bottom
            )
          }) ?? null
        )
      }

      const affectedGridSectionIds = new Set<string>()
      movedFrames.forEach((movedFrame) => {
        const originalFrame = originalMovedFramesById.get(movedFrame.id) ?? movedFrame
        const previousSection = resolveContainingGridSection(
          originalFrame,
          (id) => framesRef.current.find((f) => f.id === id) ?? null,
        )
        if (previousSection) affectedGridSectionIds.add(previousSection.id)
        const nextFrame = resolveFrameAfterSnap(movedFrame.id)
        if (!nextFrame) return
        const nextSection = resolveContainingGridSection(nextFrame, resolveFrameAfterSnap)
        if (nextSection) affectedGridSectionIds.add(nextSection.id)
      })

      const reflowGridSection = (sectionId: string) => {
        const sectionFrame = resolveFrameAfterSnap(sectionId)
        if (!sectionFrame || sectionFrame.kind !== 'section' || sectionFrame.sectionLayout !== 'grid') return

        const sectionBounds = getFrameBoundsForLayout(sectionFrame)
        const contentPaddingX = 24
        const contentPaddingTop = 92
        const contentPaddingBottom = 24
        const itemGapX = 24
        const itemGapY = 18
        const contentLeft = sectionBounds.left + contentPaddingX
        const contentRight = sectionBounds.right - contentPaddingX
        const contentTop = sectionBounds.top + contentPaddingTop

        const containedFrames = framesRef.current
          .map((frame) => resolveFrameAfterSnap(frame.id) ?? frame)
          .filter((frame): frame is CanvasFrame => Boolean(frame))
          .filter((frame) => {
            if (frame.id === sectionId || frame.kind === 'section') return false
            if ((frame.categoryId ?? null) !== (sectionFrame.categoryId ?? null)) return false
            const bounds = getFrameBoundsForLayout(frame)
            const centerX = (bounds.left + bounds.right) / 2
            const centerY = (bounds.top + bounds.bottom) / 2
            return (
              centerX >= sectionBounds.left &&
              centerX <= sectionBounds.right &&
              centerY >= sectionBounds.top &&
              centerY <= sectionBounds.bottom
            )
          })
          .sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y
            if (a.x !== b.x) return a.x - b.x
            return a.id.localeCompare(b.id)
          })

        let cursorX = contentLeft
        let cursorY = contentTop
        let currentRowHeight = 0
        let contentBottomEdge = contentTop

        containedFrames.forEach((frame) => {
          const defaults = getDefaultFrameSize(frame)
          const width = frame.width ?? defaults.width
          const height = frame.height ?? defaults.height
          const shouldWrap = cursorX !== contentLeft && cursorX + width > contentRight
          if (shouldWrap) {
            cursorX = contentLeft
            cursorY += currentRowHeight + itemGapY
            currentRowHeight = 0
          }

          const nextFrame: CanvasFrame = {
            ...frame,
            x: Math.max(0, cursorX),
            y: Math.max(-CANVAS_TOP_BUFFER, cursorY),
          }
          cursorX += width + itemGapX
          currentRowHeight = Math.max(currentRowHeight, height)
          contentBottomEdge = Math.max(contentBottomEdge, nextFrame.y + height)
          framesToPersistById.set(nextFrame.id, nextFrame)
        })

        const nextSectionFrame: CanvasFrame = {
          ...sectionFrame,
          height: Math.max(
            sectionFrame.height ?? getDefaultFrameSize(sectionFrame).height,
            Math.ceil(contentBottomEdge - sectionFrame.y + contentPaddingBottom),
          ),
        }
        framesToPersistById.set(nextSectionFrame.id, nextSectionFrame)
      }

      ;[...affectedGridSectionIds].forEach((sectionId) => {
        reflowGridSection(sectionId)
      })

      const framesToPersist = [...framesToPersistById.values()]
      setFrames((prev) =>
        prev.map((frame) => {
          const replacement = framesToPersistById.get(frame.id)
          return replacement ?? frame
        }),
      )
      void Promise.all(
        framesToPersist
          .filter((frame) => Boolean(frame.graphId))
          .map((frame) =>
            persistFrame(frame).catch((error) => {
              setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre posisjon i canvas')
              return frame
            }),
          ),
      )
      setDragState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragState, getCanvasPointerPosition, persistFrame])

  useEffect(() => {
    if (!resizeState) return

    let hasStopped = false
    const stopResize = () => {
      if (hasStopped) return
      hasStopped = true
      const resizedFrame = framesRef.current.find((frame) => frame.id === resizeState.id)
      if (resizedFrame?.graphId) {
        void persistFrame(resizedFrame).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre størrelse i canvas')
        })
      }
      setResizeState(null)
    }

    const onMouseMove = (event: MouseEvent) => {
      if (event.buttons === 0) {
        stopResize()
        return
      }
      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.id !== resizeState.id) return frame
          const defaults = getDefaultFrameSize(frame)
          const deltaX = (event.clientX - resizeState.startX) / canvasZoom
          const deltaY = (event.clientY - resizeState.startY) / canvasZoom
          if (frame.kind === 'heading') {
            return {
              ...frame,
              width: Math.min(
                HEADING_TEXT_MAX_WIDTH,
                Math.max(HEADING_TEXT_MIN_WIDTH, resizeState.startWidth + deltaX),
              ),
            }
          }
          return {
            ...frame,
            width: Math.max(defaults.minWidth, resizeState.startWidth + deltaX),
            height: Math.max(defaults.minHeight, resizeState.startHeight + deltaY),
          }
        }),
      )
    }

    const onMouseUp = () => stopResize()
    const onWindowBlur = () => stopResize()

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [canvasZoom, persistFrame, resizeState])

  useEffect(() => {
    if (!selectionBox) return

    const updateSelectionBox = (event: MouseEvent) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return
      setSelectionBox((current) => (current ? { ...current, currentX: pointer.x, currentY: pointer.y } : current))
    }

    const finalizeSelection = () => {
      const left = Math.min(selectionBox.startX, selectionBox.currentX)
      const right = Math.max(selectionBox.startX, selectionBox.currentX)
      const top = Math.min(selectionBox.startY, selectionBox.currentY)
      const bottom = Math.max(selectionBox.startY, selectionBox.currentY)
      const hasVisibleBox = right - left > 4 || bottom - top > 4
      const selectedIds = hasVisibleBox
        ? visibleFrames
            .filter((frame) => {
              const bounds = getFrameBounds(frame)
              return !(bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bottom)
            })
            .map((frame) => frame.id)
        : []
      setSelectedFrameIds((current) =>
        selectionBox.additive ? [...new Set([...current, ...selectedIds])] : selectedIds,
      )
      setSelectionBox(null)
    }

    window.addEventListener('mousemove', updateSelectionBox)
    window.addEventListener('mouseup', finalizeSelection)
    return () => {
      window.removeEventListener('mousemove', updateSelectionBox)
      window.removeEventListener('mouseup', finalizeSelection)
    }
  }, [getCanvasPointerPosition, getFrameBounds, selectionBox, visibleFrames])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSelectAllShortcut =
        (event.key === 'a' || event.key === 'A') && (event.metaKey || event.ctrlKey) && !event.altKey
      if (!isSelectAllShortcut) return

      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || false
      if (isTypingTarget) return

      event.preventDefault()
      setSelectedFrameIds(visibleFrames.map((frame) => frame.id))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visibleFrames])

  useEffect(() => {
    if (selectedFrameIds.length === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || false
      if (isTypingTarget) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      event.preventDefault()
      setDeleteTarget({
        type: 'frames',
        ids: selectedFrameIds,
        label: `${selectedFrameIds.length} valgte kort`,
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedFrameIds])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const usesPrimaryModifier = event.metaKey || event.ctrlKey
      if (!usesPrimaryModifier || event.altKey) return

      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || false
      if (isTypingTarget) return

      const pressedKey = event.key.toLowerCase()
      const isCopyShortcut = pressedKey === 'c' && !event.shiftKey
      const isPasteShortcut = pressedKey === 'v' && !event.shiftKey
      if (!isCopyShortcut && !isPasteShortcut) return

      if (isCopyShortcut) {
        const copiedFrames = frames
          .filter(
            (frame) =>
              selectedFrameIds.includes(frame.id) &&
              (frame.kind === 'sticky' || frame.kind === 'text' || frame.kind === 'section'),
          )
          .sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y
            if (a.x !== b.x) return a.x - b.x
            return a.id.localeCompare(b.id)
          })

        if (copiedFrames.length === 0) return
        event.preventDefault()
        clipboardFramesRef.current = copiedFrames
        clipboardPasteCountRef.current = 0
        return
      }

      const copiedFrames = clipboardFramesRef.current
      if (!copiedFrames || copiedFrames.length === 0) return

      event.preventDefault()
      const pasteOffset = 36 * (clipboardPasteCountRef.current + 1)
      const duplicatedFrames = copiedFrames.map((frame) => ({
        ...frame,
        id: `${Date.now()}-${Math.random()}`,
        x: Math.max(0, frame.x + pasteOffset),
        y: Math.max(-CANVAS_TOP_BUFFER, frame.y + pasteOffset),
        graphId: undefined,
        queryId: undefined,
        refreshNonce: 0,
      }))

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrames: CanvasFrame[] = []
          for (const frame of duplicatedFrames) {
            const persistedFrame = await persistFrame(frame)
            persistedFrames.push(persistedFrame)
          }
          setFrames((prev) => [...prev, ...persistedFrames])
          setSelectedFrameIds(persistedFrames.map((frame) => frame.id))
          clipboardPasteCountRef.current += 1
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lime inn elementer i canvas')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [frames, persistFrame, selectedFrameIds])

  useEffect(() => {
    if (selectedFrameIds.length === 0) return

    const onWindowMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('article')) return
      if (target.closest('button, a, input, textarea, select, [role="menu"], [role="menuitem"]')) return
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.closest('article')) {
        activeElement.blur()
      }
      setSelectedFrameIds([])
    }

    window.addEventListener('mousedown', onWindowMouseDown)
    return () => window.removeEventListener('mousedown', onWindowMouseDown)
  }, [selectedFrameIds])

  useEffect(() => {
    if (!connectionDragState) return

    const updateConnectionDrag = (event: MouseEvent) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return

      const currentTarget = visibleFrames.find((frame) => {
        if (frame.kind !== 'website' || frame.isInternalDashboard) return false
        if (frame.id === connectionDragState.sourceFrameId) return false
        const bounds = getFrameBounds(frame)
        return (
          pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom
        )
      })

      setConnectionDragState((current) =>
        current
          ? {
              ...current,
              pointerX: pointer.x,
              pointerY: pointer.y,
              currentTargetFrameId: currentTarget?.id ?? null,
            }
          : current,
      )
    }

    const finishConnectionDrag = async (event: MouseEvent) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      const sourceFrame = visibleFrames.find((frame) => frame.id === connectionDragState.sourceFrameId)
      if (!pointer || !sourceFrame || sourceFrame.kind !== 'website') {
        setConnectionDragState(null)
        return
      }

      const targetFrame = visibleFrames.find((frame) => {
        if (frame.kind !== 'website') return false
        if (frame.id === sourceFrame.id) return false
        const bounds = getFrameBounds(frame)
        return (
          pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom
        )
      })

      setConnectionDragState(null)
      if (targetFrame) {
        await createConnectionBetweenFrames(sourceFrame, targetFrame)
      }
    }

    window.addEventListener('mousemove', updateConnectionDrag)
    window.addEventListener('mouseup', finishConnectionDrag)

    return () => {
      window.removeEventListener('mousemove', updateConnectionDrag)
      window.removeEventListener('mouseup', finishConnectionDrag)
    }
  }, [connectionDragState, createConnectionBetweenFrames, getCanvasPointerPosition, getFrameBounds, visibleFrames])

  const handleRemovePage = async (id: string) => {
    const frameToDelete = frames.find((frame) => frame.id === id)
    const linkedConnections = connections.filter(
      (connection) =>
        connection.fromFrameId === id ||
        connection.toFrameId === id ||
        (frameToDelete?.graphId !== undefined &&
          (connection.fromGraphId === frameToDelete.graphId || connection.toGraphId === frameToDelete.graphId)),
    )
    setFrames((prev) => prev.filter((frame) => frame.id !== id))
    setSelectedFrameIds((prev) => prev.filter((frameId) => frameId !== id))
    setConnections((prev) => prev.filter((connection) => !linkedConnections.some((item) => item.id === connection.id)))
    if (activeEditableFrameId === id && frameToDelete) {
      setActiveEditableFrameId(null)
      void releaseEditLock(frameToDelete).catch(() => undefined)
    }
    if (connectionDragState?.sourceFrameId === id) {
      setConnectionDragState(null)
    }

    if (!frameToDelete || !canPersistToDashboard || projectId === null || dashboardId === null) return
    if (!frameToDelete.graphId || !frameToDelete.categoryId) return

    try {
      await deleteGraph(projectId, dashboardId, frameToDelete.categoryId, frameToDelete.graphId)
      await Promise.all(
        linkedConnections.map((connection) => {
          if (!connection.graphId || !connection.categoryId) return Promise.resolve()
          return deleteGraph(projectId, dashboardId, connection.categoryId, connection.graphId)
        }),
      )
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke slette element fra canvas')
    }
  }

  const handleRemoveConnection = async (connectionId: string) => {
    const connection = connections.find((item) => item.id === connectionId)
    setConnections((prev) => prev.filter((item) => item.id !== connectionId))

    if (!connection || !canPersistToDashboard || projectId === null || dashboardId === null) return
    if (!connection.graphId || !connection.categoryId) return

    try {
      await deleteGraph(projectId, dashboardId, connection.categoryId, connection.graphId)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke slette kobling')
    }
  }

  const handleRequestRemoveFrame = (frame: CanvasFrame) => {
    setDeleteTarget({
      type: 'frame',
      id: frame.id,
      label: frame.label || 'kortet',
    })
  }

  const handleRequestRemoveConnection = (connection: CanvasConnectionVisual) => {
    setDeleteTarget({
      type: 'connection',
      id: connection.id,
      label: `${connection.fromUrl || 'ukjent side'} → ${connection.toUrl || 'ukjent side'}`,
    })
  }

  const handleRequestRemoveSelectedFrames = () => {
    if (selectedFrameIds.length === 0) return
    setDeleteTarget({
      type: 'frames',
      ids: selectedFrameIds,
      label: `${selectedFrameIds.length} valgte kort`,
    })
  }

  const handleConfirmDeleteTarget = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setIsSavingCanvasItem(true)

    try {
      if (target.type === 'frame') {
        await handleRemovePage(target.id)
        setDeleteTarget(null)
        return
      }

      if (target.type === 'frames') {
        setBulkDeleteProgress({ total: target.ids.length, completed: 0 })

        for (let index = 0; index < target.ids.length; index += 1) {
          await handleRemovePage(target.ids[index])
          setBulkDeleteProgress({ total: target.ids.length, completed: index + 1 })
        }

        setBulkDeleteProgress(null)
        setDeleteTarget(null)
        return
      }

      await handleRemoveConnection(target.id)
      setDeleteTarget(null)
    } finally {
      setIsSavingCanvasItem(false)
      setBulkDeleteProgress(null)
    }
  }

  const resolveConnectionFrame = useCallback(
    (connection: CanvasConnection, role: 'from' | 'to'): CanvasFrame | null => {
      const frameId = role === 'from' ? connection.fromFrameId : connection.toFrameId
      const graphId = role === 'from' ? connection.fromGraphId : connection.toGraphId
      if (frameId) {
        const byId = visibleFrames.find((frame) => frame.id === frameId)
        if (byId) return byId
      }
      if (graphId) {
        const byGraphId = visibleFrames.find((frame) => frame.graphId === graphId)
        if (byGraphId) return byGraphId
      }
      return null
    },
    [visibleFrames],
  )

  const connectionSegments = useMemo(
    () =>
      visibleConnections.flatMap((connection) => {
        const fromFrame = resolveConnectionFrame(connection, 'from')
        const toFrame = resolveConnectionFrame(connection, 'to')
        if (!fromFrame || !toFrame) return []

        const fromBounds = getFrameBounds(fromFrame)
        const toBounds = getFrameBounds(toFrame)
        const fromCenterX = (fromBounds.left + fromBounds.right) / 2
        const fromCenterY = (fromBounds.top + fromBounds.bottom) / 2
        const toCenterX = (toBounds.left + toBounds.right) / 2
        const toCenterY = (toBounds.top + toBounds.bottom) / 2
        const fromSide = getDominantDirectionSide(fromCenterX, fromCenterY, toCenterX, toCenterY)
        const toSide = getDominantDirectionSide(toCenterX, toCenterY, fromCenterX, fromCenterY)
        const fromAnchor = getFrameAnchor(fromFrame, fromSide)
        const toAnchor = getFrameAnchor(toFrame, toSide)
        const { path, midpoint } = buildConnectionPath(
          fromAnchor.x,
          fromAnchor.y,
          fromSide,
          toAnchor.x,
          toAnchor.y,
          toSide,
        )

        return [
          {
            id: connection.id,
            path,
            labelX: midpoint.x,
            labelY: midpoint.y,
            midX: midpoint.x,
            midY: midpoint.y,
            endX: toAnchor.x,
            endY: toAnchor.y,
            fromUrl: fromFrame.targetUrl,
            toUrl: toFrame.targetUrl,
          },
        ]
      }),
    [visibleConnections, resolveConnectionFrame, getFrameAnchor, getFrameBounds, getDominantDirectionSide],
  )

  const connectionPreview = useMemo(() => {
    if (!connectionDragState) return null

    const sourceFrame = visibleFrames.find((frame) => frame.id === connectionDragState.sourceFrameId)
    if (!sourceFrame || sourceFrame.kind !== 'website') return null

    const sourceAnchor = getFrameAnchor(sourceFrame, connectionDragState.sourceAnchorSide)
    const targetFrame = connectionDragState.currentTargetFrameId
      ? visibleFrames.find((frame) => frame.id === connectionDragState.currentTargetFrameId)
      : null
    const fallbackTargetSide = getDominantDirectionSide(
      sourceAnchor.x,
      sourceAnchor.y,
      connectionDragState.pointerX,
      connectionDragState.pointerY,
    )
    const targetSide =
      targetFrame?.kind === 'website'
        ? getNearestAnchorSide(targetFrame, sourceAnchor.x, sourceAnchor.y)
        : fallbackTargetSide
    const toAnchor =
      targetFrame?.kind === 'website'
        ? getFrameAnchor(targetFrame, targetSide)
        : {
            x: connectionDragState.pointerX,
            y: connectionDragState.pointerY,
          }
    const { path, midpoint } = buildConnectionPath(
      sourceAnchor.x,
      sourceAnchor.y,
      connectionDragState.sourceAnchorSide,
      toAnchor.x,
      toAnchor.y,
      targetSide,
    )

    return {
      path,
      labelX: midpoint.x,
      labelY: midpoint.y,
      midX: midpoint.x,
      midY: midpoint.y,
      targetFrameId: targetFrame?.id ?? null,
    }
  }, [connectionDragState, visibleFrames, getFrameAnchor, getDominantDirectionSide, getNearestAnchorSide])

  const connectionSegmentsWithMetrics = useMemo(
    () =>
      connectionSegments.flatMap((segment) => {
        const metrics = connectionMetrics[segment.id]
        if (!metrics) return []
        return [
          {
            ...segment,
            metrics,
          },
        ]
      }),
    [connectionMetrics, connectionSegments],
  )

  const connectionMetricRequests = useMemo(
    () =>
      visibleConnections
        .map((connection) => {
          const fromFrame = resolveConnectionFrame(connection, 'from')
          const toFrame = resolveConnectionFrame(connection, 'to')
          if (!fromFrame?.targetUrl || !toFrame?.targetUrl) return null
          return {
            id: connection.id,
            fromUrl: fromFrame.targetUrl,
            toUrl: toFrame.targetUrl,
          }
        })
        .filter((item): item is { id: string; fromUrl: string; toUrl: string } => item !== null),
    [resolveConnectionFrame, visibleConnections],
  )

  // Request the funnel data only when the connected URLs change. Frame movement
  // should not retrigger the network call.
  useEffect(() => {
    let isActive = true

    const loadConnectionMetrics = async () => {
      if (!selectedWebsite?.id) {
        connectionMetricRequestSignatureRef.current = null
        setConnectionMetrics({})
        return
      }

      const requests = connectionMetricRequests
      const requestSignature = JSON.stringify({
        websiteId: selectedWebsite.id,
        period,
        customStartDate: customStartDate?.toISOString() ?? null,
        customEndDate: customEndDate?.toISOString() ?? null,
        onlyDirectEntry,
        requests: requests.map((request) => [request.id, request.fromUrl, request.toUrl]),
      })

      if (connectionMetricRequestSignatureRef.current === requestSignature) {
        return
      }

      connectionMetricRequestSignatureRef.current = requestSignature

      if (requests.length === 0) {
        setConnectionMetrics({})
        return
      }

      const entries = await Promise.all(
        requests.map(async (request) => {
          const result = await fetchFunnelData({
            websiteId: selectedWebsite.id,
            steps: [buildFunnelStepFromUrl(request.fromUrl), buildFunnelStepFromUrl(request.toUrl)],
            period,
            customStartDate,
            customEndDate,
            onlyDirectEntry,
          })

          if (!isActive || result.error || result.data.length < 2) {
            return [request.id, null] as const
          }

          const metrics = computeFunnelStepMetrics(result.data, 1)
          const startCount = result.data[0]?.count ?? 0
          const endCount = result.data[1]?.count ?? 0

          return [
            request.id,
            {
              ...metrics,
              fromCount: startCount,
              toCount: endCount,
            },
          ] as const
        }),
      )

      if (!isActive) return
      setConnectionMetrics(Object.fromEntries(entries))
    }

    void loadConnectionMetrics()

    return () => {
      isActive = false
    }
  }, [connectionMetricRequests, period, customStartDate, customEndDate, onlyDirectEntry, selectedWebsite?.id])

  const handleRefreshFrame = (id: string) => {
    setFrames((prev) =>
      prev.map((frame) =>
        frame.id === id && (frame.kind === 'website' || frame.kind === 'image')
          ? {
              ...frame,
              refreshNonce: frame.refreshNonce + 1,
            }
          : frame,
      ),
    )
  }

  const handleRotateIconFrame = (id: string, delta: number) => {
    const currentFrame = frames.find((frame) => frame.id === id)
    if (!currentFrame || currentFrame.kind !== 'icon') return

    const currentRotation = currentFrame.iconRotationDeg ?? 0
    const nextRotation = (((currentRotation + delta) % 360) + 360) % 360
    const nextFrame: CanvasFrame = {
      ...currentFrame,
      iconRotationDeg: nextRotation,
    }

    setFrames((prev) => prev.map((frame) => (frame.id === id ? nextFrame : frame)))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre ikon-rotasjon')
    })
  }

  const handleRotateIllustrationFrame = (id: string, delta: number) => {
    const currentFrame = frames.find((frame) => frame.id === id)
    if (!currentFrame || !isIllustrationImageFrame(currentFrame)) return

    const currentRotation = currentFrame.imageRotationDeg ?? 0
    const nextRotation = (((currentRotation + delta) % 360) + 360) % 360
    const nextFrame: CanvasFrame = {
      ...currentFrame,
      imageRotationDeg: nextRotation,
    }

    setFrames((prev) => prev.map((frame) => (frame.id === id ? nextFrame : frame)))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre illustrasjons-rotasjon')
    })
  }

  const handleToggleSectionLayout = (id: string) => {
    const sectionFrame = frames.find((frame) => frame.id === id)
    if (!sectionFrame || sectionFrame.kind !== 'section') return

    const nextSectionLayout = sectionFrame.sectionLayout === 'grid' ? 'freeform' : 'grid'
    if (nextSectionLayout === 'freeform') {
      const nextSectionFrame: CanvasFrame = {
        ...sectionFrame,
        sectionLayout: 'freeform',
      }
      setFrames((prev) => prev.map((frame) => (frame.id === id ? nextSectionFrame : frame)))
      void persistFrame(nextSectionFrame).catch((error) => {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre seksjonsoppsett')
      })
      return
    }

    const sectionBounds = getFrameBoundsForLayout(sectionFrame)
    const contentPaddingX = 24
    const contentPaddingTop = 92
    const contentPaddingBottom = 24
    const itemGapX = 24
    const itemGapY = 18
    const contentLeft = sectionBounds.left + contentPaddingX
    const contentRight = sectionBounds.right - contentPaddingX
    const contentTop = sectionBounds.top + contentPaddingTop

    const sameCategoryFrames = frames.filter(
      (frame) => (frame.categoryId ?? null) === (sectionFrame.categoryId ?? null) && frame.id !== sectionFrame.id,
    )
    const containedFrames = sameCategoryFrames
      .filter((frame) => {
        if (frame.kind === 'section') return false
        const bounds = getFrameBoundsForLayout(frame)
        return (
          bounds.left >= sectionBounds.left &&
          bounds.right <= sectionBounds.right &&
          bounds.top >= sectionBounds.top &&
          bounds.bottom <= sectionBounds.bottom
        )
      })
      .sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y
        if (a.x !== b.x) return a.x - b.x
        return a.id.localeCompare(b.id)
      })

    const movedFramesById = new Map<string, CanvasFrame>()
    let cursorX = contentLeft
    let cursorY = contentTop
    let currentRowHeight = 0
    let contentBottomEdge = contentTop

    containedFrames.forEach((frame) => {
      const defaults = getDefaultFrameSize(frame)
      const width = frame.width ?? defaults.width
      const height = frame.height ?? defaults.height
      const shouldWrap = cursorX !== contentLeft && cursorX + width > contentRight
      if (shouldWrap) {
        cursorX = contentLeft
        cursorY += currentRowHeight + itemGapY
        currentRowHeight = 0
      }

      const movedFrame: CanvasFrame = {
        ...frame,
        x: Math.max(0, cursorX),
        y: Math.max(-CANVAS_TOP_BUFFER, cursorY),
      }
      movedFramesById.set(frame.id, movedFrame)
      cursorX += width + itemGapX
      currentRowHeight = Math.max(currentRowHeight, height)
      contentBottomEdge = Math.max(contentBottomEdge, movedFrame.y + height)
    })

    const nextSectionFrame: CanvasFrame = {
      ...sectionFrame,
      sectionLayout: 'grid',
      height: Math.max(
        sectionFrame.height ?? getDefaultFrameSize(sectionFrame).height,
        Math.ceil(contentBottomEdge - sectionFrame.y + contentPaddingBottom),
      ),
    }

    const nextFrames = frames.map((frame) => {
      if (frame.id === nextSectionFrame.id) return nextSectionFrame
      return movedFramesById.get(frame.id) ?? frame
    })
    setFrames(nextFrames)

    const framesToPersist = [
      nextSectionFrame,
      ...containedFrames.map((frame) => movedFramesById.get(frame.id) ?? frame),
    ]
    void Promise.all(
      framesToPersist
        .filter((frame) => Boolean(frame.graphId))
        .map((frame) =>
          persistFrame(frame).catch((error) => {
            setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre seksjonsoppsett')
            return frame
          }),
        ),
    )
  }

  const handleEditableFrameChange = (id: string, nextValue: string) => {
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== id) return frame
        if (frame.kind === 'heading') {
          return {
            ...frame,
            headingText: nextValue,
            label: nextValue.trim() || 'Overskrift',
          }
        }
        if (frame.kind === 'section') {
          return {
            ...frame,
            label: nextValue,
          }
        }
        if (frame.kind === 'text' || frame.kind === 'sticky') {
          return {
            ...frame,
            textContent: nextValue,
          }
        }
        return frame
      }),
    )
  }

  const handleEditableFrameBlur = (id: string) => {
    const frame = frames.find((item) => item.id === id)
    if (
      !frame ||
      frame.kind === 'website' ||
      frame.kind === 'image' ||
      frame.kind === 'chart' ||
      frame.kind === 'icon' ||
      frame.kind === 'figure' ||
      frame.kind === 'drawing'
    )
      return

    let nextFrame = frame
    if (frame.kind === 'heading') {
      const normalizedHeading = (frame.headingText || '').trim()
      nextFrame = {
        ...frame,
        headingText: normalizedHeading,
        label: normalizedHeading || 'Overskrift',
      }
    } else if (frame.kind === 'section') {
      const normalizedLabel = frame.label.trim()
      nextFrame = {
        ...frame,
        label: normalizedLabel || getNextAutoSectionLabel(frames, frame.id),
      }
    } else {
      nextFrame = {
        ...frame,
        textContent: (frame.textContent || '').trim(),
      }
    }

    setFrames((prev) => prev.map((item) => (item.id === id ? nextFrame : item)))
    setActiveEditableFrameId((current) => (current === id ? null : current))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre endringer i canvas')
    })
    void releaseEditLock(frame).catch(() => undefined)
  }

  const handleStartEditingFrame = (id: string) => {
    const frame = frames.find((item) => item.id === id)
    if (
      !frame ||
      (frame.kind !== 'heading' && frame.kind !== 'text' && frame.kind !== 'sticky' && frame.kind !== 'section')
    )
      return

    void (async () => {
      const lockAcquired = await acquireEditLock(frame)
      if (!lockAcquired) {
        const lockStatus = getFrameLockStatus(frame)
        setSyncError(
          lockStatus.ownerLabel
            ? `${lockStatus.ownerLabel} redigerer dette kortet akkurat nå.`
            : 'Kortet redigeres av en kollega akkurat nå.',
        )
        return
      }
      setActiveEditableFrameId(id)
    })()
  }

  const handleOpenCanvasSettingsModal = () => {
    setRenameCanvasInput(canvasTitle)
    setRenameCanvasError(null)
    setCanvasSettingsInfo(null)
    setIsCanvasSettingsModalOpen(true)
  }

  const handleOpenInventoryModal = () => {
    setIsInventoryModalOpen(true)
  }

  const handleOpenTimerModal = () => {
    if (Date.now() < timerModalReopenBlockedUntilRef.current) return
    setTimerModalError(null)
    void (async () => {
      await refreshTimer()
      setIsTimerModalOpen(true)
    })()
  }

  const handleStartCanvasTimer = () => {
    const minutes = Number(timerMinutesInput)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setTimerModalError('Legg inn et gyldig antall minutter (minst 1).')
      return
    }
    if (minutes > 240) {
      setTimerModalError('Maks varighet er 240 minutter.')
      return
    }

    void (async () => {
      setTimerModalPendingAction('start')
      try {
        await startTimer(minutes)
        setTimerModalError(null)
        setIsTimerModalOpen(false)
      } finally {
        setTimerModalPendingAction(null)
      }
    })()
  }

  const handleStopCanvasTimer = () => {
    void (async () => {
      setTimerModalPendingAction('stop')
      try {
        timerModalReopenBlockedUntilRef.current = Date.now() + 900
        setIsTimerModalOpen(false)
        await stopTimer()
        setTimerModalError(null)
      } finally {
        setTimerModalPendingAction(null)
      }
    })()
  }

  const handlePauseCanvasTimer = () => {
    void (async () => {
      setTimerModalPendingAction('pause')
      try {
        await pauseTimer()
      } finally {
        setTimerModalPendingAction(null)
      }
    })()
  }

  const handleResumeCanvasTimer = () => {
    void (async () => {
      setTimerModalPendingAction('resume')
      try {
        await resumeTimer()
      } finally {
        setTimerModalPendingAction(null)
      }
    })()
  }

  const handleAdjustTimerMinusOneMinute = () => {
    void (async () => {
      setTimerModalPendingAction('adjust-minus')
      try {
        await adjustTimerMinutes(-1)
      } finally {
        setTimerModalPendingAction(null)
      }
    })()
  }

  const handleAdjustTimerPlusOneMinute = () => {
    void (async () => {
      setTimerModalPendingAction('adjust-plus')
      try {
        await adjustTimerMinutes(1)
      } finally {
        setTimerModalPendingAction(null)
      }
    })()
  }

  const handleDeleteInventoryType = useCallback(
    (params: { key: string; label: string; count: number }) => {
      const frameIds = visibleFrames.filter((frame) => frame.kind === params.key).map((frame) => frame.id)
      if (frameIds.length === 0) return
      setDeleteTarget({
        type: 'frames',
        ids: frameIds,
        label: `${params.count} ${params.label.toLowerCase()}`,
      })
    },
    [visibleFrames],
  )

  const handleSelectInventoryFrames = useCallback((frameIds: string[]) => {
    setSelectedFrameIds(frameIds)
  }, [])

  const handleOpenCreateTabModal = () => {
    setNewTabName('')
    setCreateTabError(null)
    setIsCreateTabModalOpen(true)
  }

  const handleCreateTab = async () => {
    const nextTabName = newTabName.trim()
    if (!nextTabName) {
      setCreateTabError('Legg inn et fanenavn.')
      return
    }
    if (projectId === null || dashboardId === null) {
      setCreateTabError('Mangler prosjekt- eller dashboard-kontekst.')
      return
    }

    try {
      setCreatingTab(true)
      setCreateTabError(null)
      const createdCategory = await createCategory(projectId, dashboardId, nextTabName)
      const categories = await fetchCategories(projectId, dashboardId)
      setCanvasCategories(categories)
      setActiveCanvasCategoryId(createdCategory.id)
      setIsCreateTabModalOpen(false)
      setNewTabName('')
    } catch (error) {
      setCreateTabError(error instanceof Error ? error.message : 'Kunne ikke opprette fane')
    } finally {
      setCreatingTab(false)
    }
  }

  const handleOpenManageTabsModal = () => {
    const selectedTabId =
      activeCanvasCategoryId !== null && canvasCategories.some((category) => category.id === activeCanvasCategoryId)
        ? activeCanvasCategoryId
        : (canvasCategories[0]?.id ?? null)
    const selectedTab = selectedTabId ? canvasCategories.find((category) => category.id === selectedTabId) : null
    setManageTabId(selectedTab ? String(selectedTab.id) : '')
    setManageTabName(selectedTab?.name ?? '')
    setManageTabError(null)
    setIsManageTabsModalOpen(true)
  }

  const manageTabCategoryId = Number(manageTabId)
  const selectedManageTab =
    Number.isFinite(manageTabCategoryId) && manageTabCategoryId > 0
      ? (canvasCategories.find((category) => category.id === manageTabCategoryId) ?? null)
      : null
  const firstCanvasCategoryId = canvasCategories[0]?.id ?? null
  const selectedManageTabIsFirst =
    selectedManageTab !== null && firstCanvasCategoryId !== null && selectedManageTab.id === firstCanvasCategoryId
  const selectedManageTabItemCount =
    selectedManageTab === null
      ? 0
      : frames.filter((frame) => frame.categoryId === selectedManageTab.id).length +
        connections.filter((connection) => connection.categoryId === selectedManageTab.id).length
  const selectedManageTabIsEmpty = selectedManageTab !== null && selectedManageTabItemCount === 0

  const handleRenameTab = async () => {
    const categoryId = Number(manageTabId)
    const nextName = manageTabName.trim()
    if (!Number.isFinite(categoryId)) {
      setManageTabError('Velg en fane.')
      return
    }
    if (!nextName) {
      setManageTabError('Legg inn et fanenavn.')
      return
    }
    if (projectId === null || dashboardId === null) {
      setManageTabError('Mangler prosjekt- eller dashboard-kontekst.')
      return
    }

    try {
      setSavingManageTab(true)
      setManageTabError(null)
      await updateCategory(projectId, dashboardId, categoryId, { name: nextName })
      const categories = await fetchCategories(projectId, dashboardId)
      setCanvasCategories(categories)
      setActiveCanvasCategoryId(categoryId)
      setIsManageTabsModalOpen(false)
    } catch (error) {
      setManageTabError(error instanceof Error ? error.message : 'Kunne ikke endre navn på fane')
    } finally {
      setSavingManageTab(false)
    }
  }

  const handleDeleteTab = async () => {
    if (!selectedManageTab) {
      setManageTabError('Velg en fane.')
      return
    }
    if (selectedManageTabIsFirst) {
      setManageTabError('Den første fanen kan ikke slettes.')
      return
    }
    if (!selectedManageTabIsEmpty) {
      setManageTabError('Fanen må være tom før den kan slettes.')
      return
    }
    if (projectId === null || dashboardId === null) {
      setManageTabError('Mangler prosjekt- eller dashboard-kontekst.')
      return
    }

    try {
      setDeletingManageTab(true)
      setManageTabError(null)
      await deleteCategory(projectId, dashboardId, selectedManageTab.id)
      const categories = await fetchCategories(projectId, dashboardId)
      setCanvasCategories(categories)
      setFrames((prev) => prev.filter((frame) => frame.categoryId !== selectedManageTab.id))
      setConnections((prev) => prev.filter((connection) => connection.categoryId !== selectedManageTab.id))
      setActiveCanvasCategoryId((current) => {
        if (current !== selectedManageTab.id) return current
        return categories[0]?.id ?? null
      })
      setIsManageTabsModalOpen(false)
    } catch (error) {
      setManageTabError(error instanceof Error ? error.message : 'Kunne ikke slette fane')
    } finally {
      setDeletingManageTab(false)
    }
  }

  const handleRenameCanvas = async () => {
    const nextName = renameCanvasInput.trim()
    if (!nextName) {
      setRenameCanvasError('Legg inn et navn.')
      return
    }

    if (!canPersistToDashboard || projectId === null || dashboardId === null) {
      setCanvasTitle(nextName)
      setIsCanvasSettingsModalOpen(false)
      return
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const nextDescription = buildCanvasDashboardDescription(canvasDashboardDescription, selectedWebsite?.id)
      await updateDashboard(projectId, dashboardId, { name: nextName, description: nextDescription })
      setCanvasTitle(nextName)
      setCanvasDashboardDescription(nextDescription)
      setCanvasConfiguredWebsiteId(selectedWebsite?.id ?? null)
      setIsCanvasSettingsModalOpen(false)
      setRenameCanvasError(null)
    } catch (error) {
      setRenameCanvasError(error instanceof Error ? error.message : 'Kunne ikke gi nytt navn')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleCreateCanvas = async () => {
    const selectedProjectId = Number(createCanvasProjectId)
    const canvasName = createCanvasNameInput.trim()

    if (!Number.isFinite(selectedProjectId)) {
      setCreateCanvasError('Velg et team.')
      return
    }
    if (!canvasName) {
      setCreateCanvasError('Legg inn et canvas-navn.')
      return
    }

    try {
      setIsCreatingCanvas(true)
      setCreateCanvasError(null)
      const createdDashboard = await createDashboard(selectedProjectId, canvasName, CANVAS_DASHBOARD_TOKEN)
      window.location.href = `/canvas?projectId=${selectedProjectId}&dashboardId=${createdDashboard.id}`
    } catch (error) {
      setCreateCanvasError(error instanceof Error ? error.message : 'Kunne ikke opprette canvas')
    } finally {
      setIsCreatingCanvas(false)
    }
  }

  const handleCreateTeam = async () => {
    const teamName = createTeamNameInput.trim()
    if (!teamName) {
      setCreateTeamError('Navn er påkrevd.')
      return
    }

    try {
      setIsCreatingTeam(true)
      setCreateTeamError(null)
      const createdProject = await createProject(teamName, createTeamDescriptionInput)
      const option = { id: createdProject.id, name: createdProject.name?.trim() || `Team ${createdProject.id}` }
      setCreateCanvasProjectOptions((current) =>
        [...current, option].sort((a, b) => a.name.localeCompare(b.name, 'nb', { sensitivity: 'base' })),
      )
      setCreateCanvasProjectId(String(createdProject.id))
      void loadExistingCanvasOptions(createdProject.id)
      setIsCreateTeamModalOpen(false)
      setCreateTeamNameInput('')
      setCreateTeamDescriptionInput('')
      setCreateTeamError(null)
      if (createCanvasError) setCreateCanvasError(null)
    } catch (error) {
      setCreateTeamError(error instanceof Error ? error.message : 'Kunne ikke opprette team')
    } finally {
      setIsCreatingTeam(false)
    }
  }

  const openAddPageModalDirect = () => {
    setAddPageError(null)
    setNewPagePreviewUrlInput('')
    setNewPageRenderEnabled(true)
    setNewPageVisualizationMode('')
    setIsAddPageModalOpen(true)
  }

  const handleOpenAddPageModal = () => {
    openAddPageModalDirect()
  }

  const handleAssignWebsiteToChart = async (frame: CanvasFrame, website: Website | null) => {
    if (frame.kind !== 'chart' || !website?.id) return

    const updatedFrame: CanvasFrame = {
      ...frame,
      websiteId: website.id,
      refreshNonce: frame.refreshNonce + 1,
    }

    setFrames((prev) => prev.map((item) => (item.id === frame.id ? updatedFrame : item)))
    setSelectedWebsite(website)

    try {
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((item) => (item.id === frame.id ? persistedFrame : item)))
      setPendingChartWebsiteByFrameId((current) => {
        if (!(frame.id in current)) return current
        const next = { ...current }
        delete next[frame.id]
        return next
      })
    } catch (error) {
      setFrames((prev) => prev.map((item) => (item.id === frame.id ? frame : item)))
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre nettside for graf')
    }
  }

  const handleOpenAddHeadingModal = () => {
    setAddHeadingError(null)
    setIsAddHeadingModalOpen(true)
  }

  const handleOpenAddTextModal = () => {
    setAddTextError(null)
    setIsAddTextModalOpen(true)
  }

  const handleCloseImportStickyCsvModal = useCallback(() => {
    setIsImportStickyCsvModalOpen(false)
    clearImportStickyCsvError()
  }, [clearImportStickyCsvError])

  const handleOpenAddStickyModal = () => {
    setAddStickyError(null)
    setIsAddStickyModalOpen(true)
  }

  const handleOpenAddSection = () => {
    handleAddSectionCard()
  }

  const handleOpenImportStickyCsvModal = () => {
    handleClearImportStickyCsvFile()
    setIsImportStickyCsvModalOpen(true)
  }

  const handleOpenAddImageModal = () => {
    setAddImageError(null)
    setNewImageUrlInput('')
    setIsAddImageModalOpen(true)
  }

  const handleOpenAddIconModal = () => {
    setAddIconError(null)
    setSelectedIconId((current) => current || DEFAULT_CANVAS_ICON_ID)
    setSelectedIconColor((current) => getCanvasIconColor(current))
    setIsAddIconModalOpen(true)
  }

  const handleOpenAddFigureModal = () => {
    setSelectedFigureType('rectangle')
    setSelectedFigureColor(DEFAULT_CANVAS_ICON_COLOR)
    setAddFigureError(null)
    setIsAddFigureModalOpen(true)
  }

  const handleOpenAddDrawing = () => {
    cancelPendingFramePlacement()
    openDrawingMode()
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as CanvasChartReadyMessage | null
      if (!data || data.type !== 'umami-canvas-chart-ready') return
      if (!data.payload?.chartSql || !data.payload?.chartType) return

      const payloadWebsiteId = data.payload.websiteId?.trim()
      if (payloadWebsiteId) {
        if (!selectedWebsite?.id) {
          const matchedWebsite = availableWebsites.find((item) => item.id === payloadWebsiteId) ?? null
          if (matchedWebsite) {
            setSelectedWebsite(matchedWebsite)
          }
        }
        setCanvasConfiguredWebsiteId((current) => current || payloadWebsiteId)
      }

      setIsGrafbyggerEmbedded(false)
      queueFrameForPlacement(
        {
          kind: 'chart',
          label: data.payload.label?.trim() || 'Graf',
          chartType: data.payload.chartType,
          chartSql: data.payload.chartSql,
          websiteId: payloadWebsiteId || undefined,
          width: 560,
          height: 360,
          refreshNonce: 0,
        },
        'graf',
      )
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [availableWebsites, queueFrameForPlacement, selectedWebsite?.id])

  const handleOpenAddIllustrationModal = () => {
    setEditIllustrationFrameId(null)
    setAddIllustrationError(null)
    setSelectedIllustrationPath((current) => current || DEFAULT_CANVAS_ILLUSTRATION_PATH)
    setIsAddIllustrationModalOpen(true)
  }

  const handleToolbarCategoryChange = (nextCategoryId: number) => {
    setActiveCanvasCategoryId(nextCategoryId)
    setActiveInsightFrameId(null)
    setConnectionDragState(null)
  }

  const sectionItemCountsById = useMemo(() => {
    const next: Record<string, number> = {}
    const sectionFrames = visibleFrames.filter((frame) => frame.kind === 'section')
    sectionFrames.forEach((section) => {
      const sectionBounds = getFrameBounds(section)
      next[section.id] = visibleFrames.filter((frame) => {
        if (frame.id === section.id || frame.kind === 'section') return false
        const bounds = getFrameBounds(frame)
        return (
          bounds.left >= sectionBounds.left &&
          bounds.right <= sectionBounds.right &&
          bounds.top >= sectionBounds.top &&
          bounds.bottom <= sectionBounds.bottom
        )
      }).length
    })
    return next
  }, [getFrameBounds, visibleFrames])

  const canvasSurfaceHeight = useMemo(() => {
    const lowestFrameEdge = frameItems.reduce((maxBottom, frame) => {
      const defaults = getDefaultFrameSize(frame)
      const frameHeight =
        frame.kind === 'heading'
          ? getHeadingFrameHeight(frame) + HEADING_CARD_HEADER_HEIGHT
          : (frame.height ?? defaults.height)
      return Math.max(maxBottom, frame.y + frameHeight)
    }, 0)

    return Math.max(CANVAS_SURFACE_HEIGHT, Math.ceil(lowestFrameEdge + CANVAS_SURFACE_BOTTOM_BUFFER))
  }, [frameItems, getHeadingFrameHeight])

  const grafbyggerWebsite = useMemo(() => {
    if (selectedWebsite) return selectedWebsite
    if (!canvasConfiguredWebsiteId) return null
    return availableWebsites.find((item) => item.id === canvasConfiguredWebsiteId) ?? null
  }, [availableWebsites, canvasConfiguredWebsiteId, selectedWebsite])

  const grafbyggerSrc = useMemo(() => {
    const params = new URLSearchParams({
      focused: 'true',
      canvasEmbed: 'true',
    })

    const websiteId = selectedWebsite?.id || canvasConfiguredWebsiteId
    if (websiteId) params.set('websiteId', websiteId)

    const websiteDomain = grafbyggerWebsite?.domain?.trim()
    if (websiteDomain) params.set('domain', websiteDomain)

    const websiteName = grafbyggerWebsite?.name?.trim()
    if (websiteName) params.set('websiteName', websiteName)

    return `/grafbygger?${params.toString()}`
  }, [canvasConfiguredWebsiteId, grafbyggerWebsite?.domain, grafbyggerWebsite?.name, selectedWebsite?.id])

  return (
    <>
      <section
        aria-label="Canvas arbeidsflate"
        className="relative h-[100dvh] min-h-[100dvh] bg-[var(--ax-bg-neutral-soft)]"
        style={canvasFrontpageBackgroundStyle}
      >
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {timerA11yAnnouncement}
        </div>
        <CanvasTopBar
          canvasToolbarRef={canvasToolbarRef}
          projectId={projectId}
          canvasTitle={canvasTitle}
          period={period}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onPeriodChange={setPeriod}
          onCustomStartDateChange={setCustomStartDate}
          onCustomEndDateChange={setCustomEndDate}
          canvasInitMode={canvasInitMode}
          onOpenAddPage={handleOpenAddPageModal}
          onOpenAddDashboard={handleOpenAddDashboardModal}
          onOpenAddHeading={handleOpenAddHeadingModal}
          onOpenAddText={handleOpenAddTextModal}
          onOpenAddSticky={handleOpenAddStickyModal}
          onOpenAddSection={handleOpenAddSection}
          onOpenImportStickyCsv={handleOpenImportStickyCsvModal}
          onOpenAddImage={handleOpenAddImageModal}
          onOpenAddIcon={handleOpenAddIconModal}
          onOpenAddFigure={handleOpenAddFigureModal}
          onOpenAddDrawing={handleOpenAddDrawing}
          onOpenAddIllustration={handleOpenAddIllustrationModal}
          onOpenCreateChart={handleOpenGrafbyggerFromAddMenu}
          isGrafbyggerEmbedded={isGrafbyggerEmbedded}
          onCloseGrafbygger={() => setIsGrafbyggerEmbedded(false)}
          onOpenCreateTab={handleOpenCreateTabModal}
          onOpenManageTabs={handleOpenManageTabsModal}
          onOpenCanvasSettings={handleOpenCanvasSettingsModal}
          onOpenInventory={handleOpenInventoryModal}
          onOpenTimer={handleOpenTimerModal}
          timerLabel={timerLabel}
          isTimerRunning={isTimerRunning}
          canManageTabs={canvasCategories.length > 1}
          canPersistToDashboard={canPersistToDashboard}
          shouldShowCreateCanvasModal={shouldShowCreateCanvasModal}
          syncError={syncError}
          onDismissSyncError={() => setSyncError(null)}
          canvasCategories={canvasCategories}
          activeCanvasCategoryId={activeCanvasCategoryId}
          onChangeActiveCanvasCategory={handleToolbarCategoryChange}
          getCanvasCategoryDisplayName={getCanvasCategoryDisplayName}
          isCanvasFrontpage={isCanvasFrontpage}
          showDateFilter={showDateFilter}
          activeParticipantCount={activeParticipantCount}
          activeOtherParticipantCount={activeOtherParticipantCount}
          participantLabels={participantLabels}
        />

        <div className="flex h-full">
          <main ref={canvasViewportRef} className="relative flex-1 overflow-auto">
            {(pendingFrameDraft || pendingCsvStickyImport) && (
              <div
                className="pointer-events-none absolute left-1/2 z-[45] -translate-x-1/2 rounded-xl border-2 border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] px-5 py-3 text-base font-semibold text-[var(--ax-text-default)] shadow-lg"
                style={{ top: `${canvasCanvasTopOffset + 20}px` }}
              >
                {pendingCsvStickyImport && isImportingStickyCsv ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader size="xsmall" />
                    {pendingCsvStickyImport.tableHeaders && pendingCsvStickyImport.tableRows
                      ? 'Importerer tabell til canvas...'
                      : pendingCsvStickyImport.aggregatedRatingsText
                        ? 'Importerer aggregert vurdering til canvas...'
                        : 'Importerer CSV-lapper til canvas...'}
                  </span>
                ) : (
                  <>
                    Plasseringsmodus: klikk for å plassere {pendingFramePlacementLabel || 'element'}. Trykk Esc for å
                    avbryte.
                  </>
                )}
              </div>
            )}
            {isDrawingMode && (
              <CanvasDrawingToolbar
                topOffsetPx={canvasCanvasTopOffset + 20}
                colorOptions={CANVAS_ICON_COLOR_OPTIONS}
                strokeWidthOptions={DRAWING_STROKE_WIDTH_OPTIONS}
                drawingStrokeColor={drawingStrokeColor}
                drawingStrokeWidth={drawingStrokeWidth}
                hasAnyStroke={drawingDraftStrokes.length > 0 || Boolean(activeDrawingStroke?.points.length)}
                onStrokeColorChange={setDrawingStrokeColor}
                onStrokeWidthChange={setDrawingStrokeWidth}
                onComplete={handleCompleteDrawing}
                onUndo={handleUndoDrawingStroke}
                onCancel={handleExitDrawingMode}
              />
            )}
            <div
              className="relative"
              style={{
                width: `${CANVAS_SURFACE_WIDTH * canvasZoom}px`,
                minHeight: `${canvasCanvasTopOffset + canvasSurfaceHeight * canvasZoom}px`,
              }}
            >
              <div
                className={`absolute left-0 top-0 origin-top-left ${pendingFrameDraft || pendingCsvStickyImport || isDrawingMode ? 'cursor-crosshair' : ''}`}
                onMouseDown={isDrawingMode ? undefined : handleCanvasSurfaceMouseDown}
                onMouseMove={isDrawingMode ? undefined : handleCanvasSurfaceMouseMove}
                onMouseLeave={isDrawingMode ? undefined : handleCanvasSurfaceMouseLeave}
                style={{
                  top: `${canvasCanvasTopOffset}px`,
                  width: `${CANVAS_SURFACE_WIDTH}px`,
                  height: `${canvasSurfaceHeight}px`,
                  transform: `scale(${canvasZoom})`,
                  transformOrigin: 'top left',
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, var(--ax-border-neutral-subtle) 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              >
                {(pendingFrameDraft || pendingCsvStickyImport) && (
                  <>
                    <div className="pointer-events-none absolute inset-0 z-[44] bg-black/10" />
                  </>
                )}
                {isDrawingMode && (
                  <div
                    className="absolute inset-0 z-[95] cursor-crosshair"
                    onMouseDown={handleCanvasSurfaceMouseDown}
                    onMouseMove={handleCanvasSurfaceMouseMove}
                    onMouseLeave={handleCanvasSurfaceMouseLeave}
                  />
                )}
                {(pendingFrameDraft || pendingCsvStickyImport) && pendingFramePointer && (
                  <div
                    className="pointer-events-none absolute z-[46] -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${pendingFramePointer.x}px`,
                      top: `${pendingFramePointer.y}px`,
                    }}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] text-[var(--ax-text-default)] shadow-lg">
                      <Plus size={20} />
                    </span>
                  </div>
                )}
                {selectionBox && (
                  <div
                    className="pointer-events-none absolute z-[45] border border-[var(--ax-border-accent)] bg-[var(--ax-bg-accent-soft)]/30"
                    style={{
                      left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
                      top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
                      width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
                      height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`,
                    }}
                  />
                )}
                {connectionSegments.length > 0 && (
                  <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible">
                    <defs>
                      <marker
                        id="canvas-connection-arrow"
                        markerWidth="10"
                        markerHeight="8"
                        refX="9"
                        refY="4"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,0 L10,4 L0,8 z" fill="var(--ax-border-accent)" />
                      </marker>
                    </defs>
                    {connectionSegments.map((segment) => (
                      <g key={segment.id}>
                        <path
                          d={segment.path}
                          stroke="var(--ax-border-accent)"
                          strokeWidth={2}
                          fill="none"
                          markerEnd="url(#canvas-connection-arrow)"
                        />
                        <path
                          d={segment.path}
                          stroke="transparent"
                          strokeWidth={16}
                          fill="none"
                          className="pointer-events-auto cursor-pointer"
                          onClick={(event) => event.preventDefault()}
                        />
                      </g>
                    ))}
                  </svg>
                )}
                {connectionPreview && (
                  <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible">
                    <defs>
                      <marker
                        id="canvas-connection-arrow-preview"
                        markerWidth="10"
                        markerHeight="8"
                        refX="9"
                        refY="4"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,0 L10,4 L0,8 z" fill="var(--ax-border-accent)" />
                      </marker>
                    </defs>
                    <path
                      d={connectionPreview.path}
                      stroke="var(--ax-border-accent)"
                      strokeWidth={3}
                      strokeDasharray="8 5"
                      strokeLinecap="round"
                      fill="none"
                      markerEnd="url(#canvas-connection-arrow-preview)"
                    />
                  </svg>
                )}
                <CanvasDrawingDraftOverlay
                  drawingDraftStrokes={drawingDraftStrokes}
                  activeDrawingStroke={activeDrawingStroke}
                />
                {connectionSegmentsWithMetrics.map((segment) => (
                  <Fragment key={segment.id}>
                    <div
                      className="group pointer-events-auto absolute z-[2] -translate-x-1/2 -translate-y-1/2 overflow-visible"
                      style={{
                        left: `${segment.labelX}px`,
                        top: `${segment.labelY}px`,
                      }}
                    >
                      <div className="absolute inset-x-0 -top-10 z-10 flex items-center justify-between gap-2 rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-3 py-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ax-text-default)]">
                          <ChartNoAxesCombined size={13} className="text-[var(--ax-text-subtle)]" />
                          <span>Kobling</span>
                        </div>
                        <Button
                          size="xsmall"
                          variant="tertiary"
                          icon={<Trash2 size={14} />}
                          onClick={() => handleRequestRemoveConnection(segment)}
                          title="Fjern kobling"
                          aria-label="Fjern kobling"
                        />
                      </div>
                      <div className="min-w-[165px] overflow-hidden rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] shadow-sm">
                        <div className="space-y-2 px-3 py-2 text-[13px] leading-tight">
                          <div className="space-y-0.5 text-right">
                            <div className="font-semibold text-[14px] text-[var(--ax-text-success)]">
                              {segment.metrics.percentageOfPrev}% gikk videre
                            </div>
                            <div className="text-[13px] text-[var(--ax-text-default)]">
                              {segment.metrics.toCount.toLocaleString('nb-NO')} brukere
                            </div>
                          </div>
                          <div className="h-px bg-[var(--ax-border-neutral-subtle)]" />
                          <div className="space-y-0.5 text-right">
                            <div className="font-semibold text-[14px] text-[var(--ax-text-danger)]">
                              {segment.metrics.dropoffPercentage}% falt fra
                            </div>
                            <div className="text-[13px] text-[var(--ax-text-default)]">
                              {segment.metrics.dropoffCount.toLocaleString('nb-NO')} brukere
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Fragment>
                ))}
                <CanvasFrameLayer
                  frameItems={frameItems}
                  sectionItemCountsById={sectionItemCountsById}
                  selectedFrameIds={selectedFrameIds}
                  activeInsightFrameId={activeInsightFrameId}
                  pageInsights={pageInsights}
                  frameVisualizationData={frameVisualizationData}
                  connectionDragState={connectionDragState}
                  resizeState={resizeState}
                  dragState={dragState}
                  activeEditableFrameId={activeEditableFrameId}
                  selectedWebsite={selectedWebsite}
                  availableWebsites={availableWebsites}
                  pendingChartWebsiteByFrameId={pendingChartWebsiteByFrameId}
                  dashboardWidgetFilters={dashboardWidgetFilters}
                  chartContentRefs={chartContentRefs}
                  failedImageFrameIds={failedImageFrameIds}
                  setFailedImageFrameIds={setFailedImageFrameIds}
                  frameTablePages={frameTablePages}
                  setFrameTablePages={setFrameTablePages}
                  setPendingChartWebsiteByFrameId={setPendingChartWebsiteByFrameId}
                  activeInsightPeriodLabel={activeInsightPeriodLabel}
                  setWebsiteIframeRef={setWebsiteIframeRef}
                  handleWebsiteFrameLoad={handleWebsiteFrameLoad}
                  getDefaultFrameSize={getDefaultFrameSize}
                  getHeadingFrameFontSize={getHeadingFrameFontSize}
                  getHeadingFrameWidth={getHeadingFrameWidth}
                  getHeadingFrameHeight={getHeadingFrameHeight}
                  getFrameLockStatus={getFrameLockStatus}
                  formatCanvasPathLabel={formatCanvasPathLabel}
                  isImagePreviewUrl={isImagePreviewUrl}
                  handleDragStart={handleDragStart}
                  handleToggleInsightPanel={handleToggleInsightPanel}
                  handleRefreshFrame={handleRefreshFrame}
                  handleDuplicateWebsiteCard={handleDuplicateWebsiteCard}
                  handleOpenEditDashboardModal={handleOpenEditDashboardModal}
                  handleOpenEditWebsiteModal={handleOpenEditWebsiteModal}
                  handleOpenEditImageModal={handleOpenEditImageModal}
                  handleOpenEditIllustrationModal={handleOpenEditIllustrationModal}
                  handleOpenEditIconModal={handleOpenEditIconModal}
                  handleDuplicateIconCard={handleDuplicateIconCard}
                  handleRotateIconFrame={handleRotateIconFrame}
                  handleOpenEditFigureModal={handleOpenEditFigureModal}
                  handleDuplicateFigureCard={handleDuplicateFigureCard}
                  handleAdjustHeadingFontSize={handleAdjustHeadingFontSize}
                  handleRotateIllustrationFrame={handleRotateIllustrationFrame}
                  handleToggleSectionLayout={handleToggleSectionLayout}
                  handleRequestRemoveFrame={handleRequestRemoveFrame}
                  startConnectionDrag={startConnectionDrag}
                  handleAssignWebsiteToChart={handleAssignWebsiteToChart}
                  handleOpenEditChartModal={handleOpenEditChartModal}
                  handleOpenDeleteChartModal={handleOpenDeleteChartModal}
                  handleEditableFrameChange={handleEditableFrameChange}
                  handleEditableFrameBlur={handleEditableFrameBlur}
                  handleStartEditingFrame={handleStartEditingFrame}
                  handleResizeStart={handleResizeStart}
                />
              </div>
            </div>
          </main>
        </div>
        {isGrafbyggerEmbedded && (
          <div
            className="absolute bottom-0 left-0 right-0 z-40 overflow-hidden bg-[var(--ax-bg-default)]"
            style={{ top: `${canvasCanvasTopOffset}px` }}
          >
            <div className="h-full p-3">
              <div className="h-full overflow-hidden rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-white shadow-sm">
                <iframe
                  title="Grafbygger i canvas"
                  src={grafbyggerSrc}
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        )}
        <aside aria-label="Canvas-handlinger" className="pointer-events-none fixed bottom-4 right-4 z-30">
          <div className="pointer-events-auto flex items-center gap-2">
            {!isGrafbyggerEmbedded && (
              <>
                {selectedFrameIds.length > 0 && (
                  <div className="rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
                    <Button
                      size="xsmall"
                      variant="tertiary"
                      onClick={handleRequestRemoveSelectedFrames}
                      title="Fjern valgte kort"
                      icon={<Trash2 size={14} />}
                      className="rounded-full px-2"
                    >
                      Fjern valgte ({selectedFrameIds.length})
                    </Button>
                  </div>
                )}
                <CanvasZoomControls
                  canvasZoom={canvasZoom}
                  onZoomOut={() => handleCanvasZoomChange(canvasZoom - CANVAS_ZOOM_STEP)}
                  onZoomReset={handleCanvasZoomReset}
                  onZoomIn={() => handleCanvasZoomChange(canvasZoom + CANVAS_ZOOM_STEP)}
                />
              </>
            )}
          </div>
        </aside>
      </section>

      <CanvasCoreModals
        shouldShowCreateCanvasModal={shouldShowCreateCanvasModal}
        isCreateTeamModalOpen={isCreateTeamModalOpen}
        isCreatingCanvas={isCreatingCanvas}
        createCanvasProjectId={createCanvasProjectId}
        createCanvasProjectOptions={createCanvasProjectOptions}
        isLoadingExistingCanvasOptions={isLoadingExistingCanvasOptions}
        existingCanvasOptions={existingCanvasOptions}
        existingCanvasError={existingCanvasError}
        createCanvasNameInput={createCanvasNameInput}
        createCanvasError={createCanvasError}
        onOpenCreateTeam={() => {
          setCreateTeamError(null)
          setIsCreateTeamModalOpen(true)
        }}
        onCreateCanvasProjectIdChange={(value) => {
          setCreateCanvasProjectId(value)
          setExistingCanvasError(null)
          const parsedProjectId = Number(value)
          void loadExistingCanvasOptions(Number.isFinite(parsedProjectId) ? parsedProjectId : null)
          if (createCanvasError) setCreateCanvasError(null)
        }}
        onCreateCanvasNameChange={(value) => {
          setCreateCanvasNameInput(value)
          if (createCanvasError) setCreateCanvasError(null)
        }}
        onSubmitCreateCanvas={() => void handleCreateCanvas()}
        isCreatingTeam={isCreatingTeam}
        createTeamNameInput={createTeamNameInput}
        createTeamDescriptionInput={createTeamDescriptionInput}
        createTeamError={createTeamError}
        onCloseCreateTeam={() => {
          if (isCreatingTeam) return
          setIsCreateTeamModalOpen(false)
          setCreateTeamError(null)
        }}
        onCreateTeamNameChange={(value) => {
          setCreateTeamNameInput(value)
          if (createTeamError) setCreateTeamError(null)
        }}
        onCreateTeamDescriptionChange={(value) => {
          setCreateTeamDescriptionInput(value)
          if (createTeamError) setCreateTeamError(null)
        }}
        onSubmitCreateTeam={() => void handleCreateTeam()}
        isAddDashboardModalOpen={isAddDashboardModalOpen}
        isLoadingDashboardOptions={isLoadingDashboardOptions}
        selectedProjectToAddId={selectedProjectToAddId}
        projectOptions={projectOptions}
        selectedDashboardToAddId={selectedDashboardToAddId}
        dashboardOptions={dashboardOptions}
        addDashboardError={addDashboardError}
        onCloseAddDashboardModal={() => {
          setIsAddDashboardModalOpen(false)
          setAddDashboardError(null)
        }}
        onAddDashboardProjectChange={(value) => {
          setSelectedProjectToAddId(value)
          setSelectedDashboardToAddId('')
          if (addDashboardError) setAddDashboardError(null)
          const parsedProjectId = Number(value)
          void loadDashboardOptions(Number.isFinite(parsedProjectId) ? parsedProjectId : null)
        }}
        onAddDashboardSelectionChange={(value) => {
          setSelectedDashboardToAddId(value)
          if (addDashboardError) setAddDashboardError(null)
        }}
        onSubmitAddDashboard={() => void handleAddDashboardCard()}
        isEditDashboardModalOpen={isEditDashboardModalOpen}
        isLoadingEditDashboardOptions={isLoadingEditDashboardOptions}
        editDashboardSelectedProjectId={editDashboardSelectedProjectId}
        editDashboardProjectOptions={editDashboardProjectOptions}
        editDashboardSelectedDashboardId={editDashboardSelectedDashboardId}
        editDashboardOptions={editDashboardOptions}
        editDashboardError={editDashboardError}
        onCloseEditDashboardModal={() => {
          setIsEditDashboardModalOpen(false)
          setEditDashboardFrameId(null)
          setEditDashboardError(null)
        }}
        onEditDashboardProjectChange={(value) => {
          setEditDashboardSelectedProjectId(value)
          setEditDashboardSelectedDashboardId('')
          if (editDashboardError) setEditDashboardError(null)
          const parsedProjectId = Number(value)
          void loadEditDashboardOptions(Number.isFinite(parsedProjectId) ? parsedProjectId : null)
        }}
        onEditDashboardSelectionChange={(value) => {
          setEditDashboardSelectedDashboardId(value)
          if (editDashboardError) setEditDashboardError(null)
        }}
        onSubmitEditDashboard={() => void handleSaveEditedDashboard()}
        deleteTarget={deleteTarget}
        bulkDeleteProgress={bulkDeleteProgress}
        onCloseDeleteModal={() => setDeleteTarget(null)}
        onConfirmDeleteTarget={() => void handleConfirmDeleteTarget()}
        isAddChartModalOpen={isAddChartModalOpen}
        isLoadingChartOptions={isLoadingChartOptions}
        chartOptions={chartOptions}
        selectedChartOptionId={selectedChartOptionId}
        addChartError={addChartError}
        onCloseAddChartModal={() => {
          setIsAddChartModalOpen(false)
          setAddChartError(null)
        }}
        onChartOptionChange={(value) => {
          setSelectedChartOptionId(value)
          if (addChartError) setAddChartError(null)
        }}
        onSubmitAddChart={() => void handleAddChartCard()}
        isSavingCanvasItem={isSavingCanvasItem}
      />

      <CanvasAdminModals
        isCanvasSettingsModalOpen={isCanvasSettingsModalOpen}
        onCloseCanvasSettings={() => {
          setIsCanvasSettingsModalOpen(false)
          setRenameCanvasError(null)
          setCanvasSettingsInfo(null)
        }}
        canvasSettingsInfo={canvasSettingsInfo}
        renameCanvasInput={renameCanvasInput}
        onRenameCanvasInputChange={(value) => {
          setRenameCanvasInput(value)
          if (renameCanvasError) setRenameCanvasError(null)
        }}
        renameCanvasError={renameCanvasError}
        onRenameCanvas={() => void handleRenameCanvas()}
        isSavingCanvasItem={isSavingCanvasItem}
        isCreateTabModalOpen={isCreateTabModalOpen}
        onCloseCreateTab={() => {
          setIsCreateTabModalOpen(false)
          setCreateTabError(null)
        }}
        newTabName={newTabName}
        onNewTabNameChange={(value) => {
          setNewTabName(value)
          if (createTabError) setCreateTabError(null)
        }}
        createTabError={createTabError}
        onCreateTab={() => void handleCreateTab()}
        creatingTab={creatingTab}
        isManageTabsModalOpen={isManageTabsModalOpen}
        onCloseManageTabs={() => {
          setIsManageTabsModalOpen(false)
          setManageTabError(null)
        }}
        manageTabId={manageTabId}
        onManageTabSelect={(nextId) => {
          setManageTabId(nextId)
          const selected = canvasCategories.find((category) => String(category.id) === nextId)
          setManageTabName(selected?.name ?? '')
          if (manageTabError) setManageTabError(null)
        }}
        manageTabName={manageTabName}
        onManageTabNameChange={(value) => {
          setManageTabName(value)
          if (manageTabError) setManageTabError(null)
        }}
        manageTabError={manageTabError}
        canvasCategories={canvasCategories}
        getCanvasCategoryDisplayName={getCanvasCategoryDisplayName}
        selectedManageTabInfoText={
          selectedManageTab
            ? selectedManageTabIsFirst
              ? 'Første fane kan ikke slettes.'
              : selectedManageTabIsEmpty
                ? 'Denne fanen er tom og kan slettes.'
                : `Fanen inneholder ${selectedManageTabItemCount} element(er) og kan ikke slettes.`
            : null
        }
        savingManageTab={savingManageTab}
        deletingManageTab={deletingManageTab}
        canSaveManageTab={!deletingManageTab && Boolean(manageTabId) && canvasCategories.length > 0}
        canDeleteManageTab={Boolean(
          !savingManageTab && selectedManageTab && !selectedManageTabIsFirst && selectedManageTabIsEmpty,
        )}
        onRenameTab={() => void handleRenameTab()}
        onDeleteTab={() => void handleDeleteTab()}
        isInventoryModalOpen={isInventoryModalOpen}
        onCloseInventory={() => setIsInventoryModalOpen(false)}
        inventoryItems={inventoryItems}
        onDeleteInventoryType={handleDeleteInventoryType}
        onSelectInventoryFrames={handleSelectInventoryFrames}
      />

      <CanvasTimerModal
        open={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        minutesInput={timerMinutesInput}
        onMinutesInputChange={(value) => {
          setTimerMinutesInput(value)
          if (timerModalError) setTimerModalError(null)
        }}
        onStart={handleStartCanvasTimer}
        onStop={handleStopCanvasTimer}
        onPause={handlePauseCanvasTimer}
        onResume={handleResumeCanvasTimer}
        onAdjustMinusOneMinute={handleAdjustTimerMinusOneMinute}
        onAdjustPlusOneMinute={handleAdjustTimerPlusOneMinute}
        isRunning={isTimerRunning}
        isPaused={isTimerPaused}
        timerLabel={timerLabel}
        isSaving={isSavingTimer}
        pendingAction={timerModalPendingAction}
        error={timerModalError}
      />

      <CanvasImageUrlModal
        open={isAddImageModalOpen}
        heading="Legg til bilde i canvas"
        urlValue={newImageUrlInput}
        error={addImageError}
        isSaving={isSavingCanvasItem}
        submitLabel="Legg til"
        onUrlChange={(value) => {
          setNewImageUrlInput(value)
          if (addImageError) setAddImageError(null)
        }}
        onSubmit={() => void handleAddImage()}
        onClose={() => setIsAddImageModalOpen(false)}
      />

      <CanvasIllustrationModal
        open={isAddIllustrationModalOpen}
        isEdit={Boolean(editIllustrationFrameId)}
        selectedPath={selectedIllustrationPath}
        error={addIllustrationError}
        isSaving={isSavingCanvasItem}
        onSelectPath={(path) => {
          setSelectedIllustrationPath(path)
          if (addIllustrationError) setAddIllustrationError(null)
        }}
        onSubmit={() => void handleAddIllustration()}
        onClose={() => {
          setIsAddIllustrationModalOpen(false)
          setEditIllustrationFrameId(null)
          setAddIllustrationError(null)
        }}
      />

      <CanvasImageUrlModal
        open={isEditImageModalOpen}
        heading="Rediger bilde"
        urlValue={editImageUrlInput}
        error={editImageError}
        isSaving={isSavingCanvasItem}
        submitLabel="Lagre"
        onUrlChange={(value) => {
          setEditImageUrlInput(value)
          if (editImageError) setEditImageError(null)
        }}
        onSubmit={() => void handleSaveEditedImage()}
        onClose={() => {
          setIsEditImageModalOpen(false)
          setEditImageFrameId(null)
          setEditImageError(null)
        }}
      />

      <CanvasIconModal
        open={isEditIconModalOpen}
        heading="Rediger ikon"
        selectedIconId={editIconSelectedId}
        selectedColor={editIconSelectedColor}
        colorOptions={CANVAS_ICON_COLOR_OPTIONS}
        error={editIconError}
        isSaving={isSavingCanvasItem}
        submitLabel="Lagre"
        onSelectIcon={(iconId) => {
          setEditIconSelectedId(iconId)
          if (editIconError) setEditIconError(null)
        }}
        onSelectColor={(color) => {
          setEditIconSelectedColor(color)
          if (editIconError) setEditIconError(null)
        }}
        onSubmit={() => void handleSaveEditedIcon()}
        onClose={() => {
          setIsEditIconModalOpen(false)
          setEditIconFrameId(null)
          setEditIconError(null)
        }}
      />

      <CanvasFigureModal
        open={isEditFigureModalOpen}
        isEdit
        selectedType={editFigureSelectedType}
        selectedColor={editFigureSelectedColor}
        figureOptions={CANVAS_FIGURE_OPTIONS}
        colorOptions={CANVAS_ICON_COLOR_OPTIONS}
        error={editFigureError}
        isSaving={isSavingCanvasItem}
        onSelectType={(type) => {
          setEditFigureSelectedType(type as CanvasFigureType)
          if (editFigureError) setEditFigureError(null)
        }}
        onSelectColor={(color) => {
          setEditFigureSelectedColor(color)
          if (editFigureError) setEditFigureError(null)
        }}
        onSubmit={() => void handleSaveEditedFigure()}
        onClose={() => {
          setIsEditFigureModalOpen(false)
          setEditFigureFrameId(null)
          setEditFigureError(null)
        }}
      />

      <CanvasWebsiteModal
        open={isAddPageModalOpen}
        isEdit={false}
        selectedWebsite={selectedWebsite}
        pathValue={newPagePathInput}
        renderEnabled={newPageRenderEnabled}
        visualizationMode={newPageVisualizationMode}
        previewUrlValue={newPagePreviewUrlInput}
        error={addPageError}
        isSaving={isSavingCanvasItem}
        onWebsiteChange={(website) => {
          setSelectedWebsite(website)
          if (addPageError) setAddPageError(null)
        }}
        onPathChange={(value) => {
          setNewPagePathInput(value)
          if (addPageError) setAddPageError(null)
        }}
        onRenderEnabledChange={(checked) => {
          setNewPageRenderEnabled(checked)
          if (addPageError) setAddPageError(null)
        }}
        onVisualizationModeChange={(mode) => {
          setNewPageVisualizationMode(mode)
          if (addPageError) setAddPageError(null)
        }}
        onPreviewUrlChange={(value) => {
          setNewPagePreviewUrlInput(value)
          if (addPageError) setAddPageError(null)
        }}
        onSubmit={() => void handleAddPage()}
        onClose={() => {
          setIsAddPageModalOpen(false)
          setAddPageError(null)
          setNewPagePreviewUrlInput('')
          setNewPageRenderEnabled(true)
          setNewPageVisualizationMode('')
        }}
      />

      <CanvasWebsiteModal
        open={isEditWebsiteModalOpen}
        isEdit
        selectedWebsite={selectedWebsite}
        pathValue={editWebsitePathInput}
        renderEnabled={editWebsiteRenderEnabled}
        visualizationMode={editWebsiteVisualizationMode}
        previewUrlValue={editWebsitePreviewUrlInput}
        error={editWebsiteError}
        isSaving={isSavingCanvasItem}
        onWebsiteChange={() => {
          // Website selection is hidden in edit mode.
        }}
        onPathChange={(value) => {
          setEditWebsitePathInput(value)
          if (editWebsiteError) setEditWebsiteError(null)
        }}
        onRenderEnabledChange={(checked) => {
          setEditWebsiteRenderEnabled(checked)
          if (editWebsiteError) setEditWebsiteError(null)
        }}
        onVisualizationModeChange={(mode) => {
          setEditWebsiteVisualizationMode(mode)
          if (editWebsiteError) setEditWebsiteError(null)
        }}
        onPreviewUrlChange={(value) => {
          setEditWebsitePreviewUrlInput(value)
          if (editWebsiteError) setEditWebsiteError(null)
        }}
        onSubmit={() => void handleSaveEditedWebsite()}
        onClose={() => {
          setIsEditWebsiteModalOpen(false)
          setEditWebsiteFrameId(null)
          setEditWebsiteError(null)
          setEditWebsiteVisualizationMode('')
        }}
      />

      <EditChartDialog
        key={editChartTarget?.id ?? 'canvas-edit-chart-dialog'}
        open={Boolean(editChartTarget)}
        chart={editChartTarget}
        defaultWebsiteId={
          frames.find((frame) => frame.id === editChartFrameId && frame.kind === 'chart')?.websiteId ??
          selectedWebsite?.id
        }
        loading={savingEditChart}
        error={chartMutationError}
        defaultShowSql
        onClose={() => {
          setEditChartTarget(null)
          setEditChartFrameId(null)
          setChartMutationError(null)
        }}
        onSave={handleSaveEditedChart}
      />

      <DeleteChartDialog
        open={Boolean(deleteChartTarget)}
        chart={deleteChartTarget}
        loading={deletingChart}
        error={chartMutationError}
        onClose={() => {
          setDeleteChartTarget(null)
          setDeleteChartFrameId(null)
          setChartMutationError(null)
        }}
        onConfirm={handleDeleteChart}
      />

      <CanvasHeadingModal
        open={isAddHeadingModalOpen}
        value={headingTextInput}
        error={addHeadingError}
        isSaving={isSavingCanvasItem}
        onChange={(value) => {
          setHeadingTextInput(value)
          if (addHeadingError) setAddHeadingError(null)
        }}
        onSubmit={() => void handleAddHeadingCard()}
        onClose={() => {
          setIsAddHeadingModalOpen(false)
          setAddHeadingError(null)
        }}
      />

      <CanvasTextModal
        open={isAddTextModalOpen}
        value={textContentInput}
        error={addTextError}
        isSaving={isSavingCanvasItem}
        onChange={(value) => {
          setTextContentInput(value)
          if (addTextError) setAddTextError(null)
        }}
        onSubmit={() => void handleAddTextCard()}
        onClose={() => {
          setIsAddTextModalOpen(false)
          setAddTextError(null)
        }}
      />

      <CanvasIconModal
        open={isAddIconModalOpen}
        heading="Legg til ikon"
        selectedIconId={selectedIconId}
        selectedColor={selectedIconColor}
        colorOptions={CANVAS_ICON_COLOR_OPTIONS}
        error={addIconError}
        isSaving={isSavingCanvasItem}
        submitLabel="Legg til"
        onSelectIcon={(iconId) => {
          setSelectedIconId(iconId)
          if (addIconError) setAddIconError(null)
        }}
        onSelectColor={(color) => {
          setSelectedIconColor(color)
          if (addIconError) setAddIconError(null)
        }}
        onSubmit={() => void handleAddIconCard()}
        onClose={() => {
          setIsAddIconModalOpen(false)
          setAddIconError(null)
        }}
      />

      <CanvasImportStickyCsvModal
        open={isImportStickyCsvModalOpen}
        onClose={handleCloseImportStickyCsvModal}
        onImport={() => {
          const didPrepareImport = handleImportStickyCsv()
          if (!didPrepareImport) return
          setIsImportStickyCsvModalOpen(false)
        }}
        isSaving={isSavingCanvasItem}
        fileInputRef={importStickyCsvFileInputRef}
        onFileChange={handleImportStickyCsvFileChange}
        onClearFile={handleClearImportStickyCsvFile}
        fileName={importStickyCsvFileName}
        rowCount={importStickyCsvRows.length}
        headers={importStickyCsvHeaders}
        contentColumn={importStickyContentColumn}
        onContentColumnChange={handleContentColumnChange}
        canChooseNonNumericImportStyle={canChooseNonNumericImportStyle}
        importStyle={importStickyStyle}
        onImportStyleChange={handleImportStyleChange}
        tableMode={importStickyTableMode}
        onTableModeChange={handleTableModeChange}
        hasNumericSummary={Boolean(importStickyNumericSummary)}
        hasPrivacyFindings={hasImportStickyPrivacyFindings}
        privacyFindings={importStickyPrivacyFindings}
        privacyReviewed={importStickyPrivacyReviewed}
        onPrivacyReviewedChange={setImportStickyPrivacyReviewed}
        shouldImportAsAggregated={shouldImportStickyAsAggregated}
        error={importStickyCsvError}
        previewNotes={importStickyPreviewNotes}
        sectionTitle={importStickySectionTitle}
        numericSummaryRows={importStickyNumericSummaryRows}
        categoricalSummaryRows={importStickyCategoricalSummaryRows}
        tablePreviewNumericSummaryRows={importStickyTablePreviewNumericSummaryRows}
        tablePreviewSummaryRows={importStickyTablePreviewSummaryRows}
        tablePreviewNoteRows={importStickyTablePreviewNoteRows}
        tablePreviewPageCount={importStickyTablePreviewPageCount}
        currentTablePreviewPage={currentImportStickyTablePreviewPage}
        onPrevTablePreviewPage={handlePrevTablePreviewPage}
        onNextTablePreviewPage={handleNextTablePreviewPage}
        onExcludeRow={handleExcludeRow}
      />

      <CanvasStickyModal
        open={isAddStickyModalOpen}
        value={stickyContentInput}
        error={addStickyError}
        isSaving={isSavingCanvasItem}
        onChange={(value) => {
          setStickyContentInput(value)
          if (addStickyError) setAddStickyError(null)
        }}
        onSubmit={() => void handleAddStickyCard()}
        onClose={() => {
          setIsAddStickyModalOpen(false)
          setAddStickyError(null)
        }}
      />

      <CanvasFigureModal
        open={isAddFigureModalOpen}
        isEdit={false}
        selectedType={selectedFigureType}
        selectedColor={selectedFigureColor}
        figureOptions={CANVAS_FIGURE_OPTIONS}
        colorOptions={CANVAS_ICON_COLOR_OPTIONS}
        error={addFigureError}
        isSaving={isSavingCanvasItem}
        onSelectType={(type) => {
          setSelectedFigureType(type as CanvasFigureType)
          if (addFigureError) setAddFigureError(null)
        }}
        onSelectColor={(color) => {
          setSelectedFigureColor(color)
          if (addFigureError) setAddFigureError(null)
        }}
        onSubmit={() => void handleAddFigureCard()}
        onClose={() => {
          setIsAddFigureModalOpen(false)
          setAddFigureError(null)
        }}
      />
    </>
  )
}

export default Canvas
