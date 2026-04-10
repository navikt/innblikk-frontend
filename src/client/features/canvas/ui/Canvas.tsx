import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionMenu,
  Alert,
  Button,
  HelpText,
  Label,
  Link,
  Loader,
  Modal,
  Select,
  Switch,
  Table,
  TextField,
  Textarea,
} from '@navikt/ds-react'
import {
  ArrowRight,
  ChartNoAxesCombined,
  Circle,
  Edit2,
  ExternalLink,
  Minus,
  MoreVertical,
  Plus,
  Slash,
  Square,
  Copy,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { computeFunnelStepMetrics } from '../../analysis/utils/horizontalFunnel.ts'
import { formatDateRange } from '../../analysis/utils/periodPicker.ts'
import type { PageMetricRow } from '../../traffic/model/types.ts'
import { fetchPageMetrics } from '../../traffic/api/trafficApi.ts'
import { fetchFunnelData } from '../../funnel/api/funnelApi.ts'
import { splitUrlStepInput } from '../../funnel/utils/stepUtils.ts'
import type { ClickmapItem } from '../../clickmap/model/types.ts'
import { fetchClickmap } from '../../clickmap/api/clickmapApi.ts'
import {
  getClickmapDatasetFromVisualizationMode,
  isVisualizationMode,
  type VisualizationMode,
} from '../../clickmap/model/visualizationMode.ts'
import VisualizationModeSelect from '../../clickmap/ui/VisualizationModeSelect.tsx'
import {
  getCookieCountByParams,
  getDateRangeFromPeriod,
  getStoredPeriod,
  normalizeUrlToPath,
  savePeriodPreference,
} from '../../../shared/lib/utils.ts'
import { DashboardWidget } from '../../dashboard'
import { mapGraphTypeToChart } from '../../oversikt'
import CanvasIllustrationPicker from './illustration/CanvasIllustrationPicker.tsx'
import {
  DEFAULT_CANVAS_ILLUSTRATION_PATH,
  getCanvasIllustrationOptionByPath,
} from './illustration/CanvasIllustrationRegistry.ts'
import CanvasIconPicker from './icon/CanvasIconPicker.tsx'
import CanvasFrameActionPoints from './CanvasFrameActionPoints.tsx'
import CanvasAdminModals from './CanvasAdminModals.tsx'
import CanvasTopBar from './CanvasTopBar.tsx'
import CanvasDrawingToolbar from './drawing/CanvasDrawingToolbar.tsx'
import CanvasDrawingDraftOverlay from './drawing/CanvasDrawingDraftOverlay.tsx'
import CanvasDrawingFrame from './drawing/CanvasDrawingFrame.tsx'
import CanvasImageFrame from './image/CanvasImageFrame.tsx'
import CanvasIconFrame from './icon/CanvasIconFrame.tsx'
import CanvasFigureFrame from './figure/CanvasFigureFrame.tsx'
import CanvasHeadingFrame from './heading/CanvasHeadingFrame.tsx'
import CanvasTextFrame from './text/CanvasTextFrame.tsx'
import CanvasStickyFrame from './sticky/CanvasStickyFrame.tsx'
import useCanvasDrawingTool, { type CanvasDrawingStroke } from './drawing/useCanvasDrawingTool.ts'
import { isIllustrationImageFrame, isIllustrationPath } from './image/CanvasImageUtils.ts'
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
  fetchGraphs,
  fetchQueries,
  updateCategory,
  updateDashboard,
  updateQuery,
} from '../../oversikt/api/oversiktApi.ts'
import type { GraphCategoryDto, GraphType, OversiktChart } from '../../oversikt/model/types.ts'
import EditChartDialog from '../../oversikt/ui/dialogs/EditChartDialog.tsx'
import DeleteChartDialog from '../../oversikt/ui/dialogs/DeleteChartDialog.tsx'
import type { FunnelStep } from '../../funnel/model/types.ts'
import type { Website } from '../../../shared/types/website.ts'
import { useCookieStartDate, useCookieSupport } from '../../../shared/hooks/useSiteimproveSupport.ts'
import { useLocation } from 'react-router-dom'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'

type CanvasChartType = 'line' | 'bar' | 'pie' | 'table'
type CanvasFigureType = 'rectangle' | 'circle' | 'line' | 'arrow'
type CanvasCsvImportStyle = 'sticky' | 'table'
type CanvasCsvTableMode = 'rows' | 'summary'
type CanvasPayloadKind =
  | 'website'
  | 'image'
  | 'heading'
  | 'text'
  | 'sticky'
  | 'chart'
  | 'icon'
  | 'figure'
  | 'drawing'
  | 'connection'
type CanvasConnectionMetric = {
  percentageOfPrev: number
  dropoffCount: number
  dropoffPercentage: number
  totalConversionPercent: number
  fromCount: number
  toCount: number
}

type CanvasFrame = {
  id: string
  kind: 'website' | 'image' | 'heading' | 'text' | 'sticky' | 'chart' | 'icon' | 'figure' | 'drawing'
  websiteId?: string
  targetUrl?: string
  previewUrl?: string
  renderWebsite?: boolean
  isInternalDashboard?: boolean
  visualizationMode?: VisualizationMode
  headingText?: string
  headingFontSize?: number
  textContent?: string
  tableHeaders?: string[]
  tableRows?: string[][]
  iconName?: string
  iconRotationDeg?: number
  iconColor?: string
  figureType?: CanvasFigureType
  figureColor?: string
  drawingPath?: string
  drawingStrokeStyles?: string
  drawingStrokeWidth?: number
  drawingColor?: string
  isIllustration?: boolean
  imageRotationDeg?: number
  chartType?: CanvasChartType
  chartSql?: string
  label: string
  x: number
  y: number
  width?: number
  height?: number
  categoryId?: number
  graphId?: number
  queryId?: number
  refreshNonce: number
}

type CanvasConnection = {
  id: string
  fromFrameId?: string
  toFrameId?: string
  fromGraphId?: number
  toGraphId?: number
  categoryId?: number
  graphId?: number
  queryId?: number
}

type CanvasPageInsight = {
  requestKey: string
  loading: boolean
  error: string | null
  data: PageMetricRow | null
}

type CanvasFrameVisualizationData = {
  requestKey: string
  loading: boolean
  error: string | null
  items: ClickmapItem[]
  websiteId?: string
  path?: string
}

type CanvasDeleteTarget =
  | {
      type: 'frame'
      id: string
      label: string
    }
  | {
      type: 'frames'
      ids: string[]
      label: string
    }
  | {
      type: 'connection'
      id: string
      label: string
    }

type ConnectionDragState = {
  sourceFrameId: string
  sourceAnchorSide: ConnectionAnchorSide
  pointerX: number
  pointerY: number
  currentTargetFrameId: string | null
}

type CanvasConnectionVisual = {
  id: string
  path: string
  labelX: number
  labelY: number
  midX: number
  midY: number
  endX: number
  endY: number
  fromUrl?: string
  toUrl?: string
}

type CanvasConfigPayload = {
  kind: CanvasPayloadKind
  x: number
  y: number
  websiteId?: string
  width?: number
  height?: number
  targetUrl?: string
  previewUrl?: string
  renderWebsite?: boolean
  isInternalDashboard?: boolean
  visualizationMode?: VisualizationMode
  headingText?: string
  headingFontSize?: number
  textContent?: string
  tableHeaders?: string[]
  tableRows?: string[][]
  iconName?: string
  iconRotationDeg?: number
  iconColor?: string
  figureType?: CanvasFigureType
  figureColor?: string
  drawingPath?: string
  drawingStrokeStyles?: string
  drawingStrokeWidth?: number
  drawingColor?: string
  isIllustration?: boolean
  imageRotationDeg?: number
  chartType?: CanvasChartType
  chartSql?: string
  label: string
  fromFrameId?: string
  toFrameId?: string
  fromGraphId?: number
  toGraphId?: number
}

type CanvasChartOption = {
  id: string
  title: string
  chartType: CanvasChartType
  sql: string
}
type CanvasFigureOption = {
  id: CanvasFigureType
  label: string
  Icon: typeof Square
}
type PendingCanvasFrameDraft = Omit<CanvasFrame, 'id' | 'x' | 'y' | 'categoryId' | 'graphId' | 'queryId'>
type PendingCsvStickyImport = {
  sectionTitle: string
  noteTexts: string[]
  aggregatedRatingsText?: string
  tableHeaders?: string[]
  tableRows?: string[][]
}

const CANVAS_DASHBOARD_TOKEN = '[canvas]'
const CANVAS_WEBSITE_ID_TOKEN_REGEX = /\[websiteId:([^\]]+)\]/i
const CANVAS_QUERY_NAME = 'canvas-config'
const CANVAS_SURFACE_WIDTH = 2200
const CANVAS_SURFACE_HEIGHT = 1500
const CANVAS_SURFACE_TOP_GAP = 24
const CANVAS_SURFACE_BOTTOM_BUFFER = 420
const CANVAS_ZOOM_MIN = 0.5
const CANVAS_ZOOM_MAX = 1.5
const CANVAS_ZOOM_STEP = 0.1
const HEADING_FONT_SIZE_DEFAULT = 40
const HEADING_FONT_SIZE_MIN = 20
const HEADING_FONT_SIZE_MAX = 96
const HEADING_FONT_SIZE_STEP = 2
const ICON_ROTATION_STEP_DEG = 15
const CANVAS_FIGURE_OPTIONS: CanvasFigureOption[] = [
  { id: 'rectangle', label: 'Rektangel', Icon: Square },
  { id: 'circle', label: 'Sirkel', Icon: Circle },
  { id: 'line', label: 'Linje', Icon: Slash },
  { id: 'arrow', label: 'Pil', Icon: ArrowRight },
]
const CANVAS_INVENTORY_KIND_OPTIONS: Array<{ kind: CanvasFrame['kind']; label: string }> = [
  { kind: 'website', label: 'Nettsider' },
  { kind: 'image', label: 'Bilder' },
  { kind: 'heading', label: 'Overskrifter' },
  { kind: 'text', label: 'Tekstblokker' },
  { kind: 'sticky', label: 'Post-it-lapper' },
  { kind: 'chart', label: 'Grafer' },
  { kind: 'icon', label: 'Ikoner' },
  { kind: 'figure', label: 'Figurer' },
  { kind: 'drawing', label: 'Tegninger' },
]
const CANVAS_INVENTORY_DETAIL_LIMIT_PER_TYPE = 500
const CLICKMAP_EVENTS = ['navigere', 'accordion åpnet']
const DRAWING_STROKE_WIDTH_OPTIONS = [6, 10, 14]
const DEFAULT_DRAWING_STROKE_WIDTH = 10
const IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE = 8
const CANVAS_TABLE_ROWS_PER_PAGE = 10
const TABLE_FRAME_MIN_HEIGHT = 180
const TABLE_FRAME_MAX_HEIGHT = 520
const TABLE_FRAME_HEADER_HEIGHT = 42
const TABLE_FRAME_ROW_HEIGHT = 44
const TABLE_FRAME_VERTICAL_CHROME = 28
const TABLE_FRAME_PAGINATION_HEIGHT = 32
const PLANNER_COLUMN_LABEL_PREFIX = 'planner-column:'
const CARD_ACTION_BUTTON_CLASSNAME =
  'pointer-events-auto bg-[var(--ax-bg-default)]/95 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'

const clampCanvasZoom = (value: number): number => Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value))

const mapCanvasChartTypeToGraphType = (chartType: CanvasChartType): GraphType => {
  if (chartType === 'line') return 'LINE'
  if (chartType === 'bar') return 'BAR'
  if (chartType === 'pie') return 'PIE'
  return 'TABLE'
}

const getCanvasCategoryDisplayName = (name?: string): string => {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) return 'Fane 1'
  if (trimmed.toLowerCase() === 'general') return 'Fane 1'
  return trimmed
}

const extractCanvasWebsiteIdFromDescription = (description?: string): string | null => {
  if (!description) return null
  const match = description.match(CANVAS_WEBSITE_ID_TOKEN_REGEX)
  const websiteId = match?.[1]?.trim()
  return websiteId || null
}

const buildCanvasDashboardDescription = (description: string | undefined, websiteId?: string): string => {
  const withoutCanvasToken = (description ?? '')
    .replace(/\[canvas\]/gi, ' ')
    .replace(CANVAS_WEBSITE_ID_TOKEN_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = [CANVAS_DASHBOARD_TOKEN]
  if (websiteId?.trim()) {
    tokens.push(`[websiteId:${websiteId.trim()}]`)
  }
  if (withoutCanvasToken) {
    tokens.push(withoutCanvasToken)
  }
  return tokens.join(' ')
}

const normalizeInputToTargetUrl = (value: string, websiteDomain?: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const originFromWebsiteDomain = (() => {
    if (!websiteDomain) return null
    const withProtocol =
      websiteDomain.startsWith('http://') || websiteDomain.startsWith('https://')
        ? websiteDomain
        : `https://${websiteDomain}`
    try {
      return new URL(withProtocol).origin
    } catch {
      return null
    }
  })()

  if (trimmed.startsWith('/')) {
    try {
      const baseUrl = originFromWebsiteDomain ?? 'https://www.nav.no/'
      const url = new URL(trimmed, baseUrl)
      url.hash = ''
      return url.toString()
    } catch {
      return null
    }
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

const getComparableUrl = (value: string): string => {
  try {
    const url = new URL(value)
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
    return `${url.origin}${pathname}${url.search}`
  } catch {
    return value
  }
}

const getFrameLabel = (targetUrl: string): string => {
  try {
    const url = new URL(targetUrl)
    return `${url.hostname}${url.pathname}${url.search}`
  } catch {
    return targetUrl
  }
}

const parseDashboardTargetUrl = (
  targetUrl?: string,
): {
  projectId: number | null
  dashboardId: number | null
} => {
  if (!targetUrl) return { projectId: null, dashboardId: null }
  try {
    const url = new URL(targetUrl, window.location.origin)
    const match = url.pathname.match(/^\/dashboard\/(\d+)\b/)
    const dashboardId = match ? Number(match[1]) : NaN
    const projectId = Number(url.searchParams.get('projectId'))
    return {
      projectId: Number.isFinite(projectId) ? projectId : null,
      dashboardId: Number.isFinite(dashboardId) ? dashboardId : null,
    }
  } catch {
    return { projectId: null, dashboardId: null }
  }
}

const isCanvasDashboardDescription = (description?: string): boolean =>
  (description || '').toLowerCase().split(/\s+/).includes(CANVAS_DASHBOARD_TOKEN)

const getCanvasPeriodLabel = (period: string, customStartDate?: Date, customEndDate?: Date): string => {
  if (period === 'custom' && customStartDate && customEndDate) {
    return formatDateRange(customStartDate, customEndDate)
  }

  const option = [
    { value: 'today', label: 'I dag' },
    { value: 'yesterday', label: 'I går' },
    { value: 'this_week', label: 'Denne uken' },
    { value: 'last_7_days', label: 'Siste 7 dager' },
    { value: 'last_week', label: 'Forrige uke' },
    { value: 'last_28_days', label: 'Siste 28 dager' },
    { value: 'current_month', label: 'Denne måneden' },
    { value: 'last_month', label: 'Forrige måned' },
  ].find((item) => item.value === period)

  return option?.label || period
}

const buildFunnelStepFromUrl = (targetUrl: string): FunnelStep => {
  const { value, query } = splitUrlStepInput(targetUrl)
  return { type: 'url', value, query }
}

type ConnectionAnchorSide = 'left' | 'right' | 'top' | 'bottom'

const computeMidpoint = (
  x1: number,
  y1: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x2: number,
  y2: number,
): { x: number; y: number } => {
  const t = 0.5
  const mt = 1 - t

  return {
    x: mt ** 3 * x1 + 3 * mt ** 2 * t * c1x + 3 * mt * t ** 2 * c2x + t ** 3 * x2,
    y: mt ** 3 * y1 + 3 * mt ** 2 * t * c1y + 3 * mt * t ** 2 * c2y + t ** 3 * y2,
  }
}

const buildConnectionPath = (
  x1: number,
  y1: number,
  fromSide: ConnectionAnchorSide,
  x2: number,
  y2: number,
  toSide: ConnectionAnchorSide,
): { path: string; midpoint: { x: number; y: number } } => {
  const horizontalDelta = Math.max(80, Math.abs(x2 - x1) * 0.45)
  const verticalDelta = Math.max(80, Math.abs(y2 - y1) * 0.45)
  const c1x = fromSide === 'right' ? x1 + horizontalDelta : fromSide === 'left' ? x1 - horizontalDelta : x1
  const c1y = fromSide === 'bottom' ? y1 + verticalDelta : fromSide === 'top' ? y1 - verticalDelta : y1
  const c2x = toSide === 'right' ? x2 + horizontalDelta : toSide === 'left' ? x2 - horizontalDelta : x2
  const c2y = toSide === 'bottom' ? y2 + verticalDelta : toSide === 'top' ? y2 - verticalDelta : y2
  return {
    path: `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`,
    midpoint: computeMidpoint(x1, y1, c1x, c1y, c2x, c2y, x2, y2),
  }
}

const WEBSITE_CARD_HEADER_HEIGHT = 46
const HEADING_CARD_HEADER_HEIGHT = 0
const ICON_CARD_HEADER_HEIGHT = 0
const CANVAS_TOP_BUFFER = 240
const HEADING_TEXT_MIN_WIDTH = 140
const HEADING_TEXT_MAX_WIDTH = 820
const HEADING_TEXT_EXTRA_WIDTH = 6
const HEADING_TEXT_VERTICAL_PADDING = 0
const HEADING_TEXT_CHAR_WIDTH_FACTOR = 0.42

const createPreviewProxySrc = (targetUrl: string): string => {
  return `/api/clickmap-preview?url=${encodeURIComponent(targetUrl)}`
}

const getWebsiteFrameDisplayUrl = (frame: CanvasFrame): string | undefined => {
  if (frame.kind === 'image') {
    return frame.targetUrl
  }

  if (frame.renderWebsite === false) {
    return frame.previewUrl
  }

  return frame.targetUrl
}

const getWebsiteFrameRenderSrc = (frame: CanvasFrame): string | undefined => {
  if (frame.kind === 'image') {
    return frame.targetUrl
  }

  if (frame.renderWebsite === false) {
    return frame.previewUrl
  }

  return frame.targetUrl ? createPreviewProxySrc(frame.targetUrl) : undefined
}

const getCanvasFrameVisualizationMode = (frame: Pick<CanvasFrame, 'visualizationMode'>): VisualizationMode | '' =>
  isVisualizationMode(frame.visualizationMode) ? frame.visualizationMode : ''

const getVisualizationModeLabel = (mode: VisualizationMode | ''): string => {
  if (mode === 'clickmap') return 'Klikkkart'
  if (mode === 'heatmap') return 'Varmekart'
  if (mode === 'scrollmap') return 'Scrollkart'
  return ''
}

const formatCanvasPathLabel = (targetUrl?: string, fallbackText?: string): string => {
  const normalizedPath = targetUrl ? normalizeUrlToPath(targetUrl) : ''
  if (normalizedPath === '/') return '/ (forside)'
  return normalizedPath || fallbackText || targetUrl || ''
}

const normalizeDomainForComparison = (value: string): string =>
  value.replace(/^https?:\/\//i, '').replace(/^www\./i, '')

const isImagePreviewUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname)
  } catch {
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(value)
  }
}

const serializeCanvasConfig = (frame: CanvasConfigPayload): string => {
  const json = JSON.stringify(frame)
  const escaped = json.replace(/'/g, "''")
  return `SELECT '${escaped}' AS canvas_config`
}

const buildCanvasStorageGraphName = (frame: CanvasFrame): string => `canvas:${frame.kind}:${frame.id}`.slice(0, 200)
const buildCanvasConnectionStorageGraphName = (connection: CanvasConnection): string =>
  `canvas:connection:${connection.id}`.slice(0, 200)

const isCanvasPayloadKind = (value: unknown): value is CanvasPayloadKind =>
  value === 'website' ||
  value === 'image' ||
  value === 'heading' ||
  value === 'text' ||
  value === 'sticky' ||
  value === 'chart' ||
  value === 'icon' ||
  value === 'figure' ||
  value === 'drawing' ||
  value === 'connection'

const isRenderableCanvasFrameKind = (value: unknown): value is CanvasFrame['kind'] =>
  value === 'website' ||
  value === 'image' ||
  value === 'heading' ||
  value === 'text' ||
  value === 'sticky' ||
  value === 'chart' ||
  value === 'icon' ||
  value === 'figure' ||
  value === 'drawing'

const isCanvasChartType = (value: unknown): value is CanvasChartType =>
  value === 'line' || value === 'bar' || value === 'pie' || value === 'table'

const isCanvasFigureType = (value: unknown): value is CanvasFigureType =>
  value === 'rectangle' || value === 'circle' || value === 'line' || value === 'arrow'

const parseCanvasConfig = (raw: string): CanvasConfigPayload | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  const selectMatch = trimmed.match(/^SELECT\s+'((?:''|[^'])*)'\s+AS\s+canvas_config\s*;?\s*$/i)
  const jsonCandidate = selectMatch ? selectMatch[1].replace(/''/g, "'") : trimmed

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<CanvasConfigPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (!isCanvasPayloadKind(parsed.kind)) return null
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
    if (!parsed.label || typeof parsed.label !== 'string') return null

    return {
      kind: parsed.kind,
      x: Number(parsed.x),
      y: Number(parsed.y),
      width: Number.isFinite(parsed.width) ? Number(parsed.width) : undefined,
      height: Number.isFinite(parsed.height) ? Number(parsed.height) : undefined,
      websiteId: typeof parsed.websiteId === 'string' ? parsed.websiteId : undefined,
      targetUrl: typeof parsed.targetUrl === 'string' ? parsed.targetUrl : undefined,
      previewUrl: typeof parsed.previewUrl === 'string' ? parsed.previewUrl : undefined,
      renderWebsite: typeof parsed.renderWebsite === 'boolean' ? parsed.renderWebsite : undefined,
      isInternalDashboard: typeof parsed.isInternalDashboard === 'boolean' ? parsed.isInternalDashboard : undefined,
      visualizationMode: isVisualizationMode(parsed.visualizationMode) ? parsed.visualizationMode : undefined,
      headingText: typeof parsed.headingText === 'string' ? parsed.headingText : undefined,
      headingFontSize: Number.isFinite(parsed.headingFontSize) ? Number(parsed.headingFontSize) : undefined,
      textContent: typeof parsed.textContent === 'string' ? parsed.textContent : undefined,
      tableHeaders: isStringArray(parsed.tableHeaders) ? parsed.tableHeaders : undefined,
      tableRows: isStringMatrix(parsed.tableRows) ? parsed.tableRows : undefined,
      iconName: typeof parsed.iconName === 'string' ? parsed.iconName : undefined,
      iconRotationDeg: Number.isFinite(parsed.iconRotationDeg) ? Number(parsed.iconRotationDeg) : undefined,
      iconColor: typeof parsed.iconColor === 'string' ? parsed.iconColor : undefined,
      figureType: isCanvasFigureType(parsed.figureType) ? parsed.figureType : undefined,
      figureColor: typeof parsed.figureColor === 'string' ? parsed.figureColor : undefined,
      drawingPath: typeof parsed.drawingPath === 'string' ? parsed.drawingPath : undefined,
      drawingStrokeStyles: typeof parsed.drawingStrokeStyles === 'string' ? parsed.drawingStrokeStyles : undefined,
      drawingStrokeWidth: Number.isFinite(parsed.drawingStrokeWidth) ? Number(parsed.drawingStrokeWidth) : undefined,
      drawingColor: typeof parsed.drawingColor === 'string' ? parsed.drawingColor : undefined,
      isIllustration: typeof parsed.isIllustration === 'boolean' ? parsed.isIllustration : undefined,
      imageRotationDeg: Number.isFinite(parsed.imageRotationDeg) ? Number(parsed.imageRotationDeg) : undefined,
      chartType: isCanvasChartType(parsed.chartType) ? parsed.chartType : undefined,
      chartSql: typeof parsed.chartSql === 'string' ? parsed.chartSql : undefined,
      label: parsed.label,
      fromFrameId: typeof parsed.fromFrameId === 'string' ? parsed.fromFrameId : undefined,
      toFrameId: typeof parsed.toFrameId === 'string' ? parsed.toFrameId : undefined,
      fromGraphId: Number.isFinite(parsed.fromGraphId) ? Number(parsed.fromGraphId) : undefined,
      toGraphId: Number.isFinite(parsed.toGraphId) ? Number(parsed.toGraphId) : undefined,
    }
  } catch {
    return null
  }
}

type CanvasChartReadyMessage = {
  type: 'umami-canvas-chart-ready'
  payload: {
    label?: string
    chartType?: CanvasChartType
    chartSql?: string
    websiteId?: string
  }
}

type CanvasCsvImportRow = Record<string, string>

type CanvasRatingDistributionItem = {
  value: number
  count: number
  percentage: number
}

type CanvasNumericRatingSummary = {
  count: number
  average: number
  median: number
  min: number
  max: number
  distribution: CanvasRatingDistributionItem[]
}

type CanvasCategoricalSummaryRow = {
  value: string
  count: number
  percentage: number
}

type CanvasPrivacyPattern = {
  name: string
  regex: RegExp
}

type CanvasPrivacyFinding = {
  rowIndex: number
  text: string
  patternNames: string[]
}

const CSV_IMPORT_PRIVACY_PATTERNS: CanvasPrivacyPattern[] = [
  { name: 'Fødselsnummer', regex: /(?:^|[^\d])\d{11}(?!\d)/ },
  { name: 'Navident', regex: /(?:^|[^a-zA-Z0-9])[a-zA-Z]\d{6}(?!\d)/ },
  { name: 'E-post', regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: 'IP-adresse', regex: /(?:^|[^\d])\d{1,3}(?:\.\d{1,3}){3}(?!\d)/ },
  { name: 'Telefonnummer', regex: /(?:^|[^\d])[2-9](?:\s?\d){7}(?!\d)/ },
  {
    name: 'Mulig navn',
    regex:
      /\b(?!Norge\b)[A-ZÆØÅ][a-zæøå]{1,20}\s(?!Norge\b)[A-ZÆØÅ][a-zæøå]{1,20}(?:\s(?!Norge\b)[A-ZÆØÅ][a-zæøå]{1,20})?\b/,
  },
  { name: 'Mulig adresse', regex: /\b\d{4}\s[A-ZÆØÅ][A-ZÆØÅa-zæøå]+(?:\s[A-ZÆØÅa-zæøå]+)*\b/ },
  { name: 'Hemmelig adresse', regex: /hemmelig(?:%20|\s+)(?:20\s*%(?:%20|\s+))?adresse/i },
  { name: 'Kontonummer', regex: /(?:^|[^\d])\d{4}\.?\d{2}\.?\d{5}(?!\d)/ },
  { name: 'Organisasjonsnummer', regex: /(?:^|[^\d])\d{9}(?!\d)/ },
  { name: 'Bilnummer', regex: /(?:^|[^a-zA-Z])[A-Z]{2}\s?\d{5}(?!\d)/ },
  { name: 'Mulig søk', regex: /[?&](?:q|query|search|k|ord)=[^&]+/i },
]

const parseDelimitedCsvMatrix = (input: string, delimiter: string): string[][] => {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index <= normalized.length; index += 1) {
    const character = index === normalized.length ? '\n' : normalized[index]

    if (inQuotes) {
      if (character === '"') {
        if (normalized[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += character
      }
      continue
    }

    if (character === '"') {
      inQuotes = true
      continue
    }

    if (character === delimiter) {
      row.push(cell)
      cell = ''
      continue
    }

    if (character === '\n') {
      row.push(cell)
      if (row.some((item) => item.trim() !== '')) {
        rows.push(row)
      }
      row = []
      cell = ''
      continue
    }

    cell += character
  }

  return rows
}

const parseCsvImportText = (input: string): { headers: string[]; rows: CanvasCsvImportRow[]; error?: string } => {
  const delimiterCandidates = [',', ';', '\t']
  const matrix = delimiterCandidates
    .map((delimiter) => parseDelimitedCsvMatrix(input, delimiter))
    .sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0))[0]

  if (!matrix || matrix.length === 0) {
    return { headers: [], rows: [] }
  }

  const [rawHeaderRow, ...rawRows] = matrix
  if (rawHeaderRow.some((header) => !header.trim())) {
    return {
      headers: [],
      rows: [],
      error: 'CSV-filen må ha overskrift i alle kolonner på første rad.',
    }
  }
  const usedHeaders = new Set<string>()
  const headers = rawHeaderRow.map((header) => {
    const baseName = header.trim()
    let uniqueName = baseName
    let suffix = 2
    while (usedHeaders.has(uniqueName)) {
      uniqueName = `${baseName} (${suffix})`
      suffix += 1
    }
    usedHeaders.add(uniqueName)
    return uniqueName
  })

  const rows = rawRows
    .map((rawRow) => {
      const parsedRow: CanvasCsvImportRow = {}
      headers.forEach((header, index) => {
        parsedRow[header] = (rawRow[index] ?? '').trim()
      })
      return parsedRow
    })
    .filter((row) => headers.some((header) => row[header]?.trim()))

  return { headers, rows }
}

const summarizeCategoricalValues = (inputs: string[]): CanvasCategoricalSummaryRow[] => {
  if (inputs.length === 0) return []

  const grouped = new Map<string, number>()
  inputs.forEach((value) => {
    grouped.set(value, (grouped.get(value) ?? 0) + 1)
  })

  const total = inputs.length
  return Array.from(grouped.entries())
    .map(([value, count]) => ({
      value,
      count,
      percentage: (count / total) * 100,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.value.localeCompare(b.value, 'nb')
    })
}

const findPrivacyPatternNames = (text: string): string[] => {
  const matches = CSV_IMPORT_PRIVACY_PATTERNS.filter((pattern) => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    return regex.test(text)
  }).map((pattern) => pattern.name)

  return Array.from(new Set(matches))
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isStringMatrix = (value: unknown): value is string[][] =>
  Array.isArray(value) && value.every((row) => isStringArray(row))

const parseRatingValue = (input: string): number | null => {
  const normalized = input.trim().replace(',', '.')
  if (!normalized) return null
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const formatRatingValue = (value: number): string =>
  Number.isInteger(value) ? value.toString() : value.toLocaleString('nb-NO', { maximumFractionDigits: 2 })

const summarizeNumericRatings = (inputs: string[]): CanvasNumericRatingSummary | null => {
  if (inputs.length === 0) return null
  const numericValues = inputs.map((value) => parseRatingValue(value))
  if (numericValues.some((value) => value === null)) return null

  const values = numericValues.filter((value): value is number => value !== null)
  if (values.length === 0) return null

  const sortedValues = [...values].sort((a, b) => a - b)
  const total = values.length
  const sum = values.reduce((accumulator, value) => accumulator + value, 0)
  const middleIndex = Math.floor(total / 2)
  const median =
    total % 2 === 0 ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2 : sortedValues[middleIndex] || 0

  const distributionMap = new Map<number, number>()
  values.forEach((value) => {
    distributionMap.set(value, (distributionMap.get(value) ?? 0) + 1)
  })

  const distribution: CanvasRatingDistributionItem[] = Array.from(distributionMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({
      value,
      count,
      percentage: (count / total) * 100,
    }))

  return {
    count: total,
    average: sum / total,
    median,
    min: sortedValues[0] || 0,
    max: sortedValues[sortedValues.length - 1] || 0,
    distribution,
  }
}

const buildNumericRatingSummaryText = (summary: CanvasNumericRatingSummary): string => {
  const lines = [
    `Antall svar: ${summary.count.toLocaleString('nb-NO')}`,
    `Snitt: ${summary.average.toLocaleString('nb-NO', { maximumFractionDigits: 2 })}`,
    `Median: ${summary.median.toLocaleString('nb-NO', { maximumFractionDigits: 2 })}`,
    `Min/maks: ${formatRatingValue(summary.min)} - ${formatRatingValue(summary.max)}`,
    '',
    'Fordeling:',
    ...summary.distribution.map(
      (item) =>
        `${formatRatingValue(item.value)}: ${item.count.toLocaleString('nb-NO')} svar (${item.percentage.toLocaleString(
          'nb-NO',
          {
            maximumFractionDigits: 1,
          },
        )} %)`,
    ),
  ]
  return lines.join('\n')
}

const estimateTableFrameHeight = (rowCount: number): number => {
  const visibleRows = Math.max(1, Math.min(CANVAS_TABLE_ROWS_PER_PAGE, rowCount))
  const includesPagination = rowCount > CANVAS_TABLE_ROWS_PER_PAGE
  const estimatedHeight =
    TABLE_FRAME_HEADER_HEIGHT +
    visibleRows * TABLE_FRAME_ROW_HEIGHT +
    TABLE_FRAME_VERTICAL_CHROME +
    (includesPagination ? TABLE_FRAME_PAGINATION_HEIGHT : 0)

  return Math.max(TABLE_FRAME_MIN_HEIGHT, Math.min(TABLE_FRAME_MAX_HEIGHT, estimatedHeight))
}

const Canvas = () => {
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
  const [canvasTitle, setCanvasTitle] = useState('Innblikk: Canvas')
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
  const [importStickyCsvFileName, setImportStickyCsvFileName] = useState('')
  const [importStickyCsvHeaders, setImportStickyCsvHeaders] = useState<string[]>([])
  const [importStickyCsvRows, setImportStickyCsvRows] = useState<CanvasCsvImportRow[]>([])
  const [importStickyContentColumn, setImportStickyContentColumn] = useState('')
  const [importStickyStyle, setImportStickyStyle] = useState<CanvasCsvImportStyle>('sticky')
  const [importStickyTableMode, setImportStickyTableMode] = useState<CanvasCsvTableMode>('rows')
  const [importStickyTablePreviewPage, setImportStickyTablePreviewPage] = useState(1)
  const [importStickySectionTitle, setImportStickySectionTitle] = useState('')
  const [importStickyExcludedRowIndexes, setImportStickyExcludedRowIndexes] = useState<number[]>([])
  const [importStickyPrivacyReviewed, setImportStickyPrivacyReviewed] = useState(false)
  const [importStickyCsvError, setImportStickyCsvError] = useState<string | null>(null)
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
  const [chartOptions, setChartOptions] = useState<CanvasChartOption[]>([])
  const [selectedChartOptionId, setSelectedChartOptionId] = useState('')
  const [isLoadingChartOptions, setIsLoadingChartOptions] = useState(false)
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
  const [, setIsLoadingCanvasItems] = useState(false)
  const [isSavingCanvasItem, setIsSavingCanvasItem] = useState(false)
  const [isImportingStickyCsv, setIsImportingStickyCsv] = useState(false)
  const [connectionMetrics, setConnectionMetrics] = useState<Record<string, CanvasConnectionMetric | null>>({})
  const [frameVisualizationData, setFrameVisualizationData] = useState<Record<string, CanvasFrameVisualizationData>>({})
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
  const frameVisualizationDataRef = useRef<Record<string, CanvasFrameVisualizationData>>({})
  const websiteIframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})
  const chartContentRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const importStickyCsvFileInputRef = useRef<HTMLInputElement | null>(null)
  const isImportingStickyCsvRef = useRef(false)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const canvasToolbarRef = useRef<HTMLDivElement | null>(null)
  const connectionMetricRequestSignatureRef = useRef<string | null>(null)
  const [canvasToolbarHeight, setCanvasToolbarHeight] = useState(120)
  const canvasCanvasTopOffset = canvasToolbarHeight + CANVAS_SURFACE_TOP_GAP
  const shouldShowCreateCanvasModal = canvasInitMode === 'create'
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

  const activeInsightPeriodLabel = useMemo(
    () => getCanvasPeriodLabel(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate],
  )

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
    frameVisualizationDataRef.current = frameVisualizationData
  }, [frameVisualizationData])

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

  const importStickyPreviewNotes = useMemo(
    () =>
      importStickyContentColumn
        ? importStickyCsvRows
            .map((row, index) => ({
              rowIndex: index,
              text: (row[importStickyContentColumn] || '').trim(),
            }))
            .filter((item) => Boolean(item.text))
            .filter((item) => !importStickyExcludedRowIndexes.includes(item.rowIndex))
        : [],
    [importStickyContentColumn, importStickyCsvRows, importStickyExcludedRowIndexes],
  )

  const importStickyNumericSummary = useMemo(
    () => summarizeNumericRatings(importStickyPreviewNotes.map((item) => item.text)),
    [importStickyPreviewNotes],
  )

  const canChooseNonNumericImportStyle = importStickyPreviewNotes.length > 0 && !importStickyNumericSummary
  const shouldImportStickyAsAggregated = Boolean(importStickyNumericSummary)
  const importStickyCategoricalSummaryRows = useMemo(
    () => summarizeCategoricalValues(importStickyPreviewNotes.map((item) => item.text)),
    [importStickyPreviewNotes],
  )
  const importStickyNumericSummaryRows = useMemo(
    () =>
      importStickyNumericSummary
        ? importStickyNumericSummary.distribution.map((item) => ({
            value: formatRatingValue(item.value),
            count: item.count,
            percentage: item.percentage,
          }))
        : [],
    [importStickyNumericSummary],
  )
  const importStickyPrivacyFindings = useMemo<CanvasPrivacyFinding[]>(
    () =>
      importStickyPreviewNotes
        .map((item) => ({
          rowIndex: item.rowIndex,
          text: item.text,
          patternNames: findPrivacyPatternNames(item.text),
        }))
        .filter((item) => item.patternNames.length > 0),
    [importStickyPreviewNotes],
  )
  const hasImportStickyPrivacyFindings = importStickyPrivacyFindings.length > 0
  const importStickyTablePreviewPageCount = Math.max(
    1,
    Math.ceil(
      (shouldImportStickyAsAggregated
        ? importStickyNumericSummaryRows.length
        : importStickyStyle === 'table' && importStickyTableMode === 'summary'
          ? importStickyCategoricalSummaryRows.length
          : importStickyPreviewNotes.length) / IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE,
    ),
  )
  const currentImportStickyTablePreviewPage = Math.min(importStickyTablePreviewPage, importStickyTablePreviewPageCount)
  const importStickyTablePreviewNoteRows = useMemo(() => {
    const startIndex = (currentImportStickyTablePreviewPage - 1) * IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE
    return importStickyPreviewNotes.slice(startIndex, startIndex + IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE)
  }, [currentImportStickyTablePreviewPage, importStickyPreviewNotes])
  const importStickyTablePreviewSummaryRows = useMemo(() => {
    const startIndex = (currentImportStickyTablePreviewPage - 1) * IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE
    return importStickyCategoricalSummaryRows.slice(startIndex, startIndex + IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE)
  }, [currentImportStickyTablePreviewPage, importStickyCategoricalSummaryRows])
  const importStickyTablePreviewNumericSummaryRows = useMemo(() => {
    const startIndex = (currentImportStickyTablePreviewPage - 1) * IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE
    return importStickyNumericSummaryRows.slice(startIndex, startIndex + IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE)
  }, [currentImportStickyTablePreviewPage, importStickyNumericSummaryRows])

  useEffect(() => {
    if (importStickyTablePreviewPage <= importStickyTablePreviewPageCount) return
    setImportStickyTablePreviewPage(importStickyTablePreviewPageCount)
  }, [importStickyTablePreviewPage, importStickyTablePreviewPageCount])

  useEffect(() => {
    setImportStickyPrivacyReviewed(false)
  }, [importStickyContentColumn, importStickyExcludedRowIndexes, importStickyCsvRows])

  const visualizationWebsiteFrames = useMemo(
    () =>
      frameItems
        .filter((frame) => frame.kind === 'website' && !frame.isInternalDashboard && frame.renderWebsite !== false)
        .map((frame) => ({
          id: frame.id,
          kind: frame.kind,
          websiteId: frame.websiteId,
          targetUrl: frame.targetUrl,
          renderWebsite: frame.renderWebsite,
          isInternalDashboard: frame.isInternalDashboard,
          visualizationMode: frame.visualizationMode,
        })),
    [frameItems],
  )

  const visualizationWebsiteFramesKey = useMemo(
    () => JSON.stringify(visualizationWebsiteFrames),
    [visualizationWebsiteFrames],
  )

  const visualizationWebsiteFramesRef = useRef(visualizationWebsiteFrames)

  useEffect(() => {
    visualizationWebsiteFramesRef.current = visualizationWebsiteFrames
  }, [visualizationWebsiteFrames])

  const sendVisualizationDataToWebsiteFrame = useCallback(
    (frame: Pick<CanvasFrame, 'id' | 'kind' | 'isInternalDashboard' | 'renderWebsite' | 'visualizationMode'>) => {
      if (frame.kind !== 'website' || frame.isInternalDashboard || frame.renderWebsite === false) return
      const contentWindow = websiteIframeRefs.current[frame.id]?.contentWindow
      if (!contentWindow) return

      const viewMode = getCanvasFrameVisualizationMode(frame)
      const frameData = frameVisualizationData[frame.id]
      const items = viewMode ? (frameData?.items ?? []) : []
      const payloadItems = items.map((item) => ({
        ...item,
        badgeLabel: item.count.toLocaleString('nb-NO'),
      }))

      contentWindow.postMessage(
        {
          type: 'umami-clickmap-data',
          items: payloadItems,
          zeroBadgeLabel: '0',
          viewMode: viewMode || 'clickmap',
          includeUnmatched: viewMode === 'clickmap',
        },
        '*',
      )
    },
    [frameVisualizationData],
  )

  useEffect(() => {
    const websiteFrames = visualizationWebsiteFramesRef.current

    setFrameVisualizationData((current) => {
      const validIds = new Set(websiteFrames.map((frame) => frame.id))
      const next = Object.fromEntries(Object.entries(current).filter(([frameId]) => validIds.has(frameId)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })

    const dateRange = getDateRangeFromPeriod(period, customStartDate, customEndDate)
    if (!dateRange) return

    const normalizedSelectedDomain = normalizeDomainForComparison(selectedWebsite?.domain || '')
    const websiteByDomain = new Map<string, string>()
    availableWebsites.forEach((website) => {
      const normalizedDomain = normalizeDomainForComparison(website.domain || '')
      if (normalizedDomain && !websiteByDomain.has(normalizedDomain)) {
        websiteByDomain.set(normalizedDomain, website.id)
      }
    })

    let isActive = true

    const loadVisualizationData = async () => {
      await Promise.all(
        websiteFrames.map(async (frame) => {
          const pagePath = frame.targetUrl ? normalizeUrlToPath(frame.targetUrl) : ''
          if (!pagePath) {
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey: '',
                loading: false,
                error: 'Fant ikke gyldig URL-sti for kortet.',
                items: [],
                path: '',
              },
            }))
            return
          }

          let websiteId = frame.websiteId || selectedWebsite?.id || canvasConfiguredWebsiteId || ''
          if (!websiteId && frame.targetUrl) {
            try {
              const targetDomain = normalizeDomainForComparison(new URL(frame.targetUrl).hostname)
              websiteId = websiteByDomain.get(targetDomain) || ''
            } catch {
              // Ignore invalid target URL.
            }
          }
          if (!websiteId && normalizedSelectedDomain) {
            websiteId = websiteByDomain.get(normalizedSelectedDomain) || ''
          }
          if (!websiteId) {
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey: '',
                loading: false,
                error: 'Fant ikke nettsted for URL-en i kortet.',
                items: [],
                websiteId: '',
                path: pagePath,
              },
            }))
            return
          }

          const mode = getCanvasFrameVisualizationMode(frame)
          if (!mode) return
          const dataset = getClickmapDatasetFromVisualizationMode(mode)
          const requestKey = JSON.stringify({
            websiteId,
            pagePath,
            period,
            customStartDate: customStartDate?.toISOString() ?? null,
            customEndDate: customEndDate?.toISOString() ?? null,
            mode,
            dataset,
          })

          const existing = frameVisualizationDataRef.current[frame.id]
          const hasCompletedSuccessfulResult =
            existing?.requestKey === requestKey && existing.loading === false && existing.error === null
          if (hasCompletedSuccessfulResult) return

          setFrameVisualizationData((current) => ({
            ...current,
            [frame.id]: {
              requestKey,
              loading: true,
              error: null,
              items: existing?.requestKey === requestKey ? existing.items : [],
              websiteId,
              path: pagePath,
            },
          }))

          try {
            const result = await fetchClickmap({
              websiteId,
              startAt: dateRange.startDate.getTime(),
              endAt: dateRange.endDate.getTime(),
              urlPath: pagePath,
              pathOperator: 'equals',
              eventNames: CLICKMAP_EVENTS,
              limit: 400,
              dataset,
            })

            if (!isActive) return
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey,
                loading: false,
                error: null,
                items: result.data ?? [],
                websiteId,
                path: pagePath,
              },
            }))
          } catch (error) {
            if (!isActive) return
            setFrameVisualizationData((current) => ({
              ...current,
              [frame.id]: {
                requestKey,
                loading: false,
                error: error instanceof Error ? error.message : 'Kunne ikke hente visualiseringsdata',
                items: [],
                websiteId,
                path: pagePath,
              },
            }))
          }
        }),
      )
    }

    void loadVisualizationData()

    return () => {
      isActive = false
    }
  }, [
    availableWebsites,
    canvasConfiguredWebsiteId,
    customEndDate,
    customStartDate,
    period,
    selectedWebsite?.domain,
    selectedWebsite?.id,
    visualizationWebsiteFramesKey,
  ])

  useEffect(() => {
    const websiteFrames = visualizationWebsiteFramesRef.current
    websiteFrames.forEach((frame) => {
      sendVisualizationDataToWebsiteFrame(frame)
    })
  }, [frameVisualizationData, sendVisualizationDataToWebsiteFrame, visualizationWebsiteFramesKey])

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
        const categories = await fetchCategories(projectId, dashboardId)
        if (!isActive) return
        setCanvasCategories(categories)
        if (categories.length > 0) {
          setActiveCanvasCategoryId((current) =>
            current && categories.some((category) => category.id === current)
              ? current
              : initialCategoryId && categories.some((category) => category.id === initialCategoryId)
                ? initialCategoryId
                : categories[0].id,
          )
        } else {
          setActiveCanvasCategoryId(null)
        }

        const framesFromStorage: CanvasFrame[] = []
        const connectionsFromStorage: CanvasConnection[] = []
        for (const category of categories) {
          const graphs = await fetchGraphs(projectId, dashboardId, category.id)
          for (const graph of graphs) {
            if (graph.graphType !== 'TEXT') continue
            if ((graph.description || '').toLowerCase().split(/\s+/).includes(CANVAS_DASHBOARD_TOKEN) === false)
              continue

            const queries = await fetchQueries(projectId, dashboardId, category.id, graph.id)
            const configQuery = queries.find((query) => query.name === CANVAS_QUERY_NAME) ?? queries[0]
            const parsedConfig = parseCanvasConfig(configQuery?.sqlText || '')
            if (!parsedConfig) continue

            if (parsedConfig.kind === 'connection') {
              connectionsFromStorage.push({
                id: `stored-connection-${graph.id}`,
                fromFrameId: parsedConfig.fromFrameId,
                toFrameId: parsedConfig.toFrameId,
                fromGraphId: parsedConfig.fromGraphId,
                toGraphId: parsedConfig.toGraphId,
                categoryId: category.id,
                graphId: graph.id,
                queryId: configQuery?.id,
              })
              continue
            }
            if (!isRenderableCanvasFrameKind(parsedConfig.kind)) continue

            framesFromStorage.push({
              id: `stored-${graph.id}`,
              kind: parsedConfig.kind,
              websiteId: parsedConfig.websiteId,
              targetUrl: parsedConfig.targetUrl,
              previewUrl: parsedConfig.previewUrl,
              renderWebsite: parsedConfig.renderWebsite,
              isInternalDashboard: parsedConfig.isInternalDashboard,
              visualizationMode: parsedConfig.visualizationMode,
              headingText: parsedConfig.headingText,
              headingFontSize: parsedConfig.headingFontSize,
              textContent: parsedConfig.textContent,
              tableHeaders: parsedConfig.tableHeaders,
              tableRows: parsedConfig.tableRows,
              iconName: parsedConfig.iconName,
              iconRotationDeg: parsedConfig.iconRotationDeg,
              iconColor: parsedConfig.iconColor,
              figureType: parsedConfig.figureType,
              figureColor: parsedConfig.figureColor,
              drawingPath: parsedConfig.drawingPath,
              drawingStrokeStyles: parsedConfig.drawingStrokeStyles,
              drawingStrokeWidth: parsedConfig.drawingStrokeWidth,
              drawingColor: parsedConfig.drawingColor,
              isIllustration:
                typeof parsedConfig.isIllustration === 'boolean'
                  ? parsedConfig.isIllustration
                  : parsedConfig.kind === 'image' && isIllustrationPath(parsedConfig.targetUrl),
              imageRotationDeg: parsedConfig.imageRotationDeg,
              chartType: parsedConfig.chartType,
              chartSql: parsedConfig.chartSql,
              label: parsedConfig.label || graph.name,
              x: parsedConfig.x,
              y: parsedConfig.y,
              width: parsedConfig.width,
              height: parsedConfig.height,
              categoryId: category.id,
              graphId: graph.id,
              queryId: configQuery?.id,
              refreshNonce: 0,
            })
          }
        }

        if (!isActive) return
        setFrames(framesFromStorage)
        setConnections(connectionsFromStorage)
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
          setCanvasTitle('Innblikk: Canvas')
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
        setCanvasTitle('Innblikk: Canvas')
        setCanvasDashboardDescription(CANVAS_DASHBOARD_TOKEN)
        setCanvasConfiguredWebsiteId(null)
      }
    }

    void loadCanvasTitle()
    return () => {
      isActive = false
    }
  }, [canPersistToDashboard, isCanvasFrontpage, projectId, dashboardId])

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
        setCreateCanvasProjectOptions(options)
        setCreateCanvasProjectId((current) => {
          if (current && options.some((option) => String(option.id) === current)) return current
          if (projectId !== null && options.some((option) => option.id === projectId)) return String(projectId)
          return options[0] ? String(options[0].id) : ''
        })
      } catch (error) {
        if (!isActive) return
        setCreateCanvasProjectOptions([])
        setCreateCanvasProjectId('')
        setCreateCanvasError(error instanceof Error ? error.message : 'Kunne ikke laste team')
      }
    })()
    return () => {
      isActive = false
    }
  }, [projectId, shouldShowCreateCanvasModal])

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
      const titleBlockHeight = sectionTitle ? 110 : 0
      const baseX = Math.max(0, pointer.x)
      const baseY = Math.max(-CANVAS_TOP_BUFFER, pointer.y)
      const stickyStartY = baseY + titleBlockHeight
      const timestampSeed = Date.now()
      const framesToPersist: CanvasFrame[] = []
      const isTableImport =
        Array.isArray(pendingCsvStickyImport.tableHeaders) &&
        pendingCsvStickyImport.tableHeaders.length > 0 &&
        Array.isArray(pendingCsvStickyImport.tableRows)

      if (sectionTitle) {
        framesToPersist.push({
          id: `csv-section-title-${timestampSeed}`,
          kind: 'heading',
          headingText: sectionTitle,
          headingFontSize: HEADING_FONT_SIZE_DEFAULT,
          label: sectionTitle,
          x: baseX,
          y: baseY,
          width: stickyWidth * 2 + columnGap,
          height: 86,
          refreshNonce: 0,
        })
      }

      if (isTableImport) {
        const tableRowCount = pendingCsvStickyImport.tableRows?.length ?? 0
        framesToPersist.push({
          id: `csv-table-${timestampSeed}`,
          kind: 'text',
          tableHeaders: pendingCsvStickyImport.tableHeaders,
          tableRows: pendingCsvStickyImport.tableRows,
          label: 'Tabell',
          x: baseX,
          y: stickyStartY,
          width: 700,
          height: estimateTableFrameHeight(tableRowCount),
          refreshNonce: 0,
        })
      } else if (pendingCsvStickyImport.aggregatedRatingsText) {
        const summaryText = pendingCsvStickyImport.aggregatedRatingsText || ''
        framesToPersist.push({
          id: `csv-rating-summary-${timestampSeed}`,
          kind: 'sticky',
          textContent: summaryText,
          label: 'Post-it-lapp',
          x: baseX,
          y: stickyStartY,
          width: stickyWidth,
          height: 320,
          refreshNonce: 0,
        })
      } else {
        pendingCsvStickyImport.noteTexts.forEach((content, rowIndex) => {
          const columnIndex = rowIndex % cardsPerRow
          const gridRowIndex = Math.floor(rowIndex / cardsPerRow)
          framesToPersist.push({
            id: `csv-sticky-${timestampSeed}-${rowIndex}`,
            kind: 'sticky',
            textContent: content,
            label: 'Post-it-lapp',
            x: baseX + columnIndex * (stickyWidth + columnGap),
            y: stickyStartY + gridRowIndex * (stickyHeight + stickyGap),
            width: stickyWidth,
            height: stickyHeight,
            refreshNonce: 0,
          })
        })
      }

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
    [cancelPendingFramePlacement, getCanvasPointerPosition, pendingCsvStickyImport, persistFrame],
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
      const defaults = getDefaultFrameSize(frame)
      const width = frame.width ?? defaults.width
      const height = frame.height ?? defaults.height
      return {
        left: frame.x,
        top: frame.y,
        right: frame.x + width,
        bottom: frame.y + height,
      }
    },
    [],
  )

  const getFrameAnchor = useCallback((frame: CanvasFrame, side: ConnectionAnchorSide): { x: number; y: number } => {
    const defaults = getDefaultFrameSize(frame)
    const width = frame.width ?? defaults.width
    const height = frame.height ?? defaults.height
    const headerHeight =
      frame.kind === 'website' ? WEBSITE_CARD_HEADER_HEIGHT : frame.kind === 'icon' ? ICON_CARD_HEADER_HEIGHT : 0
    const bodyTop = frame.y + headerHeight
    const bodyHeight = Math.max(height - headerHeight, 0)
    const centerX = frame.x + width / 2
    const centerY = bodyTop + bodyHeight / 2

    if (side === 'top') return { x: centerX, y: bodyTop }
    if (side === 'bottom') return { x: centerX, y: frame.y + height }
    if (side === 'left') return { x: frame.x, y: centerY }
    return { x: frame.x + width, y: centerY }
  }, [])

  const getDominantDirectionSide = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number): ConnectionAnchorSide => {
      const dx = toX - fromX
      const dy = toY - fromY
      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? 'right' : 'left'
      }
      return dy >= 0 ? 'bottom' : 'top'
    },
    [],
  )

  const getNearestAnchorSide = useCallback(
    (frame: CanvasFrame, pointX: number, pointY: number): ConnectionAnchorSide => {
      const defaults = getDefaultFrameSize(frame)
      const width = frame.width ?? defaults.width
      const height = frame.height ?? defaults.height
      const headerHeight =
        frame.kind === 'website' ? WEBSITE_CARD_HEADER_HEIGHT : frame.kind === 'icon' ? ICON_CARD_HEADER_HEIGHT : 0
      const bodyTop = frame.y + headerHeight
      const distances: Array<{ side: ConnectionAnchorSide; distance: number }> = [
        { side: 'left', distance: Math.abs(pointX - frame.x) },
        { side: 'right', distance: Math.abs(pointX - (frame.x + width)) },
        { side: 'top', distance: Math.abs(pointY - bodyTop) },
        { side: 'bottom', distance: Math.abs(pointY - (frame.y + height)) },
      ]
      distances.sort((a, b) => a.distance - b.distance)
      return distances[0]?.side ?? 'left'
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

  const loadChartOptions = useCallback(async () => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) {
      setChartOptions([])
      setSelectedChartOptionId('')
      return
    }

    setIsLoadingChartOptions(true)
    setAddChartError(null)

    try {
      const categories = await fetchCategories(projectId, dashboardId)
      const options: CanvasChartOption[] = []

      for (const category of categories) {
        const graphs = await fetchGraphs(projectId, dashboardId, category.id)
        for (const graph of graphs) {
          const mappedType = mapGraphTypeToChart(graph.graphType)
          if (mappedType !== 'line' && mappedType !== 'bar' && mappedType !== 'pie' && mappedType !== 'table') {
            continue
          }

          const queries = await fetchQueries(projectId, dashboardId, category.id, graph.id)
          const primaryQuery = queries[0]
          if (!primaryQuery?.sqlText) continue

          options.push({
            id: `${category.id}:${graph.id}:${primaryQuery.id}`,
            title: graph.name || `Graf ${graph.id}`,
            chartType: mappedType,
            sql: primaryQuery.sqlText,
          })
        }
      }

      setChartOptions(options)
      setSelectedChartOptionId((prev) => {
        if (prev && options.some((option) => option.id === prev)) return prev
        return options[0]?.id || ''
      })
    } catch (error) {
      setAddChartError(error instanceof Error ? error.message : 'Kunne ikke laste grafer')
    } finally {
      setIsLoadingChartOptions(false)
    }
  }, [canPersistToDashboard, projectId, dashboardId])

  const handleOpenAddChartModal = () => {
    const hasWebsiteContext = Boolean(selectedWebsite?.id || canvasConfiguredWebsiteId)
    if (!hasWebsiteContext) {
      setCanvasSettingsInfo('Velg nettside i canvas-innstillinger før du importerer graf.')
      setIsCanvasSettingsModalOpen(true)
      return
    }
    setAddChartError(null)
    setIsGrafbyggerEmbedded(false)
    setIsAddChartModalOpen(true)
    void loadChartOptions()
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

    const idsToMove = selectedFrameIds.includes(frame.id) ? selectedFrameIds : [frame.id]
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

  const getDefaultFrameSize = (
    frameOrKind: CanvasFrame | CanvasFrame['kind'],
  ): { width: number; height: number; minWidth: number; minHeight: number } => {
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
    return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
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
  }

  const handleStartEditingFrame = (id: string) => {
    setActiveEditableFrameId(id)
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

  const handleImportStickyCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) return
    if (selectedFiles.length > 1) {
      setImportStickyCsvError('Velg kun én CSV-fil.')
      return
    }
    const selectedFile = selectedFiles[0]
    if (!selectedFile) return

    try {
      const content = await selectedFile.text()
      const parsed = parseCsvImportText(content)
      if (parsed.headers.length === 0) {
        setImportStickyCsvError(parsed.error ?? 'Filen ser ikke ut som en CSV med kolonneoverskrifter.')
        setImportStickyCsvFileName(selectedFile.name)
        setImportStickyCsvHeaders([])
        setImportStickyCsvRows([])
        setImportStickyContentColumn('')
        return
      }

      setImportStickyCsvFileName(selectedFile.name)
      setImportStickyCsvHeaders(parsed.headers)
      setImportStickyCsvRows(parsed.rows)
      setImportStickyExcludedRowIndexes([])
      setImportStickyStyle('sticky')
      setImportStickyTableMode('rows')
      setImportStickyTablePreviewPage(1)
      setImportStickyPrivacyReviewed(false)
      const resolvedContentColumn =
        importStickyContentColumn && parsed.headers.includes(importStickyContentColumn)
          ? importStickyContentColumn
          : (parsed.headers[0] ?? '')
      setImportStickyContentColumn(resolvedContentColumn)
      setImportStickySectionTitle(resolvedContentColumn)
      setImportStickyCsvError(parsed.rows.length === 0 ? 'CSV-filen har ingen rader med innhold.' : null)
    } catch {
      setImportStickyCsvError('Kunne ikke lese CSV-filen.')
      setImportStickyCsvFileName('')
      setImportStickyCsvHeaders([])
      setImportStickyCsvRows([])
      setImportStickyContentColumn('')
      setImportStickyStyle('sticky')
      setImportStickyTableMode('rows')
      setImportStickyTablePreviewPage(1)
      setImportStickyExcludedRowIndexes([])
      setImportStickyPrivacyReviewed(false)
    }
  }

  const handleImportStickyCsv = () => {
    const contentColumn =
      importStickyContentColumn && importStickyCsvHeaders.includes(importStickyContentColumn)
        ? importStickyContentColumn
        : ''
    if (!contentColumn) {
      setImportStickyCsvError('Velg kolonnen som skal importeres.')
      return
    }

    if (importStickyCsvRows.length === 0) {
      setImportStickyCsvError('CSV-filen har ingen rader med innhold.')
      return
    }

    const noteTexts = importStickyPreviewNotes.map((item) => item.text)
    if (noteTexts.length === 0) {
      setImportStickyCsvError('Fant ingen rader med innhold i valgt kolonne.')
      return
    }
    if (hasImportStickyPrivacyFindings && !importStickyPrivacyReviewed) {
      setImportStickyCsvError('Mulige personopplysninger funnet. Gå gjennom treffene før import.')
      return
    }

    const numericSummary = summarizeNumericRatings(noteTexts)
    const aggregatedRatingsText = numericSummary ? buildNumericRatingSummaryText(numericSummary) : undefined
    const categoricalSummaryRows = summarizeCategoricalValues(noteTexts)
    const tableHeaders = numericSummary
      ? [contentColumn, 'Antall', 'Andel']
      : importStickyStyle === 'table'
        ? importStickyTableMode === 'summary'
          ? [contentColumn, 'Antall', 'Andel']
          : [contentColumn]
        : undefined
    const tableRows = numericSummary
      ? numericSummary.distribution.map((item) => [
          formatRatingValue(item.value),
          item.count.toLocaleString('nb-NO'),
          `${item.percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %`,
        ])
      : importStickyStyle === 'table'
        ? importStickyTableMode === 'summary'
          ? categoricalSummaryRows.map((item) => [
              item.value,
              item.count.toLocaleString('nb-NO'),
              `${item.percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %`,
            ])
          : noteTexts.map((text) => [text])
        : undefined

    setImportStickyCsvError(null)
    setPendingCsvStickyImport({
      sectionTitle: importStickySectionTitle.trim(),
      noteTexts,
      aggregatedRatingsText,
      tableHeaders,
      tableRows,
    })
    setPendingFramePlacementLabel(
      tableHeaders && tableRows ? 'tabell' : aggregatedRatingsText ? 'aggregert vurdering' : 'CSV-lapper',
    )
    setPendingFramePointer(null)
    setIsImportStickyCsvModalOpen(false)
  }

  const handleOpenAddStickyModal = () => {
    setAddStickyError(null)
    setIsAddStickyModalOpen(true)
  }

  const handleOpenImportStickyCsvModal = () => {
    setImportStickyCsvError(null)
    setImportStickyCsvFileName('')
    setImportStickyCsvHeaders([])
    setImportStickyCsvRows([])
    setImportStickyContentColumn('')
    setImportStickyStyle('sticky')
    setImportStickyTableMode('rows')
    setImportStickyTablePreviewPage(1)
    setImportStickySectionTitle('')
    setImportStickyExcludedRowIndexes([])
    setImportStickyPrivacyReviewed(false)
    if (importStickyCsvFileInputRef.current) {
      importStickyCsvFileInputRef.current.value = ''
    }
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
          onOpenImportStickyCsv={handleOpenImportStickyCsvModal}
          onOpenAddImage={handleOpenAddImageModal}
          onOpenAddIcon={handleOpenAddIconModal}
          onOpenAddFigure={handleOpenAddFigureModal}
          onOpenAddDrawing={handleOpenAddDrawing}
          onOpenAddIllustration={handleOpenAddIllustrationModal}
          onOpenCreateChart={handleOpenGrafbyggerFromAddMenu}
          onOpenImportChart={handleOpenAddChartModal}
          isGrafbyggerEmbedded={isGrafbyggerEmbedded}
          onCloseGrafbygger={() => setIsGrafbyggerEmbedded(false)}
          onOpenCreateTab={handleOpenCreateTabModal}
          onOpenManageTabs={handleOpenManageTabsModal}
          onOpenCanvasSettings={handleOpenCanvasSettingsModal}
          onOpenInventory={handleOpenInventoryModal}
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
                {frameItems.map((frame) =>
                  (() => {
                    const defaults = getDefaultFrameSize(frame)
                    const isIllustrationFrame = isIllustrationImageFrame(frame)
                    const isSelectedFrame = selectedFrameIds.includes(frame.id)
                    const isWebsiteInsightOpen = frame.kind === 'website' && activeInsightFrameId === frame.id
                    const websiteInsight = pageInsights[frame.id]
                    const visualizationMode = frame.kind === 'website' ? getCanvasFrameVisualizationMode(frame) : ''
                    const visualizationData = frame.kind === 'website' ? frameVisualizationData[frame.id] : undefined
                    const isTableTextFrame =
                      frame.kind === 'text' &&
                      Array.isArray(frame.tableHeaders) &&
                      frame.tableHeaders.length > 0 &&
                      Array.isArray(frame.tableRows)
                    return (
                      <article
                        key={frame.id}
                        tabIndex={0}
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
                                        : 'group absolute flex flex-col overflow-hidden rounded-xl border border-[#f1dc7d] bg-[#fff5b8] shadow-sm'
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
                            frame.kind === 'heading'
                              ? `${getHeadingFrameWidth(frame)}px`
                              : `${frame.width ?? defaults.width}px`,
                          height:
                            frame.kind === 'heading'
                              ? `${getHeadingFrameHeight(frame) + HEADING_CARD_HEADER_HEIGHT}px`
                              : `${frame.height ?? defaults.height}px`,
                          minWidth: frame.kind === 'heading' ? `${HEADING_TEXT_MIN_WIDTH}px` : `${defaults.minWidth}px`,
                          minHeight:
                            frame.kind === 'heading'
                              ? `${HEADING_CARD_HEADER_HEIGHT + 12}px`
                              : `${defaults.minHeight}px`,
                        }}
                      >
                        {frame.kind === 'website' && !frame.isInternalDashboard && (
                          <header
                            className={
                              'flex cursor-move items-start justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-2'
                            }
                            onMouseDown={(event) => handleDragStart(event, frame)}
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
                                        Visualiseringen er basert på totale klikk på interaktive elementer, ikke antall
                                        brukere.
                                      </HelpText>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {visualizationMode && (
                                <div className="flex h-4 w-4 items-center justify-center">
                                  {visualizationData?.loading ? (
                                    <Loader size="xsmall" title="Henter kartdata..." />
                                  ) : null}
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {frame.kind === 'website' && !frame.isInternalDashboard && (
                                <Button
                                  size="xsmall"
                                  variant="tertiary"
                                  icon={<ChartNoAxesCombined size={14} />}
                                  className="whitespace-nowrap"
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={() => handleToggleInsightPanel(frame)}
                                  title={selectedWebsite ? 'Vis/skjul innsikt' : 'Velg nettsted først'}
                                  aria-label={activeInsightFrameId === frame.id ? 'Skjul innsikt' : 'Vis innsikt'}
                                  disabled={!selectedWebsite}
                                >
                                  {activeInsightFrameId === frame.id ? 'Skjul' : 'Innsikt'}
                                </Button>
                              )}
                              <ActionMenu>
                                <ActionMenu.Trigger>
                                  <Button
                                    size="xsmall"
                                    variant="tertiary"
                                    icon={<MoreVertical size={14} />}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    title="Flere valg"
                                    aria-label="Flere valg"
                                  />
                                </ActionMenu.Trigger>
                                <ActionMenu.Content align="end">
                                  <ActionMenu.Item onClick={() => handleRefreshFrame(frame.id)}>
                                    <span className="inline-flex items-center gap-2">
                                      <RefreshCw size={14} aria-hidden="true" />
                                      <span>Last inn på nytt</span>
                                    </span>
                                  </ActionMenu.Item>
                                  <ActionMenu.Item onClick={() => handleDuplicateWebsiteCard(frame)}>
                                    <span className="inline-flex items-center gap-2">
                                      <Copy size={14} aria-hidden="true" />
                                      <span>Dupliser</span>
                                    </span>
                                  </ActionMenu.Item>
                                  <ActionMenu.Item
                                    onClick={() => {
                                      if (frame.isInternalDashboard) {
                                        handleOpenEditDashboardModal(frame)
                                      } else {
                                        handleOpenEditWebsiteModal(frame)
                                      }
                                    }}
                                  >
                                    <span className="inline-flex items-center gap-2">
                                      <Edit2 size={14} aria-hidden="true" />
                                      <span>
                                        {frame.isInternalDashboard ? 'Rediger dashboard' : 'Rediger nettside'}
                                      </span>
                                    </span>
                                  </ActionMenu.Item>
                                  <ActionMenu.Item onClick={() => handleRequestRemoveFrame(frame)}>
                                    <span className="inline-flex items-center gap-2">
                                      <Trash2 size={14} aria-hidden="true" />
                                      <span>Fjern kort</span>
                                    </span>
                                  </ActionMenu.Item>
                                </ActionMenu.Content>
                              </ActionMenu>
                            </div>
                          </header>
                        )}
                        {frame.kind === 'chart' && (
                          <div
                            className="pointer-events-none absolute inset-0 z-20 overflow-visible"
                            aria-hidden="true"
                          >
                            <div
                              className="pointer-events-auto absolute inset-x-2 top-0 h-3 cursor-move"
                              onMouseDown={(event) => handleDragStart(event, frame)}
                            />
                            <div
                              className="pointer-events-auto absolute inset-x-2 bottom-0 h-3 cursor-move"
                              onMouseDown={(event) => handleDragStart(event, frame)}
                            />
                            <div
                              className="pointer-events-auto absolute inset-y-2 left-0 w-3 cursor-move"
                              onMouseDown={(event) => handleDragStart(event, frame)}
                            />
                            <div
                              className="pointer-events-auto absolute inset-y-2 right-0 w-3 cursor-move"
                              onMouseDown={(event) => handleDragStart(event, frame)}
                            />
                          </div>
                        )}
                        {(frame.kind === 'sticky' ||
                          frame.kind === 'text' ||
                          frame.kind === 'heading' ||
                          frame.kind === 'icon' ||
                          frame.kind === 'figure' ||
                          frame.kind === 'drawing' ||
                          frame.kind === 'image' ||
                          frame.kind === 'website') && (
                          <>
                            <div
                              className="pointer-events-none absolute inset-0 z-20 overflow-visible"
                              aria-hidden="true"
                            >
                              <div
                                className="pointer-events-auto absolute inset-x-2 top-0 h-3 cursor-move"
                                onMouseDown={(event) => handleDragStart(event, frame)}
                              />
                              <div
                                className="pointer-events-auto absolute inset-x-2 bottom-0 h-3 cursor-move"
                                onMouseDown={(event) => handleDragStart(event, frame)}
                              />
                              <div
                                className="pointer-events-auto absolute inset-y-2 left-0 w-3 cursor-move"
                                onMouseDown={(event) => handleDragStart(event, frame)}
                              />
                              <div
                                className="pointer-events-auto absolute inset-y-2 right-0 w-3 cursor-move"
                                onMouseDown={(event) => handleDragStart(event, frame)}
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
                              onDecreaseHeadingFontSize={() =>
                                handleAdjustHeadingFontSize(frame.id, -HEADING_FONT_SIZE_STEP)
                              }
                              onIncreaseHeadingFontSize={() =>
                                handleAdjustHeadingFontSize(frame.id, HEADING_FONT_SIZE_STEP)
                              }
                              onRotateIllustrationLeft={() =>
                                handleRotateIllustrationFrame(frame.id, -ICON_ROTATION_STEP_DEG)
                              }
                              onRotateIllustrationRight={() =>
                                handleRotateIllustrationFrame(frame.id, ICON_ROTATION_STEP_DEG)
                              }
                              onRemoveFrame={() => handleRequestRemoveFrame(frame)}
                            />
                          </>
                        )}
                        {(frame.kind === 'heading' ||
                          frame.kind === 'text' ||
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
                            frame.kind === 'website' || frame.kind === 'image'
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
                                    connectionDragState?.sourceFrameId === frame.id
                                      ? 'bg-[var(--ax-border-accent)]'
                                      : ''
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
                                    connectionDragState?.sourceFrameId === frame.id
                                      ? 'bg-[var(--ax-border-accent)]'
                                      : ''
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                className={`pointer-events-auto absolute left-1/2 top-[-12px] flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full bg-transparent opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100 ${
                                  connectionDragState?.sourceFrameId === frame.id ? 'opacity-100' : ''
                                }`}
                                aria-label="Kobling"
                                title="Dra for å koble"
                                onMouseDown={(event) => startConnectionDrag(event, frame, 'top')}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`pointer-events-none h-3.5 w-3.5 rounded-full border border-[var(--ax-border-accent)] bg-[var(--ax-bg-default)] shadow-sm ${
                                    connectionDragState?.sourceFrameId === frame.id
                                      ? 'bg-[var(--ax-border-accent)]'
                                      : ''
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
                                    connectionDragState?.sourceFrameId === frame.id
                                      ? 'bg-[var(--ax-border-accent)]'
                                      : ''
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
                          {frame.kind === 'website' && frame.src && frame.displayUrl ? (
                            <div className="flex h-full flex-col bg-white">
                              {isWebsiteInsightOpen && (
                                <div className="shrink-0 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ax-text-subtle)]">
                                    Sideinnsikt
                                  </div>
                                  <div className="mt-1 text-sm text-[var(--ax-text-subtle)]">
                                    Periode: {activeInsightPeriodLabel}
                                  </div>
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
                                          {(websiteInsight.data.proportion * 100).toLocaleString('nb-NO', {
                                            maximumFractionDigits: 1,
                                          })}
                                          %
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-sm text-[var(--ax-text-subtle)]">
                                      Ingen trafikk funnet for denne siden i valgt periode.
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
                                {isImagePreviewUrl(frame.displayUrl) ? (
                                  <img
                                    key={`${frame.id}-${frame.refreshNonce}`}
                                    alt={frame.label}
                                    src={frame.src}
                                    className="block h-auto w-full max-w-full"
                                    loading="lazy"
                                  />
                                ) : (
                                  <iframe
                                    key={`${frame.id}-${frame.refreshNonce}`}
                                    title={`Canvas-side ${frame.label}`}
                                    src={frame.src}
                                    className="h-full w-full"
                                    loading="lazy"
                                    sandbox="allow-same-origin allow-scripts allow-forms"
                                    ref={(node) => {
                                      websiteIframeRefs.current[frame.id] = node
                                    }}
                                    onLoad={() => sendVisualizationDataToWebsiteFrame(frame)}
                                  />
                                )}
                              </div>
                            </div>
                          ) : frame.kind === 'website' ? (
                            <div className="flex h-full flex-col bg-white">
                              {isWebsiteInsightOpen && (
                                <div className="shrink-0 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ax-text-subtle)]">
                                    Sideinnsikt
                                  </div>
                                  <div className="mt-1 text-sm text-[var(--ax-text-subtle)]">
                                    Periode: {activeInsightPeriodLabel}
                                  </div>
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
                                          {(websiteInsight.data.proportion * 100).toLocaleString('nb-NO', {
                                            maximumFractionDigits: 1,
                                          })}
                                          %
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-sm text-[var(--ax-text-subtle)]">
                                      Ingen trafikk funnet for denne siden i valgt periode.
                                    </div>
                                  )}
                                </div>
                              )}
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
                            </div>
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
                                            onClick={() =>
                                              void handleAssignWebsiteToChart(frame, pickerSelectedWebsite ?? null)
                                            }
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
                                  strokeColor={getCanvasIconColor(frame.drawingColor)}
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
                              isEditing={activeEditableFrameId === frame.id}
                              onChange={handleEditableFrameChange}
                              onBlur={handleEditableFrameBlur}
                              onStartEditing={handleStartEditingFrame}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--ax-text-subtle)]">
                              Kunne ikke lage forhåndsvisning for denne siden.
                            </div>
                          )}
                        </div>
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
                <ActionMenu>
                  <ActionMenu.Trigger>
                    <div className="rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
                      <Button size="xsmall" variant="tertiary" icon={<Plus size={14} />} className="rounded-full px-2">
                        Legg til
                      </Button>
                    </div>
                  </ActionMenu.Trigger>
                  <ActionMenu.Content align="end">
                    <ActionMenu.Item onClick={handleOpenAddPageModal}>Nettside</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenGrafbyggerFromAddMenu}>Lag ny graf</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddChartModal}>Importer graf</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddDashboardModal}>Dashboard</ActionMenu.Item>
                    <ActionMenu.Divider />
                    <ActionMenu.Item onClick={handleOpenAddHeadingModal}>Overskrift</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddTextModal}>Tekst</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddStickyModal}>Post-it-lapp</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenImportStickyCsvModal}>CSV-feedback (Post-it)</ActionMenu.Item>
                    <ActionMenu.Divider />
                    <ActionMenu.Item onClick={handleOpenAddImageModal}>Bilde</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddIconModal}>Ikon</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddFigureModal}>Figur</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddDrawing}>Tegning</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddIllustrationModal}>Illustrasjoner</ActionMenu.Item>
                    <ActionMenu.Divider />
                    <ActionMenu.Item onClick={handleOpenCreateTabModal}>Legg til fane</ActionMenu.Item>
                  </ActionMenu.Content>
                </ActionMenu>
                <div className="flex items-center gap-1 rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
                  <Button
                    size="xsmall"
                    variant="tertiary"
                    icon={<Minus size={14} />}
                    onClick={() => handleCanvasZoomChange(canvasZoom - CANVAS_ZOOM_STEP)}
                    title="Zoom ut"
                    aria-label="Zoom ut"
                  />
                  <Button
                    size="xsmall"
                    variant="tertiary"
                    onClick={handleCanvasZoomReset}
                    title="Tilbakestill zoom"
                    aria-label={`${Math.round(canvasZoom * 100)}% Tilbakestill zoom`}
                  >
                    {Math.round(canvasZoom * 100)}%
                  </Button>
                  <Button
                    size="xsmall"
                    variant="tertiary"
                    icon={<Plus size={14} />}
                    onClick={() => handleCanvasZoomChange(canvasZoom + CANVAS_ZOOM_STEP)}
                    title="Zoom inn"
                    aria-label="Zoom inn"
                  />
                </div>
              </>
            )}
          </div>
        </aside>
      </section>

      <Modal
        open={shouldShowCreateCanvasModal && !isCreateTeamModalOpen}
        onClose={() => {
          // Keep modal open until user creates or navigates away.
        }}
        header={{ heading: 'Lag canvas', closeButton: false }}
        width="small"
        closeOnBackdropClick={false}
      >
        <Modal.Body>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="create-canvas-team-select">Team</Label>
                <Button
                  variant="tertiary"
                  size="small"
                  type="button"
                  icon={<Plus aria-hidden size={16} />}
                  onClick={() => {
                    setCreateTeamError(null)
                    setIsCreateTeamModalOpen(true)
                  }}
                  disabled={isCreatingCanvas}
                >
                  Nytt team
                </Button>
              </div>
              <Select
                id="create-canvas-team-select"
                label="Team"
                hideLabel
                value={createCanvasProjectId}
                onChange={(event) => {
                  setCreateCanvasProjectId(event.target.value)
                  if (createCanvasError) setCreateCanvasError(null)
                }}
                disabled={isCreatingCanvas}
              >
                <option value="" disabled>
                  {createCanvasProjectOptions.length === 0 ? 'Laster team...' : 'Velg team'}
                </option>
                {createCanvasProjectOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>
            <TextField
              label="Canvas-navn"
              value={createCanvasNameInput}
              onChange={(event) => {
                setCreateCanvasNameInput(event.target.value)
                if (createCanvasError) setCreateCanvasError(null)
              }}
              disabled={isCreatingCanvas}
            />
            {createCanvasError && <Alert variant="error">{createCanvasError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleCreateCanvas()} size="small" loading={isCreatingCanvas}>
            Lag canvas
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isCreateTeamModalOpen}
        onClose={() => {
          if (isCreatingTeam) return
          setIsCreateTeamModalOpen(false)
          setCreateTeamError(null)
        }}
        header={{ heading: 'Nytt team' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              label="Navn"
              size="small"
              value={createTeamNameInput}
              onChange={(event) => {
                setCreateTeamNameInput(event.target.value)
                if (createTeamError) setCreateTeamError(null)
              }}
            />
            <TextField
              label="Beskrivelse (valgfri)"
              size="small"
              value={createTeamDescriptionInput}
              onChange={(event) => {
                setCreateTeamDescriptionInput(event.target.value)
                if (createTeamError) setCreateTeamError(null)
              }}
            />
            {createTeamError && <Alert variant="error">{createTeamError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button size="small" onClick={() => void handleCreateTeam()} loading={isCreatingTeam}>
            Opprett
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              setIsCreateTeamModalOpen(false)
              setCreateTeamError(null)
            }}
            disabled={isCreatingTeam}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

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

      <Modal
        open={isAddImageModalOpen}
        onClose={() => {
          setIsAddImageModalOpen(false)
          setAddImageError(null)
        }}
        header={{ heading: 'Legg til bilde i canvas' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              size="small"
              label="Bilde-URL"
              value={newImageUrlInput}
              onChange={(event) => {
                setNewImageUrlInput(event.target.value)
                if (addImageError) setAddImageError(null)
              }}
              autoFocus
            />
            {addImageError && <Alert variant="error">{addImageError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddImage()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button variant="secondary" size="small" onClick={() => setIsAddImageModalOpen(false)}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddIllustrationModalOpen}
        onClose={() => {
          setIsAddIllustrationModalOpen(false)
          setEditIllustrationFrameId(null)
          setAddIllustrationError(null)
        }}
        header={{ heading: editIllustrationFrameId ? 'Rediger Nav-illustrasjon' : 'Legg til Nav-illustrasjon' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <CanvasIllustrationPicker
              selectedPath={selectedIllustrationPath}
              onSelectPath={(path) => {
                setSelectedIllustrationPath(path)
                if (addIllustrationError) setAddIllustrationError(null)
              }}
            />
            {addIllustrationError && <Alert variant="error">{addIllustrationError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddIllustration()} size="small" loading={isSavingCanvasItem}>
            {editIllustrationFrameId ? 'Lagre' : 'Legg til'}
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddIllustrationModalOpen(false)
              setEditIllustrationFrameId(null)
              setAddIllustrationError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddDashboardModalOpen}
        onClose={() => {
          setIsAddDashboardModalOpen(false)
          setAddDashboardError(null)
        }}
        header={{ heading: 'Legg til dashboard i canvas' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Select
              label="Team"
              value={selectedProjectToAddId}
              onChange={(event) => {
                const nextProjectId = event.target.value
                setSelectedProjectToAddId(nextProjectId)
                setSelectedDashboardToAddId('')
                if (addDashboardError) setAddDashboardError(null)
                const parsedProjectId = Number(nextProjectId)
                void loadDashboardOptions(Number.isFinite(parsedProjectId) ? parsedProjectId : null)
              }}
              disabled={isLoadingDashboardOptions}
            >
              <option value="" disabled>
                {isLoadingDashboardOptions ? 'Laster team...' : 'Velg team'}
              </option>
              {projectOptions.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </Select>
            {(isLoadingDashboardOptions || dashboardOptions.length > 0) && (
              <Select
                label="Dashboard"
                value={selectedDashboardToAddId}
                onChange={(event) => {
                  setSelectedDashboardToAddId(event.target.value)
                  if (addDashboardError) setAddDashboardError(null)
                }}
                disabled={isLoadingDashboardOptions}
              >
                <option value="" disabled>
                  {isLoadingDashboardOptions ? 'Laster dashboards...' : 'Velg dashboard'}
                </option>
                {dashboardOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
            {addDashboardError && <Alert variant="error">{addDashboardError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {dashboardOptions.length > 0 && (
            <Button
              onClick={() => void handleAddDashboardCard()}
              size="small"
              loading={isSavingCanvasItem}
              disabled={!selectedDashboardToAddId}
            >
              Legg til
            </Button>
          )}
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddDashboardModalOpen(false)
              setAddDashboardError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isEditDashboardModalOpen}
        onClose={() => {
          setIsEditDashboardModalOpen(false)
          setEditDashboardFrameId(null)
          setEditDashboardError(null)
        }}
        header={{ heading: 'Rediger dashboard' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Select
              label="Team"
              value={editDashboardSelectedProjectId}
              onChange={(event) => {
                const nextProjectId = event.target.value
                setEditDashboardSelectedProjectId(nextProjectId)
                setEditDashboardSelectedDashboardId('')
                if (editDashboardError) setEditDashboardError(null)
                const parsedProjectId = Number(nextProjectId)
                void loadEditDashboardOptions(Number.isFinite(parsedProjectId) ? parsedProjectId : null)
              }}
              disabled={isLoadingEditDashboardOptions}
            >
              <option value="" disabled>
                {isLoadingEditDashboardOptions ? 'Laster team...' : 'Velg team'}
              </option>
              {editDashboardProjectOptions.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </Select>
            {(isLoadingEditDashboardOptions || editDashboardOptions.length > 0) && (
              <Select
                label="Dashboard"
                value={editDashboardSelectedDashboardId}
                onChange={(event) => {
                  setEditDashboardSelectedDashboardId(event.target.value)
                  if (editDashboardError) setEditDashboardError(null)
                }}
                disabled={isLoadingEditDashboardOptions}
              >
                <option value="" disabled>
                  {isLoadingEditDashboardOptions ? 'Laster dashboards...' : 'Velg dashboard'}
                </option>
                {editDashboardOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
            {editDashboardError && <Alert variant="error">{editDashboardError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {editDashboardOptions.length > 0 && (
            <Button
              onClick={() => void handleSaveEditedDashboard()}
              size="small"
              loading={isSavingCanvasItem}
              disabled={!editDashboardSelectedDashboardId}
            >
              Lagre
            </Button>
          )}
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsEditDashboardModalOpen(false)
              setEditDashboardFrameId(null)
              setEditDashboardError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isEditImageModalOpen}
        onClose={() => {
          setIsEditImageModalOpen(false)
          setEditImageFrameId(null)
          setEditImageError(null)
        }}
        header={{ heading: 'Rediger bilde' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              size="small"
              label="Bilde-URL"
              value={editImageUrlInput}
              onChange={(event) => {
                setEditImageUrlInput(event.target.value)
                if (editImageError) setEditImageError(null)
              }}
              autoFocus
            />
            {editImageError && <Alert variant="error">{editImageError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleSaveEditedImage()} size="small" loading={isSavingCanvasItem}>
            Lagre
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsEditImageModalOpen(false)
              setEditImageFrameId(null)
              setEditImageError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isEditIconModalOpen}
        onClose={() => {
          setIsEditIconModalOpen(false)
          setEditIconFrameId(null)
          setEditIconError(null)
        }}
        header={{ heading: 'Rediger ikon' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <CanvasIconPicker
              selectedIconId={editIconSelectedId}
              onSelectIcon={(iconId) => {
                setEditIconSelectedId(iconId)
                if (editIconError) setEditIconError(null)
              }}
            />
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-[var(--ax-text-default)]">Farge</div>
              <div className="flex flex-wrap gap-2">
                {CANVAS_ICON_COLOR_OPTIONS.map((colorOption) => {
                  const isSelected = editIconSelectedColor === colorOption.value
                  return (
                    <button
                      key={colorOption.id}
                      type="button"
                      onClick={() => {
                        setEditIconSelectedColor(colorOption.value)
                        if (editIconError) setEditIconError(null)
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                        isSelected ? 'border-[var(--ax-border-accent)]' : 'border-[var(--ax-border-neutral-subtle)]'
                      }`}
                      aria-label={`Velg farge ${colorOption.label}`}
                      title={colorOption.label}
                    >
                      <span
                        aria-hidden="true"
                        className="h-5 w-5 rounded-full border border-black/10"
                        style={{ backgroundColor: colorOption.value }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
            {editIconError && <Alert variant="error">{editIconError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleSaveEditedIcon()} size="small" loading={isSavingCanvasItem}>
            Lagre
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsEditIconModalOpen(false)
              setEditIconFrameId(null)
              setEditIconError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isEditFigureModalOpen}
        onClose={() => {
          setIsEditFigureModalOpen(false)
          setEditFigureFrameId(null)
          setEditFigureError(null)
        }}
        header={{ heading: 'Rediger figur' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-[var(--ax-text-default)]">Figurtype</div>
              <div className="grid grid-cols-2 gap-2">
                {CANVAS_FIGURE_OPTIONS.map((figureOption) => {
                  const isSelected = editFigureSelectedType === figureOption.id
                  const FigureIcon = figureOption.Icon
                  return (
                    <button
                      key={figureOption.id}
                      type="button"
                      onClick={() => {
                        setEditFigureSelectedType(figureOption.id)
                        if (editFigureError) setEditFigureError(null)
                      }}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left ${
                        isSelected
                          ? 'border-[var(--ax-border-accent)] bg-[var(--ax-bg-accent-soft)]'
                          : 'border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]'
                      }`}
                    >
                      <FigureIcon size={16} aria-hidden="true" />
                      <span className="text-sm text-[var(--ax-text-default)]">{figureOption.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-[var(--ax-text-default)]">Farge</div>
              <div className="flex flex-wrap gap-2">
                {CANVAS_ICON_COLOR_OPTIONS.map((colorOption) => {
                  const isSelected = editFigureSelectedColor === colorOption.value
                  return (
                    <button
                      key={colorOption.id}
                      type="button"
                      onClick={() => {
                        setEditFigureSelectedColor(colorOption.value)
                        if (editFigureError) setEditFigureError(null)
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                        isSelected ? 'border-[var(--ax-border-accent)]' : 'border-[var(--ax-border-neutral-subtle)]'
                      }`}
                      aria-label={`Velg farge ${colorOption.label}`}
                      title={colorOption.label}
                    >
                      <span
                        aria-hidden="true"
                        className="h-5 w-5 rounded-full border border-black/10"
                        style={{ backgroundColor: colorOption.value }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
            {editFigureError && <Alert variant="error">{editFigureError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleSaveEditedFigure()} size="small" loading={isSavingCanvasItem}>
            Lagre
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsEditFigureModalOpen(false)
              setEditFigureFrameId(null)
              setEditFigureError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddPageModalOpen}
        onClose={() => {
          setIsAddPageModalOpen(false)
          setAddPageError(null)
          setNewPagePreviewUrlInput('')
          setNewPageRenderEnabled(true)
          setNewPageVisualizationMode('')
        }}
        header={{ heading: 'Legg til nettside' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <WebsitePicker
              selectedWebsite={selectedWebsite}
              onWebsiteChange={(website) => {
                setSelectedWebsite(website)
                if (addPageError) setAddPageError(null)
              }}
              disableAutoRestore
              variant="default"
              customLabel="Velg nettside"
            />
            <TextField
              size="small"
              label="URL"
              value={newPagePathInput}
              onChange={(event) => {
                setNewPagePathInput(event.target.value)
                if (addPageError) setAddPageError(null)
              }}
              autoFocus
            />
            <Switch
              size="small"
              checked={newPageRenderEnabled}
              onChange={(event) => {
                setNewPageRenderEnabled(event.target.checked)
                if (addPageError) setAddPageError(null)
              }}
            >
              Last inn nettsiden
            </Switch>
            <Switch
              size="small"
              checked={Boolean(newPageVisualizationMode)}
              onChange={(event) => {
                setNewPageVisualizationMode(event.target.checked ? 'clickmap' : '')
                if (addPageError) setAddPageError(null)
              }}
            >
              Legg til visualisering
            </Switch>
            {newPageVisualizationMode && (
              <>
                <VisualizationModeSelect
                  value={newPageVisualizationMode}
                  onChange={(nextMode) => {
                    setNewPageVisualizationMode(nextMode)
                    if (addPageError) setAddPageError(null)
                  }}
                  size="small"
                  label="Visualisering"
                  allowNoneOption={false}
                />
                <p className="text-xs text-[var(--ax-text-subtle)]">
                  Velg hvordan klikkdata vises over nettsiden i kortet (klikkkart, varmekart eller scrollkart).
                </p>
              </>
            )}
            {!newPageRenderEnabled && (
              <TextField
                size="small"
                label="Valgfri visnings-URL"
                value={newPagePreviewUrlInput}
                onChange={(event) => {
                  setNewPagePreviewUrlInput(event.target.value)
                  if (addPageError) setAddPageError(null)
                }}
                description="Vises i kortet i stedet for nettsiden. Kan være en bilde- eller innholdsside."
              />
            )}
            {addPageError && <Alert variant="error">{addPageError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddPage()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddPageModalOpen(false)
              setNewPageVisualizationMode('')
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isEditWebsiteModalOpen}
        onClose={() => {
          setIsEditWebsiteModalOpen(false)
          setEditWebsiteFrameId(null)
          setEditWebsiteError(null)
          setEditWebsiteVisualizationMode('')
        }}
        header={{ heading: 'Rediger nettside' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              size="small"
              label="URL"
              value={editWebsitePathInput}
              onChange={(event) => {
                setEditWebsitePathInput(event.target.value)
                if (editWebsiteError) setEditWebsiteError(null)
              }}
              autoFocus
            />
            <Switch
              size="small"
              checked={editWebsiteRenderEnabled}
              onChange={(event) => {
                setEditWebsiteRenderEnabled(event.target.checked)
                if (editWebsiteError) setEditWebsiteError(null)
              }}
            >
              Last inn nettsiden
            </Switch>
            {editWebsiteRenderEnabled && (
              <>
                <VisualizationModeSelect
                  value={editWebsiteVisualizationMode}
                  onChange={(nextMode) => {
                    setEditWebsiteVisualizationMode(nextMode)
                    if (editWebsiteError) setEditWebsiteError(null)
                  }}
                  size="small"
                  label="Visualisering"
                  allowNoneOption
                  noneOptionLabel="Ingen"
                />
                <p className="text-xs text-[var(--ax-text-subtle)]">
                  Velg hvordan klikkdata vises over nettsiden i kortet (klikkkart, varmekart eller scrollkart).
                </p>
              </>
            )}
            {!editWebsiteRenderEnabled && (
              <TextField
                size="small"
                label="Valgfri visnings-URL"
                value={editWebsitePreviewUrlInput}
                onChange={(event) => {
                  setEditWebsitePreviewUrlInput(event.target.value)
                  if (editWebsiteError) setEditWebsiteError(null)
                }}
                description="Vises i kortet i stedet for nettsiden. Kan være en image- eller innholdsside."
              />
            )}
            {editWebsiteError && <Alert variant="error">{editWebsiteError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleSaveEditedWebsite()} size="small" loading={isSavingCanvasItem}>
            Lagre
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsEditWebsiteModalOpen(false)
              setEditWebsiteFrameId(null)
              setEditWebsiteError(null)
              setEditWebsiteVisualizationMode('')
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

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

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (isSavingCanvasItem) return
          setDeleteTarget(null)
        }}
        header={{
          heading:
            deleteTarget?.type === 'connection'
              ? 'Fjern kobling'
              : deleteTarget?.type === 'frames'
                ? 'Fjern valgte kort'
                : 'Fjern kort',
        }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <p>
              Er du sikker på at du vil fjerne{' '}
              <strong>
                {deleteTarget?.type === 'connection'
                  ? 'koblingen'
                  : deleteTarget?.type === 'frames'
                    ? 'de valgte kortene'
                    : 'kortet'}
              </strong>
              {deleteTarget?.label ? (
                <>
                  {' '}
                  <strong>{deleteTarget.label}</strong>
                </>
              ) : null}
              ?
            </p>
            <p className="text-[var(--ax-text-subtle)]">Denne handlingen kan ikke angres.</p>
            {deleteTarget?.type === 'frames' && isSavingCanvasItem && bulkDeleteProgress ? (
              <Alert variant="info" size="small">
                Sletter kort {bulkDeleteProgress.completed} av {bulkDeleteProgress.total}...
              </Alert>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="danger" onClick={() => void handleConfirmDeleteTarget()} loading={isSavingCanvasItem}>
            {deleteTarget?.type === 'connection'
              ? 'Fjern kobling'
              : deleteTarget?.type === 'frames'
                ? isSavingCanvasItem && bulkDeleteProgress
                  ? `Sletter (${bulkDeleteProgress.completed}/${bulkDeleteProgress.total})`
                  : 'Fjern valgte'
                : 'Fjern kort'}
          </Button>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isSavingCanvasItem}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddChartModalOpen}
        onClose={() => {
          setIsAddChartModalOpen(false)
          setAddChartError(null)
        }}
        header={{ heading: 'Importer graf' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            {(isLoadingChartOptions || chartOptions.length > 0) && (
              <Select
                label="Graf"
                value={selectedChartOptionId}
                onChange={(event) => {
                  setSelectedChartOptionId(event.target.value)
                  if (addChartError) setAddChartError(null)
                }}
                disabled={isLoadingChartOptions}
              >
                <option value="" disabled>
                  {isLoadingChartOptions ? 'Laster grafer...' : 'Velg graf'}
                </option>
                {chartOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </Select>
            )}
            {addChartError && <Alert variant="error">{addChartError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {chartOptions.length > 0 && (
            <Button
              onClick={() => void handleAddChartCard()}
              size="small"
              loading={isSavingCanvasItem}
              disabled={!selectedChartOptionId}
            >
              Legg til
            </Button>
          )}
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddChartModalOpen(false)
              setAddChartError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddHeadingModalOpen}
        onClose={() => {
          setIsAddHeadingModalOpen(false)
          setAddHeadingError(null)
        }}
        header={{ heading: 'Legg til overskrift' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              label="Overskrift"
              value={headingTextInput}
              onChange={(event) => {
                setHeadingTextInput(event.target.value)
                if (addHeadingError) setAddHeadingError(null)
              }}
              autoFocus
            />
            {addHeadingError && <Alert variant="error">{addHeadingError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddHeadingCard()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddHeadingModalOpen(false)
              setAddHeadingError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddTextModalOpen}
        onClose={() => {
          setIsAddTextModalOpen(false)
          setAddTextError(null)
        }}
        header={{ heading: 'Legg til tekst' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Textarea
              label="Tekst"
              minRows={6}
              value={textContentInput}
              onChange={(event) => {
                setTextContentInput(event.target.value)
                if (addTextError) setAddTextError(null)
              }}
            />
            {addTextError && <Alert variant="error">{addTextError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddTextCard()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddTextModalOpen(false)
              setAddTextError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddIconModalOpen}
        onClose={() => {
          setIsAddIconModalOpen(false)
          setAddIconError(null)
        }}
        header={{ heading: 'Legg til ikon' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <CanvasIconPicker
              selectedIconId={selectedIconId}
              onSelectIcon={(iconId) => {
                setSelectedIconId(iconId)
                if (addIconError) setAddIconError(null)
              }}
            />
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-[var(--ax-text-default)]">Farge</div>
              <div className="flex flex-wrap gap-2">
                {CANVAS_ICON_COLOR_OPTIONS.map((colorOption) => {
                  const isSelected = selectedIconColor === colorOption.value
                  return (
                    <button
                      key={colorOption.id}
                      type="button"
                      onClick={() => {
                        setSelectedIconColor(colorOption.value)
                        if (addIconError) setAddIconError(null)
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                        isSelected ? 'border-[var(--ax-border-accent)]' : 'border-[var(--ax-border-neutral-subtle)]'
                      }`}
                      aria-label={`Velg farge ${colorOption.label}`}
                      title={colorOption.label}
                    >
                      <span
                        aria-hidden="true"
                        className="h-5 w-5 rounded-full border border-black/10"
                        style={{ backgroundColor: colorOption.value }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
            {addIconError && <Alert variant="error">{addIconError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddIconCard()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddIconModalOpen(false)
              setAddIconError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isImportStickyCsvModalOpen}
        onClose={() => {
          setIsImportStickyCsvModalOpen(false)
          setImportStickyCsvError(null)
        }}
        header={{ heading: 'Importer fra Skyra / Lumi' }}
        width={1100}
      >
        <Modal.Body>
          <section
            aria-label="CSV-import for brukerfeedback"
            className="grid gap-4 md:grid-cols-[340px_minmax(380px,1fr)]"
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="canvas-feedback-csv-file" className="text-sm font-medium text-[var(--ax-text-default)]">
                  CSV-fil
                </label>
                <input
                  ref={importStickyCsvFileInputRef}
                  id="canvas-feedback-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    void handleImportStickyCsvFileChange(event)
                  }}
                  className="sr-only"
                />
                <div className="flex items-center gap-2">
                  <Button size="small" variant="secondary" onClick={() => importStickyCsvFileInputRef.current?.click()}>
                    {importStickyCsvFileName ? 'Bytt CSV-fil' : 'Velg CSV-fil'}
                  </Button>
                  {importStickyCsvFileName && (
                    <Button
                      size="small"
                      variant="tertiary"
                      onClick={() => {
                        setImportStickyCsvFileName('')
                        setImportStickyCsvHeaders([])
                        setImportStickyCsvRows([])
                        setImportStickyContentColumn('')
                        setImportStickyStyle('sticky')
                        setImportStickyTableMode('rows')
                        setImportStickyTablePreviewPage(1)
                        setImportStickySectionTitle('')
                        setImportStickyExcludedRowIndexes([])
                        setImportStickyPrivacyReviewed(false)
                        setImportStickyCsvError(null)
                        if (importStickyCsvFileInputRef.current) {
                          importStickyCsvFileInputRef.current.value = ''
                        }
                      }}
                    >
                      Fjern fil
                    </Button>
                  )}
                </div>
                {importStickyCsvFileName && (
                  <p className="text-xs text-[var(--ax-text-subtle)]">
                    <strong>{importStickyCsvFileName}</strong> ({importStickyCsvRows.length} rader)
                  </p>
                )}
              </div>

              {importStickyCsvHeaders.length > 0 && (
                <div className="space-y-3">
                  <Select
                    label="Velg kolonne"
                    value={importStickyContentColumn}
                    onChange={(event) => {
                      const nextColumn = event.target.value
                      setImportStickyContentColumn(nextColumn)
                      setImportStickySectionTitle(nextColumn)
                      setImportStickyExcludedRowIndexes([])
                      setImportStickyTableMode('rows')
                      setImportStickyTablePreviewPage(1)
                      if (importStickyCsvError) setImportStickyCsvError(null)
                    }}
                  >
                    <option value="" disabled>
                      Velg kolonne
                    </option>
                    {importStickyCsvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                  {canChooseNonNumericImportStyle && (
                    <div className="space-y-3">
                      <Select
                        label="Importer som"
                        value={importStickyStyle}
                        onChange={(event) => {
                          setImportStickyStyle(event.target.value as CanvasCsvImportStyle)
                          setImportStickyTableMode('rows')
                          setImportStickyTablePreviewPage(1)
                          if (importStickyCsvError) setImportStickyCsvError(null)
                        }}
                      >
                        <option value="sticky">Post-it-lapper</option>
                        <option value="table">Tabell</option>
                      </Select>
                      {importStickyStyle === 'table' && (
                        <Select
                          label="Tabellvisning"
                          value={importStickyTableMode}
                          onChange={(event) => {
                            setImportStickyTableMode(event.target.value as CanvasCsvTableMode)
                            setImportStickyTablePreviewPage(1)
                          }}
                        >
                          <option value="rows">Rader</option>
                          <option value="summary">Oppsummering</option>
                        </Select>
                      )}
                    </div>
                  )}
                </div>
              )}
              {importStickyNumericSummary && (
                <Alert variant="info" size="small">
                  Denne kolonnen inneholder bare tall. Importen blir en aggregert vurdering i stedet for Post-it-lapper.
                </Alert>
              )}
              {hasImportStickyPrivacyFindings && (
                <Alert variant="error" size="small">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">
                      Fant mulig persondata i {importStickyPrivacyFindings.length} rader
                    </p>
                    <div className="max-h-48 space-y-2 overflow-auto rounded border border-[var(--ax-border-danger)]/30 bg-[var(--ax-bg-default)] p-2">
                      {importStickyPrivacyFindings.slice(0, 8).map((finding) => (
                        <div
                          key={`privacy-finding-row-${finding.rowIndex}`}
                          className="rounded border border-[var(--ax-border-danger)]/20 bg-[var(--ax-bg-default)] p-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-xs font-semibold text-[var(--ax-text-default)]">
                                Rad {finding.rowIndex + 1}
                              </div>
                              <div className="text-xs text-[var(--ax-text-subtle)]">
                                {finding.patternNames.join(', ')}
                              </div>
                            </div>
                            <Button
                              size="xsmall"
                              variant="secondary"
                              className="shrink-0"
                              onClick={() =>
                                setImportStickyExcludedRowIndexes((current) =>
                                  current.includes(finding.rowIndex) ? current : [...current, finding.rowIndex],
                                )
                              }
                            >
                              Fjern
                            </Button>
                          </div>
                          <div className="mt-1 break-all text-xs text-[var(--ax-text-subtle)]">{finding.text}</div>
                        </div>
                      ))}
                      {importStickyPrivacyFindings.length > 8 && (
                        <p className="text-xs text-[var(--ax-text-subtle)]">
                          + {importStickyPrivacyFindings.length - 8} flere rader med treff.
                        </p>
                      )}
                    </div>
                    <Switch
                      size="small"
                      checked={importStickyPrivacyReviewed}
                      onChange={(event) => setImportStickyPrivacyReviewed(event.target.checked)}
                    >
                      Jeg har gått gjennom radene med treff og vil fortsette import.
                    </Switch>
                  </div>
                </Alert>
              )}
              {importStickyCsvFileName && importStickyContentColumn && !shouldImportStickyAsAggregated && (
                <Alert variant="warning" size="small">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Gjør en personversjekk før import</p>
                    <p className="text-xs">
                      Innblikk er tilgjengelig for alle i Nav. Importer kun data som er trygt å dele.
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      <li>Skann teksten for navn, fødselsnummer, telefonnummer, e-post og adresser.</li>
                      <li>
                        Bruk forhåndsvisningen til høyre og fjern {importStickyStyle === 'table' ? 'rader' : 'lapper'}{' '}
                        med sensitive opplysninger.
                      </li>
                    </ul>
                  </div>
                </Alert>
              )}
              {importStickyCsvError && <Alert variant="error">{importStickyCsvError}</Alert>}
            </div>

            <aside className="min-w-0 overflow-hidden rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3">
              <div className="mb-2 text-sm font-semibold text-[var(--ax-text-default)]">Forhåndsvisning</div>
              <div className="mb-2 text-xs text-[var(--ax-text-subtle)]">
                {importStickyPreviewNotes.length === 0
                  ? 'Du kan forhåndsvise innholdet her før import.'
                  : `${importStickySectionTitle || 'Kolonne'} • ${
                      shouldImportStickyAsAggregated && importStickyNumericSummary
                        ? `${importStickyNumericSummaryRows.length} verdier (oppsummert)`
                        : importStickyStyle === 'table'
                          ? importStickyTableMode === 'summary'
                            ? `${importStickyCategoricalSummaryRows.length} verdier (oppsummert)`
                            : `${importStickyPreviewNotes.length} rader (tabell)`
                          : `${importStickyPreviewNotes.length} lapper`
                    }`}
              </div>
              {(shouldImportStickyAsAggregated || importStickyStyle === 'table') && (
                <div className="space-y-2">
                  <Table size="small" zebraStripes className="w-full table-fixed">
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell className="w-[70%]">
                          {importStickyContentColumn || 'Kolonne'}
                        </Table.HeaderCell>
                        {shouldImportStickyAsAggregated || importStickyTableMode === 'summary' ? (
                          <>
                            <Table.HeaderCell className="w-[90px]">Antall</Table.HeaderCell>
                            <Table.HeaderCell className="w-[90px]">Andel</Table.HeaderCell>
                          </>
                        ) : (
                          <Table.HeaderCell className="w-[90px]">Handling</Table.HeaderCell>
                        )}
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {shouldImportStickyAsAggregated
                        ? importStickyTablePreviewNumericSummaryRows.map((item) => (
                            <Table.Row key={`import-preview-numeric-summary-row-${item.value}`}>
                              <Table.DataCell className="break-all">{item.value}</Table.DataCell>
                              <Table.DataCell>{item.count.toLocaleString('nb-NO')}</Table.DataCell>
                              <Table.DataCell>
                                {item.percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %
                              </Table.DataCell>
                            </Table.Row>
                          ))
                        : importStickyTableMode === 'summary'
                          ? importStickyTablePreviewSummaryRows.map((item) => (
                              <Table.Row key={`import-preview-summary-row-${item.value}`}>
                                <Table.DataCell className="break-all">{item.value}</Table.DataCell>
                                <Table.DataCell>{item.count.toLocaleString('nb-NO')}</Table.DataCell>
                                <Table.DataCell>
                                  {item.percentage.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %
                                </Table.DataCell>
                              </Table.Row>
                            ))
                          : importStickyTablePreviewNoteRows.map((note) => (
                              <Table.Row key={`import-preview-row-${note.rowIndex}`}>
                                <Table.DataCell className="break-all">{note.text}</Table.DataCell>
                                <Table.DataCell>
                                  <Button
                                    size="xsmall"
                                    variant="tertiary"
                                    onClick={() =>
                                      setImportStickyExcludedRowIndexes((current) =>
                                        current.includes(note.rowIndex) ? current : [...current, note.rowIndex],
                                      )
                                    }
                                  >
                                    Fjern
                                  </Button>
                                </Table.DataCell>
                              </Table.Row>
                            ))}
                    </Table.Body>
                  </Table>
                  {importStickyTablePreviewPageCount > 1 && (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="xsmall"
                        variant="tertiary"
                        disabled={currentImportStickyTablePreviewPage <= 1}
                        onClick={() => setImportStickyTablePreviewPage((current) => Math.max(1, current - 1))}
                      >
                        Forrige
                      </Button>
                      <span className="text-xs text-[var(--ax-text-subtle)]">
                        Side {currentImportStickyTablePreviewPage} av {importStickyTablePreviewPageCount}
                      </span>
                      <Button
                        size="xsmall"
                        variant="tertiary"
                        disabled={currentImportStickyTablePreviewPage >= importStickyTablePreviewPageCount}
                        onClick={() =>
                          setImportStickyTablePreviewPage((current) =>
                            Math.min(importStickyTablePreviewPageCount, current + 1),
                          )
                        }
                      >
                        Neste
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!shouldImportStickyAsAggregated && importStickyStyle === 'sticky' && (
                <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                  {importStickyPreviewNotes.map((note) => (
                    <div
                      key={`import-preview-note-${note.rowIndex}`}
                      className="rounded-md border border-[#e5cd69] bg-[#fff7ca] px-2 py-1.5 text-xs leading-4 text-[#4a3d00]"
                      title={note.text}
                    >
                      <div className="mb-1.5 whitespace-pre-wrap break-words">{note.text}</div>
                      <div className="flex justify-end">
                        <Button
                          size="xsmall"
                          variant="tertiary"
                          onClick={() =>
                            setImportStickyExcludedRowIndexes((current) =>
                              current.includes(note.rowIndex) ? current : [...current, note.rowIndex],
                            )
                          }
                        >
                          Fjern
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {importStickyPreviewNotes.length === 0 && (
                <div className="rounded-md border border-dashed border-[var(--ax-border-neutral-subtle)] p-3 text-xs text-[var(--ax-text-subtle)]">
                  Velg fil og kolonne. Du kan forhåndsvise innholdet før du importerer.
                </div>
              )}
            </aside>
          </section>
        </Modal.Body>
        <Modal.Footer>
          <Button
            onClick={() => void handleImportStickyCsv()}
            size="small"
            loading={isSavingCanvasItem}
            disabled={
              importStickyCsvHeaders.length === 0 ||
              !importStickyContentColumn ||
              (hasImportStickyPrivacyFindings && !importStickyPrivacyReviewed)
            }
          >
            Importer
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsImportStickyCsvModalOpen(false)
              setImportStickyCsvError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddStickyModalOpen}
        onClose={() => {
          setIsAddStickyModalOpen(false)
          setAddStickyError(null)
        }}
        header={{ heading: 'Legg til Post-it-lapp' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3 rounded-xl border border-[#f1dc7d] bg-[#fff5b8] p-3">
            <Textarea
              label="Tekst"
              minRows={6}
              value={stickyContentInput}
              onChange={(event) => {
                setStickyContentInput(event.target.value)
                if (addStickyError) setAddStickyError(null)
              }}
              className="[&_label]:text-[#4a3d00] [&_textarea]:border-[#e5cd69] [&_textarea]:bg-[#fff7ca] [&_textarea]:text-[#4a3d00] [&_textarea::placeholder]:text-[#7a6b2a]"
            />
            {addStickyError && <Alert variant="error">{addStickyError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddStickyCard()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddStickyModalOpen(false)
              setAddStickyError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isAddFigureModalOpen}
        onClose={() => {
          setIsAddFigureModalOpen(false)
          setAddFigureError(null)
        }}
        header={{ heading: 'Legg til figur' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-[var(--ax-text-default)]">Figurtype</div>
              <div className="grid grid-cols-2 gap-2">
                {CANVAS_FIGURE_OPTIONS.map((figureOption) => {
                  const isSelected = selectedFigureType === figureOption.id
                  const FigureIcon = figureOption.Icon
                  return (
                    <button
                      key={figureOption.id}
                      type="button"
                      onClick={() => {
                        setSelectedFigureType(figureOption.id)
                        if (addFigureError) setAddFigureError(null)
                      }}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left ${
                        isSelected
                          ? 'border-[var(--ax-border-accent)] bg-[var(--ax-bg-accent-soft)]'
                          : 'border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)]'
                      }`}
                    >
                      <FigureIcon size={16} aria-hidden="true" />
                      <span className="text-sm text-[var(--ax-text-default)]">{figureOption.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-[var(--ax-text-default)]">Farge</div>
              <div className="flex flex-wrap gap-2">
                {CANVAS_ICON_COLOR_OPTIONS.map((colorOption) => {
                  const isSelected = selectedFigureColor === colorOption.value
                  return (
                    <button
                      key={colorOption.id}
                      type="button"
                      onClick={() => {
                        setSelectedFigureColor(colorOption.value)
                        if (addFigureError) setAddFigureError(null)
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                        isSelected ? 'border-[var(--ax-border-accent)]' : 'border-[var(--ax-border-neutral-subtle)]'
                      }`}
                      aria-label={`Velg farge ${colorOption.label}`}
                      title={colorOption.label}
                    >
                      <span
                        aria-hidden="true"
                        className="h-5 w-5 rounded-full border border-black/10"
                        style={{ backgroundColor: colorOption.value }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
            {addFigureError && <Alert variant="error">{addFigureError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleAddFigureCard()} size="small" loading={isSavingCanvasItem}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setIsAddFigureModalOpen(false)
              setAddFigureError(null)
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

export default Canvas
