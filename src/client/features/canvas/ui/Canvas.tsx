import { Fragment, createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionMenu,
  Alert,
  Button,
  Link,
  Loader,
  Modal,
  Select,
  Switch,
  Tabs,
  TextField,
  Textarea,
} from '@navikt/ds-react'
import {
  ChartNoAxesCombined,
  Edit2,
  ExternalLink,
  Minus,
  MoreVertical,
  Plus,
  Copy,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
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
import CanvasIllustrationPicker from './CanvasIllustrationPicker.tsx'
import { DEFAULT_CANVAS_ILLUSTRATION_PATH, getCanvasIllustrationOptionByPath } from './CanvasIllustrationRegistry.ts'
import CanvasIconPicker from './CanvasIconPicker.tsx'
import {
  CANVAS_ICON_COLOR_OPTIONS,
  DEFAULT_CANVAS_ICON_COLOR,
  DEFAULT_CANVAS_ICON_ID,
  getCanvasIconColor,
  getCanvasIconOptionById,
} from './CanvasIconRegistry.ts'
import {
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

type CanvasChartType = 'line' | 'bar' | 'pie' | 'table'
type CanvasPayloadKind = 'website' | 'image' | 'heading' | 'text' | 'sticky' | 'chart' | 'icon' | 'connection'
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
  kind: 'website' | 'image' | 'heading' | 'text' | 'sticky' | 'chart' | 'icon'
  websiteId?: string
  targetUrl?: string
  previewUrl?: string
  renderWebsite?: boolean
  isInternalDashboard?: boolean
  visualizationMode?: VisualizationMode
  headingText?: string
  headingFontSize?: number
  textContent?: string
  iconName?: string
  iconRotationDeg?: number
  iconColor?: string
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
      type: 'connection'
      id: string
      label: string
    }

type ConnectionDragState = {
  sourceFrameId: string
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
  iconName?: string
  iconRotationDeg?: number
  iconColor?: string
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

const CANVAS_DASHBOARD_TOKEN = '[canvas]'
const CANVAS_WEBSITE_ID_TOKEN_REGEX = /\[websiteId:([^\]]+)\]/i
const CANVAS_QUERY_NAME = 'canvas-config'
const CANVAS_SURFACE_WIDTH = 2200
const CANVAS_SURFACE_HEIGHT = 1500
const CANVAS_SURFACE_TOP_GAP = 24
const CANVAS_ZOOM_MIN = 0.5
const CANVAS_ZOOM_MAX = 1.5
const CANVAS_ZOOM_STEP = 0.1
const HEADING_FONT_SIZE_DEFAULT = 40
const HEADING_FONT_SIZE_MIN = 20
const HEADING_FONT_SIZE_MAX = 96
const HEADING_FONT_SIZE_STEP = 2
const ICON_ROTATION_STEP_DEG = 15
const CLICKMAP_EVENTS = ['navigere', 'accordion åpnet']
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

const computeMidpoint = (x1: number, y1: number, x2: number, y2: number, delta: number): { x: number; y: number } => {
  const c1x = x1 + delta
  const c1y = y1
  const c2x = x2 - delta
  const c2y = y2
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
  x2: number,
  y2: number,
): { path: string; midpoint: { x: number; y: number } } => {
  const delta = Math.max(80, Math.abs(x2 - x1) * 0.45)
  return {
    path: `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`,
    midpoint: computeMidpoint(x1, y1, x2, y2, delta),
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

const isIllustrationPath = (targetUrl?: string): boolean => Boolean(targetUrl?.startsWith('/illustrasjoner/'))

const isIllustrationImageFrame = (frame: Pick<CanvasFrame, 'kind' | 'targetUrl' | 'isIllustration'>): boolean =>
  frame.kind === 'image' && (Boolean(frame.isIllustration) || isIllustrationPath(frame.targetUrl))

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
  value === 'connection'

const isRenderableCanvasFrameKind = (value: unknown): value is CanvasFrame['kind'] =>
  value === 'website' ||
  value === 'image' ||
  value === 'heading' ||
  value === 'text' ||
  value === 'sticky' ||
  value === 'chart' ||
  value === 'icon'

const isCanvasChartType = (value: unknown): value is CanvasChartType =>
  value === 'line' || value === 'bar' || value === 'pie' || value === 'table'

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
      iconName: typeof parsed.iconName === 'string' ? parsed.iconName : undefined,
      iconRotationDeg: Number.isFinite(parsed.iconRotationDeg) ? Number(parsed.iconRotationDeg) : undefined,
      iconColor: typeof parsed.iconColor === 'string' ? parsed.iconColor : undefined,
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

const Canvas = () => {
  const routeContext = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const projectId = Number(params.get('projectId'))
    const dashboardId = Number(params.get('dashboardId'))
    const categoryId = Number(params.get('categoryId'))
    return {
      onlyDirectEntry: params.get('strict') ? params.get('strict') === 'true' : false,
      projectId: Number.isFinite(projectId) ? projectId : null,
      dashboardId: Number.isFinite(dashboardId) ? dashboardId : null,
      categoryId: Number.isFinite(categoryId) ? categoryId : null,
    }
  }, [])
  const { onlyDirectEntry, projectId, dashboardId, categoryId: initialCategoryId } = routeContext
  const canPersistToDashboard = projectId !== null && dashboardId !== null
  const projectManagerHref = projectId !== null ? `/dashboard?projectId=${projectId}` : '/dashboard'
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
  const [isAddIconModalOpen, setIsAddIconModalOpen] = useState(false)
  const [isCanvasSettingsModalOpen, setIsCanvasSettingsModalOpen] = useState(false)
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
  const [editWebsiteFrameId, setEditWebsiteFrameId] = useState<string | null>(null)
  const [editDashboardFrameId, setEditDashboardFrameId] = useState<string | null>(null)
  const [editImageFrameId, setEditImageFrameId] = useState<string | null>(null)
  const [editIconFrameId, setEditIconFrameId] = useState<string | null>(null)
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
  const [selectedIconId, setSelectedIconId] = useState(DEFAULT_CANVAS_ICON_ID)
  const [selectedIconColor, setSelectedIconColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [addIconError, setAddIconError] = useState<string | null>(null)
  const [editIconSelectedId, setEditIconSelectedId] = useState(DEFAULT_CANVAS_ICON_ID)
  const [editIconSelectedColor, setEditIconSelectedColor] = useState(DEFAULT_CANVAS_ICON_COLOR)
  const [editIconError, setEditIconError] = useState<string | null>(null)
  const [chartOptions, setChartOptions] = useState<CanvasChartOption[]>([])
  const [selectedChartOptionId, setSelectedChartOptionId] = useState('')
  const [isLoadingChartOptions, setIsLoadingChartOptions] = useState(false)
  const [addChartError, setAddChartError] = useState<string | null>(null)
  const [editChartFrameId, setEditChartFrameId] = useState<string | null>(null)
  const [editChartTarget, setEditChartTarget] = useState<OversiktChart | null>(null)
  const [deleteChartFrameId, setDeleteChartFrameId] = useState<string | null>(null)
  const [deleteChartTarget, setDeleteChartTarget] = useState<OversiktChart | null>(null)
  const [chartMutationError, setChartMutationError] = useState<string | null>(null)
  const [savingEditChart, setSavingEditChart] = useState(false)
  const [deletingChart, setDeletingChart] = useState(false)
  const [dragState, setDragState] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
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
  const [connectionMetrics, setConnectionMetrics] = useState<Record<string, CanvasConnectionMetric | null>>({})
  const [frameVisualizationData, setFrameVisualizationData] = useState<Record<string, CanvasFrameVisualizationData>>({})
  const [connectionDragState, setConnectionDragState] = useState<ConnectionDragState | null>(null)
  const [toolbarNotice, setToolbarNotice] = useState<string | null>(null)
  const [pageInsights, setPageInsights] = useState<Record<string, CanvasPageInsight>>({})
  const [activeInsightFrameId, setActiveInsightFrameId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CanvasDeleteTarget | null>(null)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [activeEditableFrameId, setActiveEditableFrameId] = useState<string | null>(null)
  const [failedImageFrameIds, setFailedImageFrameIds] = useState<Record<string, boolean>>({})
  const pageInsightsRef = useRef<Record<string, CanvasPageInsight>>({})
  const framesRef = useRef<CanvasFrame[]>([])
  const frameVisualizationDataRef = useRef<Record<string, CanvasFrameVisualizationData>>({})
  const websiteIframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const canvasToolbarRef = useRef<HTMLDivElement | null>(null)
  const connectionMetricRequestSignatureRef = useRef<string | null>(null)
  const [canvasToolbarHeight, setCanvasToolbarHeight] = useState(120)
  const toolbarNoticeTimerRef = useRef<number | null>(null)
  const toolbarNoticeReadyRef = useRef(false)
  const canvasCanvasTopOffset = canvasToolbarHeight + CANVAS_SURFACE_TOP_GAP
  const shouldShowCreateCanvasModal = canvasInitMode === 'create'

  const handleCanvasZoomChange = useCallback((nextZoom: number) => {
    setCanvasZoom(clampCanvasZoom(nextZoom))
  }, [])

  const handleCanvasZoomReset = useCallback(() => {
    setCanvasZoom(1)
  }, [])

  const setPeriod = (nextPeriod: string) => {
    setPeriodState(nextPeriod)
    savePeriodPreference(nextPeriod)
    if (toolbarNoticeReadyRef.current) {
      if (toolbarNoticeTimerRef.current) {
        window.clearTimeout(toolbarNoticeTimerRef.current)
      }
      setToolbarNotice('Filter oppdatert')
      toolbarNoticeTimerRef.current = window.setTimeout(() => {
        setToolbarNotice(null)
        toolbarNoticeTimerRef.current = null
      }, 1800)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      toolbarNoticeReadyRef.current = true
    }, 1200)

    return () => {
      window.clearTimeout(timer)
      if (toolbarNoticeTimerRef.current) {
        window.clearTimeout(toolbarNoticeTimerRef.current)
      }
    }
  }, [])

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
        iconName: frame.iconName,
        iconRotationDeg: frame.iconRotationDeg,
        iconColor: frame.iconColor,
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
              iconName: parsedConfig.iconName,
              iconRotationDeg: parsedConfig.iconRotationDeg,
              iconColor: parsedConfig.iconColor,
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
      setCanvasTitle('Canvas')
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
  }, [canPersistToDashboard, projectId, dashboardId])

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

  const handleAddPage = async () => {
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

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'website',
      websiteId: selectedWebsite?.id || canvasConfiguredWebsiteId || undefined,
      targetUrl,
      previewUrl: newPageRenderEnabled ? undefined : (previewUrl ?? undefined),
      renderWebsite: newPageRenderEnabled,
      visualizationMode: newPageVisualizationMode || undefined,
      label: getFrameLabel(targetUrl),
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 420,
      height: 560,
      refreshNonce: 1,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setNewPagePathInput('')
      setNewPagePreviewUrlInput('')
      setNewPageVisualizationMode('')
      setAddPageError(null)
      setIsAddPageModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre nettside i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleAddImage = async () => {
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

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'image',
      targetUrl: imageUrl,
      label: getFrameLabel(imageUrl),
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 420,
      height: 420,
      refreshNonce: 1,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setNewImageUrlInput('')
      setAddImageError(null)
      setIsAddImageModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre bilde i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
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
        const index = frames.length
        const column = index % 3
        const row = Math.floor(index / 3)
        const newFrame: CanvasFrame = {
          id: `${Date.now()}-${Math.random()}`,
          kind: 'image',
          targetUrl: selectedIllustration.path,
          label: selectedIllustration.label,
          isIllustration: true,
          imageRotationDeg: 0,
          x: 80 + column * 460,
          y: 80 + row * 380,
          width: 420,
          height: 420,
          refreshNonce: 1,
        }
        const persistedFrame = await persistFrame(newFrame)
        setFrames((prev) => [...prev, persistedFrame])
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

  const handleAddDashboardCard = async () => {
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

    const index = frames.length
    const column = index % 2
    const row = Math.floor(index / 2)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'website',
      targetUrl: dashboardUrl,
      previewUrl: dashboardUrl,
      renderWebsite: false,
      isInternalDashboard: true,
      label: selectedDashboard.name,
      x: 120 + column * 820,
      y: 120 + row * 700,
      width: 760,
      height: 620,
      refreshNonce: 1,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setAddDashboardError(null)
      setIsAddDashboardModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre dashboard i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
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

  const getFrameAnchor = useCallback((frame: CanvasFrame, side: 'left' | 'right'): { x: number; y: number } => {
    const defaults = getDefaultFrameSize(frame)
    const width = frame.width ?? defaults.width
    const height = frame.height ?? defaults.height
    const headerHeight =
      frame.kind === 'website' ? WEBSITE_CARD_HEADER_HEIGHT : frame.kind === 'icon' ? ICON_CARD_HEADER_HEIGHT : 0
    const bodyHeight = Math.max(height - headerHeight, 0)
    return {
      x: side === 'left' ? frame.x : frame.x + width,
      y: frame.y + headerHeight + bodyHeight / 2,
    }
  }, [])

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
    (event: React.MouseEvent, frame: CanvasFrame) => {
      if (frame.kind !== 'website' || frame.isInternalDashboard) return
      event.preventDefault()
      event.stopPropagation()

      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return

      setConnectionDragState({
        sourceFrameId: frame.id,
        pointerX: pointer.x,
        pointerY: pointer.y,
        currentTargetFrameId: null,
      })
    },
    [getCanvasPointerPosition],
  )

  const handleAddHeadingCard = async () => {
    const heading = headingTextInput.trim()
    if (!heading) {
      setAddHeadingError('Legg inn overskrift.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'heading',
      headingText: heading,
      headingFontSize: HEADING_FONT_SIZE_DEFAULT,
      label: heading,
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 420,
      height: 160,
      refreshNonce: 0,
    }
    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setHeadingTextInput('')
      setAddHeadingError(null)
      setIsAddHeadingModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre overskrift i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleAddTextCard = async () => {
    const content = textContentInput.trim()

    if (!content) {
      setAddTextError('Legg inn tekst.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'text',
      textContent: content,
      label: 'Tekst',
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 340,
      height: 170,
      refreshNonce: 0,
    }
    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setTextContentInput('')
      setAddTextError(null)
      setIsAddTextModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre tekst i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleAddStickyCard = async () => {
    const content = stickyContentInput.trim()

    if (!content) {
      setAddStickyError('Legg inn tekst.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'sticky',
      textContent: content,
      label: 'Post-it-lapp',
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 360,
      height: 180,
      refreshNonce: 0,
    }
    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setStickyContentInput('')
      setAddStickyError(null)
      setIsAddStickyModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre Post-it-lapp i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleAddIconCard = async () => {
    const selectedIcon = getCanvasIconOptionById(selectedIconId)
    if (!selectedIcon) {
      setAddIconError('Velg et ikon.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'icon',
      iconName: selectedIcon.id,
      iconRotationDeg: 0,
      iconColor: getCanvasIconColor(selectedIconColor),
      label: selectedIcon.label,
      x: 80 + column * 460,
      y: 80 + row * 380,
      width: 280,
      height: 240,
      refreshNonce: 0,
    }
    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setAddIconError(null)
      setIsAddIconModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre ikon i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
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
    setAddChartError(null)
    setIsAddChartModalOpen(true)
    void loadChartOptions()
  }

  const handleAddChartCard = async () => {
    const selectedOption = chartOptions.find((option) => option.id === selectedChartOptionId)
    if (!selectedOption) {
      setAddChartError('Velg en graf.')
      return
    }

    const index = frames.length
    const column = index % 2
    const row = Math.floor(index / 2)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'chart',
      label: selectedOption.title,
      chartType: selectedOption.chartType,
      chartSql: selectedOption.sql,
      x: 120 + column * 720,
      y: 120 + row * 520,
      width: 680,
      height: 460,
      refreshNonce: 0,
    }

    try {
      setIsSavingCanvasItem(true)
      setSyncError(null)
      const persistedFrame = await persistFrame(newFrame)
      setFrames((prev) => [...prev, persistedFrame])
      setAddChartError(null)
      setIsAddChartModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre graf i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
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
    const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
    if (!pointer) return

    setDragState({
      id: frame.id,
      offsetX: pointer.x - frame.x,
      offsetY: pointer.y - frame.y,
    })
  }

  const getDefaultFrameSize = (
    frameOrKind: CanvasFrame | CanvasFrame['kind'],
  ): { width: number; height: number; minWidth: number; minHeight: number } => {
    const kind = typeof frameOrKind === 'string' ? frameOrKind : frameOrKind.kind
    const isInternalDashboard = typeof frameOrKind === 'string' ? false : Boolean(frameOrKind.isInternalDashboard)
    const isIllustration = typeof frameOrKind === 'string' ? false : isIllustrationImageFrame(frameOrKind)

    if (kind === 'website' && isInternalDashboard) return { width: 760, height: 620, minWidth: 520, minHeight: 420 }
    if (kind === 'website') return { width: 420, height: 560, minWidth: 320, minHeight: 320 }
    if (kind === 'image' && isIllustration) return { width: 420, height: 420, minWidth: 96, minHeight: 96 }
    if (kind === 'image') return { width: 420, height: 420, minWidth: 240, minHeight: 200 }
    if (kind === 'chart') return { width: 680, height: 460, minWidth: 420, minHeight: 280 }
    if (kind === 'heading') return { width: 420, height: 72, minWidth: 260, minHeight: 48 }
    if (kind === 'text') return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
    if (kind === 'icon') return { width: 280, height: 240, minWidth: 180, minHeight: 160 }
    return { width: 360, height: 180, minWidth: 280, minHeight: 72 }
  }

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

      setFrames((prev) =>
        prev.map((frame) =>
          frame.id === dragState.id
            ? {
                ...frame,
                x: Math.max(0, pointer.x - dragState.offsetX),
                y: Math.max(-CANVAS_TOP_BUFFER, pointer.y - dragState.offsetY),
              }
            : frame,
        ),
      )
    }

    const onMouseUp = () => {
      const movedFrame = framesRef.current.find((frame) => frame.id === dragState.id)
      if (movedFrame && movedFrame.graphId) {
        void persistFrame(movedFrame).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre posisjon i canvas')
        })
      }
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

  const handleConfirmDeleteTarget = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    if (target.type === 'frame') {
      await handleRemovePage(target.id)
      return
    }
    await handleRemoveConnection(target.id)
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

        const x1 = getFrameAnchor(fromFrame, 'right').x
        const y1 = getFrameAnchor(fromFrame, 'right').y
        const x2 = getFrameAnchor(toFrame, 'left').x
        const y2 = getFrameAnchor(toFrame, 'left').y
        const delta = Math.max(80, Math.abs(x2 - x1) * 0.45)
        const path = `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`
        const midpoint = computeMidpoint(x1, y1, x2, y2, delta)

        return [
          {
            id: connection.id,
            path,
            labelX: midpoint.x,
            labelY: midpoint.y - 24,
            midX: midpoint.x,
            midY: midpoint.y,
            endX: x2,
            endY: y2,
            fromUrl: fromFrame.targetUrl,
            toUrl: toFrame.targetUrl,
          },
        ]
      }),
    [visibleConnections, resolveConnectionFrame, getFrameAnchor],
  )

  const connectionPreview = useMemo(() => {
    if (!connectionDragState) return null

    const sourceFrame = visibleFrames.find((frame) => frame.id === connectionDragState.sourceFrameId)
    if (!sourceFrame || sourceFrame.kind !== 'website') return null

    const targetFrame = connectionDragState.currentTargetFrameId
      ? visibleFrames.find((frame) => frame.id === connectionDragState.currentTargetFrameId)
      : null
    const fromAnchor = getFrameAnchor(sourceFrame, 'right')
    const toAnchor =
      targetFrame?.kind === 'website'
        ? getFrameAnchor(targetFrame, 'left')
        : {
            x: connectionDragState.pointerX,
            y: connectionDragState.pointerY,
          }
    const { path, midpoint } = buildConnectionPath(fromAnchor.x, fromAnchor.y, toAnchor.x, toAnchor.y)

    return {
      path,
      labelX: midpoint.x,
      labelY: midpoint.y - 24,
      midX: midpoint.x,
      midY: midpoint.y,
      targetFrameId: targetFrame?.id ?? null,
    }
  }, [connectionDragState, visibleFrames, getFrameAnchor])

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
    if (!frame || frame.kind === 'website' || frame.kind === 'image' || frame.kind === 'chart' || frame.kind === 'icon')
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
    setIsCanvasSettingsModalOpen(true)
  }

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

  return (
    <>
      <section className="relative h-[100dvh] min-h-[100dvh] bg-[var(--ax-bg-neutral-soft)]">
        <div ref={canvasToolbarRef} className="pointer-events-none fixed left-4 right-4 top-4 z-30">
          <div className="pointer-events-auto rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={projectManagerHref}
                aria-label={`Tilbake til ProjectManager${projectId !== null ? ` for prosjekt ${projectId}` : ''}`}
                className="min-w-0 flex flex-1 items-center gap-1.5 rounded-sm text-[var(--ax-text-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M16.5 10.5C16.5 13.8137 13.8137 16.5 10.5 16.5C7.18629 16.5 4.5 13.8137 4.5 10.5C4.5 7.18629 7.18629 4.5 10.5 4.5C13.8137 4.5 16.5 7.18629 16.5 10.5Z"
                      stroke="currentColor"
                      strokeWidth="1.9"
                    />
                    <path d="M15.2 15.2L20.5 20.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                    <path
                      d="M7.9 12.5V10.2M10.5 12.5V8.5M13.1 12.5V9.3"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <h1 className="m-0 truncate text-[20px] font-semibold leading-none" title={canvasTitle}>
                  {canvasTitle}
                </h1>
              </a>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[152px] shrink-0 [&_label]:sr-only">
                  <PeriodPicker
                    period={period}
                    onPeriodChange={setPeriod}
                    startDate={customStartDate}
                    onStartDateChange={setCustomStartDate}
                    endDate={customEndDate}
                    onEndDateChange={setCustomEndDate}
                    className="w-full sm:w-auto min-w-[152px]"
                  />
                </div>
                <ActionMenu>
                  <ActionMenu.Trigger>
                    <Button
                      size="small"
                      icon={<Plus size={16} />}
                      className="shrink-0 whitespace-nowrap"
                      disabled={canvasInitMode !== 'existing'}
                    >
                      Legg til
                    </Button>
                  </ActionMenu.Trigger>
                  <ActionMenu.Content align="end">
                    <ActionMenu.Item
                      onClick={() => {
                        setAddImageError(null)
                        setNewImageUrlInput('')
                        setIsAddImageModalOpen(true)
                      }}
                    >
                      Bilde
                    </ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddDashboardModal}>Dashboard</ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddChartModal}>Graf</ActionMenu.Item>
                    <ActionMenu.Item
                      onClick={() => {
                        setAddIconError(null)
                        setSelectedIconId((current) => current || DEFAULT_CANVAS_ICON_ID)
                        setSelectedIconColor((current) => getCanvasIconColor(current))
                        setIsAddIconModalOpen(true)
                      }}
                    >
                      Ikon
                    </ActionMenu.Item>
                    <ActionMenu.Item
                      onClick={() => {
                        setEditIllustrationFrameId(null)
                        setAddIllustrationError(null)
                        setSelectedIllustrationPath((current) => current || DEFAULT_CANVAS_ILLUSTRATION_PATH)
                        setIsAddIllustrationModalOpen(true)
                      }}
                    >
                      Nav-illustrasjoner
                    </ActionMenu.Item>
                    <ActionMenu.Item
                      onClick={() => {
                        setAddPageError(null)
                        setNewPagePreviewUrlInput('')
                        setNewPageRenderEnabled(true)
                        setNewPageVisualizationMode('')
                        setIsAddPageModalOpen(true)
                      }}
                    >
                      Nettside
                    </ActionMenu.Item>
                    <ActionMenu.Item
                      onClick={() => {
                        setAddHeadingError(null)
                        setIsAddHeadingModalOpen(true)
                      }}
                    >
                      Overskrift
                    </ActionMenu.Item>
                    <ActionMenu.Item
                      onClick={() => {
                        setAddStickyError(null)
                        setIsAddStickyModalOpen(true)
                      }}
                    >
                      Post-it-lapp
                    </ActionMenu.Item>
                    <ActionMenu.Item
                      onClick={() => {
                        setAddTextError(null)
                        setIsAddTextModalOpen(true)
                      }}
                    >
                      Tekst
                    </ActionMenu.Item>
                  </ActionMenu.Content>
                </ActionMenu>
                <ActionMenu>
                  <ActionMenu.Trigger>
                    <Button
                      size="small"
                      variant="tertiary"
                      icon={<MoreVertical size={16} />}
                      aria-label="Innstillinger"
                      disabled={canvasInitMode !== 'existing'}
                    />
                  </ActionMenu.Trigger>
                  <ActionMenu.Content align="end">
                    <ActionMenu.Item onClick={handleOpenCreateTabModal}>Legg til fane</ActionMenu.Item>
                    {canvasCategories.length > 1 && (
                      <ActionMenu.Item onClick={handleOpenManageTabsModal}>Administrer faner</ActionMenu.Item>
                    )}
                    <ActionMenu.Item onClick={handleOpenCanvasSettingsModal}>Innstillinger</ActionMenu.Item>
                  </ActionMenu.Content>
                </ActionMenu>
                {toolbarNotice && (
                  <div className="shrink-0 rounded-full bg-[var(--ax-bg-success-soft)] px-2 py-1 text-[12px] font-medium text-[var(--ax-text-success)]">
                    {toolbarNotice}
                  </div>
                )}
              </div>
            </div>
            {!canPersistToDashboard && !shouldShowCreateCanvasModal && (
              <div className="mt-2">
                <Alert variant="warning" size="small">
                  Canvas er ikke koblet til et dashboard. Åpne canvas fra ProjectManager for lagring.
                </Alert>
              </div>
            )}
            {syncError && (
              <div className="mt-2">
                <Alert variant="error" size="small" closeButton onClose={() => setSyncError(null)}>
                  {syncError}
                </Alert>
              </div>
            )}
            {canvasCategories.length > 1 && (
              <div className="mt-2">
                <Tabs
                  value={activeCanvasCategoryId !== null ? String(activeCanvasCategoryId) : undefined}
                  onChange={(value) => {
                    const categoryId = Number(value)
                    if (!Number.isFinite(categoryId)) return
                    setActiveCanvasCategoryId(categoryId)
                    setActiveInsightFrameId(null)
                    setConnectionDragState(null)
                  }}
                >
                  <Tabs.List>
                    {canvasCategories.map((category) => (
                      <Tabs.Tab
                        key={category.id}
                        value={String(category.id)}
                        label={getCanvasCategoryDisplayName(category.name)}
                      />
                    ))}
                  </Tabs.List>
                </Tabs>
              </div>
            )}
          </div>
        </div>

        <div className="flex h-full">
          <main ref={canvasViewportRef} className="relative flex-1 overflow-auto">
            <div
              className="relative"
              style={{
                width: `${CANVAS_SURFACE_WIDTH * canvasZoom}px`,
                minHeight: `${canvasCanvasTopOffset + CANVAS_SURFACE_HEIGHT * canvasZoom}px`,
              }}
            >
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  top: `${canvasCanvasTopOffset}px`,
                  width: `${CANVAS_SURFACE_WIDTH}px`,
                  height: `${CANVAS_SURFACE_HEIGHT}px`,
                  transform: `scale(${canvasZoom})`,
                  transformOrigin: 'top left',
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, var(--ax-border-neutral-subtle) 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              >
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
                {connectionSegmentsWithMetrics.map((segment) => (
                  <Fragment key={segment.id}>
                    <div
                      className="group pointer-events-auto absolute z-[2] -translate-x-1/2 -translate-y-full overflow-visible"
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
                      <div className="min-w-[190px] overflow-hidden rounded-2xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] shadow-sm">
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
                    const isWebsiteInsightOpen = frame.kind === 'website' && activeInsightFrameId === frame.id
                    const websiteInsight = pageInsights[frame.id]
                    const visualizationMode = frame.kind === 'website' ? getCanvasFrameVisualizationMode(frame) : ''
                    const visualizationData = frame.kind === 'website' ? frameVisualizationData[frame.id] : undefined
                    return (
                      <article
                        key={frame.id}
                        className={
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
                              ? 'group absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none'
                              : frame.kind === 'heading'
                                ? 'group absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none'
                                : frame.kind === 'text'
                                  ? 'group absolute flex flex-col overflow-hidden rounded-xl border border-transparent bg-transparent shadow-none'
                                  : frame.kind === 'icon'
                                    ? 'group absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none'
                                    : 'group absolute flex flex-col overflow-hidden rounded-xl border border-[#f1dc7d] bg-[#fff5b8] shadow-sm'
                        }
                        style={{
                          left: `${frame.x}px`,
                          top: `${frame.y}px`,
                          zIndex:
                            resizeState?.id === frame.id
                              ? 90
                              : dragState?.id === frame.id
                                ? 80
                                : activeEditableFrameId === frame.id
                                  ? 70
                                  : isIllustrationFrame
                                    ? 50
                                    : frame.kind === 'icon'
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
                              'flex cursor-move items-center justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-2'
                            }
                            onMouseDown={(event) => handleDragStart(event, frame)}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="min-w-0">
                                <div className="min-w-0 text-sm font-semibold text-[var(--ax-text-default)] break-all">
                                  {frame.label}
                                </div>
                                {visualizationMode && visualizationData?.loading && (
                                  <div className="text-xs text-[var(--ax-text-subtle)]">Henter kartdata ...</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {frame.kind === 'website' && !frame.isInternalDashboard && (
                                <Button
                                  size="xsmall"
                                  variant="tertiary"
                                  icon={<ChartNoAxesCombined size={14} />}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={() => handleToggleInsightPanel(frame)}
                                  title={selectedWebsite ? 'Vis/skjul innsikt' : 'Velg nettsted først'}
                                  aria-label={activeInsightFrameId === frame.id ? 'Skjul innsikt' : 'Vis innsikt'}
                                  disabled={!selectedWebsite}
                                >
                                  {activeInsightFrameId === frame.id ? 'Skjul innsikt' : 'Vis innsikt'}
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
                              className="pointer-events-auto absolute inset-x-2 top-0 h-2 cursor-move"
                              onMouseDown={(event) => handleDragStart(event, frame)}
                            />
                            <div
                              className="pointer-events-auto absolute inset-x-2 bottom-0 h-2 cursor-move"
                              onMouseDown={(event) => handleDragStart(event, frame)}
                            />
                            <div
                              className="pointer-events-auto absolute inset-y-2 left-0 w-2 cursor-move"
                              onMouseDown={(event) => handleDragStart(event, frame)}
                            />
                            <div
                              className="pointer-events-auto absolute inset-y-2 right-0 w-2 cursor-move"
                              onMouseDown={(event) => handleDragStart(event, frame)}
                            />
                          </div>
                        )}
                        {(frame.kind === 'sticky' ||
                          frame.kind === 'text' ||
                          frame.kind === 'heading' ||
                          frame.kind === 'icon' ||
                          frame.kind === 'image' ||
                          (frame.kind === 'website' && frame.isInternalDashboard)) && (
                          <>
                            <div
                              className="pointer-events-none absolute inset-0 z-20 overflow-visible"
                              aria-hidden="true"
                            >
                              <div
                                className="pointer-events-auto absolute inset-x-2 top-0 h-2 cursor-move"
                                onMouseDown={(event) => handleDragStart(event, frame)}
                              />
                              <div
                                className="pointer-events-auto absolute inset-x-2 bottom-0 h-2 cursor-move"
                                onMouseDown={(event) => handleDragStart(event, frame)}
                              />
                              <div
                                className="pointer-events-auto absolute inset-y-2 left-0 w-2 cursor-move"
                                onMouseDown={(event) => handleDragStart(event, frame)}
                              />
                              <div
                                className="pointer-events-auto absolute inset-y-2 right-0 w-2 cursor-move"
                                onMouseDown={(event) => handleDragStart(event, frame)}
                              />
                            </div>
                            <div
                              className={`pointer-events-none absolute z-30 ${
                                frame.kind === 'heading' || frame.kind === 'icon' || isIllustrationFrame
                                  ? 'right-0 -top-6 flex items-center gap-1'
                                  : 'right-2 top-2'
                              }`}
                            >
                              {(frame.kind === 'image' || (frame.kind === 'website' && frame.isInternalDashboard)) && (
                                <Button
                                  size="xsmall"
                                  variant="tertiary"
                                  icon={<Edit2 size={14} />}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={() => {
                                    if (frame.kind === 'image') {
                                      if (isIllustrationFrame) {
                                        handleOpenEditIllustrationModal(frame)
                                      } else {
                                        handleOpenEditImageModal(frame)
                                      }
                                    } else {
                                      handleOpenEditDashboardModal(frame)
                                    }
                                  }}
                                  title={
                                    frame.kind === 'image'
                                      ? isIllustrationFrame
                                        ? 'Rediger illustrasjon'
                                        : 'Rediger bilde'
                                      : 'Rediger dashboard'
                                  }
                                  aria-label={
                                    frame.kind === 'image'
                                      ? isIllustrationFrame
                                        ? 'Rediger illustrasjon'
                                        : 'Rediger bilde'
                                      : 'Rediger dashboard'
                                  }
                                  className={CARD_ACTION_BUTTON_CLASSNAME}
                                />
                              )}
                              {frame.kind === 'icon' && (
                                <Button
                                  size="xsmall"
                                  variant="tertiary"
                                  icon={<Edit2 size={14} />}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={() => handleOpenEditIconModal(frame)}
                                  title="Rediger ikon"
                                  aria-label="Rediger ikon"
                                  className={CARD_ACTION_BUTTON_CLASSNAME}
                                />
                              )}
                              {frame.kind === 'icon' && (
                                <>
                                  <Button
                                    size="xsmall"
                                    variant="tertiary"
                                    icon={<RotateCcw size={14} />}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => handleRotateIconFrame(frame.id, -ICON_ROTATION_STEP_DEG)}
                                    title="Roter venstre"
                                    aria-label="Roter venstre"
                                    className={CARD_ACTION_BUTTON_CLASSNAME}
                                  />
                                  <Button
                                    size="xsmall"
                                    variant="tertiary"
                                    icon={<RotateCw size={14} />}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => handleRotateIconFrame(frame.id, ICON_ROTATION_STEP_DEG)}
                                    title="Roter hoyre"
                                    aria-label="Roter hoyre"
                                    className={CARD_ACTION_BUTTON_CLASSNAME}
                                  />
                                </>
                              )}
                              {frame.kind === 'heading' && (
                                <>
                                  <Button
                                    size="xsmall"
                                    variant="tertiary"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => handleAdjustHeadingFontSize(frame.id, -HEADING_FONT_SIZE_STEP)}
                                    title="Mindre tekststorrelse"
                                    aria-label="Mindre tekststorrelse"
                                    className={CARD_ACTION_BUTTON_CLASSNAME}
                                  >
                                    A-
                                  </Button>
                                  <Button
                                    size="xsmall"
                                    variant="tertiary"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => handleAdjustHeadingFontSize(frame.id, HEADING_FONT_SIZE_STEP)}
                                    title="Storre tekststorrelse"
                                    aria-label="Storre tekststorrelse"
                                    className={CARD_ACTION_BUTTON_CLASSNAME}
                                  >
                                    A+
                                  </Button>
                                </>
                              )}
                              {isIllustrationFrame && (
                                <>
                                  <Button
                                    size="xsmall"
                                    variant="tertiary"
                                    icon={<RotateCcw size={14} />}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => handleRotateIllustrationFrame(frame.id, -ICON_ROTATION_STEP_DEG)}
                                    title="Roter venstre"
                                    aria-label="Roter venstre"
                                    className={CARD_ACTION_BUTTON_CLASSNAME}
                                  />
                                  <Button
                                    size="xsmall"
                                    variant="tertiary"
                                    icon={<RotateCw size={14} />}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => handleRotateIllustrationFrame(frame.id, ICON_ROTATION_STEP_DEG)}
                                    title="Roter hoyre"
                                    aria-label="Roter hoyre"
                                    className={CARD_ACTION_BUTTON_CLASSNAME}
                                  />
                                </>
                              )}
                              <Button
                                size="xsmall"
                                variant="tertiary"
                                icon={<Trash2 size={14} />}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => handleRequestRemoveFrame(frame)}
                                title="Fjern kort"
                                aria-label="Fjern kort"
                                className={CARD_ACTION_BUTTON_CLASSNAME}
                              />
                            </div>
                          </>
                        )}
                        {(frame.kind === 'heading' || frame.kind === 'text' || frame.kind === 'icon') && (
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
                                onMouseDown={(event) => startConnectionDrag(event, frame)}
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
                                onMouseDown={(event) => startConnectionDrag(event, frame)}
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
                            <div
                              className={`flex h-full flex-col ${isIllustrationFrame ? 'bg-transparent' : 'bg-white'}`}
                            >
                              {frame.src && !failedImageFrameIds[frame.id] ? (
                                <div
                                  className={`h-full w-full overflow-hidden ${isIllustrationFrame ? 'bg-transparent p-0' : 'bg-white p-2'}`}
                                >
                                  <img
                                    key={`${frame.id}-${frame.refreshNonce}`}
                                    alt={frame.label}
                                    src={frame.src}
                                    className={`h-full w-full object-contain ${isIllustrationFrame ? '' : 'rounded'}`}
                                    style={
                                      isIllustrationFrame
                                        ? { transform: `rotate(${frame.imageRotationDeg ?? 0}deg)` }
                                        : undefined
                                    }
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={() => {
                                      setFailedImageFrameIds((current) => ({ ...current, [frame.id]: true }))
                                    }}
                                    onLoad={() => {
                                      setFailedImageFrameIds((current) => {
                                        if (!current[frame.id]) return current
                                        const next = { ...current }
                                        delete next[frame.id]
                                        return next
                                      })
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--ax-text-subtle)]">
                                  Kunne ikke laste bilde fra denne URL-en.
                                </div>
                              )}
                            </div>
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
                                <div className="space-y-2">
                                  <p className="text-sm font-semibold text-[var(--ax-text-default)]">{frame.label}</p>
                                  {frame.targetUrl && (
                                    <Link
                                      href={frame.targetUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5"
                                    >
                                      <span>Åpne nettside</span>
                                      <ExternalLink size={14} aria-hidden="true" />
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : frame.kind === 'chart' && frame.chartSql && frame.chartType ? (
                            <div className="h-full p-2">
                              <DashboardWidget
                                chart={{
                                  id: `canvas-chart-${frame.id}`,
                                  title: frame.label,
                                  type: frame.chartType,
                                  sql: frame.chartSql,
                                }}
                                websiteId={selectedWebsite?.id ?? ''}
                                filters={dashboardWidgetFilters}
                                chartLinksEnabled={false}
                                onEditChart={() => handleOpenEditChartModal(frame)}
                                onDeleteChart={() => handleOpenDeleteChartModal(frame)}
                              />
                            </div>
                          ) : frame.kind === 'icon' ? (
                            (() => {
                              const selectedIcon = getCanvasIconOptionById(frame.iconName)
                              const Icon = selectedIcon.Icon
                              const width = frame.width ?? defaults.width
                              const height = frame.height ?? defaults.height
                              const iconSize = Math.max(22, Math.floor(Math.min(width, height) * 0.82))
                              const iconRotationDeg = frame.iconRotationDeg ?? 0
                              const iconColor = getCanvasIconColor(frame.iconColor)
                              return (
                                <div className="flex h-full w-full items-center justify-center p-0">
                                  <Icon
                                    fontSize={`${iconSize}px`}
                                    style={{ transform: `rotate(${iconRotationDeg}deg)`, color: iconColor }}
                                    aria-hidden="true"
                                  />
                                </div>
                              )
                            })()
                          ) : frame.kind === 'heading' ? (
                            <div className="overflow-visible pt-0 pr-0 pb-0">
                              {activeEditableFrameId === frame.id ? (
                                <textarea
                                  value={frame.headingText || ''}
                                  onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                                  onBlur={() => handleEditableFrameBlur(frame.id)}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  lang="nb-NO"
                                  placeholder="Skriv overskrift"
                                  className="block w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
                                  style={{
                                    fontSize: `${getHeadingFrameFontSize(frame)}px`,
                                    lineHeight: 1.05,
                                    fontWeight: 700,
                                  }}
                                  rows={1}
                                  autoFocus
                                />
                              ) : (
                                (() => {
                                  const headingTag = 'h2'
                                  return createElement(
                                    headingTag,
                                    {
                                      className:
                                        'cursor-text select-text whitespace-pre-wrap break-words text-[var(--ax-text-default)] m-0',
                                      onClick: () => handleStartEditingFrame(frame.id),
                                      style: {
                                        fontSize: `${getHeadingFrameFontSize(frame)}px`,
                                        lineHeight: 1.05,
                                        fontWeight: 700,
                                      },
                                    },
                                    frame.headingText || frame.label || 'Skriv overskrift',
                                  )
                                })()
                              )}
                            </div>
                          ) : frame.kind === 'text' ? (
                            <div className="h-full overflow-auto px-2 pb-2">
                              {activeEditableFrameId === frame.id ? (
                                <textarea
                                  value={frame.textContent || ''}
                                  onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                                  onBlur={() => handleEditableFrameBlur(frame.id)}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  lang="nb-NO"
                                  placeholder="Skriv tekst"
                                  className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
                                  style={{ fontSize: '24px', lineHeight: 1.3, fontWeight: 500 }}
                                  autoFocus
                                />
                              ) : (
                                <div
                                  className="h-full cursor-text overflow-auto whitespace-pre-wrap break-words text-[var(--ax-text-default)]"
                                  style={{ fontSize: '24px', lineHeight: 1.3, fontWeight: 500 }}
                                  onClick={() => handleStartEditingFrame(frame.id)}
                                >
                                  {frame.textContent || 'Skriv tekst'}
                                </div>
                              )}
                            </div>
                          ) : frame.kind === 'sticky' ? (
                            <div className="h-full overflow-auto p-4">
                              {activeEditableFrameId === frame.id ? (
                                <textarea
                                  value={frame.textContent || ''}
                                  onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                                  onBlur={() => handleEditableFrameBlur(frame.id)}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  lang="nb-NO"
                                  placeholder="Skriv Post-it-lapp"
                                  className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-base leading-7 text-[#4a3d00] outline-none placeholder:text-[#7a6b2a]"
                                  autoFocus
                                />
                              ) : (
                                <div
                                  className="cursor-text whitespace-pre-wrap break-words text-base leading-7 text-[#4a3d00]"
                                  onClick={() => handleStartEditingFrame(frame.id)}
                                >
                                  {frame.textContent || 'Skriv Post-it-lapp'}
                                </div>
                              )}
                            </div>
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
                            frame.kind === 'text'
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
        <div className="pointer-events-none fixed bottom-4 right-4 z-30">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
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
              aria-label="Tilbakestill zoom"
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
        </div>
      </section>

      <Modal
        open={shouldShowCreateCanvasModal}
        onClose={() => {
          // Keep modal open until user creates or navigates away.
        }}
        header={{ heading: 'Opprett canvas', closeButton: false }}
        width="small"
        closeOnBackdropClick={false}
      >
        <Modal.Body>
          <div className="space-y-3">
            <div className="text-sm text-[var(--ax-text-subtle)]">
              Fant ikke et gyldig canvas for denne URL-en. Opprett et nytt canvas for å fortsette.
            </div>
            <Select
              label="Team"
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
            Opprett canvas
          </Button>
          <Button variant="secondary" size="small" as="a" href={projectManagerHref} disabled={isCreatingCanvas}>
            Til Dashboard
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isCanvasSettingsModalOpen}
        onClose={() => {
          setIsCanvasSettingsModalOpen(false)
          setRenameCanvasError(null)
        }}
        header={{ heading: 'Canvas-innstillinger' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <WebsitePicker
              selectedWebsite={selectedWebsite}
              onWebsiteChange={setSelectedWebsite}
              disableAutoRestore
              variant="default"
              customLabel="Nettside"
            />
            <TextField
              label="Canvas-navn"
              value={renameCanvasInput}
              onChange={(event) => {
                setRenameCanvasInput(event.target.value)
                if (renameCanvasError) setRenameCanvasError(null)
              }}
            />
            {renameCanvasError && <Alert variant="error">{renameCanvasError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleRenameCanvas()} size="small" loading={isSavingCanvasItem}>
            Lagre
          </Button>
          <Button variant="secondary" size="small" onClick={() => setIsCanvasSettingsModalOpen(false)}>
            Lukk
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isCreateTabModalOpen}
        onClose={() => {
          setIsCreateTabModalOpen(false)
          setCreateTabError(null)
        }}
        header={{ heading: 'Legg til fane' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <TextField
              label="Fanenavn"
              value={newTabName}
              onChange={(event) => {
                setNewTabName(event.target.value)
                if (createTabError) setCreateTabError(null)
              }}
              autoFocus
            />
            {createTabError && <Alert variant="error">{createTabError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => void handleCreateTab()} size="small" loading={creatingTab}>
            Legg til
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setIsCreateTabModalOpen(false)}
            disabled={creatingTab}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={isManageTabsModalOpen}
        onClose={() => {
          setIsManageTabsModalOpen(false)
          setManageTabError(null)
        }}
        header={{ heading: 'Administrer faner' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Select
              label="Hvilken fane vil du endre?"
              value={manageTabId}
              onChange={(event) => {
                const nextId = event.target.value
                setManageTabId(nextId)
                const selected = canvasCategories.find((category) => String(category.id) === nextId)
                setManageTabName(selected?.name ?? '')
                if (manageTabError) setManageTabError(null)
              }}
              disabled={savingManageTab || deletingManageTab || canvasCategories.length === 0}
            >
              <option value="" disabled>
                {canvasCategories.length === 0 ? 'Ingen faner funnet' : 'Velg fane'}
              </option>
              {canvasCategories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {getCanvasCategoryDisplayName(category.name)}
                </option>
              ))}
            </Select>
            <TextField
              label="Fanenavn"
              value={manageTabName}
              onChange={(event) => {
                setManageTabName(event.target.value)
                if (manageTabError) setManageTabError(null)
              }}
              disabled={savingManageTab || deletingManageTab || canvasCategories.length === 0}
            />
            {selectedManageTab && (
              <div className="text-sm text-[var(--ax-text-subtle)]">
                {selectedManageTabIsFirst
                  ? 'Første fane kan ikke slettes.'
                  : selectedManageTabIsEmpty
                    ? 'Denne fanen er tom og kan slettes.'
                    : `Fanen inneholder ${selectedManageTabItemCount} element(er) og kan ikke slettes.`}
              </div>
            )}
            {manageTabError && <Alert variant="error">{manageTabError}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            onClick={() => void handleRenameTab()}
            size="small"
            loading={savingManageTab}
            disabled={deletingManageTab || !manageTabId || canvasCategories.length === 0}
          >
            Lagre navn
          </Button>
          <Button
            variant="danger"
            size="small"
            onClick={() => void handleDeleteTab()}
            loading={deletingManageTab}
            disabled={savingManageTab || !selectedManageTab || selectedManageTabIsFirst || !selectedManageTabIsEmpty}
          >
            Slett fane
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setIsManageTabsModalOpen(false)}
            disabled={savingManageTab || deletingManageTab}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

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
            <VisualizationModeSelect
              value={newPageVisualizationMode}
              onChange={(nextMode) => {
                setNewPageVisualizationMode(nextMode)
                if (addPageError) setAddPageError(null)
              }}
              size="small"
              label="Visualisering"
              allowNoneOption
              noneOptionLabel="Ingen"
            />
            <p className="text-xs text-[var(--ax-text-subtle)]">
              Velg hvordan klikkdata vises over nettsiden i kortet (klikkkart, varmekart eller scrollkart).
            </p>
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
        defaultWebsiteId={selectedWebsite?.id}
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
        onClose={() => setDeleteTarget(null)}
        header={{
          heading: deleteTarget?.type === 'connection' ? 'Fjern kobling' : 'Fjern kort',
        }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <p>
              Er du sikker på at du vil fjerne{' '}
              <strong>{deleteTarget?.type === 'connection' ? 'koblingen' : 'kortet'}</strong>
              {deleteTarget?.label ? (
                <>
                  {' '}
                  <strong>{deleteTarget.label}</strong>
                </>
              ) : null}
              ?
            </p>
            <p className="text-[var(--ax-text-subtle)]">Denne handlingen kan ikke angres.</p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="danger" onClick={() => void handleConfirmDeleteTarget()} loading={isSavingCanvasItem}>
            {deleteTarget?.type === 'connection' ? 'Fjern kobling' : 'Fjern kort'}
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
        header={{ heading: 'Legg til graf' }}
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
            <Link href="/grafbygger" target="_blank" rel="noopener noreferrer">
              Lag en graf i Grafbyggeren (åpnes i ny fane)
            </Link>
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
    </>
  )
}

export default Canvas
