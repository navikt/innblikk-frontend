import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionMenu, Alert, Button, Link, Loader, Modal, Select, Switch, TextField, Textarea } from '@navikt/ds-react'
import { ChartNoAxesCombined, Edit2, ExternalLink, Minus, Move, Plus, RefreshCw, Trash2 } from 'lucide-react'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import WebsitePicker from '../../analysis/ui/WebsitePicker.tsx'
import { computeFunnelStepMetrics } from '../../analysis/utils/horizontalFunnel.ts'
import { formatDateRange } from '../../analysis/utils/periodPicker.ts'
import type { PageMetricRow } from '../../traffic/model/types.ts'
import { fetchPageMetrics } from '../../traffic/api/trafficApi.ts'
import { fetchFunnelData } from '../../funnel/api/funnelApi.ts'
import { splitUrlStepInput } from '../../funnel/utils/stepUtils.ts'
import {
  getCookieCountByParams,
  getDateRangeFromPeriod,
  getStoredPeriod,
  normalizeUrlToPath,
  savePeriodPreference,
} from '../../../shared/lib/utils.ts'
import { DashboardWidget } from '../../dashboard'
import { mapGraphTypeToChart } from '../../oversikt'
import {
  createCategory,
  createGraph,
  createQuery,
  deleteGraph,
  fetchCategories,
  fetchDashboards,
  fetchGraphs,
  fetchQueries,
  updateQuery,
} from '../../oversikt/api/oversiktApi.ts'
import type { FunnelStep } from '../../funnel/model/types.ts'
import type { Website } from '../../../shared/types/website.ts'
import { useCookieStartDate, useCookieSupport } from '../../../shared/hooks/useSiteimproveSupport.ts'

type CanvasChartType = 'line' | 'bar' | 'pie' | 'table'
type CanvasPayloadKind = 'website' | 'heading' | 'text' | 'sticky' | 'chart' | 'connection'
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
  kind: 'website' | 'heading' | 'text' | 'sticky' | 'chart'
  targetUrl?: string
  previewUrl?: string
  renderWebsite?: boolean
  headingText?: string
  headingFontSize?: number
  textContent?: string
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
  width?: number
  height?: number
  targetUrl?: string
  previewUrl?: string
  renderWebsite?: boolean
  headingText?: string
  headingFontSize?: number
  textContent?: string
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
const CANVAS_QUERY_NAME = 'canvas-config'
const CANVAS_SURFACE_WIDTH = 2200
const CANVAS_SURFACE_HEIGHT = 1500
const CANVAS_SURFACE_TOP_GAP = 24
const CANVAS_ZOOM_MIN = 0.5
const CANVAS_ZOOM_MAX = 1.5
const CANVAS_ZOOM_STEP = 0.1
const HEADING_FONT_SIZE_DEFAULT = 24
const HEADING_FONT_SIZE_MIN = 14
const HEADING_FONT_SIZE_MAX = 40
const HEADING_FONT_SIZE_STEP = 2

const clampCanvasZoom = (value: number): number => Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value))
const clampHeadingFontSize = (value: number): number =>
  Math.min(HEADING_FONT_SIZE_MAX, Math.max(HEADING_FONT_SIZE_MIN, value))

const normalizeInputToTargetUrl = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('/')) {
    try {
      const url = new URL(trimmed, 'https://www.nav.no/')
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
const HEADING_CARD_HEADER_HEIGHT = 46
const CANVAS_TOP_BUFFER = 240
const HEADING_TEXT_MIN_WIDTH = 140
const HEADING_TEXT_MAX_WIDTH = 820
const HEADING_TEXT_EXTRA_WIDTH = 32
const HEADING_TEXT_VERTICAL_PADDING = 0

const createPreviewProxySrc = (targetUrl: string): string => {
  return `/api/clickmap-preview?url=${encodeURIComponent(targetUrl)}`
}

const getWebsiteFrameDisplayUrl = (frame: CanvasFrame): string | undefined => {
  if (frame.renderWebsite === false) {
    return frame.previewUrl
  }

  return frame.targetUrl
}

const getWebsiteFrameRenderSrc = (frame: CanvasFrame): string | undefined => {
  if (frame.renderWebsite === false) {
    return frame.previewUrl
  }

  return frame.targetUrl ? createPreviewProxySrc(frame.targetUrl) : undefined
}

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
  value === 'heading' ||
  value === 'text' ||
  value === 'sticky' ||
  value === 'chart' ||
  value === 'connection'

const isRenderableCanvasFrameKind = (value: unknown): value is CanvasFrame['kind'] =>
  value === 'website' || value === 'heading' || value === 'text' || value === 'sticky' || value === 'chart'

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
      targetUrl: typeof parsed.targetUrl === 'string' ? parsed.targetUrl : undefined,
      previewUrl: typeof parsed.previewUrl === 'string' ? parsed.previewUrl : undefined,
      renderWebsite: typeof parsed.renderWebsite === 'boolean' ? parsed.renderWebsite : undefined,
      headingText: typeof parsed.headingText === 'string' ? parsed.headingText : undefined,
      headingFontSize: Number.isFinite(parsed.headingFontSize) ? Number(parsed.headingFontSize) : undefined,
      textContent: typeof parsed.textContent === 'string' ? parsed.textContent : undefined,
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
    return {
      onlyDirectEntry: params.get('strict') ? params.get('strict') === 'true' : false,
      projectId: Number.isFinite(projectId) ? projectId : null,
      dashboardId: Number.isFinite(dashboardId) ? dashboardId : null,
    }
  }, [])
  const { onlyDirectEntry, projectId, dashboardId } = routeContext
  const canPersistToDashboard = projectId !== null && dashboardId !== null
  const [canvasTitle, setCanvasTitle] = useState('Canvas')
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null)
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
  const [isAddHeadingModalOpen, setIsAddHeadingModalOpen] = useState(false)
  const [isAddTextModalOpen, setIsAddTextModalOpen] = useState(false)
  const [isAddStickyModalOpen, setIsAddStickyModalOpen] = useState(false)
  const [isAddChartModalOpen, setIsAddChartModalOpen] = useState(false)
  const [isEditWebsiteModalOpen, setIsEditWebsiteModalOpen] = useState(false)
  const [editWebsiteFrameId, setEditWebsiteFrameId] = useState<string | null>(null)
  const [editWebsitePathInput, setEditWebsitePathInput] = useState('')
  const [editWebsitePreviewUrlInput, setEditWebsitePreviewUrlInput] = useState('')
  const [editWebsiteRenderEnabled, setEditWebsiteRenderEnabled] = useState(true)
  const [newPagePathInput, setNewPagePathInput] = useState('')
  const [newPagePreviewUrlInput, setNewPagePreviewUrlInput] = useState('')
  const [newPageRenderEnabled, setNewPageRenderEnabled] = useState(true)
  const [addPageError, setAddPageError] = useState<string | null>(null)
  const [editWebsiteError, setEditWebsiteError] = useState<string | null>(null)
  const [headingTextInput, setHeadingTextInput] = useState('')
  const [addHeadingError, setAddHeadingError] = useState<string | null>(null)
  const [textContentInput, setTextContentInput] = useState('')
  const [addTextError, setAddTextError] = useState<string | null>(null)
  const [stickyContentInput, setStickyContentInput] = useState('')
  const [addStickyError, setAddStickyError] = useState<string | null>(null)
  const [chartOptions, setChartOptions] = useState<CanvasChartOption[]>([])
  const [selectedChartOptionId, setSelectedChartOptionId] = useState('')
  const [isLoadingChartOptions, setIsLoadingChartOptions] = useState(false)
  const [addChartError, setAddChartError] = useState<string | null>(null)
  const [dragState, setDragState] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [resizeState, setResizeState] = useState<{
    id: string
    startX: number
    startY: number
    startWidth: number
    startHeight: number
  } | null>(null)
  const [canvasCategoryId, setCanvasCategoryId] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [, setIsLoadingCanvasItems] = useState(false)
  const [isSavingCanvasItem, setIsSavingCanvasItem] = useState(false)
  const [connectionMetrics, setConnectionMetrics] = useState<Record<string, CanvasConnectionMetric | null>>({})
  const [connectionDragState, setConnectionDragState] = useState<ConnectionDragState | null>(null)
  const [toolbarNotice, setToolbarNotice] = useState<string | null>(null)
  const [pageInsights, setPageInsights] = useState<Record<string, CanvasPageInsight>>({})
  const [activeInsightFrameId, setActiveInsightFrameId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CanvasDeleteTarget | null>(null)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const pageInsightsRef = useRef<Record<string, CanvasPageInsight>>({})
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const canvasToolbarRef = useRef<HTMLDivElement | null>(null)
  const connectionMetricRequestSignatureRef = useRef<string | null>(null)
  const [canvasToolbarHeight, setCanvasToolbarHeight] = useState(120)
  const toolbarNoticeTimerRef = useRef<number | null>(null)
  const toolbarNoticeReadyRef = useRef(false)
  const canvasCanvasTopOffset = canvasToolbarHeight + CANVAS_SURFACE_TOP_GAP

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

  const activeInsightState = activeInsightFrameId ? (pageInsights[activeInsightFrameId] ?? null) : null
  const activeInsightPeriodLabel = useMemo(
    () => getCanvasPeriodLabel(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate],
  )

  useEffect(() => {
    pageInsightsRef.current = pageInsights
  }, [pageInsights])

  const frameItems = useMemo(
    () =>
      frames.map((frame) => {
        const displayUrl = getWebsiteFrameDisplayUrl(frame)
        return {
          ...frame,
          displayUrl,
          src: getWebsiteFrameRenderSrc(frame) || '',
        }
      }),
    [frames],
  )

  const ensureCanvasCategory = useCallback(async (): Promise<number | null> => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) return null
    if (canvasCategoryId) return canvasCategoryId

    const categories = await fetchCategories(projectId, dashboardId)
    if (categories.length > 0) {
      const firstCategoryId = categories[0].id
      setCanvasCategoryId(firstCategoryId)
      return firstCategoryId
    }

    const createdCategory = await createCategory(projectId, dashboardId, 'Fane 1')
    setCanvasCategoryId(createdCategory.id)
    return createdCategory.id
  }, [canPersistToDashboard, projectId, dashboardId, canvasCategoryId])

  const loadPageInsight = useCallback(
    async (frame: CanvasFrame) => {
      if (frame.kind !== 'website') return

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
        targetUrl: frame.targetUrl,
        previewUrl: frame.previewUrl,
        renderWebsite: frame.renderWebsite,
        headingText: frame.headingText,
        headingFontSize: frame.headingFontSize,
        textContent: frame.textContent,
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
    if (!canPersistToDashboard || projectId === null || dashboardId === null) return

    let isActive = true
    const loadCanvasItems = async () => {
      setIsLoadingCanvasItems(true)
      setSyncError(null)
      try {
        const categories = await fetchCategories(projectId, dashboardId)
        if (!isActive) return
        if (categories.length > 0) {
          setCanvasCategoryId(categories[0].id)
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
              targetUrl: parsedConfig.targetUrl,
              previewUrl: parsedConfig.previewUrl,
              renderWebsite: parsedConfig.renderWebsite,
              headingText: parsedConfig.headingText,
              headingFontSize: parsedConfig.headingFontSize,
              textContent: parsedConfig.textContent,
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
  }, [canPersistToDashboard, projectId, dashboardId])

  useEffect(() => {
    if (!canPersistToDashboard || projectId === null || dashboardId === null) return
    let isActive = true

    const loadCanvasTitle = async () => {
      try {
        const dashboards = await fetchDashboards(projectId)
        if (!isActive) return
        const dashboard = dashboards.find((item) => item.id === dashboardId)
        setCanvasTitle(dashboard?.name?.trim() || 'Canvas')
      } catch {
        if (!isActive) return
        setCanvasTitle('Canvas')
      }
    }

    void loadCanvasTitle()
    return () => {
      isActive = false
    }
  }, [canPersistToDashboard, projectId, dashboardId])

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
    const targetUrl = normalizeInputToTargetUrl(newPagePathInput)
    if (!targetUrl) {
      setAddPageError('Legg inn en gyldig URL, for eksempel https://www.nav.no/aap.')
      return
    }

    const previewInput = newPagePreviewUrlInput.trim()
    const previewUrl = previewInput ? normalizeInputToTargetUrl(previewInput) : undefined
    if (!newPageRenderEnabled && previewInput && !previewUrl) {
      setAddPageError('Legg inn en gyldig visnings-URL, for eksempel https://www.nav.no/...')
      return
    }

    const comparableUrl = getComparableUrl(targetUrl)
    if (
      frames.some(
        (frame) => frame.kind === 'website' && frame.targetUrl && getComparableUrl(frame.targetUrl) === comparableUrl,
      )
    ) {
      setAddPageError('Siden er allerede lagt til i canvaset.')
      return
    }

    const index = frames.length
    const column = index % 3
    const row = Math.floor(index / 3)
    const newFrame: CanvasFrame = {
      id: `${Date.now()}-${Math.random()}`,
      kind: 'website',
      targetUrl,
      previewUrl: newPageRenderEnabled ? undefined : (previewUrl ?? undefined),
      renderWebsite: newPageRenderEnabled,
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
      setAddPageError(null)
      setIsAddPageModalOpen(false)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre nettside i canvas')
    } finally {
      setIsSavingCanvasItem(false)
    }
  }

  const handleOpenEditWebsiteModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'website') return
    setEditWebsiteFrameId(frame.id)
    setEditWebsitePathInput(frame.targetUrl || '')
    setEditWebsitePreviewUrlInput(frame.previewUrl || '')
    setEditWebsiteRenderEnabled(frame.renderWebsite !== false)
    setEditWebsiteError(null)
    setIsEditWebsiteModalOpen(true)
  }

  const handleOpenInsightModal = (frame: CanvasFrame) => {
    if (frame.kind !== 'website') return
    setActiveInsightFrameId(frame.id)
  }

  const handleSaveEditedWebsite = async () => {
    if (!editWebsiteFrameId) return

    const targetUrl = normalizeInputToTargetUrl(editWebsitePathInput)
    if (!targetUrl) {
      setEditWebsiteError('Legg inn en gyldig URL, for eksempel https://www.nav.no/aap.')
      return
    }

    const previewInput = editWebsitePreviewUrlInput.trim()
    const previewUrl = previewInput ? normalizeInputToTargetUrl(previewInput) : undefined
    if (!editWebsiteRenderEnabled && previewInput && !previewUrl) {
      setEditWebsiteError('Legg inn en gyldig visnings-URL, for eksempel https://www.nav.no/...')
      return
    }

    const comparableUrl = getComparableUrl(targetUrl)
    if (
      frames.some(
        (frame) =>
          frame.id !== editWebsiteFrameId &&
          frame.kind === 'website' &&
          frame.targetUrl &&
          getComparableUrl(frame.targetUrl) === comparableUrl,
      )
    ) {
      setEditWebsiteError('Siden er allerede lagt til i canvaset.')
      return
    }

    const currentFrame = frames.find((frame) => frame.id === editWebsiteFrameId)
    if (!currentFrame || currentFrame.kind !== 'website') return

    const updatedFrame: CanvasFrame = {
      ...currentFrame,
      targetUrl,
      previewUrl: editWebsiteRenderEnabled ? undefined : (previewUrl ?? undefined),
      renderWebsite: editWebsiteRenderEnabled,
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
      setEditWebsiteError(null)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke oppdatere nettside')
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
      const defaults = getDefaultFrameSize(frame.kind)
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
    const defaults = getDefaultFrameSize(frame.kind)
    const width = frame.width ?? defaults.width
    const height = frame.height ?? defaults.height
    const headerHeight = frame.kind === 'website' ? WEBSITE_CARD_HEADER_HEIGHT : 0
    const bodyHeight = Math.max(height - headerHeight, 0)
    return {
      x: side === 'left' ? frame.x : frame.x + width,
      y: frame.y + headerHeight + bodyHeight / 2,
    }
  }, [])

  const createConnectionBetweenFrames = useCallback(
    async (source: CanvasFrame, target: CanvasFrame) => {
      if (source.kind !== 'website' || target.kind !== 'website') return
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
      if (frame.kind !== 'website') return
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
      label: 'Sticky note',
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
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre sticky note i canvas')
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
    kind: CanvasFrame['kind'],
  ): { width: number; height: number; minWidth: number; minHeight: number } => {
    if (kind === 'website') return { width: 420, height: 560, minWidth: 320, minHeight: 320 }
    if (kind === 'chart') return { width: 680, height: 460, minWidth: 420, minHeight: 280 }
    if (kind === 'heading') return { width: 420, height: 72, minWidth: 260, minHeight: 48 }
    if (kind === 'text') return { width: 340, height: 170, minWidth: 240, minHeight: 120 }
    return { width: 360, height: 180, minWidth: 280, minHeight: 120 }
  }

  const getHeadingFrameFontSize = useCallback((frame: CanvasFrame): number => {
    return clampHeadingFontSize(frame.headingFontSize ?? HEADING_FONT_SIZE_DEFAULT)
  }, [])

  const getHeadingFrameWidth = useCallback(
    (frame: CanvasFrame): number => {
      if (frame.kind !== 'heading') return frame.width ?? getDefaultFrameSize(frame.kind).width

      const headingText = (frame.headingText || frame.label || '').trim()
      const fontSize = getHeadingFrameFontSize(frame)
      const estimatedTextWidth = Math.ceil(headingText.length * (fontSize * 0.52)) + HEADING_TEXT_EXTRA_WIDTH
      return Math.min(HEADING_TEXT_MAX_WIDTH, Math.max(HEADING_TEXT_MIN_WIDTH, estimatedTextWidth))
    },
    [getHeadingFrameFontSize],
  )

  const getHeadingFrameHeight = useCallback(
    (frame: CanvasFrame): number => {
      if (frame.kind !== 'heading') return frame.height ?? getDefaultFrameSize(frame.kind).height

      const headingText = (frame.headingText || frame.label || '').trim()
      const width = getHeadingFrameWidth(frame)
      const fontSize = getHeadingFrameFontSize(frame)
      const usableWidth = Math.max(width - 24, HEADING_TEXT_MIN_WIDTH)
      const charsPerLine = Math.max(12, Math.floor(usableWidth / (fontSize * 0.52)))
      const lineCount = headingText
        ? headingText.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
        : 1
      return Math.max(28, lineCount * Math.ceil(fontSize * 1.05) + HEADING_TEXT_VERTICAL_PADDING)
    },
    [getHeadingFrameFontSize, getHeadingFrameWidth],
  )

  const updateHeadingFontSize = useCallback(
    async (frameId: string, delta: number) => {
      const currentFrame = frames.find((frame) => frame.id === frameId)
      if (!currentFrame || currentFrame.kind !== 'heading') return

      const nextFontSize = clampHeadingFontSize(getHeadingFrameFontSize(currentFrame) + delta)
      const updatedFrame: CanvasFrame = {
        ...currentFrame,
        headingFontSize: nextFontSize,
      }

      setFrames((prev) => prev.map((frame) => (frame.id === frameId ? updatedFrame : frame)))

      try {
        setIsSavingCanvasItem(true)
        setSyncError(null)
        const persistedFrame = await persistFrame(updatedFrame)
        setFrames((prev) => prev.map((frame) => (frame.id === frameId ? persistedFrame : frame)))
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Kunne ikke oppdatere overskrift')
      } finally {
        setIsSavingCanvasItem(false)
      }
    },
    [frames, getHeadingFrameFontSize, persistFrame],
  )

  const handleResizeStart = (event: React.MouseEvent, frame: CanvasFrame) => {
    event.stopPropagation()
    const defaults = getDefaultFrameSize(frame.kind)
    setResizeState({
      id: frame.id,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: frame.width ?? defaults.width,
      startHeight: frame.height ?? defaults.height,
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
      const movedFrame = frames.find((frame) => frame.id === dragState.id)
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
  }, [dragState, frames, getCanvasPointerPosition, persistFrame])

  useEffect(() => {
    if (!resizeState) return

    const onMouseMove = (event: MouseEvent) => {
      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.id !== resizeState.id) return frame
          const defaults = getDefaultFrameSize(frame.kind)
          const deltaX = (event.clientX - resizeState.startX) / canvasZoom
          const deltaY = (event.clientY - resizeState.startY) / canvasZoom
          return {
            ...frame,
            width: Math.max(defaults.minWidth, resizeState.startWidth + deltaX),
            height: Math.max(defaults.minHeight, resizeState.startHeight + deltaY),
          }
        }),
      )
    }

    const onMouseUp = () => {
      const resizedFrame = frames.find((frame) => frame.id === resizeState.id)
      if (resizedFrame?.graphId) {
        void persistFrame(resizedFrame).catch((error) => {
          setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre størrelse i canvas')
        })
      }
      setResizeState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [canvasZoom, frames, persistFrame, resizeState])

  useEffect(() => {
    if (!connectionDragState) return

    const updateConnectionDrag = (event: MouseEvent) => {
      const pointer = getCanvasPointerPosition(event.clientX, event.clientY)
      if (!pointer) return

      const currentTarget = frames.find((frame) => {
        if (frame.kind !== 'website') return false
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
      const sourceFrame = frames.find((frame) => frame.id === connectionDragState.sourceFrameId)
      if (!pointer || !sourceFrame || sourceFrame.kind !== 'website') {
        setConnectionDragState(null)
        return
      }

      const targetFrame = frames.find((frame) => {
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
  }, [connectionDragState, createConnectionBetweenFrames, frames, getCanvasPointerPosition, getFrameBounds])

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
        const byId = frames.find((frame) => frame.id === frameId)
        if (byId) return byId
      }
      if (graphId) {
        const byGraphId = frames.find((frame) => frame.graphId === graphId)
        if (byGraphId) return byGraphId
      }
      return null
    },
    [frames],
  )

  const connectionSegments = useMemo(
    () =>
      connections
        .map((connection) => {
          const fromFrame = resolveConnectionFrame(connection, 'from')
          const toFrame = resolveConnectionFrame(connection, 'to')
          if (!fromFrame || !toFrame) return null

          const x1 = getFrameAnchor(fromFrame, 'right').x
          const y1 = getFrameAnchor(fromFrame, 'right').y
          const x2 = getFrameAnchor(toFrame, 'left').x
          const y2 = getFrameAnchor(toFrame, 'left').y
          const delta = Math.max(80, Math.abs(x2 - x1) * 0.45)
          const path = `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`
          const midpoint = computeMidpoint(x1, y1, x2, y2, delta)

          return {
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
          }
        })
        .filter(
          (
            item,
          ): item is {
            id: string
            path: string
            labelX: number
            labelY: number
            midX: number
            midY: number
            endX: number
            endY: number
            fromUrl: string | undefined
            toUrl: string | undefined
          } => item !== null,
        ),
    [connections, resolveConnectionFrame, getFrameAnchor],
  )

  const connectionPreview = useMemo(() => {
    if (!connectionDragState) return null

    const sourceFrame = frames.find((frame) => frame.id === connectionDragState.sourceFrameId)
    if (!sourceFrame || sourceFrame.kind !== 'website') return null

    const targetFrame = connectionDragState.currentTargetFrameId
      ? frames.find((frame) => frame.id === connectionDragState.currentTargetFrameId)
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
  }, [connectionDragState, frames, getFrameAnchor])

  const connectionMetricRequests = useMemo(
    () =>
      connections
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
    [connections, resolveConnectionFrame],
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
        frame.id === id && frame.kind === 'website'
          ? {
              ...frame,
              refreshNonce: frame.refreshNonce + 1,
            }
          : frame,
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
    if (!frame || frame.kind === 'website' || frame.kind === 'chart') return

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
    void persistFrame(nextFrame).catch((error) => {
      setSyncError(error instanceof Error ? error.message : 'Kunne ikke lagre endringer i canvas')
    })
  }

  return (
    <>
      <section className="relative h-[100dvh] min-h-[100dvh] bg-[var(--ax-bg-neutral-soft)]">
        <div ref={canvasToolbarRef} className="pointer-events-none fixed left-4 right-4 top-4 z-30">
          <div className="pointer-events-auto rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex flex-1 items-center gap-1.5">
                <a
                  href="/"
                  aria-label="Gå til forsiden"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-[var(--ax-text-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
                >
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
                </a>
                <div
                  className="truncate text-[20px] font-semibold leading-none text-[var(--ax-text-default)]"
                  title={canvasTitle}
                >
                  {canvasTitle}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[160px] shrink-0 [&_label]:sr-only">
                  <WebsitePicker
                    selectedWebsite={selectedWebsite}
                    onWebsiteChange={setSelectedWebsite}
                    variant="minimal"
                    customLabel="Nettside"
                    labelClassName="[&_label]:sr-only"
                  />
                </div>
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
                    <Button size="small" icon={<Plus size={16} />} className="shrink-0 whitespace-nowrap">
                      Legg til
                    </Button>
                  </ActionMenu.Trigger>
                  <ActionMenu.Content align="end">
                    <ActionMenu.Item
                      onClick={() => {
                        setAddPageError(null)
                        setNewPagePreviewUrlInput('')
                        setNewPageRenderEnabled(true)
                        setIsAddPageModalOpen(true)
                      }}
                    >
                      Nettside
                    </ActionMenu.Item>
                    <ActionMenu.Item onClick={handleOpenAddChartModal}>Graf</ActionMenu.Item>
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
                        setAddTextError(null)
                        setIsAddTextModalOpen(true)
                      }}
                    >
                      Tekst
                    </ActionMenu.Item>
                    <ActionMenu.Item
                      onClick={() => {
                        setAddStickyError(null)
                        setIsAddStickyModalOpen(true)
                      }}
                    >
                      Sticky note
                    </ActionMenu.Item>
                  </ActionMenu.Content>
                </ActionMenu>
                {toolbarNotice && (
                  <div className="shrink-0 rounded-full bg-[var(--ax-bg-success-soft)] px-2 py-1 text-[12px] font-medium text-[var(--ax-text-success)]">
                    {toolbarNotice}
                  </div>
                )}
              </div>
            </div>
            {!canPersistToDashboard && (
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
                {connectionSegments
                  .map((segment) => {
                    const metrics = connectionMetrics[segment.id]
                    if (!metrics) return null

                    return {
                      ...segment,
                      metrics,
                    }
                  })
                  .filter(
                    (
                      item,
                    ): item is CanvasConnectionVisual & {
                      metrics: CanvasConnectionMetric
                    } => item !== null,
                  )
                  .map((segment) => (
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
                    const defaults = getDefaultFrameSize(frame.kind)
                    return (
                      <article
                        key={frame.id}
                        className={
                          frame.kind === 'website'
                            ? `group absolute flex flex-col overflow-visible rounded-lg border ${
                                connectionDragState?.sourceFrameId === frame.id ||
                                connectionDragState?.currentTargetFrameId === frame.id
                                  ? 'border-[var(--ax-border-accent)] ring-2 ring-[var(--ax-border-accent)]/20'
                                  : 'border-[var(--ax-border-neutral-subtle)]'
                              } bg-white shadow-sm`
                            : frame.kind === 'chart'
                              ? 'group absolute flex flex-col overflow-hidden rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-white shadow-sm'
                              : frame.kind === 'heading'
                                ? 'group absolute flex flex-col overflow-visible rounded-lg border border-transparent bg-transparent shadow-none'
                                : frame.kind === 'text'
                                  ? 'group absolute flex flex-col overflow-hidden rounded-xl border border-transparent bg-transparent shadow-none'
                                  : 'group absolute flex flex-col overflow-hidden rounded-xl border border-[#f1dc7d] bg-[#fff5b8] shadow-sm'
                        }
                        style={{
                          left: `${frame.x}px`,
                          top: `${frame.y}px`,
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
                        <header
                          className={
                            frame.kind === 'website'
                              ? 'flex cursor-move items-center justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-2'
                              : frame.kind === 'chart'
                                ? 'flex cursor-move items-center justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-2'
                                : frame.kind === 'heading'
                                  ? 'flex cursor-move items-center justify-between gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[#f1f5f9] px-2 py-2 opacity-0 transition-opacity pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
                                  : frame.kind === 'sticky'
                                    ? 'flex cursor-move items-center justify-between gap-2 border-b border-[#ebd56d] bg-[#fff1a6] px-2 py-2'
                                    : 'absolute right-2 top-2 z-10 flex items-center justify-end gap-1 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-focus-within:pointer-events-auto'
                          }
                          onMouseDown={
                            frame.kind === 'website' ||
                            frame.kind === 'sticky' ||
                            frame.kind === 'heading' ||
                            frame.kind === 'chart'
                              ? (event) => handleDragStart(event, frame)
                              : undefined
                          }
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {(frame.kind === 'website' || frame.kind === 'heading' || frame.kind === 'chart') && (
                              <Move size={14} className="text-[var(--ax-text-subtle)]" />
                            )}
                            {(frame.kind === 'website' || frame.kind === 'chart') && (
                              <div className="min-w-0 text-sm font-semibold text-[var(--ax-text-default)] break-all">
                                {frame.label}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {frame.kind === 'heading' && (
                              <>
                                <Button
                                  size="xsmall"
                                  variant="tertiary"
                                  icon={<Minus size={14} />}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={() => void updateHeadingFontSize(frame.id, -HEADING_FONT_SIZE_STEP)}
                                  title="Mindre overskrift"
                                  aria-label="Mindre overskrift"
                                  disabled={getHeadingFrameFontSize(frame) <= HEADING_FONT_SIZE_MIN}
                                />
                                <Button
                                  size="xsmall"
                                  variant="tertiary"
                                  icon={<Plus size={14} />}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={() => void updateHeadingFontSize(frame.id, HEADING_FONT_SIZE_STEP)}
                                  title="Større overskrift"
                                  aria-label="Større overskrift"
                                  disabled={getHeadingFrameFontSize(frame) >= HEADING_FONT_SIZE_MAX}
                                />
                              </>
                            )}
                            {frame.kind === 'website' && (
                              <Button
                                size="xsmall"
                                variant="tertiary"
                                icon={<ChartNoAxesCombined size={14} />}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => handleOpenInsightModal(frame)}
                                title={selectedWebsite ? 'Vis innsikt' : 'Velg nettsted først'}
                                aria-label="Vis innsikt"
                                disabled={!selectedWebsite}
                              />
                            )}
                            {frame.kind === 'website' && (
                              <Button
                                size="xsmall"
                                variant="tertiary"
                                icon={<Edit2 size={14} />}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => handleOpenEditWebsiteModal(frame)}
                                title="Rediger nettside"
                                aria-label="Rediger nettside"
                              />
                            )}
                            {frame.kind === 'website' && (
                              <Button
                                size="xsmall"
                                variant="tertiary"
                                icon={<RefreshCw size={14} />}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => handleRefreshFrame(frame.id)}
                                title="Last inn på nytt"
                                aria-label="Last inn på nytt"
                              />
                            )}
                            <Button
                              size="xsmall"
                              variant="tertiary"
                              icon={<Trash2 size={14} />}
                              onClick={() => handleRequestRemoveFrame(frame)}
                              title="Fjern kort"
                              aria-label="Fjern kort"
                            />
                          </div>
                        </header>

                        <div
                          className={`relative flex-1 ${frame.kind === 'website' || frame.kind === 'chart' ? 'overflow-hidden bg-white' : 'px-2 pb-2'}`}
                        >
                          {frame.kind === 'website' && (
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
                          {frame.kind === 'website' && frame.src && frame.displayUrl ? (
                            <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-white">
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
                                />
                              )}
                            </div>
                          ) : frame.kind === 'website' ? (
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
                              />
                            </div>
                          ) : frame.kind === 'heading' ? (
                            <div className="overflow-visible pt-0 pr-0 pb-0">
                              <textarea
                                value={frame.headingText || ''}
                                onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                                onBlur={() => handleEditableFrameBlur(frame.id)}
                                onMouseDown={(event) => event.stopPropagation()}
                                placeholder="Skriv overskrift"
                                className="block w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
                                style={{
                                  fontSize: `${getHeadingFrameFontSize(frame)}px`,
                                  lineHeight: 1.05,
                                  fontWeight: 700,
                                }}
                                rows={1}
                              />
                            </div>
                          ) : frame.kind === 'text' ? (
                            <div className="h-full overflow-auto px-2 pb-2">
                              <textarea
                                value={frame.textContent || ''}
                                onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                                onBlur={() => handleEditableFrameBlur(frame.id)}
                                onMouseDown={(event) => event.stopPropagation()}
                                placeholder="Skriv tekst"
                                className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
                                style={{ fontSize: '24px', lineHeight: 1.3, fontWeight: 500 }}
                              />
                            </div>
                          ) : frame.kind === 'sticky' ? (
                            <div className="h-full overflow-auto p-4">
                              <textarea
                                value={frame.textContent || ''}
                                onChange={(event) => handleEditableFrameChange(frame.id, event.target.value)}
                                onBlur={() => handleEditableFrameBlur(frame.id)}
                                placeholder="Skriv sticky note"
                                className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-base leading-7 text-[#4a3d00] outline-none placeholder:text-[#7a6b2a]"
                              />
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--ax-text-subtle)]">
                              Kunne ikke lage forhåndsvisning for denne siden.
                            </div>
                          )}
                        </div>
                        {frame.kind !== 'heading' && (
                          <button
                            type="button"
                            onMouseDown={(event) => handleResizeStart(event, frame)}
                            title="Endre størrelse"
                            aria-label="Endre størrelse"
                            className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-sm border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                          >
                            <span
                              className="pointer-events-none absolute bottom-[2px] right-[2px] h-2.5 w-2.5"
                              style={{
                                background:
                                  'linear-gradient(135deg, transparent 35%, var(--ax-text-subtle) 35%, var(--ax-text-subtle) 45%, transparent 45%, transparent 55%, var(--ax-text-subtle) 55%, var(--ax-text-subtle) 65%, transparent 65%)',
                              }}
                            />
                          </button>
                        )}
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
        open={isAddPageModalOpen}
        onClose={() => {
          setIsAddPageModalOpen(false)
          setAddPageError(null)
          setNewPagePreviewUrlInput('')
          setNewPageRenderEnabled(true)
        }}
        header={{ heading: 'Legg til side i canvas' }}
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
          <Button variant="secondary" size="small" onClick={() => setIsAddPageModalOpen(false)}>
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
            }}
          >
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

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
        open={Boolean(activeInsightFrameId)}
        onClose={() => setActiveInsightFrameId(null)}
        header={{ heading: 'Sideinnsikt' }}
        width="small"
      >
        <Modal.Body>
          {!activeInsightFrame ? (
            <Alert variant="warning">Fant ikke kortet som skulle vises.</Alert>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ax-text-subtle)]">Side</div>
                <div className="mt-1 break-all text-sm font-semibold text-[var(--ax-text-default)]">
                  {activeInsightFrame.label}
                </div>
                {activeInsightFrame.targetUrl && (
                  <div className="mt-1 break-all text-xs text-[var(--ax-text-subtle)]">
                    {activeInsightFrame.targetUrl}
                  </div>
                )}
                <div className="mt-3 text-sm text-[var(--ax-text-subtle)]">Periode: {activeInsightPeriodLabel}</div>
              </div>

              {activeInsightState?.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader size="small" title="Henter sideinnsikt..." />
                </div>
              ) : activeInsightState?.error ? (
                <Alert variant="error">{activeInsightState.error}</Alert>
              ) : activeInsightState?.data ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4">
                    <div className="text-sm font-medium text-[var(--ax-text-subtle)]">Brukere</div>
                    <div className="mt-1 text-2xl font-bold text-[var(--ax-text-default)]">
                      {activeInsightState.data.visitors.toLocaleString('nb-NO')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4">
                    <div className="text-sm font-medium text-[var(--ax-text-subtle)]">Sidevisninger</div>
                    <div className="mt-1 text-2xl font-bold text-[var(--ax-text-default)]">
                      {activeInsightState.data.pageviews.toLocaleString('nb-NO')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-4">
                    <div className="text-sm font-medium text-[var(--ax-text-subtle)]">Andel</div>
                    <div className="mt-1 text-2xl font-bold text-[var(--ax-text-default)]">
                      {(activeInsightState.data.proportion * 100).toLocaleString('nb-NO', {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </div>
                  </div>
                </div>
              ) : (
                <Alert variant="warning">Ingen trafikk funnet for denne siden i valgt periode.</Alert>
              )}
            </div>
          )}
        </Modal.Body>
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
            {!isLoadingChartOptions && chartOptions.length === 0 && !addChartError && (
              <Link href="/grafbygger" target="_blank" rel="noopener noreferrer">
                Lag en graf i Grafbyggeren (åpnes i ny fane)
              </Link>
            )}
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
        open={isAddStickyModalOpen}
        onClose={() => {
          setIsAddStickyModalOpen(false)
          setAddStickyError(null)
        }}
        header={{ heading: 'Legg til sticky note' }}
        width="small"
      >
        <Modal.Body>
          <div className="space-y-3">
            <Textarea
              label="Tekst"
              minRows={6}
              value={stickyContentInput}
              onChange={(event) => {
                setStickyContentInput(event.target.value)
                if (addStickyError) setAddStickyError(null)
              }}
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
