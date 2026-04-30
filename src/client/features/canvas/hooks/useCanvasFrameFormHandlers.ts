import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  createGraph,
  createQuery,
  fetchDashboards,
  fetchProjects,
  updateQuery,
} from '../../oversikt/api/oversiktApi.ts'
import type { VisualizationMode } from '../../clickmap/model/visualizationMode.ts'
import type { CanvasWebSocketHandle } from './useCanvasWebSocket.ts'
import type { Website } from '../../../shared/types/website.ts'
import {
  DEFAULT_CANVAS_ICON_COLOR,
  DEFAULT_CANVAS_ICON_ID,
  getCanvasIconColor,
  getCanvasIconOptionById,
} from '../ui/icon/CanvasIconRegistry.ts'
import {
  DEFAULT_CANVAS_ILLUSTRATION_PATH,
  getCanvasIllustrationOptionByPath,
} from '../ui/illustration/CanvasIllustrationRegistry.ts'
import { isIllustrationImageFrame } from '../ui/image/CanvasImageUtils.ts'
import { DEFAULT_CANVAS_STICKY_COLOR, getCanvasStickyColor } from '../ui/sticky/CanvasStickyColorRegistry.ts'
import { GRID_SECTION_LAYOUT_CONFIG, getFrameBoundsForLayout } from '../model/layout/gridSectionLayout.ts'
import type {
  CanvasChartOption,
  CanvasConfigPayload,
  CanvasFigureType,
  CanvasFrame,
  CanvasSectionLayoutMode,
  PendingCanvasFrameDraft,
} from '../model/types.ts'
import {
  CANVAS_DASHBOARD_TOKEN,
  CANVAS_TOP_BUFFER,
  CANVAS_FIGURE_OPTIONS,
  CANVAS_QUERY_NAME,
  HEADING_FONT_SIZE_DEFAULT,
  HEADING_TEXT_CHAR_WIDTH_FACTOR,
  HEADING_TEXT_EXTRA_WIDTH,
  HEADING_TEXT_MAX_WIDTH,
  HEADING_TEXT_MIN_WIDTH,
  HEADING_TEXT_VERTICAL_PADDING,
  buildCanvasStorageGraphName,
  estimateTableFrameHeight,
  getCanvasFrameVisualizationMode,
  getComparableUrl,
  getFrameLabel,
  isCanvasDashboardDescription,
  normalizeInputToTargetUrl,
  parseDashboardTargetUrl,
  serializeCanvasConfig,
} from '../utils/canvasUtils.ts'

type Setter<T> = Dispatch<SetStateAction<T>>
type DashboardOption = { id: number; name: string; isCanvas: boolean }
const TEXT_CARD_CONTENT_HORIZONTAL_PADDING = 16
const TEXT_CARD_MIN_HEIGHT = 72
const TEXT_CARD_LINE_HEIGHT = 26
const TEXT_CARD_VERTICAL_PADDING = 24
const TEXT_CARD_PARAGRAPH_GAP = 12
const TEXT_CARD_APPROX_CHAR_WIDTH = 10

const estimateTextFrameHeight = (text: string, width: number): number => {
  const normalized = text.trim()
  const usableWidth = Math.max(120, width - TEXT_CARD_CONTENT_HORIZONTAL_PADDING)
  const approxCharsPerLine = Math.max(12, Math.floor(usableWidth / TEXT_CARD_APPROX_CHAR_WIDTH))
  if (!normalized) return TEXT_CARD_MIN_HEIGHT

  const lines = normalized.split('\n')
  const wrappedLineCount = lines.reduce((count, line) => {
    if (!line.trim()) return count
    return count + Math.max(1, Math.ceil(line.length / approxCharsPerLine))
  }, 0)
  const blankLineCount = lines.reduce((count, line) => count + (line.trim() ? 0 : 1), 0)
  const estimatedHeight =
    wrappedLineCount * TEXT_CARD_LINE_HEIGHT + blankLineCount * TEXT_CARD_PARAGRAPH_GAP + TEXT_CARD_VERTICAL_PADDING

  return Math.max(TEXT_CARD_MIN_HEIGHT, estimatedHeight)
}

type UseCanvasFrameFormHandlersParams = {
  projectId: number | null
  dashboardId: number | null
  ensureCanvasCategory: () => Promise<number | null>
  frames: CanvasFrame[]
  ws?: CanvasWebSocketHandle
  selectedWebsite: Website | null
  setSelectedWebsite: Setter<Website | null>
  canvasConfiguredWebsiteId: string | null
  queueFrameForPlacement: (draft: PendingCanvasFrameDraft, label: string) => void
  setFrames: Setter<CanvasFrame[]>
  setSyncError: Setter<string | null>
  setIsSavingCanvasItem: Setter<boolean>
  setFailedImageFrameIds: Setter<Record<string, boolean>>
  pendingChartWebsiteByFrameId: Record<string, Website | null>
  setPendingChartWebsiteByFrameId: Setter<Record<string, Website | null>>

  chartOptions: CanvasChartOption[]
  selectedChartOptionId: string
  setAddChartError: Setter<string | null>
  setIsAddChartModalOpen: Setter<boolean>

  isAddPageModalOpen: boolean
  setIsAddPageModalOpen: Setter<boolean>
  isAddImageModalOpen: boolean
  setIsAddImageModalOpen: Setter<boolean>
  isAddIllustrationModalOpen: boolean
  setIsAddIllustrationModalOpen: Setter<boolean>
  isAddDashboardModalOpen: boolean
  setIsAddDashboardModalOpen: Setter<boolean>
  isAddHeadingModalOpen: boolean
  setIsAddHeadingModalOpen: Setter<boolean>
  isAddTextModalOpen: boolean
  setIsAddTextModalOpen: Setter<boolean>
  isAddTableModalOpen: boolean
  setIsAddTableModalOpen: Setter<boolean>
  isAddLinkModalOpen: boolean
  setIsAddLinkModalOpen: Setter<boolean>
  isAddStickyModalOpen: boolean
  setIsAddStickyModalOpen: Setter<boolean>
  isAddSectionModalOpen: boolean
  setIsAddSectionModalOpen: Setter<boolean>
  isAddIconModalOpen: boolean
  setIsAddIconModalOpen: Setter<boolean>
  isAddFigureModalOpen: boolean
  setIsAddFigureModalOpen: Setter<boolean>
  isEditWebsiteModalOpen: boolean
  setIsEditWebsiteModalOpen: Setter<boolean>
  isEditDashboardModalOpen: boolean
  setIsEditDashboardModalOpen: Setter<boolean>
  isEditImageModalOpen: boolean
  setIsEditImageModalOpen: Setter<boolean>
  isEditIconModalOpen: boolean
  setIsEditIconModalOpen: Setter<boolean>
  isEditFigureModalOpen: boolean
  setIsEditFigureModalOpen: Setter<boolean>

  editWebsiteFrameId: string | null
  setEditWebsiteFrameId: Setter<string | null>
  editDashboardFrameId: string | null
  setEditDashboardFrameId: Setter<string | null>
  editImageFrameId: string | null
  setEditImageFrameId: Setter<string | null>
  editTableFrameId: string | null
  setEditTableFrameId: Setter<string | null>
  editLinkFrameId: string | null
  setEditLinkFrameId: Setter<string | null>
  editIconFrameId: string | null
  setEditIconFrameId: Setter<string | null>
  editFigureFrameId: string | null
  setEditFigureFrameId: Setter<string | null>
  editIllustrationFrameId: string | null
  setEditIllustrationFrameId: Setter<string | null>

  editWebsitePathInput: string
  setEditWebsitePathInput: Setter<string>
  editImageUrlInput: string
  setEditImageUrlInput: Setter<string>
  editImageAltTextInput: string
  setEditImageAltTextInput: Setter<string>
  editWebsitePreviewUrlInput: string
  setEditWebsitePreviewUrlInput: Setter<string>
  editWebsiteRenderEnabled: boolean
  setEditWebsiteRenderEnabled: Setter<boolean>
  editWebsiteVisualizationMode: VisualizationMode | ''
  setEditWebsiteVisualizationMode: Setter<VisualizationMode | ''>
  newPagePathInput: string
  setNewPagePathInput: Setter<string>
  newImageUrlInput: string
  setNewImageUrlInput: Setter<string>
  newImageAltTextInput: string
  setNewImageAltTextInput: Setter<string>
  selectedIllustrationPath: string
  setSelectedIllustrationPath: Setter<string>
  newPagePreviewUrlInput: string
  setNewPagePreviewUrlInput: Setter<string>
  newPageRenderEnabled: boolean
  setNewPageRenderEnabled: Setter<boolean>
  newPageVisualizationMode: VisualizationMode | ''
  setNewPageVisualizationMode: Setter<VisualizationMode | ''>

  addPageError: string | null
  setAddPageError: Setter<string | null>
  addImageError: string | null
  setAddImageError: Setter<string | null>
  addIllustrationError: string | null
  setAddIllustrationError: Setter<string | null>
  addDashboardError: string | null
  setAddDashboardError: Setter<string | null>
  editWebsiteError: string | null
  setEditWebsiteError: Setter<string | null>
  editDashboardError: string | null
  setEditDashboardError: Setter<string | null>
  editImageError: string | null
  setEditImageError: Setter<string | null>

  projectOptions: Array<{ id: number; name: string }>
  setProjectOptions: Setter<Array<{ id: number; name: string }>>
  selectedProjectToAddId: string
  setSelectedProjectToAddId: Setter<string>
  dashboardOptions: DashboardOption[]
  setDashboardOptions: Setter<DashboardOption[]>
  selectedDashboardToAddId: string
  setSelectedDashboardToAddId: Setter<string>
  addDashboardInternalPathInput: string
  setAddDashboardInternalPathInput: Setter<string>
  isLoadingDashboardOptions: boolean
  setIsLoadingDashboardOptions: Setter<boolean>

  editDashboardProjectOptions: Array<{ id: number; name: string }>
  setEditDashboardProjectOptions: Setter<Array<{ id: number; name: string }>>
  editDashboardSelectedProjectId: string
  setEditDashboardSelectedProjectId: Setter<string>
  editDashboardOptions: DashboardOption[]
  setEditDashboardOptions: Setter<DashboardOption[]>
  editDashboardSelectedDashboardId: string
  setEditDashboardSelectedDashboardId: Setter<string>
  editDashboardInternalPathInput: string
  setEditDashboardInternalPathInput: Setter<string>
  isLoadingEditDashboardOptions: boolean
  setIsLoadingEditDashboardOptions: Setter<boolean>

  headingTextInput: string
  setHeadingTextInput: Setter<string>
  addHeadingError: string | null
  setAddHeadingError: Setter<string | null>
  textContentInput: string
  setTextContentInput: Setter<string>
  addTextError: string | null
  setAddTextError: Setter<string | null>
  tableHeadersInput: string
  setTableHeadersInput: Setter<string>
  tableRowsInput: string
  setTableRowsInput: Setter<string>
  addTableError: string | null
  setAddTableError: Setter<string | null>
  linkTitleInput: string
  setLinkTitleInput: Setter<string>
  linkUrlInput: string
  setLinkUrlInput: Setter<string>
  linkDescriptionInput: string
  setLinkDescriptionInput: Setter<string>
  addLinkError: string | null
  setAddLinkError: Setter<string | null>
  stickyContentInput: string
  setStickyContentInput: Setter<string>
  selectedStickyColor: string
  setSelectedStickyColor: Setter<string>
  selectedStickySectionId: string
  setSelectedStickySectionId: Setter<string>
  onFrameAddedInSection?: (frame: CanvasFrame) => void
  sectionNameInput: string
  setSectionNameInput: Setter<string>
  sectionLayoutMode: CanvasSectionLayoutMode
  setSectionLayoutMode: Setter<CanvasSectionLayoutMode>
  addSectionError: string | null
  setAddSectionError: Setter<string | null>
  selectedAddSectionId: string
  setSelectedAddSectionId: Setter<string>
  addStickyError: string | null
  setAddStickyError: Setter<string | null>

  selectedIconId: string
  setSelectedIconId: Setter<string>
  selectedIconColor: string
  setSelectedIconColor: Setter<string>
  addIconError: string | null
  setAddIconError: Setter<string | null>
  editIconSelectedId: string
  setEditIconSelectedId: Setter<string>
  editIconSelectedColor: string
  setEditIconSelectedColor: Setter<string>
  editIconError: string | null
  setEditIconError: Setter<string | null>

  selectedFigureType: CanvasFigureType
  setSelectedFigureType: Setter<CanvasFigureType>
  selectedFigureColor: string
  setSelectedFigureColor: Setter<string>
  addFigureError: string | null
  setAddFigureError: Setter<string | null>
  editFigureSelectedType: CanvasFigureType
  setEditFigureSelectedType: Setter<CanvasFigureType>
  editFigureSelectedColor: string
  setEditFigureSelectedColor: Setter<string>
  editFigureError: string | null
  setEditFigureError: Setter<string | null>

  setActiveInsightFrameId: Setter<string | null>
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

const getDashboardOptionLabel = (dashboard: {
  id: number
  name?: string | null
  description?: string | null
}): string =>
  `${dashboard.name?.trim() || `Dashboard ${dashboard.id}`}${isCanvasDashboardDescription(dashboard.description ?? undefined) ? ' (canvas)' : ''}`

const buildDashboardTargetUrl = (dashboardId: number, projectId: number, isCanvas: boolean): string => {
  if (isCanvas) return `/canvas?dashboardId=${dashboardId}&projectId=${projectId}`
  return `/dashboard/${dashboardId}?projectId=${projectId}&focused=true`
}

const normalizeInternalPathInput = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const withoutHash = trimmed.split('#')[0].trim()
  if (!withoutHash) return null
  if (/^https?:\/\//i.test(withoutHash)) {
    try {
      const parsed = new URL(withoutHash)
      const resolvedPath = `${parsed.pathname}${parsed.search}`
      return resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`
    } catch {
      return null
    }
  }
  return withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`
}

const useCanvasFrameFormHandlers = ({
  projectId,
  dashboardId,
  ensureCanvasCategory,
  frames,
  ws,
  selectedWebsite,
  setSelectedWebsite,
  canvasConfiguredWebsiteId,
  queueFrameForPlacement,
  setFrames,
  setSyncError,
  setIsSavingCanvasItem,
  setFailedImageFrameIds,
  pendingChartWebsiteByFrameId: _pendingChartWebsiteByFrameId,
  setPendingChartWebsiteByFrameId,
  chartOptions,
  selectedChartOptionId,
  setAddChartError,
  setIsAddChartModalOpen,
  isAddPageModalOpen: _isAddPageModalOpen,
  setIsAddPageModalOpen,
  isAddImageModalOpen: _isAddImageModalOpen,
  setIsAddImageModalOpen,
  isAddIllustrationModalOpen: _isAddIllustrationModalOpen,
  setIsAddIllustrationModalOpen,
  isAddDashboardModalOpen: _isAddDashboardModalOpen,
  setIsAddDashboardModalOpen,
  isAddHeadingModalOpen: _isAddHeadingModalOpen,
  setIsAddHeadingModalOpen,
  isAddTextModalOpen: _isAddTextModalOpen,
  setIsAddTextModalOpen,
  isAddTableModalOpen: _isAddTableModalOpen,
  setIsAddTableModalOpen,
  isAddLinkModalOpen: _isAddLinkModalOpen,
  setIsAddLinkModalOpen,
  isAddStickyModalOpen: _isAddStickyModalOpen,
  setIsAddStickyModalOpen,
  isAddSectionModalOpen: _isAddSectionModalOpen,
  setIsAddSectionModalOpen,
  isAddIconModalOpen: _isAddIconModalOpen,
  setIsAddIconModalOpen,
  isAddFigureModalOpen: _isAddFigureModalOpen,
  setIsAddFigureModalOpen,
  isEditWebsiteModalOpen: _isEditWebsiteModalOpen,
  setIsEditWebsiteModalOpen,
  isEditDashboardModalOpen: _isEditDashboardModalOpen,
  setIsEditDashboardModalOpen,
  isEditImageModalOpen: _isEditImageModalOpen,
  setIsEditImageModalOpen,
  isEditIconModalOpen: _isEditIconModalOpen,
  setIsEditIconModalOpen,
  isEditFigureModalOpen: _isEditFigureModalOpen,
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
  addPageError: _addPageError,
  setAddPageError,
  addImageError: _addImageError,
  setAddImageError,
  addIllustrationError: _addIllustrationError,
  setAddIllustrationError,
  addDashboardError: _addDashboardError,
  setAddDashboardError,
  editWebsiteError: _editWebsiteError,
  setEditWebsiteError,
  editDashboardError: _editDashboardError,
  setEditDashboardError,
  editImageError: _editImageError,
  setEditImageError,
  projectOptions: _projectOptions,
  setProjectOptions,
  selectedProjectToAddId,
  setSelectedProjectToAddId,
  dashboardOptions,
  setDashboardOptions,
  selectedDashboardToAddId,
  setSelectedDashboardToAddId,
  addDashboardInternalPathInput,
  setAddDashboardInternalPathInput,
  isLoadingDashboardOptions: _isLoadingDashboardOptions,
  setIsLoadingDashboardOptions,
  editDashboardProjectOptions: _editDashboardProjectOptions,
  setEditDashboardProjectOptions,
  editDashboardSelectedProjectId,
  setEditDashboardSelectedProjectId,
  editDashboardOptions,
  setEditDashboardOptions,
  editDashboardSelectedDashboardId,
  setEditDashboardSelectedDashboardId,
  editDashboardInternalPathInput,
  setEditDashboardInternalPathInput,
  isLoadingEditDashboardOptions: _isLoadingEditDashboardOptions,
  setIsLoadingEditDashboardOptions,
  headingTextInput,
  setHeadingTextInput,
  addHeadingError: _addHeadingError,
  setAddHeadingError,
  textContentInput,
  setTextContentInput,
  addTextError: _addTextError,
  setAddTextError,
  tableHeadersInput,
  setTableHeadersInput,
  tableRowsInput,
  setTableRowsInput,
  addTableError: _addTableError,
  setAddTableError,
  linkTitleInput,
  setLinkTitleInput,
  linkUrlInput,
  setLinkUrlInput,
  linkDescriptionInput,
  setLinkDescriptionInput,
  addLinkError: _addLinkError,
  setAddLinkError,
  stickyContentInput,
  setStickyContentInput,
  selectedStickyColor,
  setSelectedStickyColor,
  selectedStickySectionId,
  setSelectedStickySectionId,
  onFrameAddedInSection,
  sectionNameInput,
  setSectionNameInput,
  sectionLayoutMode,
  setSectionLayoutMode,
  addSectionError: _addSectionError,
  setAddSectionError,
  selectedAddSectionId,
  setSelectedAddSectionId,
  addStickyError: _addStickyError,
  setAddStickyError,
  selectedIconId,
  setSelectedIconId,
  selectedIconColor,
  setSelectedIconColor,
  addIconError: _addIconError,
  setAddIconError,
  editIconSelectedId,
  setEditIconSelectedId,
  editIconSelectedColor,
  setEditIconSelectedColor,
  editIconError: _editIconError,
  setEditIconError,
  selectedFigureType,
  setSelectedFigureType,
  selectedFigureColor,
  setSelectedFigureColor,
  addFigureError: _addFigureError,
  setAddFigureError,
  editFigureSelectedType,
  setEditFigureSelectedType,
  editFigureSelectedColor,
  setEditFigureSelectedColor,
  editFigureError: _editFigureError,
  setEditFigureError,
  setActiveInsightFrameId,
}: UseCanvasFrameFormHandlersParams) => {
  const getDefaultFrameSize = useCallback(
    (
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
      const isTableTextFrame =
        typeof frameOrKind !== 'string' &&
        frameOrKind.kind === 'text' &&
        Array.isArray(frameOrKind.tableHeaders) &&
        frameOrKind.tableHeaders.length > 0

      if (kind === 'website' && isInternalDashboard) return { width: 760, height: 760, minWidth: 520, minHeight: 420 }
      if (kind === 'website') return { width: 420, height: 700, minWidth: 220, minHeight: 160 }
      if (kind === 'image' && isIllustration) return { width: 420, height: 420, minWidth: 96, minHeight: 96 }
      if (kind === 'image') return { width: 420, height: 420, minWidth: 240, minHeight: 200 }
      if (kind === 'chart') return { width: 560, height: 360, minWidth: 280, minHeight: 200 }
      if (kind === 'sql-editor' || kind === 'code-block')
        return { width: 420, height: 760, minWidth: 260, minHeight: 320 }
      if (kind === 'heading') return { width: 420, height: 72, minWidth: 260, minHeight: 48 }
      if (kind === 'text') {
        if (isTableTextFrame) return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
        return { width: 280, height: 96, minWidth: 160, minHeight: 48 }
      }
      if (kind === 'link') return { width: 380, height: 112, minWidth: 280, minHeight: 92 }
      if (kind === 'icon') return { width: 280, height: 240, minWidth: 72, minHeight: 72 }
      if (kind === 'figure') return { width: 240, height: 240, minWidth: 120, minHeight: 120 }
      if (kind === 'drawing') return { width: 240, height: 160, minWidth: 28, minHeight: 28 }
      if (kind === 'section') return { width: 640, height: 420, minWidth: 240, minHeight: 180 }
      return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
    },
    [],
  )

  const persistFrame = useCallback(
    async (frame: CanvasFrame): Promise<CanvasFrame> => {
      if (projectId === null || dashboardId === null) return frame

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
        figureOrientation: frame.figureOrientation,
        drawingPath: frame.drawingPath,
        drawingStrokeStyles: frame.drawingStrokeStyles,
        drawingStrokeWidth: frame.drawingStrokeWidth,
        drawingColor: frame.drawingColor,
        drawingRotationDeg: frame.drawingRotationDeg,
        drawingAltText: frame.drawingAltText,
        isIllustration: frame.isIllustration,
        imageRotationDeg: frame.imageRotationDeg,
        imageAltText: frame.imageAltText,
        chartType: frame.chartType,
        chartSql: frame.chartSql,
        sqlQuery: frame.sqlQuery,
        hideInShare: frame.hideInShare,
        label: frame.label,
      }
      const serialized = serializeCanvasConfig(payload)

      // Try WS-based save first
      if (ws?.isConnected) {
        const result = await ws.saveFrame({
          projectId,
          dashboardId,
          categoryId,
          graphId: frame.graphId ?? undefined,
          queryId: frame.queryId ?? undefined,
          graphName: buildCanvasStorageGraphName(frame),
          name: CANVAS_QUERY_NAME,
          sqlText: serialized,
          version: frame.version,
        })

        if (result.ok) {
          return {
            ...frame,
            categoryId,
            graphId: (result.payload.graphId as number) ?? frame.graphId,
            queryId: (result.payload.queryId as number) ?? frame.queryId,
            version: (result.payload.version as number) ?? frame.version,
          }
        }

        if (result.conflict) {
          // On conflict, return the frame with updated version from server
          return {
            ...frame,
            categoryId,
            version: (result.payload.version as number) ?? frame.version,
          }
        }

        // WS save failed — fall through to REST
      }

      // REST fallback
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
    [dashboardId, ensureCanvasCategory, projectId, ws],
  )

  const resolvePlacementInSection = useCallback(
    (
      sectionId: string,
      frameSize?: { width?: number; height?: number },
    ): { x: number; y: number; categoryId?: number } | null => {
      const targetSection = frames.find((frame) => frame.id === sectionId && frame.kind === 'section')
      if (!targetSection) return null
      const targetBounds = getFrameBoundsForLayout(targetSection, getDefaultFrameSize)
      const contentLeft = targetBounds.left + GRID_SECTION_LAYOUT_CONFIG.paddingX
      const contentRight = targetBounds.right - GRID_SECTION_LAYOUT_CONFIG.paddingX
      const contentTop = targetBounds.top + GRID_SECTION_LAYOUT_CONFIG.paddingTop
      const contentBottom = targetBounds.bottom - GRID_SECTION_LAYOUT_CONFIG.paddingBottom
      const frameWidth = Math.max(1, frameSize?.width ?? 360)
      const frameHeight = Math.max(1, frameSize?.height ?? 180)
      const existingItemsInTargetSection = frames.filter((frame) => {
        if (frame.id === targetSection.id || frame.kind === 'section') return false
        if ((frame.categoryId ?? null) !== (targetSection.categoryId ?? null)) return false
        const bounds = getFrameBoundsForLayout(frame, getDefaultFrameSize)
        const centerX = (bounds.left + bounds.right) / 2
        const centerY = (bounds.top + bounds.bottom) / 2
        return (
          centerX >= targetBounds.left &&
          centerX <= targetBounds.right &&
          centerY >= targetBounds.top &&
          centerY <= targetBounds.bottom
        )
      })

      const occupiedBounds = existingItemsInTargetSection.map((frame) =>
        getFrameBoundsForLayout(frame, getDefaultFrameSize),
      )
      const contentWidth = Math.max(1, contentRight - contentLeft)
      const maxColumns = Math.max(
        1,
        Math.floor((contentWidth + GRID_SECTION_LAYOUT_CONFIG.gapX) / (frameWidth + GRID_SECTION_LAYOUT_CONFIG.gapX)),
      )
      const candidateRowLimit = Math.max(existingItemsInTargetSection.length + 6, 12)

      for (let row = 0; row < candidateRowLimit; row += 1) {
        for (let column = 0; column < maxColumns; column += 1) {
          const candidateLeft = contentLeft + column * (frameWidth + GRID_SECTION_LAYOUT_CONFIG.gapX)
          const candidateTop = contentTop + row * (frameHeight + GRID_SECTION_LAYOUT_CONFIG.gapY)
          const candidateRight = candidateLeft + frameWidth
          const candidateBottom = candidateTop + frameHeight
          if (candidateRight > contentRight || candidateBottom > contentBottom) continue

          const overlapsExisting = occupiedBounds.some((occupied) => {
            const intersectsHorizontally = candidateLeft < occupied.right && candidateRight > occupied.left
            const intersectsVertically = candidateTop < occupied.bottom && candidateBottom > occupied.top
            return intersectsHorizontally && intersectsVertically
          })
          if (overlapsExisting) continue

          return {
            x: Math.max(0, candidateLeft),
            y: Math.max(-CANVAS_TOP_BUFFER, candidateTop),
            categoryId: targetSection.categoryId,
          }
        }
      }

      const fallbackY =
        occupiedBounds.length > 0
          ? Math.max(...occupiedBounds.map((bounds) => bounds.bottom)) + GRID_SECTION_LAYOUT_CONFIG.gapY
          : contentTop
      return {
        x: Math.max(0, contentLeft),
        y: Math.max(-CANVAS_TOP_BUFFER, fallbackY),
        categoryId: targetSection.categoryId,
      }
    },
    [frames, getDefaultFrameSize],
  )

  const ensureSectionContainsFrame = useCallback(
    async (sectionId: string, frame: CanvasFrame): Promise<CanvasFrame | null> => {
      const targetSection = frames.find((candidate) => candidate.id === sectionId && candidate.kind === 'section')
      if (!targetSection) return null

      const sectionBounds = getFrameBoundsForLayout(targetSection, getDefaultFrameSize)
      const frameBounds = getFrameBoundsForLayout(frame, getDefaultFrameSize)
      const requiredBottom = frameBounds.bottom + GRID_SECTION_LAYOUT_CONFIG.paddingBottom
      if (requiredBottom <= sectionBounds.bottom) return null

      const defaultSectionSize = getDefaultFrameSize(targetSection)
      const nextSectionHeight = Math.max(
        targetSection.height ?? defaultSectionSize.height,
        Math.ceil(requiredBottom - targetSection.y),
      )
      const nextSection: CanvasFrame = {
        ...targetSection,
        height: nextSectionHeight,
      }

      return persistFrame(nextSection)
    },
    [frames, getDefaultFrameSize, persistFrame],
  )

  const loadDashboardOptions = useCallback(
    async (projectIdToLoad: number | null) => {
      if (projectIdToLoad === null) {
        setDashboardOptions([])
        setSelectedDashboardToAddId('')
        return
      }

      setIsLoadingDashboardOptions(true)
      setAddDashboardError(null)

      try {
        const dashboards = await fetchDashboards(projectIdToLoad)
        const options = dashboards.map((dashboard) => ({
          id: dashboard.id,
          name: getDashboardOptionLabel(dashboard),
          isCanvas: isCanvasDashboardDescription(dashboard.description),
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
    },
    [setAddDashboardError, setDashboardOptions, setIsLoadingDashboardOptions, setSelectedDashboardToAddId],
  )

  const loadEditDashboardOptions = useCallback(
    async (projectIdToLoad: number | null) => {
      if (projectIdToLoad === null) {
        setEditDashboardOptions([])
        setEditDashboardSelectedDashboardId('')
        return
      }

      setIsLoadingEditDashboardOptions(true)
      setEditDashboardError(null)

      try {
        const dashboards = await fetchDashboards(projectIdToLoad)
        const options = dashboards.map((dashboard) => ({
          id: dashboard.id,
          name: getDashboardOptionLabel(dashboard),
          isCanvas: isCanvasDashboardDescription(dashboard.description),
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
    },
    [
      setEditDashboardError,
      setEditDashboardOptions,
      setEditDashboardSelectedDashboardId,
      setIsLoadingEditDashboardOptions,
    ],
  )

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
    const imageAltText = newImageAltTextInput.trim()
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

    const targetSectionId = selectedAddSectionId.trim()
    if (targetSectionId) {
      const placement = resolvePlacementInSection(targetSectionId, { width: 420, height: 420 })
      if (!placement) {
        setAddImageError('Fant ikke valgt seksjon.')
        return
      }

      const nextFrame: CanvasFrame = {
        id: `${Date.now()}-${Math.random()}`,
        kind: 'image',
        targetUrl: imageUrl,
        imageAltText,
        label: getFrameLabel(imageUrl),
        width: 420,
        height: 420,
        x: placement.x,
        y: placement.y,
        categoryId: placement.categoryId,
        refreshNonce: 1,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(nextFrame)
          const persistedSection = await ensureSectionContainsFrame(targetSectionId, persistedFrame)
          setFrames((prev) => {
            const withSection = persistedSection
              ? prev.map((frame) => (frame.id === persistedSection.id ? persistedSection : frame))
              : prev
            return [...withSection, persistedFrame]
          })
          onFrameAddedInSection?.(persistedFrame)
          setNewImageUrlInput('')
          setNewImageAltTextInput('')
          setSelectedAddSectionId('')
          setAddImageError(null)
          setIsAddImageModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre bilde i canvas')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'image',
      targetUrl: imageUrl,
      imageAltText,
      label: getFrameLabel(imageUrl),
      width: 420,
      height: 420,
      refreshNonce: 1,
    }
    queueFrameForPlacement(frameDraft, 'bilde')
    setNewImageUrlInput('')
    setNewImageAltTextInput('')
    setSelectedAddSectionId('')
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
        const targetSectionId = selectedAddSectionId.trim()
        if (targetSectionId) {
          const placement = resolvePlacementInSection(targetSectionId, { width: 420, height: 420 })
          if (!placement) {
            setAddIllustrationError('Fant ikke valgt seksjon.')
            return
          }

          const nextFrame: CanvasFrame = {
            id: `${Date.now()}-${Math.random()}`,
            kind: 'image',
            targetUrl: selectedIllustration.path,
            label: selectedIllustration.label,
            isIllustration: true,
            imageRotationDeg: 0,
            width: 420,
            height: 420,
            x: placement.x,
            y: placement.y,
            categoryId: placement.categoryId,
            refreshNonce: 1,
          }
          const persistedFrame = await persistFrame(nextFrame)
          const persistedSection = await ensureSectionContainsFrame(targetSectionId, persistedFrame)
          setFrames((prev) => {
            const withSection = persistedSection
              ? prev.map((frame) => (frame.id === persistedSection.id ? persistedSection : frame))
              : prev
            return [...withSection, persistedFrame]
          })
          onFrameAddedInSection?.(persistedFrame)
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
      }
      setAddIllustrationError(null)
      setEditIllustrationFrameId(null)
      setSelectedAddSectionId('')
      setIsAddIllustrationModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre illustrasjon i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleOpenAddDashboardModal = () => {
    setAddDashboardError(null)
    setAddDashboardInternalPathInput('')
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
    const customTargetUrl = normalizeInternalPathInput(addDashboardInternalPathInput)
    const selectedDashboard = dashboardOptions.find((option) => String(option.id) === selectedDashboardToAddId)
    if (!customTargetUrl && !selectedDashboard) {
      setAddDashboardError('Velg et dashboard.')
      return
    }

    const selectedProjectId = Number(selectedProjectToAddId)
    const normalizedProjectId = Number.isFinite(selectedProjectId) ? selectedProjectId : null
    const fallbackTargetUrl =
      normalizedProjectId !== null && selectedDashboard
        ? buildDashboardTargetUrl(selectedDashboard.id, normalizedProjectId, selectedDashboard.isCanvas)
        : null
    const targetUrl = customTargetUrl ?? fallbackTargetUrl
    if (!targetUrl) {
      setAddDashboardError('Velg dashboard eller oppgi intern URL-sti.')
      return
    }

    const comparableUrl = getComparableUrl(window.location.origin + targetUrl)
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
      setAddDashboardError('Siden er allerede lagt til i canvaset.')
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'website',
      targetUrl,
      previewUrl: targetUrl,
      renderWebsite: false,
      isInternalDashboard: true,
      label: customTargetUrl ? getFrameLabel(targetUrl) : (selectedDashboard?.name ?? getFrameLabel(targetUrl)),
      width: 760,
      height: 620,
      refreshNonce: 1,
    }
    queueFrameForPlacement(frameDraft, 'dashboard')
    setAddDashboardError(null)
    setIsAddDashboardModalOpen(false)
  }

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
    setEditDashboardInternalPathInput(frame.targetUrl || '')
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

        const dashboards = preferredProjectId !== null ? await fetchDashboards(preferredProjectId) : []
        const dashboardOptions = dashboards.map((dashboard) => ({
          id: dashboard.id,
          name: getDashboardOptionLabel(dashboard),
          isCanvas: isCanvasDashboardDescription(dashboard.description),
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
    setEditImageAltTextInput(frame.imageAltText || '')
    setEditImageError(null)
    setIsEditImageModalOpen(true)
  }

  const handleOpenEditTableModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'text' || !Array.isArray(frame.tableHeaders) || frame.tableHeaders.length === 0) return
    setEditTableFrameId(frame.id)
    setTableHeadersInput(frame.tableHeaders.join(';'))
    setTableRowsInput((frame.tableRows ?? []).map((row) => row.join(';')).join('\n'))
    setAddTableError(null)
    setIsAddTableModalOpen(true)
  }

  const handleOpenEditLinkModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'link') return
    setEditLinkFrameId(frame.id)
    setLinkTitleInput(frame.label || '')
    setLinkUrlInput(frame.targetUrl || '')
    setLinkDescriptionInput(frame.textContent || '')
    setAddLinkError(null)
    setIsAddLinkModalOpen(true)
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
    setEditFigureSelectedType(frame.figureType ?? 'square')
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

    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
      width: frame.width ?? 280,
      height: frame.height ?? 240,
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

    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
      width: frame.width ?? 240,
      height: frame.height ?? 240,
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

  const handleDuplicateSectionCard = async (frame: CanvasFrame) => {
    if (frame.kind !== 'section') return

    const sectionWidth = frame.width ?? 640
    const sectionHeight = frame.height ?? 420
    const nextSectionLabel = getNextAutoSectionLabel(frames)
    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      label: nextSectionLabel,
      x: Math.max(0, frame.x + sectionWidth + 48),
      y: frame.y,
      width: sectionWidth,
      height: sectionHeight,
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
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke duplisere seksjon')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleDuplicateStickyCard = async (frame: CanvasFrame) => {
    if (frame.kind !== 'sticky') return

    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
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
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke duplisere sticky-notat')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleDuplicateTextCard = async (frame: CanvasFrame) => {
    if (frame.kind !== 'text') return

    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
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
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke duplisere tekstfelt')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleDuplicateHeadingCard = async (frame: CanvasFrame) => {
    if (frame.kind !== 'heading') return

    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
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
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke duplisere tittel')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleDuplicateDrawingCard = async (frame: CanvasFrame) => {
    if (frame.kind !== 'drawing') return

    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
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
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke duplisere tegning')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleDuplicateImageCard = async (frame: CanvasFrame) => {
    if (frame.kind !== 'image') return

    const duplicatedFrame: CanvasFrame = {
      ...frame,
      id: `${Date.now()}-${Math.random()}`,
      x: frame.x + 36,
      y: frame.y + 36,
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
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke duplisere bilde-kort')
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

    const customTargetUrl = normalizeInternalPathInput(editDashboardInternalPathInput)
    const selectedProjectId = Number(editDashboardSelectedProjectId)
    const selectedDashboardId = Number(editDashboardSelectedDashboardId)
    const normalizedProjectId = Number.isFinite(selectedProjectId) ? selectedProjectId : null
    const normalizedDashboardId = Number.isFinite(selectedDashboardId) ? selectedDashboardId : null

    if (!customTargetUrl && (normalizedProjectId === null || normalizedDashboardId === null)) {
      setEditDashboardError('Velg team og dashboard, eller oppgi intern URL-sti.')
      return
    }

    const selectedDashboard =
      normalizedDashboardId === null ? null : editDashboardOptions.find((option) => option.id === normalizedDashboardId)
    if (!customTargetUrl && !selectedDashboard) {
      setEditDashboardError('Velg et gyldig dashboard.')
      return
    }

    const fallbackTargetUrl =
      normalizedProjectId !== null && normalizedDashboardId !== null && selectedDashboard
        ? buildDashboardTargetUrl(normalizedDashboardId, normalizedProjectId, selectedDashboard.isCanvas)
        : null
    const targetUrl = customTargetUrl ?? fallbackTargetUrl
    if (!targetUrl) {
      setEditDashboardError('Velg et gyldig dashboard eller intern URL-sti.')
      return
    }

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
      setEditDashboardError('Siden er allerede lagt til i canvaset.')
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
      label: customTargetUrl ? getFrameLabel(targetUrl) : (selectedDashboard?.name ?? getFrameLabel(targetUrl)),
      refreshNonce: currentFrame.refreshNonce + 1,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(updatedFrame)
      setFrames((prev) => prev.map((frame) => (frame.id === editDashboardFrameId ? persistedFrame : frame)))
      setIsEditDashboardModalOpen(false)
      setEditDashboardFrameId(null)
      setEditDashboardInternalPathInput('')
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
    const imageAltText = editImageAltTextInput.trim()
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
      imageAltText,
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
      setEditImageAltTextInput('')
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

  const handleAddHeadingCard = () => {
    const heading = headingTextInput.trim()
    if (!heading) {
      setAddHeadingError('Legg inn overskrift.')
      return
    }

    const longestHeadingLineLength = heading
      .split('\n')
      .reduce((maxLength, line) => Math.max(maxLength, line.length), 0)
    const estimatedTextWidth =
      Math.ceil(longestHeadingLineLength * (HEADING_FONT_SIZE_DEFAULT * HEADING_TEXT_CHAR_WIDTH_FACTOR * 1.3)) +
      HEADING_TEXT_EXTRA_WIDTH
    const width = Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, estimatedTextWidth))
    const usableWidth = Math.max(1, width - HEADING_TEXT_EXTRA_WIDTH)
    const charsPerLine = Math.max(
      12,
      Math.floor(usableWidth / (HEADING_FONT_SIZE_DEFAULT * HEADING_TEXT_CHAR_WIDTH_FACTOR)),
    )
    const lineCount = heading
      .split('\n')
      .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
    const height = Math.max(28, lineCount * Math.ceil(HEADING_FONT_SIZE_DEFAULT * 1.05) + HEADING_TEXT_VERTICAL_PADDING)

    const targetSectionId = selectedAddSectionId.trim()
    if (targetSectionId) {
      const placement = resolvePlacementInSection(targetSectionId, { width, height })
      if (!placement) {
        setAddHeadingError('Fant ikke valgt seksjon.')
        return
      }

      const nextFrame: CanvasFrame = {
        id: `${Date.now()}-${Math.random()}`,
        kind: 'heading',
        headingText: heading,
        headingFontSize: HEADING_FONT_SIZE_DEFAULT,
        label: heading,
        width,
        height,
        x: placement.x,
        y: placement.y,
        categoryId: placement.categoryId,
        refreshNonce: 0,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(nextFrame)
          const persistedSection = await ensureSectionContainsFrame(targetSectionId, persistedFrame)
          setFrames((prev) => {
            const withSection = persistedSection
              ? prev.map((frame) => (frame.id === persistedSection.id ? persistedSection : frame))
              : prev
            return [...withSection, persistedFrame]
          })
          onFrameAddedInSection?.(persistedFrame)
          setHeadingTextInput('')
          setSelectedAddSectionId('')
          setAddHeadingError(null)
          setIsAddHeadingModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre overskrift')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'heading',
      headingText: heading,
      headingFontSize: HEADING_FONT_SIZE_DEFAULT,
      label: heading,
      width,
      height,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'overskrift')
    setHeadingTextInput('')
    setSelectedAddSectionId('')
    setAddHeadingError(null)
    setIsAddHeadingModalOpen(false)
  }

  const handleAddTextCard = () => {
    const content = textContentInput.trim()
    const textCardWidth = 340
    const textCardHeight = estimateTextFrameHeight(content, textCardWidth)

    if (!content) {
      setAddTextError('Legg inn tekst.')
      return
    }

    const targetSectionId = selectedAddSectionId.trim()
    if (targetSectionId) {
      const placement = resolvePlacementInSection(targetSectionId, { width: textCardWidth, height: textCardHeight })
      if (!placement) {
        setAddTextError('Fant ikke valgt seksjon.')
        return
      }

      const nextFrame: CanvasFrame = {
        id: `${Date.now()}-${Math.random()}`,
        kind: 'text',
        textContent: content,
        label: 'Tekst',
        width: textCardWidth,
        height: textCardHeight,
        x: placement.x,
        y: placement.y,
        categoryId: placement.categoryId,
        refreshNonce: 0,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(nextFrame)
          const persistedSection = await ensureSectionContainsFrame(targetSectionId, persistedFrame)
          setFrames((prev) => {
            const withSection = persistedSection
              ? prev.map((frame) => (frame.id === persistedSection.id ? persistedSection : frame))
              : prev
            return [...withSection, persistedFrame]
          })
          onFrameAddedInSection?.(persistedFrame)
          setTextContentInput('')
          setSelectedAddSectionId('')
          setAddTextError(null)
          setIsAddTextModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre tekst')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'text',
      textContent: content,
      label: 'Tekst',
      width: textCardWidth,
      height: textCardHeight,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'tekst')
    setTextContentInput('')
    setSelectedAddSectionId('')
    setAddTextError(null)
    setIsAddTextModalOpen(false)
  }

  const splitTableLine = (line: string): string[] => {
    const normalized = line.trim()
    if (!normalized) return []
    const delimiter = normalized.includes(';') ? ';' : normalized.includes('\t') ? '\t' : ','
    return normalized
      .split(delimiter)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }

  const handleAddTableCard = () => {
    const headers = splitTableLine(tableHeadersInput)
    if (headers.length === 0) {
      setAddTableError('Legg inn minst én kolonne.')
      return
    }

    const rows = tableRowsInput
      .split('\n')
      .map((line) => splitTableLine(line))
      .filter((row) => row.length > 0)
      .map((row) => {
        if (row.length >= headers.length) return row.slice(0, headers.length)
        const missingCells = Array.from({ length: headers.length - row.length }, (): string => '')
        return [...row, ...missingCells]
      })

    if (rows.length === 0) {
      setAddTableError('Legg inn minst én rad.')
      return
    }

    if (editTableFrameId) {
      const currentFrame = frames.find((frame) => frame.id === editTableFrameId)
      if (!currentFrame || currentFrame.kind !== 'text') return

      const updatedFrame: CanvasFrame = {
        ...currentFrame,
        label: currentFrame.label || 'Tabell',
        tableHeaders: headers,
        tableRows: rows,
        textContent: undefined,
        height: estimateTableFrameHeight(rows.length),
        refreshNonce: currentFrame.refreshNonce + 1,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(updatedFrame)
          setFrames((prev) => prev.map((frame) => (frame.id === editTableFrameId ? persistedFrame : frame)))
          setTableHeadersInput('')
          setTableRowsInput('')
          setAddTableError(null)
          setEditTableFrameId(null)
          setIsAddTableModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke oppdatere tabell')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
      return
    }

    const targetSectionId = selectedAddSectionId.trim()
    if (targetSectionId) {
      const tableHeight = estimateTableFrameHeight(rows.length)
      const placement = resolvePlacementInSection(targetSectionId, { width: 640, height: tableHeight })
      if (!placement) {
        setAddTableError('Fant ikke valgt seksjon.')
        return
      }

      const nextFrame: CanvasFrame = {
        id: `${Date.now()}-${Math.random()}`,
        kind: 'text',
        label: 'Tabell',
        tableHeaders: headers,
        tableRows: rows,
        width: 640,
        height: tableHeight,
        x: placement.x,
        y: placement.y,
        categoryId: placement.categoryId,
        refreshNonce: 0,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(nextFrame)
          const persistedSection = await ensureSectionContainsFrame(targetSectionId, persistedFrame)
          setFrames((prev) => {
            const withSection = persistedSection
              ? prev.map((frame) => (frame.id === persistedSection.id ? persistedSection : frame))
              : prev
            return [...withSection, persistedFrame]
          })
          onFrameAddedInSection?.(persistedFrame)
          setTableHeadersInput('')
          setTableRowsInput('')
          setSelectedAddSectionId('')
          setAddTableError(null)
          setEditTableFrameId(null)
          setIsAddTableModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre tabell')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'text',
      label: 'Tabell',
      tableHeaders: headers,
      tableRows: rows,
      width: 640,
      height: estimateTableFrameHeight(rows.length),
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'tabell')
    setTableHeadersInput('')
    setTableRowsInput('')
    setSelectedAddSectionId('')
    setAddTableError(null)
    setEditTableFrameId(null)
    setIsAddTableModalOpen(false)
  }

  const handleAddLinkCard = () => {
    const title = linkTitleInput.trim()
    const href = normalizeInputToTargetUrl(linkUrlInput, selectedWebsite?.domain)
    const description = linkDescriptionInput.trim()

    if (!title) {
      setAddLinkError('Legg inn tittel.')
      return
    }

    if (!href) {
      setAddLinkError('Legg inn en gyldig lenke, for eksempel https://www.nav.no/sykdom.')
      return
    }

    const descriptionLineCount = description ? description.split('\n').length : 0
    const estimatedHeight = description
      ? Math.min(240, Math.max(132, 112 + descriptionLineCount * 22 + Math.ceil(description.length / 64) * 14))
      : 96

    if (editLinkFrameId) {
      const currentFrame = frames.find((frame) => frame.id === editLinkFrameId)
      if (!currentFrame || currentFrame.kind !== 'link') return

      const updatedFrame: CanvasFrame = {
        ...currentFrame,
        targetUrl: href,
        textContent: description || undefined,
        label: title,
        height: estimatedHeight,
        refreshNonce: currentFrame.refreshNonce + 1,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(updatedFrame)
          setFrames((prev) => prev.map((frame) => (frame.id === editLinkFrameId ? persistedFrame : frame)))
          setLinkTitleInput('')
          setLinkUrlInput('')
          setLinkDescriptionInput('')
          setAddLinkError(null)
          setEditLinkFrameId(null)
          setIsAddLinkModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke oppdatere lenke')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
      return
    }

    const targetSectionId = selectedAddSectionId.trim()
    if (targetSectionId) {
      const placement = resolvePlacementInSection(targetSectionId, { width: 380, height: estimatedHeight })
      if (!placement) {
        setAddLinkError('Fant ikke valgt seksjon.')
        return
      }

      const nextFrame: CanvasFrame = {
        id: `${Date.now()}-${Math.random()}`,
        kind: 'link',
        targetUrl: href,
        textContent: description || undefined,
        label: title,
        width: 380,
        height: estimatedHeight,
        x: placement.x,
        y: placement.y,
        categoryId: placement.categoryId,
        refreshNonce: 0,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(nextFrame)
          const persistedSection = await ensureSectionContainsFrame(targetSectionId, persistedFrame)
          setFrames((prev) => {
            const withSection = persistedSection
              ? prev.map((frame) => (frame.id === persistedSection.id ? persistedSection : frame))
              : prev
            return [...withSection, persistedFrame]
          })
          onFrameAddedInSection?.(persistedFrame)
          setLinkTitleInput('')
          setLinkUrlInput('')
          setLinkDescriptionInput('')
          setSelectedAddSectionId('')
          setAddLinkError(null)
          setEditLinkFrameId(null)
          setIsAddLinkModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre lenke')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'link',
      targetUrl: href,
      textContent: description || undefined,
      label: title,
      width: 380,
      height: estimatedHeight,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'lenke')
    setLinkTitleInput('')
    setLinkUrlInput('')
    setLinkDescriptionInput('')
    setSelectedAddSectionId('')
    setAddLinkError(null)
    setEditLinkFrameId(null)
    setIsAddLinkModalOpen(false)
  }

  const handleAddStickyCard = () => {
    const content = stickyContentInput.trim()

    if (!content) {
      setAddStickyError('Legg inn tekst.')
      return
    }

    const normalizedStickyColor = getCanvasStickyColor(selectedStickyColor)
    const targetSectionId = selectedStickySectionId.trim()

    if (targetSectionId) {
      const placement = resolvePlacementInSection(targetSectionId, { width: 360, height: 180 })
      if (!placement) {
        setAddStickyError('Fant ikke valgt seksjon.')
        return
      }

      const nextFrame: CanvasFrame = {
        id: `${Date.now()}-${Math.random()}`,
        kind: 'sticky',
        textContent: content,
        stickyColor: normalizedStickyColor,
        label: 'Post-it-lapp',
        width: 360,
        height: 180,
        x: placement.x,
        y: placement.y,
        categoryId: placement.categoryId,
        refreshNonce: 0,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(nextFrame)
          const persistedSection = await ensureSectionContainsFrame(targetSectionId, persistedFrame)
          setFrames((prev) => {
            const withSection = persistedSection
              ? prev.map((frame) => (frame.id === persistedSection.id ? persistedSection : frame))
              : prev
            return [...withSection, persistedFrame]
          })
          onFrameAddedInSection?.(persistedFrame)
          setStickyContentInput('')
          setSelectedStickyColor(DEFAULT_CANVAS_STICKY_COLOR)
          setSelectedStickySectionId('')
          setAddStickyError(null)
          setIsAddStickyModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre post-it-lapp')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
      return
    }

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'sticky',
      textContent: content,
      stickyColor: normalizedStickyColor,
      label: 'Post-it-lapp',
      width: 360,
      height: 180,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'Post-it-lapp')
    setStickyContentInput('')
    setSelectedStickyColor(DEFAULT_CANVAS_STICKY_COLOR)
    setSelectedStickySectionId('')
    setAddStickyError(null)
    setIsAddStickyModalOpen(false)
  }

  const handleAddSectionCard = () => {
    const nextSectionLabel = sectionNameInput.trim() || getNextAutoSectionLabel(frames)

    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'section',
      label: nextSectionLabel,
      sectionLayout: sectionLayoutMode,
      width: 640,
      height: 420,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'seksjon')
    setSectionNameInput('')
    setSectionLayoutMode('grid')
    setAddSectionError(null)
    setIsAddSectionModalOpen(false)
  }

  const handleAddIconCard = () => {
    const selectedIcon = getCanvasIconOptionById(selectedIconId)
    if (!selectedIcon) {
      setAddIconError('Velg et ikon.')
      return
    }

    const targetSectionId = selectedAddSectionId.trim()
    if (targetSectionId) {
      const placement = resolvePlacementInSection(targetSectionId, { width: 280, height: 240 })
      if (!placement) {
        setAddIconError('Fant ikke valgt seksjon.')
        return
      }

      const nextFrame: CanvasFrame = {
        id: `${Date.now()}-${Math.random()}`,
        kind: 'icon',
        iconName: selectedIcon.id,
        iconRotationDeg: 0,
        iconColor: getCanvasIconColor(selectedIconColor),
        label: selectedIcon.label,
        width: 280,
        height: 240,
        x: placement.x,
        y: placement.y,
        categoryId: placement.categoryId,
        refreshNonce: 0,
      }

      void (async () => {
        try {
          setIsSavingCanvasItem(true)
          setSyncError(null)
          const persistedFrame = await persistFrame(nextFrame)
          const persistedSection = await ensureSectionContainsFrame(targetSectionId, persistedFrame)
          setFrames((prev) => {
            const withSection = persistedSection
              ? prev.map((frame) => (frame.id === persistedSection.id ? persistedSection : frame))
              : prev
            return [...withSection, persistedFrame]
          })
          onFrameAddedInSection?.(persistedFrame)
          setSelectedAddSectionId('')
          setAddIconError(null)
          setIsAddIconModalOpen(false)
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre ikon')
        } finally {
          setIsSavingCanvasItem(false)
        }
      })()
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
    setSelectedAddSectionId('')
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
      height: selectedFigure.id === 'line' || selectedFigure.id === 'arrow' ? 120 : 240,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'figur')
    setAddFigureError(null)
    setIsAddFigureModalOpen(false)
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

  const handleAddSqlEditorCard = () => {
    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'sql-editor',
      label: 'SQL-editor',
      sqlQuery: '',
      width: 420,
      height: 760,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'SQL-editor')
  }

  const handleAddCodeBlockCard = () => {
    const frameDraft: PendingCanvasFrameDraft = {
      kind: 'code-block',
      label: 'Kodeblokk',
      sqlQuery: '',
      codeLanguage: 'text',
      width: 420,
      height: 760,
      refreshNonce: 0,
    }
    queueFrameForPlacement(frameDraft, 'Kodeblokk')
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
    setSelectedAddSectionId('')
    setIsAddHeadingModalOpen(true)
  }

  const handleOpenAddTextModal = () => {
    setAddTextError(null)
    setSelectedAddSectionId('')
    setIsAddTextModalOpen(true)
  }

  const handleOpenAddTableModal = () => {
    setEditTableFrameId(null)
    setAddTableError(null)
    setTableHeadersInput('')
    setTableRowsInput('')
    setSelectedAddSectionId('')
    setIsAddTableModalOpen(true)
  }

  const handleOpenAddStickyModal = () => {
    setAddStickyError(null)
    setSelectedStickyColor((current) => getCanvasStickyColor(current))
    setSelectedStickySectionId('')
    setIsAddStickyModalOpen(true)
  }

  const handleOpenAddLinkModal = () => {
    setEditLinkFrameId(null)
    setLinkTitleInput('')
    setLinkUrlInput('')
    setLinkDescriptionInput('')
    setAddLinkError(null)
    setSelectedAddSectionId('')
    setIsAddLinkModalOpen(true)
  }

  const handleOpenAddSection = () => {
    setSectionNameInput('')
    setSectionLayoutMode('grid')
    setAddSectionError(null)
    setIsAddSectionModalOpen(true)
  }

  const handleOpenAddSqlEditor = () => {
    handleAddSqlEditorCard()
  }

  const handleOpenAddCodeBlock = () => {
    handleAddCodeBlockCard()
  }

  const handleOpenAddImageModal = () => {
    setAddImageError(null)
    setNewImageUrlInput('')
    setNewImageAltTextInput('')
    setSelectedAddSectionId('')
    setIsAddImageModalOpen(true)
  }

  const handleOpenAddIconModal = () => {
    setAddIconError(null)
    setSelectedIconId((current) => current || DEFAULT_CANVAS_ICON_ID)
    setSelectedIconColor((current) => getCanvasIconColor(current))
    setSelectedAddSectionId('')
    setIsAddIconModalOpen(true)
  }

  const handleOpenAddFigureModal = () => {
    setSelectedFigureType('square')
    setSelectedFigureColor(DEFAULT_CANVAS_ICON_COLOR)
    setAddFigureError(null)
    setIsAddFigureModalOpen(true)
  }

  const handleOpenAddIllustrationModal = () => {
    setEditIllustrationFrameId(null)
    setAddIllustrationError(null)
    setSelectedIllustrationPath((current) => current || DEFAULT_CANVAS_ILLUSTRATION_PATH)
    setSelectedAddSectionId('')
    setIsAddIllustrationModalOpen(true)
  }

  return {
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
    handleAddSqlEditorCard,
    handleAddCodeBlockCard,
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
  }
}

export default useCanvasFrameFormHandlers
