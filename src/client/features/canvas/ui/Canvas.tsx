import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import CanvasIllustrationModal from './illustration/CanvasIllustrationModal.tsx'
import { DEFAULT_CANVAS_ILLUSTRATION_PATH } from './illustration/CanvasIllustrationRegistry.ts'
import CanvasIconModal from './icon/CanvasIconModal.tsx'
import CanvasAdminModals from './controls/CanvasAdminModals.tsx'
import CanvasCoreModals from './controls/CanvasCoreModals.tsx'
import CanvasTopBar from './controls/CanvasTopBar.tsx'
import CanvasDotVotingModal from './controls/CanvasDotVotingModal.tsx'
import CanvasTimerModal from './controls/CanvasTimerModal.tsx'
import type { SectionAddAction } from './controls/CanvasFrameActionPoints.tsx'
import CanvasDrawingToolbar from './drawing/CanvasDrawingToolbar.tsx'
import CanvasDrawingDraftOverlay from './drawing/CanvasDrawingDraftOverlay.tsx'
import CanvasDrawingAccessibilityModal from './drawing/CanvasDrawingAccessibilityModal.tsx'
import CanvasConnectionLayer from './layers/CanvasConnectionLayer.tsx'
import CanvasFloatingControls from './controls/CanvasFloatingControls.tsx'
import CanvasGrafbyggerOverlay from './controls/CanvasGrafbyggerOverlay.tsx'
import CanvasPlacementModeLayer, { CanvasPlacementModeBanner } from './layers/CanvasPlacementModeLayer.tsx'
import CanvasFrameLayer from './layers/CanvasFrameLayer.tsx'
import CanvasImageUrlModal from './image/CanvasImageUrlModal.tsx'
import CanvasFigureModal from './figure/CanvasFigureModal.tsx'
import CanvasHeadingModal from './heading/CanvasHeadingModal.tsx'
import CanvasTextModal from './text/CanvasTextModal.tsx'
import CanvasTableModal from './text/CanvasTableModal.tsx'
import CanvasLinkModal from './link/CanvasLinkModal.tsx'
import CanvasStickyModal from './sticky/CanvasStickyModal.tsx'
import CanvasSectionModal from './section/CanvasSectionModal.tsx'
import {
  CANVAS_STICKY_COLOR_OPTIONS,
  DEFAULT_CANVAS_STICKY_COLOR,
  getCanvasStickyColor,
} from './sticky/CanvasStickyColorRegistry.ts'
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
} from './icon/CanvasIconRegistry.ts'
import {
  createCategory,
  createGraph,
  createQuery,
  deleteGraph,
  fetchCategories,
  fetchDashboards,
  fetchGraphs,
  updateDashboard,
  updateQuery,
} from '../../oversikt/api/oversiktApi.ts'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'
import EditChartDialog from '../../oversikt/ui/dialogs/EditChartDialog.tsx'
import DeleteChartDialog from '../../oversikt/ui/dialogs/DeleteChartDialog.tsx'
import type { Website } from '../../../shared/types/website.ts'
import { useCookieStartDate, useCookieSupport } from '../../../shared/hooks/useSiteimproveSupport.ts'
import { useLocation } from 'react-router-dom'
import useCanvasCsvImport from '../hooks/useCanvasCsvImport.ts'
import useCanvasBackgroundSync from '../hooks/useCanvasBackgroundSync.ts'
import useCanvasAdminFlow from '../hooks/useCanvasAdminFlow.ts'
import useCanvasEditLocks from '../hooks/useCanvasEditLocks.ts'
import useCanvasFrameFormHandlers from '../hooks/useCanvasFrameFormHandlers.ts'
import useCanvasPresence from '../hooks/useCanvasPresence.ts'
import useCanvasDotVotingSync from '../hooks/useCanvasDotVotingSync.ts'
import useCanvasTimerSync from '../hooks/useCanvasTimerSync.ts'
import useCanvasInteractions, {
  type CanvasDragState,
  type CanvasResizeState,
  type CanvasSelectionBox,
} from '../hooks/useCanvasInteractions.ts'
import useCanvasPlacement from '../hooks/useCanvasPlacement.ts'
import useCanvasPlacementState from '../hooks/useCanvasPlacementState.ts'
import useCanvasChartMutations from '../hooks/useCanvasChartMutations.ts'
import { fetchCanvasStorageData } from '../api/canvasStorageApi.ts'
import ChangeLogModal, { type ChangeLogEntry } from '../../../shared/ui/ChangeLogModal.tsx'
import { buildCanvasPresentationUrl, buildCanvasShareUrl } from '../share/utils/canvasShareLayout.ts'

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
  CanvasSectionLayoutMode,
  ConnectionAnchorSide,
  ConnectionDragState,
  PendingCanvasFrameDraft,
} from '../model/types.ts'
import {
  GRID_SECTION_LAYOUT_CONFIG,
  compareFramesForGridLayout,
  compareFramesForSectionOrder,
  findContainingGridSectionId,
  getFrameBoundsForLayout as getFrameBoundsForLayoutBase,
  reflowGridSections as reflowGridSectionFrames,
} from '../model/layout/gridSectionLayout.ts'
import { buildCanvasHierarchy } from '../utils/canvasHierarchy.ts'
import {
  CANVAS_DASHBOARD_TOKEN,
  CANVAS_FIGURE_OPTIONS,
  CANVAS_INVENTORY_DETAIL_LIMIT_PER_TYPE,
  CANVAS_INVENTORY_KIND_OPTIONS,
  CANVAS_QUERY_NAME,
  CANVAS_SURFACE_BOTTOM_BUFFER,
  CANVAS_SURFACE_HEIGHT,
  CANVAS_SURFACE_RIGHT_BUFFER,
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
  buildCanvasConnectionStorageGraphName,
  buildCanvasStorageGraphName,
  buildConnectionPath,
  buildFunnelStepFromUrl,
  clampCanvasZoom,
  estimateTableFrameHeight,
  extractCanvasCustomEndDateFromDescription,
  extractCanvasCustomStartDateFromDescription,
  extractCanvasHideDateFilterFromDescription,
  extractCanvasLockedFromDescription,
  extractCanvasPeriodFromDescription,
  extractCanvasWebsiteIdFromDescription,
  buildCanvasDashboardDescription,
  formatCanvasPathLabel,
  getCanvasCategoryDisplayName,
  getCanvasPeriodLabel,
  getWebsiteFrameDisplayUrl,
  getWebsiteFrameRenderSrc,
  isImagePreviewUrl,
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

  if (kind === 'website' && isInternalDashboard) return { width: 760, height: 760, minWidth: 520, minHeight: 420 }
  if (kind === 'website') return { width: 420, height: 700, minWidth: 220, minHeight: 160 }
  if (kind === 'image' && isIllustration) return { width: 420, height: 420, minWidth: 96, minHeight: 96 }
  if (kind === 'image') return { width: 420, height: 420, minWidth: 240, minHeight: 200 }
  if (kind === 'chart') return { width: 560, height: 360, minWidth: 280, minHeight: 200 }
  if (kind === 'sql-editor') return { width: 420, height: 760, minWidth: 260, minHeight: 320 }
  if (kind === 'code-block') return { width: 420, height: 760, minWidth: 260, minHeight: 320 }
  if (kind === 'heading') return { width: 420, height: 72, minWidth: 260, minHeight: 48 }
  if (kind === 'text') return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
  if (kind === 'link') return { width: 380, height: 112, minWidth: 280, minHeight: 92 }
  if (kind === 'icon') return { width: 280, height: 240, minWidth: 72, minHeight: 72 }
  if (kind === 'figure') {
    const isLineOrArrow =
      typeof frameOrKind !== 'string' && (frameOrKind.figureType === 'line' || frameOrKind.figureType === 'arrow')
    return { width: 240, height: 240, minWidth: isLineOrArrow ? 12 : 120, minHeight: isLineOrArrow ? 12 : 120 }
  }
  if (kind === 'drawing') return { width: 240, height: 160, minWidth: 28, minHeight: 28 }
  if (kind === 'section') return { width: 640, height: 420, minWidth: 240, minHeight: 180 }
  return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
}

const getPendingFrameContentAnchorOffset = (draft: PendingCanvasFrameDraft): { x: number; y: number } => {
  if (draft.kind === 'heading') return { x: 16, y: 9 }
  if (draft.kind === 'text') return { x: 16, y: 0 }
  if (draft.kind === 'link') return { x: 16, y: 16 }
  if (draft.kind === 'sticky') return { x: 24, y: 24 }
  return { x: 0, y: 0 }
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

const STICKY_CARD_HORIZONTAL_PADDING = 32
const STICKY_CARD_VERTICAL_PADDING = 40
const STICKY_CARD_MIN_HEIGHT = 180
const STICKY_CARD_LINE_HEIGHT = 28
const STICKY_CARD_CHAR_WIDTH_FACTOR = 0.55
const METABASE_CREATED_AT_FILTER_REGEX = /\[\[\s*AND\s*\{\{\s*created_at\s*\}\}\s*\]\]/i
const METABASE_URL_STI_FILTER_REGEX =
  /\[\[\s*\{\{\s*url_sti\s*\}\}\s*--\s*\]\]\s*'\/'|\[\[\s*AND\s*\{\{\s*url_sti\s*\}\}\s*\]\]|\{\{\s*url_sti\s*\}\}/i

const estimateStickyFrameHeight = (text: string, width: number): number => {
  const normalizedText = text.trim()
  const usableWidth = Math.max(120, width - STICKY_CARD_HORIZONTAL_PADDING)
  const approxCharsPerLine = Math.max(12, Math.floor(usableWidth / (16 * STICKY_CARD_CHAR_WIDTH_FACTOR)))
  const lineCount = normalizedText
    ? normalizedText
        .split('\n')
        .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / approxCharsPerLine)), 0)
    : 1

  return Math.max(STICKY_CARD_MIN_HEIGHT, lineCount * STICKY_CARD_LINE_HEIGHT + STICKY_CARD_VERTICAL_PADDING)
}

const Canvas = () => {
  const LAST_PROJECT_STORAGE_KEY = 'projectmanager:lastSelectedProjectId'
  const WEBSITE_TOP_LIST_VISIBLE_STORAGE_KEY = 'canvas:websiteTopListVisible'
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
  const [canvasDefaultPeriod, setCanvasDefaultPeriod] = useState<string>(() =>
    getStoredPeriod(new URLSearchParams(window.location.search).get('period')),
  )
  const [canvasDefaultCustomStartDate, setCanvasDefaultCustomStartDate] = useState<Date | undefined>(undefined)
  const [canvasDefaultCustomEndDate, setCanvasDefaultCustomEndDate] = useState<Date | undefined>(undefined)
  const [canvasHideDateFilter, setCanvasHideDateFilter] = useState(false)
  const usesCookies = useCookieSupport(selectedWebsite?.domain, selectedWebsite?.id)
  const cookieStartDate = useCookieStartDate(selectedWebsite?.domain, selectedWebsite?.id)
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)
  const [websiteTopListEnabled, setWebsiteTopListEnabled] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(WEBSITE_TOP_LIST_VISIBLE_STORAGE_KEY)
      if (stored === null) return true
      return stored !== 'false'
    } catch {
      return true
    }
  })
  const [frames, setFrames] = useState<CanvasFrame[]>([])
  const [connections, setConnections] = useState<CanvasConnection[]>([])
  const [isAddPageModalOpen, setIsAddPageModalOpen] = useState(false)
  const [isAddImageModalOpen, setIsAddImageModalOpen] = useState(false)
  const [isAddIllustrationModalOpen, setIsAddIllustrationModalOpen] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(WEBSITE_TOP_LIST_VISIBLE_STORAGE_KEY, websiteTopListEnabled ? 'true' : 'false')
    } catch {
      return
    }
  }, [WEBSITE_TOP_LIST_VISIBLE_STORAGE_KEY, websiteTopListEnabled])
  const [isAddDashboardModalOpen, setIsAddDashboardModalOpen] = useState(false)
  const [isAddHeadingModalOpen, setIsAddHeadingModalOpen] = useState(false)
  const [isAddTextModalOpen, setIsAddTextModalOpen] = useState(false)
  const [isAddTableModalOpen, setIsAddTableModalOpen] = useState(false)
  const [isAddLinkModalOpen, setIsAddLinkModalOpen] = useState(false)
  const [isAddStickyModalOpen, setIsAddStickyModalOpen] = useState(false)
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false)
  const [isImportStickyCsvModalOpen, setIsImportStickyCsvModalOpen] = useState(false)
  const [isAddIconModalOpen, setIsAddIconModalOpen] = useState(false)
  const [isAddFigureModalOpen, setIsAddFigureModalOpen] = useState(false)
  const [isDrawingAccessibilityModalOpen, setIsDrawingAccessibilityModalOpen] = useState(false)
  const [isCanvasSettingsModalOpen, setIsCanvasSettingsModalOpen] = useState(false)
  const [canvasSettingsInfo, setCanvasSettingsInfo] = useState<string | null>(null)
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false)
  const [isChangeLogModalOpen, setIsChangeLogModalOpen] = useState(false)
  const [isLoadingChangeLog, setIsLoadingChangeLog] = useState(false)
  const [changeLogError, setChangeLogError] = useState<string | null>(null)
  const [changeLogEntries, setChangeLogEntries] = useState<ChangeLogEntry[]>([])
  const [renameCanvasError, setRenameCanvasError] = useState<string | null>(null)
  const [isAddChartModalOpen, setIsAddChartModalOpen] = useState(false)
  const [isCreateTabModalOpen, setIsCreateTabModalOpen] = useState(false)
  const [createTabError, setCreateTabError] = useState<string | null>(null)
  const [creatingTab, setCreatingTab] = useState(false)
  const [isManageTabsModalOpen, setIsManageTabsModalOpen] = useState(false)
  const [isManageTabPreselected, setIsManageTabPreselected] = useState(false)
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
  const [editTableFrameId, setEditTableFrameId] = useState<string | null>(null)
  const [editLinkFrameId, setEditLinkFrameId] = useState<string | null>(null)
  const [editIconFrameId, setEditIconFrameId] = useState<string | null>(null)
  const [editFigureFrameId, setEditFigureFrameId] = useState<string | null>(null)
  const [editIllustrationFrameId, setEditIllustrationFrameId] = useState<string | null>(null)
  const [editDrawingFrameId, setEditDrawingFrameId] = useState<string | null>(null)
  const [editWebsitePathInput, setEditWebsitePathInput] = useState('')
  const [editImageUrlInput, setEditImageUrlInput] = useState('')
  const [editImageAltTextInput, setEditImageAltTextInput] = useState('')
  const [editWebsitePreviewUrlInput, setEditWebsitePreviewUrlInput] = useState('')
  const [editWebsiteRenderEnabled, setEditWebsiteRenderEnabled] = useState(true)
  const [editWebsiteVisualizationMode, setEditWebsiteVisualizationMode] = useState<VisualizationMode | ''>('')
  const [newPagePathInput, setNewPagePathInput] = useState('')
  const [newImageUrlInput, setNewImageUrlInput] = useState('')
  const [newImageAltTextInput, setNewImageAltTextInput] = useState('')
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
  const [dashboardOptions, setDashboardOptions] = useState<Array<{ id: number; name: string; isCanvas: boolean }>>([])
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
  const [editDashboardOptions, setEditDashboardOptions] = useState<
    Array<{ id: number; name: string; isCanvas: boolean }>
  >([])
  const [editDashboardSelectedDashboardId, setEditDashboardSelectedDashboardId] = useState('')
  const [isLoadingEditDashboardOptions, setIsLoadingEditDashboardOptions] = useState(false)
  const [headingTextInput, setHeadingTextInput] = useState('')
  const [addHeadingError, setAddHeadingError] = useState<string | null>(null)
  const [textContentInput, setTextContentInput] = useState('')
  const [addTextError, setAddTextError] = useState<string | null>(null)
  const [tableHeadersInput, setTableHeadersInput] = useState('')
  const [tableRowsInput, setTableRowsInput] = useState('')
  const [addTableError, setAddTableError] = useState<string | null>(null)
  const [linkTitleInput, setLinkTitleInput] = useState('')
  const [linkUrlInput, setLinkUrlInput] = useState('')
  const [linkDescriptionInput, setLinkDescriptionInput] = useState('')
  const [addLinkError, setAddLinkError] = useState<string | null>(null)
  const [drawingIsDecorative, setDrawingIsDecorative] = useState(false)
  const [drawingAltTextInput, setDrawingAltTextInput] = useState('')
  const [drawingAccessibilityError, setDrawingAccessibilityError] = useState<string | null>(null)
  const [pendingDrawingFrameDraft, setPendingDrawingFrameDraft] = useState<{
    drawingPath: string
    drawingStrokeStyles: string
    drawingStrokeWidth: number
    drawingColor: string
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [stickyContentInput, setStickyContentInput] = useState('')
  const [selectedStickyColor, setSelectedStickyColor] = useState(DEFAULT_CANVAS_STICKY_COLOR)
  const [selectedStickySectionId, setSelectedStickySectionId] = useState('')
  const [sectionNameInput, setSectionNameInput] = useState('')
  const [sectionLayoutMode, setSectionLayoutMode] = useState<CanvasSectionLayoutMode>('grid')
  const [addSectionError, setAddSectionError] = useState<string | null>(null)
  const [isSectionOptionsModalOpen, setIsSectionOptionsModalOpen] = useState(false)
  const [sectionOptionsFrameId, setSectionOptionsFrameId] = useState<string | null>(null)
  const [sectionOptionsNameInput, setSectionOptionsNameInput] = useState('')
  const [sectionOptionsLayoutMode, setSectionOptionsLayoutMode] = useState<CanvasSectionLayoutMode>('grid')
  const [sectionOptionsError, setSectionOptionsError] = useState<string | null>(null)
  const [selectedAddSectionId, setSelectedAddSectionId] = useState('')
  const [addStickyError, setAddStickyError] = useState<string | null>(null)
  const [frameTablePages, setFrameTablePages] = useState<Record<string, number>>({})
  const [selectedIconId, setSelectedIconId] = useState(DEFAULT_CANVAS_ICON_ID)
  const [selectedIconColor, setSelectedIconColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [addIconError, setAddIconError] = useState<string | null>(null)
  const [editIconSelectedId, setEditIconSelectedId] = useState(DEFAULT_CANVAS_ICON_ID)
  const [editIconSelectedColor, setEditIconSelectedColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [editIconError, setEditIconError] = useState<string | null>(null)
  const [selectedFigureType, setSelectedFigureType] = useState<CanvasFigureType>('square')
  const [selectedFigureColor, setSelectedFigureColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [addFigureError, setAddFigureError] = useState<string | null>(null)
  const [editFigureSelectedType, setEditFigureSelectedType] = useState<CanvasFigureType>('square')
  const [editFigureSelectedColor, setEditFigureSelectedColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [editFigureError, setEditFigureError] = useState<string | null>(null)
  const [chartOptions, _setChartOptions] = useState<CanvasChartOption[]>([])
  const [selectedChartOptionId, setSelectedChartOptionId] = useState('')
  const [isLoadingChartOptions, _setIsLoadingChartOptions] = useState(false)
  const [addChartError, setAddChartError] = useState<string | null>(null)
  const [isGrafbyggerEmbedded, setIsGrafbyggerEmbedded] = useState(false)
  const [isCanvasLocked, setIsCanvasLocked] = useState(true)
  const [isLockedModeEditing, setIsLockedModeEditing] = useState(false)
  const [dragState, setDragState] = useState<CanvasDragState | null>(null)
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<CanvasSelectionBox | null>(null)
  const [resizeState, setResizeState] = useState<CanvasResizeState | null>(null)
  const [canvasCategories, setCanvasCategories] = useState<GraphCategoryDto[]>([])
  const [activeCanvasCategoryId, setActiveCanvasCategoryId] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  useEffect(() => {
    if (!syncError) return
    console.error('[Canvas] Sync error:', syncError)
  }, [syncError])
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false)
  const [timerMinutesInput, setTimerMinutesInput] = useState('5')
  const [timerModalError, setTimerModalError] = useState<string | null>(null)
  const [timerModalPendingAction, setTimerModalPendingAction] = useState<
    'start' | 'stop' | 'pause' | 'resume' | 'adjust-minus' | 'adjust-plus' | null
  >(null)
  const [isDotVotingModalOpen, setIsDotVotingModalOpen] = useState(false)
  const [dotVotingMinutesInput, setDotVotingMinutesInput] = useState('5')
  const [dotVotingVotesPerParticipantInput, setDotVotingVotesPerParticipantInput] = useState('5')
  const [dotVotingSelectedSectionId, setDotVotingSelectedSectionId] = useState('')
  const [dotVotingModalError, setDotVotingModalError] = useState<string | null>(null)
  const [dotVotingModalPendingAction, setDotVotingModalPendingAction] = useState<
    | 'start'
    | 'pause'
    | 'resume'
    | 'adjust-minus'
    | 'adjust-plus'
    | 'end'
    | 'clear'
    | 'sort'
    | 'add-vote'
    | 'remove-vote'
    | null
  >(null)
  const [timerA11yAnnouncement, setTimerA11yAnnouncement] = useState('')
  const [placementA11yAnnouncement, setPlacementA11yAnnouncement] = useState('')
  const [, setIsLoadingCanvasItems] = useState(false)
  const [isSavingCanvasItem, setIsSavingCanvasItem] = useState(false)
  const [isImportingStickyCsv, setIsImportingStickyCsv] = useState(false)
  const [importStickyProgressCurrent, setImportStickyProgressCurrent] = useState(0)
  const [importStickyProgressTotal, setImportStickyProgressTotal] = useState(0)
  const [connectionMetrics, setConnectionMetrics] = useState<Record<string, CanvasConnectionMetric | null>>({})
  const [connectionDragState, setConnectionDragState] = useState<ConnectionDragState | null>(null)
  const [pageInsights, setPageInsights] = useState<Record<string, CanvasPageInsight>>({})
  const [activeInsightFrameId, setActiveInsightFrameId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CanvasDeleteTarget | null>(null)
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ total: number; completed: number } | null>(null)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [activeEditableFrameId, setActiveEditableFrameId] = useState<string | null>(null)
  const [focusSectionTitleId, setFocusSectionTitleId] = useState<string | null>(null)
  const [focusFrameId, setFocusFrameId] = useState<string | null>(null)
  const [failedImageFrameIds, setFailedImageFrameIds] = useState<Record<string, boolean>>({})
  const pageInsightsRef = useRef<Record<string, CanvasPageInsight>>({})
  const framesRef = useRef<CanvasFrame[]>([])
  const skipNextGridSectionPersistRef = useRef(false)
  const chartContentRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const isImportingStickyCsvRef = useRef(false)
  const clipboardFramesRef = useRef<CanvasFrame[] | null>(null)
  const clipboardPasteCountRef = useRef(0)
  const previousTimerRunningRef = useRef(false)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const canvasToolbarRef = useRef<HTMLDivElement | null>(null)
  const connectionMetricRequestSignatureRef = useRef<string | null>(null)
  const timerModalReopenBlockedUntilRef = useRef(0)
  const wasPlacementModeActiveRef = useRef(false)
  const {
    pendingFrameDraft,
    setPendingFrameDraft,
    pendingFigureDragStart,
    setPendingFigureDragStart,
    pendingCsvStickyImport,
    pendingFramePlacementLabel,
    setPendingFramePlacementLabel,
    pendingFramePointer,
    setPendingFramePointer,
    pendingCsvStickyImportRef,
    queueFrameForPlacement,
    cancelPendingFramePlacement,
    handleCsvImportPrepared,
  } = useCanvasPlacementState({
    setImportStickyProgressCurrent,
    setImportStickyProgressTotal,
  })
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
  const isPlacementModeActive = Boolean(pendingFrameDraft || pendingCsvStickyImport)
  const visibleChangeLogEntries = useMemo(
    () =>
      changeLogEntries.filter(
        (entry) =>
          entry.description !== '[canvas-presence]' &&
          entry.description !== '[canvas-lock]' &&
          !entry.name.startsWith('canvas:presence:') &&
          !entry.name.startsWith('canvas:lock:'),
      ),
    [changeLogEntries],
  )

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

  const activeInsightUrlPath = useMemo(() => {
    if (!activeInsightFrameId) return ''
    const activeFrame = frames.find((frame) => frame.id === activeInsightFrameId)
    if (!activeFrame || activeFrame.kind !== 'website' || activeFrame.isInternalDashboard) return ''
    return normalizeUrlToPath(activeFrame.targetUrl || '') || ''
  }, [activeInsightFrameId, frames])

  const hasDynamicUrlPathCharts = useMemo(
    () =>
      frames.some((frame) => {
        if (frame.kind !== 'chart') return false
        if (activeCanvasCategoryId !== null && (frame.categoryId ?? null) !== activeCanvasCategoryId) return false
        return METABASE_URL_STI_FILTER_REGEX.test((frame.chartSql || '').trim())
      }),
    [activeCanvasCategoryId, frames],
  )

  const dashboardWidgetFilters = useMemo(
    () => ({
      urlFilters: hasDynamicUrlPathCharts && activeInsightUrlPath ? [activeInsightUrlPath] : [],
      dateRange: period,
      pathOperator: 'equals',
      metricType: 'visitors' as const,
      customStartDate,
      customEndDate,
    }),
    [activeInsightUrlPath, customEndDate, customStartDate, hasDynamicUrlPathCharts, period],
  )

  const activeInsightFrame = useMemo(
    () => (activeInsightFrameId ? (frames.find((frame) => frame.id === activeInsightFrameId) ?? null) : null),
    [activeInsightFrameId, frames],
  )
  const activeEditableFrame = useMemo(
    () => (activeEditableFrameId ? (frames.find((frame) => frame.id === activeEditableFrameId) ?? null) : null),
    [activeEditableFrameId, frames],
  )

  const handleCanvasSyncError = useCallback((message: string) => {
    setSyncError(message)
  }, [])

  const markRemoteCanvasFramesApplied = useCallback(() => {
    skipNextGridSectionPersistRef.current = true
  }, [])

  const canvasSyncContextEnabled =
    canPersistToDashboard && projectId !== null && dashboardId !== null && canvasInitMode === 'existing'
  const { activeParticipantCount, activeOtherParticipantCount, shouldEnableBackgroundSync, participantLabels } =
    useCanvasPresence({
      enabled: canvasSyncContextEnabled,
      projectId,
      dashboardId,
    })
  const shouldEnableEditLockSync = activeEditableFrameId !== null

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
    enabled: canvasSyncContextEnabled,
    projectId,
    dashboardId,
    onSyncError: handleCanvasSyncError,
  })

  const {
    sessionPayload: dotVotingSessionPayload,
    votingLabel: dotVotingLabel,
    isVotingRunning: isDotVotingRunning,
    isVotingPaused: isDotVotingPaused,
    isSavingVoting: isSavingDotVoting,
    activeVotesByFrameGraphId,
    myVotesByFrameGraphId,
    myUsedVotes: myUsedDotVotes,
    myVotesRemaining: myRemainingDotVotes,
    startVoting,
    pauseVoting,
    resumeVoting,
    adjustVotingMinutes,
    endVoting,
    clearVoting,
    addVote,
    removeVote,
    refreshVoting,
  } = useCanvasDotVotingSync({
    enabled: canvasSyncContextEnabled,
    enableIdlePolling: shouldEnableBackgroundSync,
    idleSyncIntervalMs: 30000,
    projectId,
    dashboardId,
    onSyncError: handleCanvasSyncError,
  })
  const isDotVotingActive = Boolean(dotVotingSessionPayload) && dotVotingSessionPayload?.status !== 'ended'
  const isCanvasReadOnly = isCanvasLocked && !isLockedModeEditing
  const isInteractionLocked = isDotVotingActive || isCanvasReadOnly
  const shouldRevealDotVotingTotals =
    Boolean(dotVotingSessionPayload) &&
    (dotVotingSessionPayload?.status === 'ended' || (!isDotVotingRunning && !isDotVotingPaused))

  const activeInsightPeriodLabel = useMemo(
    () => getCanvasPeriodLabel(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate],
  )

  useEffect(() => {
    if (!isCanvasLocked && isLockedModeEditing) {
      setIsLockedModeEditing(false)
    }
  }, [isCanvasLocked, isLockedModeEditing])

  useEffect(() => {
    if (!isCanvasReadOnly) return
    setActiveEditableFrameId(null)
    setSelectedFrameIds([])
    setSelectionBox(null)
  }, [isCanvasReadOnly])

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
    if (!placementA11yAnnouncement) return
    const timeoutId = window.setTimeout(() => setPlacementA11yAnnouncement(''), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [placementA11yAnnouncement])

  useEffect(() => {
    const placementModeStarted = isPlacementModeActive && !wasPlacementModeActiveRef.current
    if (placementModeStarted) {
      const elementLabel = pendingFramePlacementLabel || pendingFrameDraft?.label || 'element'
      if (pendingFrameDraft) {
        setPlacementA11yAnnouncement(
          `Plasseringsmodus aktivert for ${elementLabel}. Velg Autoplasser, eller klikk i canvas for plassering. Velg Avbryt for å avslutte.`,
        )
      } else if (pendingCsvStickyImport) {
        setPlacementA11yAnnouncement(
          'Plasseringsmodus aktivert for import. Klikk i canvas for plassering, eller velg Avbryt for å avslutte.',
        )
      }
    }
    wasPlacementModeActiveRef.current = isPlacementModeActive
  }, [isPlacementModeActive, pendingCsvStickyImport, pendingFrameDraft, pendingFramePlacementLabel])

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

  const activeCanvasCategoryLabel = useMemo(() => {
    if (activeCanvasCategoryId === null) return 'Aktiv fane'
    const activeCategory = canvasCategories.find((category) => category.id === activeCanvasCategoryId)
    return getCanvasCategoryDisplayName(activeCategory?.name)
  }, [activeCanvasCategoryId, canvasCategories])

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
      !canvasHideDateFilter &&
      frameItems.some((frame) => {
        if (frame.kind === 'website') return !frame.isInternalDashboard
        if (frame.kind !== 'chart') return false
        return METABASE_CREATED_AT_FILTER_REGEX.test(frame.chartSql || '')
      }),
    [canvasHideDateFilter, frameItems],
  )

  const {
    importStickyCsvFileInputRef,
    importStickyCsvFileName,
    importStickyCsvHeaders,
    importStickyCsvRows,
    importStickyContentColumn,
    isImportStickyCombiningColumns,
    importStickyCombinedColumns,
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
    handleToggleCombineColumns,
    handleToggleCombinedColumn,
    handleImportStyleChange,
    handleTableModeChange,
    handlePrevTablePreviewPage,
    handleNextTablePreviewPage,
    handleExcludeRow,
    handleImportStickyCsv,
  } = useCanvasCsvImport({
    onImportPrepared: handleCsvImportPrepared,
  })

  const { frameVisualizationData, setWebsiteIframeRef, handleWebsiteFrameLoad, focusWebsiteTopListItem } =
    useCanvasWebsiteVisualization({
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
        stickyColor: frame.stickyColor,
        finalVoteCount: frame.finalVoteCount,
        finalVoteRank: frame.finalVoteRank,
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
        drawingAltText: frame.drawingAltText,
        isIllustration: frame.isIllustration,
        imageRotationDeg: frame.imageRotationDeg,
        imageAltText: frame.imageAltText,
        chartType: frame.chartType,
        chartSql: frame.chartSql,
        sqlQuery: frame.sqlQuery,
        codeLanguage: frame.codeLanguage,
        hideInShare: frame.hideInShare,
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
        markRemoteCanvasFramesApplied()
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
  }, [canPersistToDashboard, projectId, dashboardId, canvasInitMode, initialCategoryId, markRemoteCanvasFramesApplied])

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
    onBeforeApplyRemoteData: markRemoteCanvasFramesApplied,
  })

  const {
    acquireLock: acquireEditLock,
    releaseLock: releaseEditLock,
    getFrameLockStatus,
  } = useCanvasEditLocks({
    enabled: canvasSyncContextEnabled && shouldEnableEditLockSync,
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
      setIsCanvasLocked(true)
      setIsLockedModeEditing(false)
      setCanvasDefaultPeriod('')
      setCanvasDefaultCustomStartDate(undefined)
      setCanvasDefaultCustomEndDate(undefined)
      setCanvasHideDateFilter(false)
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
          setIsCanvasLocked(true)
          setIsLockedModeEditing(false)
          setCanvasDefaultPeriod('')
          setCanvasDefaultCustomStartDate(undefined)
          setCanvasDefaultCustomEndDate(undefined)
          setCanvasHideDateFilter(false)
          return
        }
        setCanvasInitMode('existing')
        setCanvasTitle(dashboard.name?.trim() || 'Canvas')
        const dashboardDescription = dashboard.description || CANVAS_DASHBOARD_TOKEN
        const configuredDefaultPeriod = extractCanvasPeriodFromDescription(dashboardDescription)
        const defaultCustomStartDate = extractCanvasCustomStartDateFromDescription(dashboardDescription)
        const defaultCustomEndDate = extractCanvasCustomEndDateFromDescription(dashboardDescription)
        const hideDateFilter = extractCanvasHideDateFilterFromDescription(dashboardDescription)
        const isLocked = extractCanvasLockedFromDescription(dashboardDescription)
        const hasPeriodInUrl = new URLSearchParams(window.location.search).has('period')
        setCanvasDashboardDescription(dashboardDescription)
        setCanvasConfiguredWebsiteId(extractCanvasWebsiteIdFromDescription(dashboardDescription))
        setIsCanvasLocked(isLocked)
        setIsLockedModeEditing(false)
        setCanvasDefaultPeriod(configuredDefaultPeriod ?? '')
        setCanvasDefaultCustomStartDate(defaultCustomStartDate)
        setCanvasDefaultCustomEndDate(defaultCustomEndDate)
        setCanvasHideDateFilter(hideDateFilter)
        if (!hasPeriodInUrl) {
          const nextPeriod = configuredDefaultPeriod ? getStoredPeriod(configuredDefaultPeriod) : getStoredPeriod(null)
          setPeriodState(nextPeriod)
          if (nextPeriod === 'custom' && configuredDefaultPeriod) {
            setCustomStartDate(defaultCustomStartDate)
            setCustomEndDate(defaultCustomEndDate)
          } else {
            setCustomStartDate(undefined)
            setCustomEndDate(undefined)
          }
        }
      } catch {
        if (!isActive) return
        setCanvasInitMode('create')
        setCanvasTitle('Canvas')
        setCanvasDashboardDescription(CANVAS_DASHBOARD_TOKEN)
        setCanvasConfiguredWebsiteId(null)
        setIsCanvasLocked(true)
        setIsLockedModeEditing(false)
        setCanvasDefaultPeriod('')
        setCanvasDefaultCustomStartDate(undefined)
        setCanvasDefaultCustomEndDate(undefined)
        setCanvasHideDateFilter(false)
      }
    }

    void loadCanvasTitle()
    return () => {
      isActive = false
    }
  }, [canPersistToDashboard, isCanvasFrontpage, projectId, dashboardId])

  const {
    loadExistingCanvasOptions,
    handleOpenCreateTabModal,
    handleCreateTab,
    handleOpenManageTabsModal,
    selectedManageTab,
    selectedManageTabIsFirst,
    selectedManageTabItemCount,
    selectedManageTabIsEmpty,
    handleRenameTab,
    handleDeleteTab,
    handleRenameCanvas,
    handleCreateCanvas,
    handleCreateTeam,
  } = useCanvasAdminFlow({
    projectId,
    dashboardId,
    canPersistToDashboard,
    shouldShowCreateCanvasModal,
    lastProjectStorageKey: LAST_PROJECT_STORAGE_KEY,
    canvasCategories,
    setCanvasCategories,
    activeCanvasCategoryId,
    setActiveCanvasCategoryId,
    frames,
    setFrames,
    connections,
    setConnections,
    setCanvasTitle,
    canvasDashboardDescription,
    setCanvasDashboardDescription,
    setCanvasConfiguredWebsiteId,
    setCanvasDefaultPeriod,
    setCanvasDefaultCustomStartDate,
    setCanvasDefaultCustomEndDate,
    setCanvasHideDateFilter,
    selectedWebsiteId: selectedWebsite?.id ?? null,
    setSyncError,
    setIsSavingCanvasItem,
    setIsCanvasSettingsModalOpen,
    setRenameCanvasError,
    setIsCreateTabModalOpen,
    setCreateTabError,
    setCreatingTab,
    setIsManageTabsModalOpen,
    setIsManageTabPreselected,
    manageTabId,
    setManageTabId,
    setManageTabName,
    setManageTabError,
    setSavingManageTab,
    setDeletingManageTab,
    createCanvasProjectId,
    setCreateCanvasProjectId,
    setCreateCanvasProjectOptions,
    setExistingCanvasOptions,
    setIsLoadingExistingCanvasOptions,
    setExistingCanvasError,
    createCanvasNameInput,
    setCreateCanvasError,
    setIsCreatingCanvas,
    setIsCreateTeamModalOpen,
    createTeamNameInput,
    setCreateTeamNameInput,
    createTeamDescriptionInput,
    setCreateTeamDescriptionInput,
    createCanvasError,
    setCreateTeamError,
    setIsCreatingTeam,
  })

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

  const {
    loadDashboardOptions,
    loadEditDashboardOptions,
    handleAddPage,
    handleAddImage,
    handleAddIllustration,
    handleOpenAddDashboardModal,
    handleAddDashboardCard,
    handleOpenEditWebsiteModal,
    handleOpenEditDashboardModal,
    handleOpenEditImageModal,
    handleOpenEditTableModal,
    handleOpenEditLinkModal,
    handleOpenEditIllustrationModal,
    handleOpenEditIconModal,
    handleOpenEditFigureModal,
    handleToggleInsightPanel,
    handleDuplicateWebsiteCard,
    handleDuplicateIconCard,
    handleDuplicateFigureCard,
    handleDuplicateSectionCard,
    handleDuplicateStickyCard,
    handleDuplicateTextCard,
    handleDuplicateHeadingCard,
    handleDuplicateDrawingCard,
    handleDuplicateImageCard,
    handleSaveEditedWebsite,
    handleSaveEditedDashboard,
    handleSaveEditedImage,
    handleSaveEditedIcon,
    handleSaveEditedFigure,
    handleAddHeadingCard,
    handleAddTextCard,
    handleAddTableCard,
    handleAddLinkCard,
    handleAddStickyCard,
    handleAddSectionCard,
    handleAddIconCard,
    handleAddFigureCard,
    handleAddChartCard,
    handleOpenAddPageModal,
    handleAssignWebsiteToChart,
    handleOpenAddHeadingModal,
    handleOpenAddTextModal,
    handleOpenAddTableModal,
    handleOpenAddLinkModal,
    handleOpenAddStickyModal,
    handleOpenAddSection,
    handleOpenAddSqlEditor,
    handleOpenAddCodeBlock,
    handleOpenAddImageModal,
    handleOpenAddIconModal,
    handleOpenAddFigureModal,
    handleOpenAddIllustrationModal,
  } = useCanvasFrameFormHandlers({
    projectId,
    dashboardId,
    ensureCanvasCategory,
    frames,
    selectedWebsite,
    setSelectedWebsite,
    canvasConfiguredWebsiteId,
    queueFrameForPlacement,
    setFrames,
    setSyncError,
    setIsSavingCanvasItem,
    setFailedImageFrameIds,
    pendingChartWebsiteByFrameId,
    setPendingChartWebsiteByFrameId,
    chartOptions,
    selectedChartOptionId,
    setAddChartError,
    setIsAddChartModalOpen,
    isAddPageModalOpen,
    setIsAddPageModalOpen,
    isAddImageModalOpen,
    setIsAddImageModalOpen,
    isAddIllustrationModalOpen,
    setIsAddIllustrationModalOpen,
    isAddDashboardModalOpen,
    setIsAddDashboardModalOpen,
    isAddHeadingModalOpen,
    setIsAddHeadingModalOpen,
    isAddTextModalOpen,
    setIsAddTextModalOpen,
    isAddTableModalOpen,
    setIsAddTableModalOpen,
    isAddLinkModalOpen,
    setIsAddLinkModalOpen,
    isAddStickyModalOpen,
    setIsAddStickyModalOpen,
    isAddSectionModalOpen,
    setIsAddSectionModalOpen,
    isAddIconModalOpen,
    setIsAddIconModalOpen,
    isAddFigureModalOpen,
    setIsAddFigureModalOpen,
    isEditWebsiteModalOpen,
    setIsEditWebsiteModalOpen,
    isEditDashboardModalOpen,
    setIsEditDashboardModalOpen,
    isEditImageModalOpen,
    setIsEditImageModalOpen,
    isEditIconModalOpen,
    setIsEditIconModalOpen,
    isEditFigureModalOpen,
    setIsEditFigureModalOpen,
    editWebsiteFrameId,
    setEditWebsiteFrameId,
    editDashboardFrameId,
    setEditDashboardFrameId,
    editImageFrameId,
    setEditImageFrameId,
    editTableFrameId,
    setEditTableFrameId,
    editLinkFrameId,
    setEditLinkFrameId,
    editIconFrameId,
    setEditIconFrameId,
    editFigureFrameId,
    setEditFigureFrameId,
    editIllustrationFrameId,
    setEditIllustrationFrameId,
    editWebsitePathInput,
    setEditWebsitePathInput,
    editImageUrlInput,
    setEditImageUrlInput,
    editImageAltTextInput,
    setEditImageAltTextInput,
    editWebsitePreviewUrlInput,
    setEditWebsitePreviewUrlInput,
    editWebsiteRenderEnabled,
    setEditWebsiteRenderEnabled,
    editWebsiteVisualizationMode,
    setEditWebsiteVisualizationMode,
    newPagePathInput,
    setNewPagePathInput,
    newImageUrlInput,
    setNewImageUrlInput,
    newImageAltTextInput,
    setNewImageAltTextInput,
    selectedIllustrationPath,
    setSelectedIllustrationPath,
    newPagePreviewUrlInput,
    setNewPagePreviewUrlInput,
    newPageRenderEnabled,
    setNewPageRenderEnabled,
    newPageVisualizationMode,
    setNewPageVisualizationMode,
    addPageError,
    setAddPageError,
    addImageError,
    setAddImageError,
    addIllustrationError,
    setAddIllustrationError,
    addDashboardError,
    setAddDashboardError,
    editWebsiteError,
    setEditWebsiteError,
    editDashboardError,
    setEditDashboardError,
    editImageError,
    setEditImageError,
    projectOptions,
    setProjectOptions,
    selectedProjectToAddId,
    setSelectedProjectToAddId,
    dashboardOptions,
    setDashboardOptions,
    selectedDashboardToAddId,
    setSelectedDashboardToAddId,
    isLoadingDashboardOptions,
    setIsLoadingDashboardOptions,
    editDashboardProjectOptions,
    setEditDashboardProjectOptions,
    editDashboardSelectedProjectId,
    setEditDashboardSelectedProjectId,
    editDashboardOptions,
    setEditDashboardOptions,
    editDashboardSelectedDashboardId,
    setEditDashboardSelectedDashboardId,
    isLoadingEditDashboardOptions,
    setIsLoadingEditDashboardOptions,
    headingTextInput,
    setHeadingTextInput,
    addHeadingError,
    setAddHeadingError,
    textContentInput,
    setTextContentInput,
    addTextError,
    setAddTextError,
    tableHeadersInput,
    setTableHeadersInput,
    tableRowsInput,
    setTableRowsInput,
    addTableError,
    setAddTableError,
    linkTitleInput,
    setLinkTitleInput,
    linkUrlInput,
    setLinkUrlInput,
    linkDescriptionInput,
    setLinkDescriptionInput,
    addLinkError,
    setAddLinkError,
    stickyContentInput,
    setStickyContentInput,
    selectedStickyColor,
    setSelectedStickyColor,
    selectedStickySectionId,
    setSelectedStickySectionId,
    onFrameAddedInSection: (frame) => setFocusFrameId(frame.id),
    sectionNameInput,
    setSectionNameInput,
    sectionLayoutMode,
    setSectionLayoutMode,
    addSectionError,
    setAddSectionError,
    selectedAddSectionId,
    setSelectedAddSectionId,
    addStickyError,
    setAddStickyError,
    selectedIconId,
    setSelectedIconId,
    selectedIconColor,
    setSelectedIconColor,
    addIconError,
    setAddIconError,
    editIconSelectedId,
    setEditIconSelectedId,
    editIconSelectedColor,
    setEditIconSelectedColor,
    editIconError,
    setEditIconError,
    selectedFigureType,
    setSelectedFigureType,
    selectedFigureColor,
    setSelectedFigureColor,
    addFigureError,
    setAddFigureError,
    editFigureSelectedType,
    setEditFigureSelectedType,
    editFigureSelectedColor,
    setEditFigureSelectedColor,
    editFigureError,
    setEditFigureError,
    setActiveInsightFrameId,
  })

  const handleCloseImportStickyCsvModal = useCallback(() => {
    setIsImportStickyCsvModalOpen(false)
    clearImportStickyCsvError()
  }, [clearImportStickyCsvError])

  const handleOpenImportStickyCsvModal = () => {
    handleClearImportStickyCsvFile()
    setIsImportStickyCsvModalOpen(true)
  }

  const handleOpenAddDrawing = () => {
    cancelPendingFramePlacement()
    openDrawingMode()
  }

  const handleSelectSectionAddAction = (sectionId: string, action: SectionAddAction) => {
    const openAddModalInSection = (openModal: () => void) => {
      openModal()
      setSelectedAddSectionId(sectionId)
    }

    switch (action) {
      case 'section':
        handleOpenAddSection()
        return
      case 'tab':
        handleOpenCreateTabModal()
        return
      case 'heading':
        openAddModalInSection(handleOpenAddHeadingModal)
        return
      case 'text':
        openAddModalInSection(handleOpenAddTextModal)
        return
      case 'table':
        openAddModalInSection(handleOpenAddTableModal)
        return
      case 'link':
        openAddModalInSection(handleOpenAddLinkModal)
        return
      case 'sticky':
        handleOpenAddStickyModal()
        setSelectedStickySectionId(sectionId)
        return
      case 'code-block':
        handleOpenAddCodeBlock()
        return
      case 'image':
        openAddModalInSection(handleOpenAddImageModal)
        return
      case 'icon':
        openAddModalInSection(handleOpenAddIconModal)
        return
      case 'figure':
        openAddModalInSection(handleOpenAddFigureModal)
        return
      case 'drawing':
        handleOpenAddDrawing()
        return
      case 'illustration':
        openAddModalInSection(handleOpenAddIllustrationModal)
        return
      case 'website':
        handleOpenAddPageModal()
        return
      case 'chart':
        handleOpenGrafbyggerFromAddMenu()
        return
      case 'sql-editor':
        handleOpenAddSqlEditor()
        return
      case 'dashboard':
        handleOpenAddDashboardModal()
        return
      case 'import-sticky-csv':
        handleOpenImportStickyCsvModal()
        return
    }
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
  }, [availableWebsites, queueFrameForPlacement, selectedWebsite?.id, setSelectedWebsite])

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

  const handleAutoPlacedSection = useCallback(
    (frame: CanvasFrame) => {
      if (frame.kind !== 'section') return
      setFocusSectionTitleId(frame.id)
      const viewport = canvasViewportRef.current
      if (!viewport) return

      const defaults = getDefaultFrameSize(frame)
      const width = frame.width ?? defaults.width
      const height = frame.height ?? defaults.height
      const margin = 48

      const leftPx = frame.x * canvasZoom
      const topPx = canvasCanvasTopOffset + frame.y * canvasZoom
      const rightPx = leftPx + width * canvasZoom
      const bottomPx = topPx + height * canvasZoom

      const visibleLeft = viewport.scrollLeft
      const visibleTop = viewport.scrollTop
      const visibleRight = visibleLeft + viewport.clientWidth
      const visibleBottom = visibleTop + viewport.clientHeight

      const isVisibleWithMargin =
        leftPx >= visibleLeft + margin &&
        rightPx <= visibleRight - margin &&
        topPx >= visibleTop + margin &&
        bottomPx <= visibleBottom - margin
      if (isVisibleWithMargin) return

      let nextScrollLeft = visibleLeft
      let nextScrollTop = visibleTop

      if (rightPx > visibleRight - margin) {
        nextScrollLeft = rightPx - viewport.clientWidth + margin
      } else if (leftPx < visibleLeft + margin) {
        nextScrollLeft = leftPx - margin
      }

      if (bottomPx > visibleBottom - margin) {
        nextScrollTop = bottomPx - viewport.clientHeight + margin
      } else if (topPx < visibleTop + margin) {
        nextScrollTop = topPx - margin
      }

      viewport.scrollTo({
        left: Math.max(0, nextScrollLeft),
        top: Math.max(0, nextScrollTop),
        behavior: 'smooth',
      })
    },
    [canvasCanvasTopOffset, canvasZoom],
  )

  const handleFinalizeDrawing = useCallback(({ strokes }: { strokes: CanvasDrawingStroke[] }) => {
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

    setPendingDrawingFrameDraft({
      drawingPath,
      drawingStrokeStyles,
      drawingStrokeWidth: normalizedStrokes[0]?.strokeWidth ?? DEFAULT_DRAWING_STROKE_WIDTH,
      drawingColor: getCanvasIconColor(normalizedStrokes[0]?.color),
      x: Math.max(0, baseX),
      y: Math.max(-CANVAS_TOP_BUFFER, baseY),
      width,
      height,
    })
    setDrawingIsDecorative(false)
    setDrawingAltTextInput('')
    setDrawingAccessibilityError(null)
    setEditDrawingFrameId(null)
    setIsDrawingAccessibilityModalOpen(true)
  }, [])

  const handleOpenEditDrawingModal = useCallback((frame: CanvasFrame) => {
    if (frame.kind !== 'drawing') return
    setEditDrawingFrameId(frame.id)
    setPendingDrawingFrameDraft(null)
    setDrawingIsDecorative(frame.drawingAltText === '')
    setDrawingAltTextInput(frame.drawingAltText ?? '')
    setDrawingAccessibilityError(null)
    setIsDrawingAccessibilityModalOpen(true)
  }, [])

  const handleSaveDrawingWithAccessibility = useCallback(async () => {
    const normalizedAltText = drawingAltTextInput.trim()
    if (!drawingIsDecorative && !normalizedAltText) {
      setDrawingAccessibilityError('Legg inn alternativ tekst, eller marker tegningen som dekorativ.')
      return
    }

    const drawingAltText = drawingIsDecorative ? '' : normalizedAltText

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      if (editDrawingFrameId) {
        const currentFrame = frames.find((frame) => frame.id === editDrawingFrameId)
        if (!currentFrame || currentFrame.kind !== 'drawing') return

        const updatedFrame: CanvasFrame = {
          ...currentFrame,
          drawingAltText,
          label: drawingIsDecorative ? 'Tegning' : normalizedAltText,
        }
        const persistedFrame = await persistFrame(updatedFrame)
        setFrames((prev) => prev.map((frame) => (frame.id === editDrawingFrameId ? persistedFrame : frame)))
      } else {
        if (!pendingDrawingFrameDraft) return
        const nextFrame: CanvasFrame = {
          id: `${Date.now()}-${Math.random()}`,
          kind: 'drawing',
          drawingPath: pendingDrawingFrameDraft.drawingPath,
          drawingStrokeStyles: pendingDrawingFrameDraft.drawingStrokeStyles,
          drawingStrokeWidth: pendingDrawingFrameDraft.drawingStrokeWidth,
          drawingColor: pendingDrawingFrameDraft.drawingColor,
          drawingAltText,
          label: drawingIsDecorative ? 'Tegning' : normalizedAltText,
          x: pendingDrawingFrameDraft.x,
          y: pendingDrawingFrameDraft.y,
          width: pendingDrawingFrameDraft.width,
          height: pendingDrawingFrameDraft.height,
          refreshNonce: 0,
        }
        const persistedFrame = await persistFrame(nextFrame)
        setFrames((prev) => [...prev, persistedFrame])
      }
      setPendingDrawingFrameDraft(null)
      setEditDrawingFrameId(null)
      setDrawingAccessibilityError(null)
      setIsDrawingAccessibilityModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre tegning')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }, [drawingAltTextInput, drawingIsDecorative, editDrawingFrameId, frames, pendingDrawingFrameDraft, persistFrame])

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

  const {
    handleCanvasSurfaceMouseDown,
    handleCanvasSurfaceMouseMove,
    handleCanvasSurfaceMouseLeave,
    handleAutoPlacePendingFrame,
  } = useCanvasPlacement({
    frames,
    setFrames,
    pendingFrameDraft,
    setPendingFrameDraft,
    pendingCsvStickyImport,
    pendingCsvStickyImportRef,
    pendingFigureDragStart,
    setPendingFigureDragStart,
    pendingFramePointer,
    setPendingFramePointer,
    setPendingFramePlacementLabel,
    cancelPendingFramePlacement,
    isImportingStickyCsv,
    setIsImportingStickyCsv,
    isImportingStickyCsvRef,
    setImportStickyProgressCurrent,
    setImportStickyProgressTotal,
    setIsSavingCanvasItem,
    setSyncError,
    setPlacementA11yAnnouncement,
    onAutoPlacedSection: handleAutoPlacedSection,
    onFramePlaced: (frame) => setFocusFrameId(frame.id),
    getCanvasPointerPosition,
    getPendingFrameContentAnchorOffset,
    getDefaultFrameSize,
    getNextAutoSectionLabel,
    activeCanvasCategoryId,
    estimateStickyFrameHeight,
    estimateTableFrameHeight,
    persistFrame,
    sectionHeaderHeight: GRID_SECTION_LAYOUT_CONFIG.paddingTop,
    topBuffer: CANVAS_TOP_BUFFER,
    isDrawingMode,
    startDrawingAt,
    continueDrawingAt,
    selectionBox,
    setSelectionBox,
    setSelectedFrameIds,
    isInteractionLocked,
  })

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

  const getFrameBoundsForLayout = useCallback(
    (frame: CanvasFrame): { left: number; top: number; right: number; bottom: number } =>
      getFrameBoundsForLayoutBase(frame, getDefaultFrameSize),
    [],
  )

  const findFrameContainingGridSectionId = useCallback(
    (frame: CanvasFrame, framePool: CanvasFrame[]): string | null =>
      findContainingGridSectionId(frame, framePool, getDefaultFrameSize),
    [],
  )

  const getGridLayoutFrameHeight = useCallback((frame: CanvasFrame): number => {
    const defaults = getDefaultFrameSize(frame)
    const currentHeight = frame.height ?? defaults.height

    if (frame.kind === 'heading') {
      const headingText = (frame.headingText || frame.label || '').trim()
      const fontSize = Math.max(
        HEADING_FONT_SIZE_MIN,
        Math.min(HEADING_FONT_SIZE_MAX, frame.headingFontSize ?? HEADING_FONT_SIZE_DEFAULT),
      )
      const estimatedTextWidth =
        Math.ceil(headingText.length * (fontSize * HEADING_TEXT_CHAR_WIDTH_FACTOR)) + HEADING_TEXT_EXTRA_WIDTH
      const autoWidth = Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, estimatedTextWidth))
      const defaultHeadingSize = getDefaultFrameSize('heading')
      const hasLegacyDefaultSize =
        Number(frame.width) === defaultHeadingSize.width &&
        (frame.height ?? defaultHeadingSize.height) === defaultHeadingSize.height
      const width =
        Number.isFinite(frame.width) && !hasLegacyDefaultSize
          ? Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, Number(frame.width)))
          : autoWidth
      const usableWidth = Math.max(1, width - HEADING_TEXT_EXTRA_WIDTH)
      const charsPerLine = Math.max(12, Math.floor(usableWidth / (fontSize * HEADING_TEXT_CHAR_WIDTH_FACTOR)))
      const lineCount = headingText
        ? headingText.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
        : 1
      const contentHeight = Math.max(28, lineCount * Math.ceil(fontSize * 1.05) + HEADING_TEXT_VERTICAL_PADDING)
      const naturalHeight = contentHeight + HEADING_CARD_HEADER_HEIGHT
      return Math.min(currentHeight, naturalHeight)
    }

    if (
      frame.kind === 'text' &&
      Array.isArray(frame.tableHeaders) &&
      frame.tableHeaders.length > 0 &&
      Array.isArray(frame.tableRows)
    ) {
      return Math.min(currentHeight, estimateTableFrameHeight(frame.tableRows.length))
    }

    if (frame.kind === 'text') {
      const text = frame.textContent?.trim() ?? ''
      const width = frame.width ?? defaults.width
      const usableWidth = Math.max(120, width - 16)
      const approxCharsPerLine = Math.max(12, Math.floor(usableWidth / 13))
      const lineCount = text
        ? text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / approxCharsPerLine)), 0)
        : 1
      const estimatedHeight = Math.max(72, lineCount * 32 + 24)
      return Math.min(currentHeight, estimatedHeight)
    }

    return currentHeight
  }, [])

  const reflowGridSections = useCallback(
    (inputFrames: CanvasFrame[], sectionIds: string[]) =>
      reflowGridSectionFrames({
        inputFrames,
        sectionIds,
        getDefaultFrameSize,
        getGridLayoutFrameHeight,
        topBuffer: CANVAS_TOP_BUFFER,
      }),
    [getGridLayoutFrameHeight],
  )

  useEffect(() => {
    if (dragState || resizeState) return

    const gridSectionIds = frames
      .filter((frame) => frame.kind === 'section' && frame.sectionLayout === 'grid')
      .map((frame) => frame.id)
    if (gridSectionIds.length === 0) return

    const { nextFrames, changedFrameIds } = reflowGridSections(frames, gridSectionIds)
    if (changedFrameIds.size === 0) return

    const previousById = new Map(frames.map((frame) => [frame.id, frame]))
    const hasLayoutChanges = [...changedFrameIds].some((frameId) => {
      const previous = previousById.get(frameId)
      const next = nextFrames.find((frame) => frame.id === frameId)
      if (!previous || !next) return false
      return (
        previous.x !== next.x ||
        previous.y !== next.y ||
        previous.height !== next.height ||
        previous.width !== next.width
      )
    })
    if (!hasLayoutChanges) return

    setFrames(nextFrames)

    if (skipNextGridSectionPersistRef.current) {
      skipNextGridSectionPersistRef.current = false
      return
    }

    const framesToPersist = nextFrames.filter((frame) => changedFrameIds.has(frame.id) && Boolean(frame.graphId))
    if (framesToPersist.length === 0) return

    void Promise.all(
      framesToPersist.map((frame) =>
        persistFrame(frame).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre seksjonsoppsett')
          return frame
        }),
      ),
    )
  }, [dragState, frames, persistFrame, reflowGridSections, resizeState])

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
      if (isCanvasReadOnly) return
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
    [getCanvasPointerPosition, isCanvasReadOnly],
  )

  const openGrafbyggerFromAddMenuDirect = () => {
    setAddChartError(null)
    setIsAddChartModalOpen(false)
    setIsGrafbyggerEmbedded(true)
  }

  const handleOpenGrafbyggerFromAddMenu = () => {
    openGrafbyggerFromAddMenuDirect()
  }

  const {
    getHeadingFrameFontSize,
    getHeadingFrameWidth,
    getHeadingFrameHeight,
    handleDragStart,
    handleResizeStart,
    handleSetHeadingFontSize,
  } = useCanvasInteractions({
    isInteractionLocked,
    frames,
    framesRef,
    visibleFrames,
    dragState,
    setDragState,
    selectedFrameIds,
    setSelectedFrameIds,
    selectionBox,
    setSelectionBox,
    resizeState,
    setResizeState,
    canvasZoom,
    getCanvasPointerPosition,
    getDefaultFrameSize,
    getFrameBounds,
    findContainingGridSectionId: findFrameContainingGridSectionId,
    compareFramesForSectionOrder,
    reflowGridSections,
    setFrames,
    persistFrame,
    setSyncError,
    setDeleteTarget,
  })

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

  const handleRemovePage = useCallback(
    async (id: string) => {
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
      setConnections((prev) =>
        prev.filter((connection) => !linkedConnections.some((item) => item.id === connection.id)),
      )
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
    },
    [
      frames,
      connections,
      activeEditableFrameId,
      releaseEditLock,
      connectionDragState,
      canPersistToDashboard,
      projectId,
      dashboardId,
      setSyncError,
    ],
  )

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

  const handleBulkRemovePages = useCallback(
    async (ids: string[]) => {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) return

      const frameById = new Map(frames.map((frame) => [frame.id, frame]))
      const framesToDelete = uniqueIds
        .map((id) => frameById.get(id))
        .filter((frame): frame is CanvasFrame => Boolean(frame))
      if (framesToDelete.length === 0) return

      const frameIdsToDelete = new Set(framesToDelete.map((frame) => frame.id))
      const frameGraphIdsToDelete = new Set(
        framesToDelete.map((frame) => frame.graphId).filter((graphId): graphId is number => Number.isFinite(graphId)),
      )
      const linkedConnections = connections.filter(
        (connection) =>
          (typeof connection.fromFrameId === 'string' && frameIdsToDelete.has(connection.fromFrameId)) ||
          (typeof connection.toFrameId === 'string' && frameIdsToDelete.has(connection.toFrameId)) ||
          (Number.isFinite(connection.fromGraphId) && frameGraphIdsToDelete.has(connection.fromGraphId as number)) ||
          (Number.isFinite(connection.toGraphId) && frameGraphIdsToDelete.has(connection.toGraphId as number)),
      )
      const linkedConnectionIds = new Set(linkedConnections.map((connection) => connection.id))

      const failedFramesById = new Map<string, CanvasFrame>()
      const failedConnectionsById = new Map<string, CanvasConnection>()

      setFrames((prev) => prev.filter((frame) => !frameIdsToDelete.has(frame.id)))
      setSelectedFrameIds((prev) => prev.filter((frameId) => !frameIdsToDelete.has(frameId)))
      setConnections((prev) => prev.filter((connection) => !linkedConnectionIds.has(connection.id)))

      if (activeEditableFrameId && frameIdsToDelete.has(activeEditableFrameId)) {
        const activeFrame = frameById.get(activeEditableFrameId)
        setActiveEditableFrameId(null)
        if (activeFrame) {
          void releaseEditLock(activeFrame).catch(() => undefined)
        }
      }
      if (connectionDragState?.sourceFrameId && frameIdsToDelete.has(connectionDragState.sourceFrameId)) {
        setConnectionDragState(null)
      }

      setBulkDeleteProgress({ total: framesToDelete.length, completed: 0 })

      let completedFrameDeletes = 0
      for (const frame of framesToDelete) {
        if (canPersistToDashboard && projectId !== null && dashboardId !== null && frame.graphId && frame.categoryId) {
          try {
            await deleteGraph(projectId, dashboardId, frame.categoryId, frame.graphId)
          } catch {
            failedFramesById.set(frame.id, frame)
          }
        }
        completedFrameDeletes += 1
        setBulkDeleteProgress({ total: framesToDelete.length, completed: completedFrameDeletes })
      }

      for (const connection of linkedConnections) {
        if (
          canPersistToDashboard &&
          projectId !== null &&
          dashboardId !== null &&
          connection.graphId &&
          connection.categoryId
        ) {
          try {
            await deleteGraph(projectId, dashboardId, connection.categoryId, connection.graphId)
          } catch {
            failedConnectionsById.set(connection.id, connection)
          }
        }
      }

      if (failedFramesById.size > 0) {
        const failedFrames = [...failedFramesById.values()]
        setFrames((prev) => {
          const existingIds = new Set(prev.map((frame) => frame.id))
          const framesToRestore = failedFrames.filter((frame) => !existingIds.has(frame.id))
          return framesToRestore.length > 0 ? [...prev, ...framesToRestore] : prev
        })
      }
      if (failedConnectionsById.size > 0) {
        const failedConnections = [...failedConnectionsById.values()]
        setConnections((prev) => {
          const existingIds = new Set(prev.map((connection) => connection.id))
          const connectionsToRestore = failedConnections.filter((connection) => !existingIds.has(connection.id))
          return connectionsToRestore.length > 0 ? [...prev, ...connectionsToRestore] : prev
        })
      }

      if (failedFramesById.size > 0 || failedConnectionsById.size > 0) {
        const succeededFrames = framesToDelete.length - failedFramesById.size
        setSyncError(
          `Slettet ${succeededFrames} av ${framesToDelete.length} elementer. ${failedFramesById.size} elementer feilet.`,
        )
      }
    },
    [
      activeEditableFrameId,
      canPersistToDashboard,
      connectionDragState?.sourceFrameId,
      connections,
      dashboardId,
      frames,
      projectId,
      releaseEditLock,
      setSyncError,
    ],
  )

  const {
    editChartFrameId,
    editChartTarget,
    deleteChartTarget,
    chartMutationError,
    savingEditChart,
    deletingChart,
    handleOpenEditChartModal,
    handleOpenDeleteChartModal,
    handleSaveEditedChart,
    handleDeleteChart,
    closeEditChartModal,
    closeDeleteChartModal,
  } = useCanvasChartMutations({
    frames,
    activeCanvasCategoryId,
    persistFrame,
    setFrames,
    setSyncError,
    handleRemovePage,
  })

  const getContainedFrameIdsForSection = useCallback(
    (sectionFrame: CanvasFrame): string[] => {
      if (sectionFrame.kind !== 'section') return []
      const sectionBounds = getFrameBounds(sectionFrame)
      return frames
        .filter((frame) => {
          if (frame.id === sectionFrame.id || frame.kind === 'section') return false
          if ((frame.categoryId ?? null) !== (sectionFrame.categoryId ?? null)) return false
          const bounds = getFrameBounds(frame)
          const intersectsSection =
            bounds.right >= sectionBounds.left &&
            bounds.left <= sectionBounds.right &&
            bounds.bottom >= sectionBounds.top &&
            bounds.top <= sectionBounds.bottom
          return intersectsSection
        })
        .map((frame) => frame.id)
    },
    [frames, getFrameBounds],
  )

  const handleRequestRemoveFrame = (frame: CanvasFrame) => {
    if (frame.kind === 'section') {
      setDeleteTarget({
        type: 'section',
        id: frame.id,
        label: frame.label || 'seksjonen',
        containedFrameIds: getContainedFrameIdsForSection(frame),
      })
      return
    }
    const voteCount =
      frame.kind === 'sticky' && Number.isFinite(frame.finalVoteCount) ? frame.finalVoteCount : undefined
    setDeleteTarget({
      type: 'frame',
      id: frame.id,
      label: frame.label || 'kortet',
      hasVotes: voteCount !== undefined && voteCount > 0,
      voteCount,
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

  const handleConfirmDeleteTarget = async (mode?: 'section-only' | 'section-with-content') => {
    if (!deleteTarget) return
    const target = deleteTarget
    setIsSavingCanvasItem(true)

    try {
      if (target.type === 'frame') {
        await handleRemovePage(target.id)
        setDeleteTarget(null)
        return
      }

      if (target.type === 'section') {
        if (mode === 'section-with-content') {
          const latestSectionFrame = frames.find((frame) => frame.id === target.id)
          const latestContainedIds =
            latestSectionFrame && latestSectionFrame.kind === 'section'
              ? getContainedFrameIdsForSection(latestSectionFrame)
              : target.containedFrameIds
          const idsToDelete = [target.id, ...latestContainedIds]
          await handleBulkRemovePages(idsToDelete)
        } else {
          await handleRemovePage(target.id)
        }
        setBulkDeleteProgress(null)
        setDeleteTarget(null)
        return
      }

      if (target.type === 'frames') {
        await handleBulkRemovePages(target.ids)
        setBulkDeleteProgress(null)
        setDeleteTarget(null)
        return
      }

      if (target.type === 'connection') {
        await handleRemoveConnection(target.id)
        setDeleteTarget(null)
        return
      }

      if (target.type === 'clear-vote-snapshot') {
        handleClearStickyVoteSnapshot(target.id)
        setDeleteTarget(null)
      }
    } finally {
      setIsSavingCanvasItem(false)
      setBulkDeleteProgress(null)
    }
  }

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
      const isCutShortcut = pressedKey === 'x' && !event.shiftKey
      const isPasteShortcut = pressedKey === 'v' && !event.shiftKey
      if (!isCopyShortcut && !isCutShortcut && !isPasteShortcut) return

      if (isCopyShortcut || isCutShortcut) {
        const copiedFrames = frames
          .filter((frame) => selectedFrameIds.includes(frame.id))
          .sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y
            if (a.x !== b.x) return a.x - b.x
            return a.id.localeCompare(b.id)
          })

        if (copiedFrames.length === 0) return
        event.preventDefault()
        clipboardFramesRef.current = copiedFrames
        clipboardPasteCountRef.current = 0

        if (isCutShortcut) {
          void (async () => {
            try {
              setIsSavingCanvasItem(true)
              setSyncError(null)
              const idsToRemove = [...selectedFrameIds]
              for (const id of idsToRemove) {
                await handleRemovePage(id)
              }
              setSelectedFrameIds([])
            } catch (error) {
              setSyncError(error instanceof Error ? error.message : 'Kunne ikke klippe ut elementer fra canvas')
            } finally {
              setIsSavingCanvasItem(false)
            }
          })()
        }
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
  }, [frames, handleRemovePage, persistFrame, selectedFrameIds])

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
    const pointerSide = getDominantDirectionSide(
      sourceAnchor.x,
      sourceAnchor.y,
      connectionDragState.pointerX,
      connectionDragState.pointerY,
    )
    const freePointerTargetSide: ConnectionAnchorSide =
      pointerSide === 'left' ? 'right' : pointerSide === 'right' ? 'left' : pointerSide === 'top' ? 'bottom' : 'top'
    const targetSide =
      targetFrame?.kind === 'website'
        ? getNearestAnchorSide(targetFrame, sourceAnchor.x, sourceAnchor.y)
        : freePointerTargetSide
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

  const handleRotateFigureFrame = (id: string, delta: number) => {
    const currentFrame = frames.find((frame) => frame.id === id)
    if (!currentFrame || currentFrame.kind !== 'figure') return

    const currentRotation = currentFrame.iconRotationDeg ?? 0
    const nextRotation = (((currentRotation + delta) % 360) + 360) % 360
    const nextFrame: CanvasFrame = {
      ...currentFrame,
      iconRotationDeg: nextRotation,
    }

    setFrames((prev) => prev.map((frame) => (frame.id === id ? nextFrame : frame)))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre figur-rotasjon')
    })
  }

  const handleRotateDrawingFrame = (id: string, delta: number) => {
    const currentFrame = frames.find((frame) => frame.id === id)
    if (!currentFrame || currentFrame.kind !== 'drawing') return

    const currentRotation = currentFrame.drawingRotationDeg ?? 0
    const nextRotation = (((currentRotation + delta) % 360) + 360) % 360
    const nextFrame: CanvasFrame = {
      ...currentFrame,
      drawingRotationDeg: nextRotation,
    }

    setFrames((prev) => prev.map((frame) => (frame.id === id ? nextFrame : frame)))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre tegning-rotasjon')
    })
  }

  const handleSetSectionLayout = (
    id: string,
    nextSectionLayout: CanvasSectionLayoutMode,
    nextLabel?: string,
  ): boolean => {
    const sectionFrame = frames.find((frame) => frame.id === id)
    if (!sectionFrame || sectionFrame.kind !== 'section') return false
    if (sectionFrame.sectionLayout === nextSectionLayout && nextLabel === undefined) return true

    if (sectionFrame.sectionLayout === 'freeform' && nextSectionLayout === 'grid') {
      const confirmed = window.confirm(
        'Bytte til rutenett vil flytte elementene automatisk og overstyre friform-posisjonene. Vil du fortsette?',
      )
      if (!confirmed) return false
    }

    if (nextSectionLayout === 'freeform') {
      const nextSectionFrame: CanvasFrame = {
        ...sectionFrame,
        label: nextLabel ?? sectionFrame.label,
        sectionLayout: 'freeform',
      }
      setFrames((prev) => prev.map((frame) => (frame.id === id ? nextSectionFrame : frame)))
      void persistFrame(nextSectionFrame).catch((error) => {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre seksjonsoppsett')
      })
      return true
    }

    const sectionBounds = getFrameBoundsForLayout(sectionFrame)
    const contentPaddingX = 24
    const contentPaddingTop = GRID_SECTION_LAYOUT_CONFIG.paddingTop
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
      .sort(compareFramesForGridLayout)

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
      label: nextLabel ?? sectionFrame.label,
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
    return true
  }

  const handleOpenSectionOptionsModal = (id: string) => {
    const sectionFrame = frames.find((frame) => frame.id === id && frame.kind === 'section')
    if (!sectionFrame) return
    setSectionOptionsFrameId(id)
    setSectionOptionsNameInput(sectionFrame.label)
    setSectionOptionsLayoutMode(sectionFrame.sectionLayout === 'grid' ? 'grid' : 'freeform')
    setSectionOptionsError(null)
    setIsSectionOptionsModalOpen(true)
  }

  const handleSaveSectionOptions = () => {
    const frameId = sectionOptionsFrameId
    if (!frameId) return
    const sectionFrame = frames.find((frame) => frame.id === frameId && frame.kind === 'section')
    if (!sectionFrame) {
      setSectionOptionsError('Fant ikke seksjonen.')
      return
    }

    const normalizedLabel = sectionOptionsNameInput.trim() || getNextAutoSectionLabel(frames, frameId)
    const nextLayout = sectionOptionsLayoutMode

    if (sectionFrame.sectionLayout !== nextLayout) {
      const didApplyLayout = handleSetSectionLayout(frameId, nextLayout, normalizedLabel)
      if (!didApplyLayout) return
      setIsSectionOptionsModalOpen(false)
      setSectionOptionsFrameId(null)
      setSectionOptionsNameInput('')
      setSectionOptionsLayoutMode('grid')
      setSectionOptionsError(null)
      return
    }

    const nextSectionFrame: CanvasFrame = {
      ...sectionFrame,
      label: normalizedLabel,
    }
    setFrames((prev) => prev.map((frame) => (frame.id === frameId ? nextSectionFrame : frame)))
    void persistFrame(nextSectionFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre seksjonsinnstillinger')
    })
    setIsSectionOptionsModalOpen(false)
    setSectionOptionsFrameId(null)
    setSectionOptionsNameInput('')
    setSectionOptionsLayoutMode('grid')
    setSectionOptionsError(null)
  }

  const handleMoveFrameToSection = (frameId: string, sectionId: string) => {
    const frameToMove = frames.find((frame) => frame.id === frameId)
    const targetSection = frames.find((frame) => frame.id === sectionId)
    if (!frameToMove || !targetSection || targetSection.kind !== 'section') return
    if (frameToMove.kind !== 'sticky' && frameToMove.kind !== 'text') return
    if ((frameToMove.categoryId ?? null) !== (targetSection.categoryId ?? null)) return

    const sourceGridSectionId = findFrameContainingGridSectionId(frameToMove, frames)
    const targetBounds = getFrameBoundsForLayout(targetSection)
    const baseX = targetBounds.left + GRID_SECTION_LAYOUT_CONFIG.paddingX
    const baseY = targetBounds.top + GRID_SECTION_LAYOUT_CONFIG.paddingTop
    const isTargetGrid = targetSection.sectionLayout === 'grid'

    const existingItemsInTargetSection = frames.filter((frame) => {
      if (frame.id === frameId || frame.id === targetSection.id || frame.kind === 'section') return false
      if ((frame.categoryId ?? null) !== (targetSection.categoryId ?? null)) return false
      const bounds = getFrameBoundsForLayout(frame)
      const centerX = (bounds.left + bounds.right) / 2
      const centerY = (bounds.top + bounds.bottom) / 2
      return (
        centerX >= targetBounds.left &&
        centerX <= targetBounds.right &&
        centerY >= targetBounds.top &&
        centerY <= targetBounds.bottom
      )
    })
    const freeformShiftStep = 24
    const freeformColumns = 4
    const freeformShiftIndex = existingItemsInTargetSection.length
    const freeformShiftX = (freeformShiftIndex % freeformColumns) * freeformShiftStep
    const freeformShiftY = Math.floor(freeformShiftIndex / freeformColumns) * freeformShiftStep

    const movedFrame: CanvasFrame = {
      ...frameToMove,
      x: Math.max(0, baseX + (isTargetGrid ? 0 : freeformShiftX)),
      y: Math.max(-CANVAS_TOP_BUFFER, baseY + (isTargetGrid ? 0 : freeformShiftY)),
    }

    const framesWithMove = frames.map((frame) => (frame.id === frameId ? movedFrame : frame))
    const affectedGridSectionIds = [sourceGridSectionId, isTargetGrid ? targetSection.id : null].filter(
      (value): value is string => Boolean(value),
    )
    const { nextFrames: nextFramesAfterReflow, changedFrameIds } = reflowGridSections(
      framesWithMove,
      affectedGridSectionIds,
    )
    changedFrameIds.add(movedFrame.id)

    setFrames(nextFramesAfterReflow)
    const framesToPersist = nextFramesAfterReflow.filter(
      (frame) => changedFrameIds.has(frame.id) && Boolean(frame.graphId),
    )
    void Promise.all(
      framesToPersist.map((frame) =>
        persistFrame(frame).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke flytte element til seksjon')
          return frame
        }),
      ),
    )
  }

  const handleSetStickyColor = (frameId: string, colorId: string) => {
    const frame = frames.find((item) => item.id === frameId)
    if (!frame || frame.kind !== 'sticky') return
    const nextFrame: CanvasFrame = {
      ...frame,
      stickyColor: getCanvasStickyColor(colorId),
    }
    setFrames((prev) => prev.map((item) => (item.id === frameId ? nextFrame : item)))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre farge for post-it-lapp')
    })
  }

  const handleClearStickyVoteSnapshot = (frameId: string) => {
    const frame = frames.find((item) => item.id === frameId)
    if (!frame || frame.kind !== 'sticky') return
    if (!Number.isFinite(frame.finalVoteCount) && !Number.isFinite(frame.finalVoteRank)) return

    const nextFrame: CanvasFrame = {
      ...frame,
      finalVoteCount: undefined,
      finalVoteRank: undefined,
    }
    setFrames((prev) => prev.map((item) => (item.id === frameId ? nextFrame : item)))
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke fjerne lagret stemmeresultat')
    })
  }

  const handleRequestClearStickyVoteSnapshot = (frameId: string) => {
    const frame = frames.find((item) => item.id === frameId)
    if (!frame || frame.kind !== 'sticky') return
    setDeleteTarget({
      type: 'clear-vote-snapshot',
      id: frameId,
      label: frame.label || 'Post-it-lapp',
      voteCount: frame.finalVoteCount ?? 0,
    })
  }

  const handleEditableFrameChange = (id: string, nextValue: string) => {
    if (isInteractionLocked) return
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
        if (frame.kind === 'sql-editor' || frame.kind === 'code-block') {
          return {
            ...frame,
            sqlQuery: nextValue,
          }
        }
        return frame
      }),
    )
  }

  const handlePersistSqlEditorFrame = async (id: string, nextValue?: string): Promise<void> => {
    const frame = frames.find((item) => item.id === id)
    if (!frame || (frame.kind !== 'sql-editor' && frame.kind !== 'code-block')) return

    const nextFrame: CanvasFrame = {
      ...frame,
      sqlQuery: ((nextValue ?? frame.sqlQuery) || '').trim(),
    }

    setFrames((prev) => prev.map((item) => (item.id === id ? nextFrame : item)))
    try {
      await persistFrame(nextFrame)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre kode')
    }
  }

  const handleEditableFrameBlur = (id: string, nextValue?: string) => {
    if (isInteractionLocked) return
    const frame = frames.find((item) => item.id === id)
    if (
      !frame ||
      frame.kind === 'website' ||
      frame.kind === 'image' ||
      frame.kind === 'chart' ||
      frame.kind === 'link' ||
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
    } else if (frame.kind === 'text' || frame.kind === 'sticky') {
      nextFrame = {
        ...frame,
        textContent: (frame.textContent || '').trim(),
      }
    } else {
      nextFrame = {
        ...frame,
        sqlQuery: ((nextValue ?? frame.sqlQuery) || '').trim(),
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
    if (isInteractionLocked) return
    const frame = frames.find((item) => item.id === id)
    if (
      !frame ||
      (frame.kind !== 'heading' &&
        frame.kind !== 'text' &&
        frame.kind !== 'sticky' &&
        frame.kind !== 'section' &&
        frame.kind !== 'sql-editor' &&
        frame.kind !== 'code-block')
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
    setRenameCanvasError(null)
    setCanvasSettingsInfo(null)
    setIsCanvasSettingsModalOpen(true)
  }

  const handleOpenInventoryModal = () => {
    setIsInventoryModalOpen(true)
  }

  const handleOpenShareView = () => {
    window.location.assign(
      buildCanvasShareUrl({
        projectId,
        dashboardId,
        categoryId: activeCanvasCategoryId,
      }),
    )
  }

  const handleOpenPresentationView = () => {
    window.location.assign(
      buildCanvasPresentationUrl({
        projectId,
        dashboardId,
        categoryId: activeCanvasCategoryId,
      }),
    )
  }

  const loadCanvasChangeLog = useCallback(async () => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) {
      setChangeLogEntries([])
      setChangeLogError('Endringslogg er bare tilgjengelig for canvas som er koblet til dashboard.')
      return
    }

    setIsLoadingChangeLog(true)
    setChangeLogError(null)
    try {
      const categories = await fetchCategories(projectId, dashboardId)
      const graphsByCategory = await Promise.all(
        categories.map((category) => fetchGraphs(projectId, dashboardId, category.id)),
      )

      const entries = graphsByCategory
        .flatMap((graphs) => graphs)
        .map((graph) => {
          const graphWithAudit = graph as typeof graph & {
            changedByName?: string
            changedByNavIdent?: string
            changedByEmail?: string
          }

          return {
            id: graph.id,
            name: String(graph.name || ''),
            description: String(graph.description || ''),
            updatedAt: String(graph.updatedAt || ''),
            changedByName: String(graphWithAudit.changedByName || ''),
            changedByNavIdent: String(graphWithAudit.changedByNavIdent || ''),
            changedByEmail: String(graphWithAudit.changedByEmail || ''),
            graphType: String(graph.graphType || ''),
          } satisfies ChangeLogEntry
        })
        .filter((entry) => entry.name.startsWith('canvas:') || entry.description.startsWith('[canvas'))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

      setChangeLogEntries(entries)
    } catch (error) {
      setChangeLogError(error instanceof Error ? error.message : 'Kunne ikke laste endringslogg')
    } finally {
      setIsLoadingChangeLog(false)
    }
  }, [canPersistToDashboard, projectId, dashboardId])

  const handleOpenChangeLogModal = () => {
    setIsChangeLogModalOpen(true)
    void loadCanvasChangeLog()
  }

  const handleOpenTimerModal = () => {
    if (Date.now() < timerModalReopenBlockedUntilRef.current) return
    setTimerModalError(null)
    void (async () => {
      await refreshTimer()
      setIsTimerModalOpen(true)
    })()
  }

  const handleOpenDotVotingModal = () => {
    setDotVotingModalError(null)
    void (async () => {
      await refreshVoting()
      setIsDotVotingModalOpen(true)
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

  const handleStartDotVoting = () => {
    const sectionFrame = frames.find((frame) => frame.id === dotVotingSelectedSectionId && frame.kind === 'section')
    if (!sectionFrame?.graphId) {
      setDotVotingModalError('Velg en seksjon som allerede er lagret i canvas.')
      return
    }

    const minutes = Number(dotVotingMinutesInput)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setDotVotingModalError('Legg inn et gyldig antall minutter (minst 1).')
      return
    }
    if (minutes > 240) {
      setDotVotingModalError('Maks varighet er 240 minutter.')
      return
    }

    const votesPerParticipant = Number(dotVotingVotesPerParticipantInput)
    if (!Number.isFinite(votesPerParticipant) || votesPerParticipant <= 0) {
      setDotVotingModalError('Legg inn antall stemmer per person (minst 1).')
      return
    }
    if (votesPerParticipant > 20) {
      setDotVotingModalError('Maks antall stemmer per person er 20.')
      return
    }

    void (async () => {
      setDotVotingModalPendingAction('start')
      try {
        await startVoting({
          sectionGraphId: sectionFrame.graphId ?? 0,
          durationMinutes: minutes,
          votesPerParticipant,
        })
        setDotVotingModalError(null)
        setIsDotVotingModalOpen(false)
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handlePauseDotVoting = () => {
    void (async () => {
      setDotVotingModalPendingAction('pause')
      try {
        await pauseVoting()
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handleResumeDotVoting = () => {
    void (async () => {
      setDotVotingModalPendingAction('resume')
      try {
        await resumeVoting()
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handleAdjustDotVotingMinusOneMinute = () => {
    void (async () => {
      setDotVotingModalPendingAction('adjust-minus')
      try {
        await adjustVotingMinutes(-1)
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handleAdjustDotVotingPlusOneMinute = () => {
    void (async () => {
      setDotVotingModalPendingAction('adjust-plus')
      try {
        await adjustVotingMinutes(1)
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handleEndSortAndClearDotVoting = () => {
    void (async () => {
      setDotVotingModalPendingAction('end')
      try {
        await endVoting()
      } finally {
        setDotVotingModalPendingAction(null)
      }
      handleSortSectionByVotes()
      setDotVotingModalPendingAction('clear')
      try {
        await clearVoting()
      } finally {
        setDotVotingModalPendingAction(null)
      }
      setIsDotVotingModalOpen(false)
    })()
  }

  const handleEndDotVoting = () => {
    void (async () => {
      setDotVotingModalPendingAction('end')
      try {
        await endVoting()
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handleClearDotVoting = () => {
    void (async () => {
      setDotVotingModalPendingAction('clear')
      try {
        await clearVoting()
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handleAddDotVote = (stickyId: string) => {
    const stickyFrame = frames.find((frame) => frame.id === stickyId)
    if (!stickyFrame || stickyFrame.kind !== 'sticky' || !stickyFrame.graphId) return

    void (async () => {
      setDotVotingModalPendingAction('add-vote')
      try {
        await addVote(stickyFrame.graphId ?? 0)
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handleRemoveDotVote = (stickyId: string) => {
    const stickyFrame = frames.find((frame) => frame.id === stickyId)
    if (!stickyFrame || stickyFrame.kind !== 'sticky' || !stickyFrame.graphId) return

    void (async () => {
      setDotVotingModalPendingAction('remove-vote')
      try {
        await removeVote(stickyFrame.graphId ?? 0)
      } finally {
        setDotVotingModalPendingAction(null)
      }
    })()
  }

  const handleSortSectionByVotes = () => {
    if (!dotVotingSessionPayload?.sectionGraphId) {
      setDotVotingModalError('Fant ingen aktiv eller avsluttet votering å sortere etter.')
      return
    }

    const sectionFrame = frames.find(
      (frame) => frame.kind === 'section' && frame.graphId === dotVotingSessionPayload.sectionGraphId,
    )
    if (!sectionFrame) {
      setDotVotingModalError('Fant ikke seksjonen for denne voteringen i aktiv fane.')
      return
    }

    const sectionBounds = getFrameBoundsForLayout(sectionFrame)
    const sectionStickyFrames = frames
      .filter((frame) => {
        if (frame.kind !== 'sticky') return false
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
        const votesA = activeVotesByFrameGraphId[String(a.graphId ?? 0)] ?? 0
        const votesB = activeVotesByFrameGraphId[String(b.graphId ?? 0)] ?? 0
        if (votesA !== votesB) return votesB - votesA
        return compareFramesForSectionOrder(a, b)
      })

    if (sectionStickyFrames.length === 0) {
      setDotVotingModalError('Fant ingen Post-it-lapper å sortere i valgt seksjon.')
      return
    }

    const nextFramesById = new Map<string, CanvasFrame>()
    if (sectionFrame.sectionLayout === 'grid') {
      const baseX = sectionBounds.left + GRID_SECTION_LAYOUT_CONFIG.paddingX
      const baseY = sectionBounds.top + GRID_SECTION_LAYOUT_CONFIG.paddingTop
      sectionStickyFrames.forEach((frame, index) => {
        const votes = activeVotesByFrameGraphId[String(frame.graphId ?? 0)] ?? 0
        const nextFrame: CanvasFrame = {
          ...frame,
          x: Math.max(0, baseX),
          y: Math.max(-CANVAS_TOP_BUFFER, baseY + index * 10),
          stickyColor: votes > 0 ? 'green' : frame.stickyColor,
          finalVoteCount: votes,
          finalVoteRank: index + 1,
        }
        nextFramesById.set(frame.id, nextFrame)
      })
    } else {
      const contentLeft = sectionBounds.left + 24
      const contentRight = sectionBounds.right - 24
      const contentTop = sectionBounds.top + GRID_SECTION_LAYOUT_CONFIG.paddingTop
      const gapX = 20
      const gapY = 18
      let cursorX = contentLeft
      let cursorY = contentTop
      let rowHeight = 0

      sectionStickyFrames.forEach((frame) => {
        const votes = activeVotesByFrameGraphId[String(frame.graphId ?? 0)] ?? 0
        const defaults = getDefaultFrameSize(frame)
        const width = frame.width ?? defaults.width
        const height = frame.height ?? defaults.height
        const shouldWrap = cursorX !== contentLeft && cursorX + width > contentRight

        if (shouldWrap) {
          cursorX = contentLeft
          cursorY += rowHeight + gapY
          rowHeight = 0
        }

        const nextFrame: CanvasFrame = {
          ...frame,
          x: Math.max(0, cursorX),
          y: Math.max(-CANVAS_TOP_BUFFER, cursorY),
          stickyColor: votes > 0 ? 'green' : frame.stickyColor,
          finalVoteCount: votes,
          finalVoteRank: nextFramesById.size + 1,
        }
        nextFramesById.set(frame.id, nextFrame)
        cursorX += width + gapX
        rowHeight = Math.max(rowHeight, height)
      })
    }

    let nextFrames = frames.map((frame) => nextFramesById.get(frame.id) ?? frame)
    const framesToPersistById = new Map(nextFramesById)
    if (sectionFrame.sectionLayout === 'grid') {
      const { nextFrames: nextAfterReflow, changedFrameIds } = reflowGridSections(nextFrames, [sectionFrame.id])
      nextFrames = nextAfterReflow
      changedFrameIds.forEach((frameId) => {
        const frame = nextAfterReflow.find((item) => item.id === frameId)
        if (frame) framesToPersistById.set(frameId, frame)
      })
    }

    setFrames(nextFrames)
    void (async () => {
      setDotVotingModalPendingAction('sort')
      try {
        await Promise.all(
          [...framesToPersistById.values()]
            .filter((frame) => Boolean(frame.graphId))
            .map((frame) =>
              persistFrame(frame).catch((error) => {
                setSyncError(error instanceof Error ? error.message : 'Kunne ikke sortere seksjon etter stemmer')
                return frame
              }),
            ),
        )
        setDotVotingModalError(null)
      } finally {
        setDotVotingModalPendingAction(null)
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

  const sectionMoveOptions = useMemo(
    () =>
      visibleFrames
        .filter((frame) => frame.kind === 'section')
        .sort((a, b) => {
          if (a.y !== b.y) return a.y - b.y
          if (a.x !== b.x) return a.x - b.x
          return a.id.localeCompare(b.id)
        })
        .map((frame) => ({
          id: frame.id,
          label: frame.label || 'Seksjon',
        })),
    [visibleFrames],
  )

  const dotVotingSectionOptions = useMemo(
    () =>
      visibleFrames
        .filter((frame) => frame.kind === 'section' && Boolean(frame.graphId))
        .sort((a, b) => {
          if (a.y !== b.y) return a.y - b.y
          if (a.x !== b.x) return a.x - b.x
          return a.id.localeCompare(b.id)
        })
        .map((frame) => ({
          id: frame.id,
          label: frame.label.trim() || 'Seksjon',
        })),
    [visibleFrames],
  )

  const activeDotVotingSectionFrame = useMemo(
    () =>
      dotVotingSessionPayload
        ? (frames.find(
            (frame) => frame.kind === 'section' && frame.graphId === dotVotingSessionPayload.sectionGraphId,
          ) ?? null)
        : null,
    [dotVotingSessionPayload, frames],
  )

  const activeDotVotingSectionLabel = useMemo(
    () => activeDotVotingSectionFrame?.label.trim() || null,
    [activeDotVotingSectionFrame],
  )

  const dotVotingStickyRows = useMemo(() => {
    if (!activeDotVotingSectionFrame) return []

    const sectionBounds = getFrameBounds(activeDotVotingSectionFrame)
    return visibleFrames
      .filter((frame) => {
        if (frame.kind !== 'sticky' || !frame.graphId) return false
        if ((frame.categoryId ?? null) !== (activeDotVotingSectionFrame.categoryId ?? null)) return false
        const bounds = getFrameBounds(frame)
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
        const votesA = activeVotesByFrameGraphId[String(a.graphId ?? 0)] ?? 0
        const votesB = activeVotesByFrameGraphId[String(b.graphId ?? 0)] ?? 0
        if (votesA !== votesB) return votesB - votesA
        if (a.y !== b.y) return a.y - b.y
        if (a.x !== b.x) return a.x - b.x
        return a.id.localeCompare(b.id)
      })
      .map((frame) => {
        const graphIdKey = String(frame.graphId ?? 0)
        const myVotes = myVotesByFrameGraphId[graphIdKey] ?? 0
        const canVote = myRemainingDotVotes > 0
        return {
          id: frame.id,
          label: frame.textContent?.trim() || frame.label.trim() || 'Post-it-lapp',
          totalVotes: activeVotesByFrameGraphId[graphIdKey] ?? 0,
          myVotes,
          canVote,
        }
      })
  }, [
    activeDotVotingSectionFrame,
    activeVotesByFrameGraphId,
    getFrameBounds,
    myRemainingDotVotes,
    myVotesByFrameGraphId,
    visibleFrames,
  ])

  const dotVotingTotalVotesByFrameId = useMemo(() => {
    const totalsByFrameId: Record<string, number> = {}
    frames.forEach((frame) => {
      if (frame.kind !== 'sticky' || !frame.graphId) return
      totalsByFrameId[frame.id] = activeVotesByFrameGraphId[String(frame.graphId)] ?? 0
    })
    return totalsByFrameId
  }, [activeVotesByFrameGraphId, frames])

  const dotVotingMyVotesByFrameId = useMemo(() => {
    const myByFrameId: Record<string, number> = {}
    frames.forEach((frame) => {
      if (frame.kind !== 'sticky' || !frame.graphId) return
      myByFrameId[frame.id] = myVotesByFrameGraphId[String(frame.graphId)] ?? 0
    })
    return myByFrameId
  }, [frames, myVotesByFrameGraphId])

  useEffect(() => {
    if (dotVotingSessionPayload) return
    if (
      dotVotingSelectedSectionId &&
      dotVotingSectionOptions.some((option) => option.id === dotVotingSelectedSectionId)
    ) {
      return
    }
    setDotVotingSelectedSectionId(dotVotingSectionOptions[0]?.id ?? '')
  }, [dotVotingSectionOptions, dotVotingSelectedSectionId, dotVotingSessionPayload])

  const canvasHierarchy = useMemo(
    () =>
      buildCanvasHierarchy({
        frames: visibleFrames,
        getFrameBounds,
      }),
    [getFrameBounds, visibleFrames],
  )

  const frameContainingSectionIdByFrameId = canvasHierarchy.frameContainingSectionIdByFrameId

  const inventoryHierarchy = useMemo(
    () => ({
      nodes: canvasHierarchy.nodes.map((node) =>
        node.type === 'section'
          ? {
              type: 'section' as const,
              id: node.id,
              label: node.label,
              elements: node.elements.map((element) => ({
                id: element.id,
                kindLabel: element.kindLabel,
                label: element.label,
              })),
            }
          : {
              type: 'element' as const,
              id: node.id,
              kindLabel: node.kindLabel,
              label: node.label,
            },
      ),
    }),
    [canvasHierarchy.nodes],
  )

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

  const canvasSurfaceWidth = useMemo(() => {
    const furthestFrameEdge = frameItems.reduce((maxRight, frame) => {
      const defaults = getDefaultFrameSize(frame)
      const frameWidth = frame.kind === 'heading' ? getHeadingFrameWidth(frame) : (frame.width ?? defaults.width)
      return Math.max(maxRight, frame.x + frameWidth)
    }, 0)

    return Math.max(CANVAS_SURFACE_WIDTH, Math.ceil(furthestFrameEdge + CANVAS_SURFACE_RIGHT_BUFFER))
  }, [frameItems, getHeadingFrameWidth])

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
        className="relative h-[100dvh] min-h-[100dvh] bg-[var(--ax-bg-neutral-soft)]"
        style={canvasFrontpageBackgroundStyle}
      >
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {timerA11yAnnouncement}
        </div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {placementA11yAnnouncement}
        </div>
        <CanvasTopBar
          canvasToolbarRef={canvasToolbarRef}
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
          onOpenAddSqlEditor={handleOpenAddSqlEditor}
          onOpenAddHeading={handleOpenAddHeadingModal}
          onOpenAddText={handleOpenAddTextModal}
          onOpenAddTable={handleOpenAddTableModal}
          onOpenAddLink={handleOpenAddLinkModal}
          onOpenAddSticky={handleOpenAddStickyModal}
          onOpenAddCodeBlock={handleOpenAddCodeBlock}
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
          onOpenChangeLog={handleOpenChangeLogModal}
          onOpenTimer={handleOpenTimerModal}
          onOpenDotVoting={handleOpenDotVotingModal}
          onOpenShareView={handleOpenShareView}
          onOpenPresentationView={handleOpenPresentationView}
          timerLabel={timerLabel}
          dotVotingLabel={dotVotingLabel}
          isTimerRunning={isTimerRunning}
          isTimerPaused={isTimerPaused}
          isDotVotingActive={isDotVotingActive}
          isDotVotingPaused={isDotVotingPaused}
          canManageTabs={canvasCategories.length > 1}
          canPersistToDashboard={canPersistToDashboard}
          shouldShowCreateCanvasModal={shouldShowCreateCanvasModal}
          canvasCategories={canvasCategories}
          activeCanvasCategoryId={activeCanvasCategoryId}
          onChangeActiveCanvasCategory={handleToolbarCategoryChange}
          getCanvasCategoryDisplayName={getCanvasCategoryDisplayName}
          isCanvasFrontpage={isCanvasFrontpage}
          showDateFilter={showDateFilter}
          activeParticipantCount={activeParticipantCount}
          activeOtherParticipantCount={activeOtherParticipantCount}
          participantLabels={participantLabels}
          isInteractionLocked={isDotVotingActive}
          isCanvasLocked={isCanvasLocked}
          isCanvasReadOnly={isCanvasReadOnly}
          onToggleLockedModeEditing={() => {
            if (!isCanvasLocked) return
            setIsLockedModeEditing((current) => !current)
            setActiveEditableFrameId(null)
            setSelectedFrameIds([])
            setSelectionBox(null)
          }}
          onToggleCanvasLock={() => {
            const nextIsLocked = !isCanvasLocked
            setIsCanvasLocked(nextIsLocked)
            setIsLockedModeEditing(false)
            setActiveEditableFrameId(null)
            setSelectedFrameIds([])
            setSelectionBox(null)

            if (!canPersistToDashboard || projectId === null || dashboardId === null) return

            void (async () => {
              try {
                const nextDescription = buildCanvasDashboardDescription(
                  canvasDashboardDescription,
                  selectedWebsite?.id ?? undefined,
                  canvasDefaultPeriod,
                  canvasDefaultCustomStartDate,
                  canvasDefaultCustomEndDate,
                  canvasHideDateFilter,
                  nextIsLocked,
                )
                await updateDashboard(projectId, dashboardId, {
                  name: canvasTitle,
                  description: nextDescription,
                })
                setCanvasDashboardDescription(nextDescription)
              } catch (error) {
                setIsCanvasLocked((current) => !current)
                setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre canvas-lås')
              }
            })()
          }}
        />

        <div className="flex h-full">
          <main ref={canvasViewportRef} aria-label="Canvas arbeidsflate" className="relative flex-1 overflow-auto">
            <CanvasPlacementModeBanner
              topOffsetPx={canvasCanvasTopOffset + 20}
              pendingFrameDraft={pendingFrameDraft}
              pendingCsvStickyImport={pendingCsvStickyImport}
              pendingFramePlacementLabel={pendingFramePlacementLabel}
              isImportingStickyCsv={isImportingStickyCsv}
              importStickyProgressCurrent={importStickyProgressCurrent}
              importStickyProgressTotal={importStickyProgressTotal}
              onAutoPlace={() => {
                void handleAutoPlacePendingFrame()
              }}
              onCancel={() => {
                cancelPendingFramePlacement()
                setPlacementA11yAnnouncement('Plasseringsmodus avsluttet.')
              }}
            />
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
            <CanvasDrawingAccessibilityModal
              open={isDrawingAccessibilityModalOpen}
              heading={editDrawingFrameId ? 'Rediger tegning' : 'Beskriv tegning'}
              submitLabel={editDrawingFrameId ? 'Lagre' : 'Legg til'}
              isDecorative={drawingIsDecorative}
              altTextValue={drawingAltTextInput}
              error={drawingAccessibilityError}
              isSaving={isSavingCanvasItem}
              onDecorativeChange={(value) => {
                setDrawingIsDecorative(value)
                if (value) setDrawingAltTextInput('')
                setDrawingAccessibilityError(null)
              }}
              onAltTextChange={(value) => {
                setDrawingAltTextInput(value)
                setDrawingAccessibilityError(null)
              }}
              onSubmit={() => void handleSaveDrawingWithAccessibility()}
              onClose={() => {
                setIsDrawingAccessibilityModalOpen(false)
                setPendingDrawingFrameDraft(null)
                setEditDrawingFrameId(null)
                setDrawingAccessibilityError(null)
              }}
            />
            <div
              className="relative"
              style={{
                width: `${canvasSurfaceWidth * canvasZoom}px`,
                minHeight: `${canvasCanvasTopOffset + canvasSurfaceHeight * canvasZoom}px`,
              }}
            >
              <div
                className={`absolute left-0 top-0 origin-top-left ${pendingFrameDraft || pendingCsvStickyImport || isDrawingMode ? 'cursor-crosshair' : ''}`}
                onMouseDown={isDrawingMode || isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseDown}
                onMouseMove={isDrawingMode || isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseMove}
                onMouseLeave={isDrawingMode || isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseLeave}
                style={{
                  top: `${canvasCanvasTopOffset}px`,
                  width: `${canvasSurfaceWidth}px`,
                  height: `${canvasSurfaceHeight}px`,
                  transform: `scale(${canvasZoom})`,
                  transformOrigin: 'top left',
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, var(--ax-border-neutral-subtle) 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              >
                <CanvasPlacementModeLayer
                  pendingFrameDraft={pendingFrameDraft}
                  pendingCsvStickyImport={pendingCsvStickyImport}
                  pendingFramePointer={pendingFramePointer}
                  pendingFigureDragStart={pendingFigureDragStart}
                  pendingFramePlacementLabel={pendingFramePlacementLabel}
                  getPendingFrameContentAnchorOffset={getPendingFrameContentAnchorOffset}
                  getDefaultFrameSize={getDefaultFrameSize}
                  getHeadingFrameHeight={getHeadingFrameHeight}
                  getHeadingFrameFontSize={getHeadingFrameFontSize}
                  headingCardHeaderHeight={HEADING_CARD_HEADER_HEIGHT}
                />
                {isPlacementModeActive && (
                  <div
                    className="absolute inset-0 z-[96] cursor-crosshair"
                    onMouseDown={isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseDown}
                    onMouseMove={isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseMove}
                    onMouseLeave={isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseLeave}
                  />
                )}
                {isDrawingMode && (
                  <div
                    className="absolute inset-0 z-[95] touch-none cursor-crosshair"
                    onMouseDown={isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseDown}
                    onMouseMove={isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseMove}
                    onMouseLeave={isCanvasReadOnly ? undefined : handleCanvasSurfaceMouseLeave}
                    onTouchStart={
                      isCanvasReadOnly
                        ? undefined
                        : (event) => {
                            const touch = event.touches[0]
                            if (!touch) return
                            const pointer = getCanvasPointerPosition(touch.clientX, touch.clientY)
                            if (!pointer) return
                            event.preventDefault()
                            event.stopPropagation()
                            startDrawingAt(pointer)
                          }
                    }
                    onTouchMove={
                      isCanvasReadOnly
                        ? undefined
                        : (event) => {
                            const touch = event.touches[0]
                            if (!touch) return
                            const pointer = getCanvasPointerPosition(touch.clientX, touch.clientY)
                            if (!pointer) return
                            event.preventDefault()
                            continueDrawingAt(pointer)
                          }
                    }
                  />
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
                <div className={isPlacementModeActive ? 'pointer-events-none' : undefined}>
                  <CanvasConnectionLayer
                    connectionSegments={connectionSegments}
                    connectionPreview={connectionPreview}
                    connectionSegmentsWithMetrics={connectionSegmentsWithMetrics}
                    onRequestRemoveConnection={handleRequestRemoveConnection}
                  />
                </div>
                <CanvasDrawingDraftOverlay
                  drawingDraftStrokes={drawingDraftStrokes}
                  activeDrawingStroke={activeDrawingStroke}
                />
                <div className={isPlacementModeActive ? 'pointer-events-none' : undefined}>
                  <CanvasFrameLayer
                    frameItems={frameItems}
                    sectionItemCountsById={sectionItemCountsById}
                    sectionMoveOptions={sectionMoveOptions}
                    frameContainingSectionIdByFrameId={frameContainingSectionIdByFrameId}
                    stickyColorOptions={CANVAS_STICKY_COLOR_OPTIONS.map((option) => ({
                      id: option.id,
                      label: option.label,
                      color: option.background,
                    }))}
                    selectedFrameIds={selectedFrameIds}
                    activeInsightFrameId={activeInsightFrameId}
                    pageInsights={pageInsights}
                    frameVisualizationData={frameVisualizationData}
                    websiteTopListEnabled={websiteTopListEnabled}
                    onToggleWebsiteTopList={() => setWebsiteTopListEnabled((current) => !current)}
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
                    focusWebsiteTopListItem={focusWebsiteTopListItem}
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
                    handleOpenEditDrawingModal={handleOpenEditDrawingModal}
                    handleOpenEditTableModal={handleOpenEditTableModal}
                    handleOpenEditLinkModal={handleOpenEditLinkModal}
                    handleOpenEditIllustrationModal={handleOpenEditIllustrationModal}
                    handleOpenEditIconModal={handleOpenEditIconModal}
                    handleDuplicateIconCard={handleDuplicateIconCard}
                    handleRotateIconFrame={handleRotateIconFrame}
                    handleOpenEditFigureModal={handleOpenEditFigureModal}
                    handleDuplicateFigureCard={handleDuplicateFigureCard}
                    handleDuplicateSectionCard={handleDuplicateSectionCard}
                    handleDuplicateStickyCard={handleDuplicateStickyCard}
                    handleDuplicateTextCard={handleDuplicateTextCard}
                    handleDuplicateHeadingCard={handleDuplicateHeadingCard}
                    handleDuplicateDrawingCard={handleDuplicateDrawingCard}
                    handleDuplicateImageCard={handleDuplicateImageCard}
                    handleSetHeadingFontSize={handleSetHeadingFontSize}
                    handleRotateIllustrationFrame={handleRotateIllustrationFrame}
                    handleRotateFigureFrame={handleRotateFigureFrame}
                    handleRotateDrawingFrame={handleRotateDrawingFrame}
                    handleOpenSectionOptionsModal={handleOpenSectionOptionsModal}
                    handleMoveFrameToSection={handleMoveFrameToSection}
                    handleSetStickyColor={handleSetStickyColor}
                    handleRequestRemoveFrame={handleRequestRemoveFrame}
                    handleSelectSectionAddAction={handleSelectSectionAddAction}
                    startConnectionDrag={startConnectionDrag}
                    handleAssignWebsiteToChart={handleAssignWebsiteToChart}
                    handleOpenEditChartModal={handleOpenEditChartModal}
                    handleOpenDeleteChartModal={handleOpenDeleteChartModal}
                    handlePersistSqlEditorFrame={handlePersistSqlEditorFrame}
                    handleEditableFrameChange={handleEditableFrameChange}
                    handleEditableFrameBlur={handleEditableFrameBlur}
                    handleStartEditingFrame={handleStartEditingFrame}
                    handleResizeStart={handleResizeStart}
                    isDotVotingActive={isDotVotingActive}
                    dotVotingTargetSectionId={activeDotVotingSectionFrame?.id ?? null}
                    dotVotingTotalVotesByFrameId={dotVotingTotalVotesByFrameId}
                    dotVotingMyVotesByFrameId={dotVotingMyVotesByFrameId}
                    shouldRevealDotVotingTotals={shouldRevealDotVotingTotals}
                    onVoteSticky={handleAddDotVote}
                    onClearStickyVoteSnapshot={handleRequestClearStickyVoteSnapshot}
                    isCanvasLocked={isCanvasReadOnly}
                    focusSectionTitleId={focusSectionTitleId}
                    onSectionTitleFocusHandled={() => setFocusSectionTitleId(null)}
                    focusFrameId={focusFrameId}
                    onFrameFocusHandled={() => setFocusFrameId(null)}
                  />
                </div>
              </div>
            </div>
          </main>
        </div>
        <CanvasGrafbyggerOverlay open={isGrafbyggerEmbedded} topOffsetPx={canvasCanvasTopOffset} src={grafbyggerSrc} />
        <CanvasFloatingControls
          isGrafbyggerEmbedded={isGrafbyggerEmbedded}
          isDotVotingActive={isDotVotingActive}
          selectedFrameCount={selectedFrameIds.length}
          onRequestRemoveSelectedFrames={handleRequestRemoveSelectedFrames}
          canvasZoom={canvasZoom}
          onZoomOut={() => handleCanvasZoomChange(canvasZoom - CANVAS_ZOOM_STEP)}
          onZoomReset={handleCanvasZoomReset}
          onZoomIn={() => handleCanvasZoomChange(canvasZoom + CANVAS_ZOOM_STEP)}
        />
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
        onConfirmDeleteTarget={(mode) => void handleConfirmDeleteTarget(mode)}
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

      <ChangeLogModal
        open={isChangeLogModalOpen}
        onClose={() => setIsChangeLogModalOpen(false)}
        entries={visibleChangeLogEntries}
        isLoading={isLoadingChangeLog}
        error={changeLogError}
        onRefresh={() => void loadCanvasChangeLog()}
      />

      <CanvasAdminModals
        key={`canvas-admin-modals-${dashboardId ?? 'none'}-${canvasDefaultPeriod}-${canvasDefaultCustomStartDate?.toISOString() ?? 'none'}-${canvasDefaultCustomEndDate?.toISOString() ?? 'none'}-${canvasHideDateFilter ? 'hide' : 'show'}`}
        isCanvasSettingsModalOpen={isCanvasSettingsModalOpen}
        onCloseCanvasSettings={() => {
          setIsCanvasSettingsModalOpen(false)
          setRenameCanvasError(null)
          setCanvasSettingsInfo(null)
        }}
        canvasSettingsInfo={canvasSettingsInfo}
        renameCanvasInitialValue={canvasTitle}
        defaultCanvasPeriodInitialValue={canvasDefaultPeriod}
        defaultCanvasCustomStartDateInitialValue={canvasDefaultCustomStartDate}
        defaultCanvasCustomEndDateInitialValue={canvasDefaultCustomEndDate}
        hideDateFilterInitialValue={canvasHideDateFilter}
        renameCanvasError={renameCanvasError}
        onRenameCanvas={(value, defaultPeriod, customStartDate, customEndDate, hideDateFilter) =>
          void handleRenameCanvas(value, defaultPeriod, customStartDate, customEndDate, hideDateFilter)
        }
        isSavingCanvasItem={isSavingCanvasItem}
        isCreateTabModalOpen={isCreateTabModalOpen}
        onCloseCreateTab={() => {
          setIsCreateTabModalOpen(false)
          setCreateTabError(null)
        }}
        newTabNameInitialValue=""
        createTabError={createTabError}
        onCreateTab={(value) => void handleCreateTab(value)}
        creatingTab={creatingTab}
        isManageTabsModalOpen={isManageTabsModalOpen}
        onCloseManageTabs={() => {
          setIsManageTabsModalOpen(false)
          setIsManageTabPreselected(false)
          setManageTabError(null)
        }}
        isManageTabPreselected={isManageTabPreselected}
        manageTabId={manageTabId}
        onManageTabSelect={(nextId) => {
          setManageTabId(nextId)
          const selected = canvasCategories.find((category) => String(category.id) === nextId)
          setManageTabName(selected?.name ?? '')
          if (manageTabError) setManageTabError(null)
        }}
        manageTabInitialName={manageTabName}
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
        onRenameTab={(value) => void handleRenameTab(value)}
        onDeleteTab={() => void handleDeleteTab()}
        isInventoryModalOpen={isInventoryModalOpen}
        onCloseInventory={() => setIsInventoryModalOpen(false)}
        inventoryDashboardLabel={canvasTitle.trim() || 'Canvas'}
        inventoryTabLabel={activeCanvasCategoryLabel}
        inventoryHierarchy={inventoryHierarchy}
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

      <CanvasDotVotingModal
        open={isDotVotingModalOpen}
        onClose={() => setIsDotVotingModalOpen(false)}
        sectionOptions={dotVotingSectionOptions}
        selectedSectionId={dotVotingSelectedSectionId}
        onSelectedSectionIdChange={(sectionId) => {
          setDotVotingSelectedSectionId(sectionId)
          if (dotVotingModalError) setDotVotingModalError(null)
        }}
        minutesInput={dotVotingMinutesInput}
        onMinutesInputChange={(value) => {
          setDotVotingMinutesInput(value)
          if (dotVotingModalError) setDotVotingModalError(null)
        }}
        votesPerParticipantInput={dotVotingVotesPerParticipantInput}
        onVotesPerParticipantInputChange={(value) => {
          setDotVotingVotesPerParticipantInput(value)
          if (dotVotingModalError) setDotVotingModalError(null)
        }}
        onStart={handleStartDotVoting}
        onPause={handlePauseDotVoting}
        onResume={handleResumeDotVoting}
        onAdjustMinusOneMinute={handleAdjustDotVotingMinusOneMinute}
        onAdjustPlusOneMinute={handleAdjustDotVotingPlusOneMinute}
        onEnd={handleEndDotVoting}
        onClear={handleClearDotVoting}
        onSortSectionByVotes={handleSortSectionByVotes}
        onEndSortAndClear={handleEndSortAndClearDotVoting}
        isRunning={isDotVotingRunning}
        isPaused={isDotVotingPaused}
        sessionExists={Boolean(dotVotingSessionPayload)}
        votingLabel={dotVotingLabel}
        activeSectionLabel={activeDotVotingSectionLabel}
        votesPerParticipant={dotVotingSessionPayload?.votesPerParticipant ?? 0}
        myUsedVotes={myUsedDotVotes}
        myVotesRemaining={myRemainingDotVotes}
        stickyRows={dotVotingStickyRows}
        onAddVote={handleAddDotVote}
        onRemoveVote={handleRemoveDotVote}
        isSaving={isSavingDotVoting}
        pendingAction={dotVotingModalPendingAction}
        error={dotVotingModalError}
      />

      <CanvasImageUrlModal
        open={isAddImageModalOpen}
        heading="Legg til bilde"
        urlValue={newImageUrlInput}
        altTextValue={newImageAltTextInput}
        selectedSectionId={selectedAddSectionId}
        sectionOptions={sectionMoveOptions}
        error={addImageError}
        isSaving={isSavingCanvasItem}
        submitLabel="Legg til"
        onUrlChange={(value) => {
          setNewImageUrlInput(value)
          if (addImageError) setAddImageError(null)
        }}
        onAltTextChange={(value) => {
          setNewImageAltTextInput(value)
          if (addImageError) setAddImageError(null)
        }}
        onSectionChange={(sectionId) => {
          setSelectedAddSectionId(sectionId)
          if (addImageError) setAddImageError(null)
        }}
        onSubmit={() => void handleAddImage()}
        onClose={() => {
          setIsAddImageModalOpen(false)
          setNewImageAltTextInput('')
          setSelectedAddSectionId('')
        }}
      />

      <CanvasIllustrationModal
        open={isAddIllustrationModalOpen}
        isEdit={Boolean(editIllustrationFrameId)}
        selectedPath={selectedIllustrationPath}
        selectedSectionId={selectedAddSectionId}
        sectionOptions={sectionMoveOptions}
        error={addIllustrationError}
        isSaving={isSavingCanvasItem}
        onSelectPath={(path) => {
          setSelectedIllustrationPath(path)
          if (addIllustrationError) setAddIllustrationError(null)
        }}
        onSectionChange={(sectionId) => {
          setSelectedAddSectionId(sectionId)
          if (addIllustrationError) setAddIllustrationError(null)
        }}
        onSubmit={() => void handleAddIllustration()}
        onClose={() => {
          setIsAddIllustrationModalOpen(false)
          setEditIllustrationFrameId(null)
          setSelectedAddSectionId('')
          setAddIllustrationError(null)
        }}
      />

      <CanvasImageUrlModal
        open={isEditImageModalOpen}
        heading="Rediger bilde"
        urlValue={editImageUrlInput}
        altTextValue={editImageAltTextInput}
        error={editImageError}
        isSaving={isSavingCanvasItem}
        submitLabel="Lagre"
        onUrlChange={(value) => {
          setEditImageUrlInput(value)
          if (editImageError) setEditImageError(null)
        }}
        onAltTextChange={(value) => {
          setEditImageAltTextInput(value)
          if (editImageError) setEditImageError(null)
        }}
        onSubmit={() => void handleSaveEditedImage()}
        onClose={() => {
          setIsEditImageModalOpen(false)
          setEditImageFrameId(null)
          setEditImageAltTextInput('')
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
        onClose={closeEditChartModal}
        onSave={handleSaveEditedChart}
      />

      <DeleteChartDialog
        open={Boolean(deleteChartTarget)}
        chart={deleteChartTarget}
        loading={deletingChart}
        error={chartMutationError}
        onClose={closeDeleteChartModal}
        onConfirm={handleDeleteChart}
      />

      <CanvasHeadingModal
        open={isAddHeadingModalOpen}
        value={headingTextInput}
        selectedSectionId={selectedAddSectionId}
        sectionOptions={sectionMoveOptions}
        error={addHeadingError}
        isSaving={isSavingCanvasItem}
        onChange={(value) => {
          setHeadingTextInput(value)
          if (addHeadingError) setAddHeadingError(null)
        }}
        onSectionChange={(sectionId) => {
          setSelectedAddSectionId(sectionId)
          if (addHeadingError) setAddHeadingError(null)
        }}
        onSubmit={() => void handleAddHeadingCard()}
        onClose={() => {
          setIsAddHeadingModalOpen(false)
          setSelectedAddSectionId('')
          setAddHeadingError(null)
        }}
      />

      <CanvasTextModal
        open={isAddTextModalOpen}
        value={textContentInput}
        selectedSectionId={selectedAddSectionId}
        sectionOptions={sectionMoveOptions}
        error={addTextError}
        isSaving={isSavingCanvasItem}
        onChange={(value) => {
          setTextContentInput(value)
          if (addTextError) setAddTextError(null)
        }}
        onSectionChange={(sectionId) => {
          setSelectedAddSectionId(sectionId)
          if (addTextError) setAddTextError(null)
        }}
        onSubmit={() => void handleAddTextCard()}
        onClose={() => {
          setIsAddTextModalOpen(false)
          setSelectedAddSectionId('')
          setAddTextError(null)
        }}
      />

      <CanvasSectionModal
        open={isAddSectionModalOpen}
        nameValue={sectionNameInput}
        layoutMode={sectionLayoutMode}
        error={addSectionError}
        isSaving={isSavingCanvasItem}
        onNameChange={(value) => {
          setSectionNameInput(value)
          if (addSectionError) setAddSectionError(null)
        }}
        onLayoutModeChange={(value) => {
          setSectionLayoutMode(value)
          if (addSectionError) setAddSectionError(null)
        }}
        onSubmit={() => void handleAddSectionCard()}
        onClose={() => {
          setIsAddSectionModalOpen(false)
          setSectionNameInput('')
          setSectionLayoutMode('grid')
          setAddSectionError(null)
        }}
      />

      <CanvasSectionModal
        open={isSectionOptionsModalOpen}
        heading="Seksjonsinnstillinger"
        submitLabel="Lagre"
        nameValue={sectionOptionsNameInput}
        layoutMode={sectionOptionsLayoutMode}
        error={sectionOptionsError}
        isSaving={isSavingCanvasItem}
        onNameChange={(value) => {
          setSectionOptionsNameInput(value)
          if (sectionOptionsError) setSectionOptionsError(null)
        }}
        onLayoutModeChange={(value) => {
          setSectionOptionsLayoutMode(value)
          if (sectionOptionsError) setSectionOptionsError(null)
        }}
        onSubmit={() => {
          handleSaveSectionOptions()
        }}
        onClose={() => {
          setIsSectionOptionsModalOpen(false)
          setSectionOptionsFrameId(null)
          setSectionOptionsNameInput('')
          setSectionOptionsLayoutMode('grid')
          setSectionOptionsError(null)
        }}
      />

      <CanvasTableModal
        open={isAddTableModalOpen}
        heading={editTableFrameId ? 'Rediger tabell' : 'Legg til tabell'}
        submitLabel={editTableFrameId ? 'Lagre' : 'Legg til'}
        headersValue={tableHeadersInput}
        rowsValue={tableRowsInput}
        selectedSectionId={editTableFrameId ? '' : selectedAddSectionId}
        sectionOptions={editTableFrameId ? [] : sectionMoveOptions}
        error={addTableError}
        isSaving={isSavingCanvasItem}
        onHeadersChange={(value) => {
          setTableHeadersInput(value)
          if (addTableError) setAddTableError(null)
        }}
        onRowsChange={(value) => {
          setTableRowsInput(value)
          if (addTableError) setAddTableError(null)
        }}
        onSectionChange={(sectionId) => {
          setSelectedAddSectionId(sectionId)
          if (addTableError) setAddTableError(null)
        }}
        onSubmit={() => void handleAddTableCard()}
        onClose={() => {
          setIsAddTableModalOpen(false)
          setEditTableFrameId(null)
          setSelectedAddSectionId('')
          setAddTableError(null)
        }}
      />

      <CanvasLinkModal
        open={isAddLinkModalOpen}
        titleValue={linkTitleInput}
        hrefValue={linkUrlInput}
        descriptionValue={linkDescriptionInput}
        selectedSectionId={editLinkFrameId ? '' : selectedAddSectionId}
        sectionOptions={editLinkFrameId ? [] : sectionMoveOptions}
        error={addLinkError}
        isSaving={isSavingCanvasItem}
        onTitleChange={(value) => {
          setLinkTitleInput(value)
          if (addLinkError) setAddLinkError(null)
        }}
        onHrefChange={(value) => {
          setLinkUrlInput(value)
          if (addLinkError) setAddLinkError(null)
        }}
        onDescriptionChange={(value) => {
          setLinkDescriptionInput(value)
          if (addLinkError) setAddLinkError(null)
        }}
        onSectionChange={(sectionId) => {
          setSelectedAddSectionId(sectionId)
          if (addLinkError) setAddLinkError(null)
        }}
        onSubmit={() => void handleAddLinkCard()}
        onClose={() => {
          setIsAddLinkModalOpen(false)
          setEditLinkFrameId(null)
          setSelectedAddSectionId('')
          setAddLinkError(null)
        }}
      />

      <CanvasIconModal
        open={isAddIconModalOpen}
        heading="Legg til ikon"
        selectedIconId={selectedIconId}
        selectedColor={selectedIconColor}
        selectedSectionId={selectedAddSectionId}
        sectionOptions={sectionMoveOptions}
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
        onSectionChange={(sectionId) => {
          setSelectedAddSectionId(sectionId)
          if (addIconError) setAddIconError(null)
        }}
        onSubmit={() => void handleAddIconCard()}
        onClose={() => {
          setIsAddIconModalOpen(false)
          setSelectedAddSectionId('')
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
        isCombiningColumns={isImportStickyCombiningColumns}
        combinedColumns={importStickyCombinedColumns}
        onToggleCombineColumns={handleToggleCombineColumns}
        onToggleCombinedColumn={handleToggleCombinedColumn}
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
        selectedColorId={selectedStickyColor}
        selectedSectionId={selectedStickySectionId}
        sectionOptions={sectionMoveOptions}
        colorOptions={CANVAS_STICKY_COLOR_OPTIONS}
        error={addStickyError}
        isSaving={isSavingCanvasItem}
        onChange={(value) => {
          setStickyContentInput(value)
          if (addStickyError) setAddStickyError(null)
        }}
        onColorChange={(colorId) => setSelectedStickyColor(getCanvasStickyColor(colorId))}
        onSectionChange={(sectionId) => {
          setSelectedStickySectionId(sectionId)
          if (addStickyError) setAddStickyError(null)
        }}
        onSubmit={() => void handleAddStickyCard()}
        onClose={() => {
          setIsAddStickyModalOpen(false)
          setSelectedStickySectionId('')
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
