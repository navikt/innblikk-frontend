import { ArrowRight, Circle, Slash, Square } from 'lucide-react'
import { formatDateRange } from '../../analysis/utils/periodPicker.ts'
import { splitUrlStepInput } from '../../funnel/utils/stepUtils.ts'
import type { FunnelStep } from '../../funnel/model/types.ts'
import { isVisualizationMode, type VisualizationMode } from '../../clickmap/model/visualizationMode.ts'
import { normalizeUrlToPath } from '../../../shared/lib/utils.ts'
import type { GraphType } from '../../oversikt/model/types.ts'
import type {
  CanvasCategoricalSummaryRow,
  CanvasChartType,
  CanvasConfigPayload,
  CanvasConnection,
  CanvasCsvImportRow,
  CanvasFigureOption,
  CanvasFigureType,
  CanvasFrame,
  CanvasNumericRatingSummary,
  CanvasPayloadKind,
  CanvasPrivacyPattern,
  CanvasSectionLayoutMode,
  ConnectionAnchorSide,
} from '../model/types.ts'

export const CANVAS_DASHBOARD_TOKEN = '[canvas]'
export const CANVAS_WEBSITE_ID_TOKEN_REGEX = /\[websiteId:([^\]]+)\]/i
export const CANVAS_PERIOD_TOKEN_REGEX = /\[period:([^\]]+)\]/i
export const CANVAS_CUSTOM_START_DATE_TOKEN_REGEX = /\[customStartDate:([^\]]+)\]/i
export const CANVAS_CUSTOM_END_DATE_TOKEN_REGEX = /\[customEndDate:([^\]]+)\]/i
export const CANVAS_HIDE_DATE_FILTER_TOKEN_REGEX = /\[hideDateFilter:(true|false)\]/i
export const CANVAS_LOCKED_TOKEN_REGEX = /\[canvasLocked:(true|false)\]/i
export const CANVAS_QUERY_NAME = 'canvas-config'
export const CANVAS_SURFACE_WIDTH = 2200
export const CANVAS_SURFACE_HEIGHT = 1500
export const CANVAS_SURFACE_TOP_GAP = 24
export const CANVAS_SURFACE_RIGHT_BUFFER = 220
export const CANVAS_SURFACE_BOTTOM_BUFFER = 420
export const CANVAS_ZOOM_MIN = 0.5
export const CANVAS_ZOOM_MAX = 1.5
export const CANVAS_ZOOM_STEP = 0.1
export const HEADING_FONT_SIZE_DEFAULT = 24
export const HEADING_FONT_SIZE_MIN = 18
export const HEADING_FONT_SIZE_MAX = 96
export const HEADING_FONT_SIZE_STEP = 4
export const ICON_ROTATION_STEP_DEG = 15

export const CANVAS_FIGURE_OPTIONS: CanvasFigureOption[] = [
  { id: 'square', label: 'Kvadrat', Icon: Square },
  { id: 'circle', label: 'Sirkel', Icon: Circle },
  { id: 'line', label: 'Linje', Icon: Slash },
  { id: 'arrow', label: 'Pil', Icon: ArrowRight },
]

export const CANVAS_INVENTORY_KIND_OPTIONS: Array<{ kind: CanvasFrame['kind']; label: string }> = [
  { kind: 'website', label: 'Nettsider' },
  { kind: 'image', label: 'Bilder' },
  { kind: 'heading', label: 'Overskrifter' },
  { kind: 'text', label: 'Tekstblokker' },
  { kind: 'link', label: 'Lenkekort' },
  { kind: 'sticky', label: 'Post-it-lapper' },
  { kind: 'section', label: 'Seksjoner' },
  { kind: 'chart', label: 'Grafer' },
  { kind: 'sql-editor', label: 'SQL-editorer' },
  { kind: 'icon', label: 'Ikoner' },
  { kind: 'figure', label: 'Figurer' },
  { kind: 'drawing', label: 'Tegninger' },
]

export const CANVAS_INVENTORY_DETAIL_LIMIT_PER_TYPE = 500
export const CLICKMAP_EVENTS = ['navigere', 'accordion åpnet']
export const DRAWING_STROKE_WIDTH_OPTIONS = [6, 10, 14]
export const DEFAULT_DRAWING_STROKE_WIDTH = 10
export const IMPORT_TABLE_PREVIEW_ROWS_PER_PAGE = 8
export const CANVAS_TABLE_ROWS_PER_PAGE = 10
export const TABLE_FRAME_MIN_HEIGHT = 180
export const TABLE_FRAME_MAX_HEIGHT = 520
export const TABLE_FRAME_HEADER_HEIGHT = 42
export const TABLE_FRAME_ROW_HEIGHT = 44
export const TABLE_FRAME_VERTICAL_CHROME = 28
export const TABLE_FRAME_PAGINATION_HEIGHT = 32
export const PLANNER_COLUMN_LABEL_PREFIX = 'planner-column:'
export const CARD_ACTION_BUTTON_CLASSNAME =
  'pointer-events-auto bg-[var(--ax-bg-default)]/95 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'

export const WEBSITE_CARD_HEADER_HEIGHT = 46
export const HEADING_CARD_HEADER_HEIGHT = 0
export const ICON_CARD_HEADER_HEIGHT = 0
export const CANVAS_TOP_BUFFER = 240
export const HEADING_TEXT_MIN_WIDTH = 140
export const HEADING_TEXT_MAX_WIDTH = 820
export const HEADING_TEXT_EXTRA_WIDTH = 32
export const HEADING_TEXT_VERTICAL_PADDING = 16
export const HEADING_TEXT_CHAR_WIDTH_FACTOR = 0.42

export const clampCanvasZoom = (value: number): number => Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value))

export const mapCanvasChartTypeToGraphType = (chartType: CanvasChartType): GraphType => {
  if (chartType === 'line') return 'LINE'
  if (chartType === 'bar') return 'BAR'
  if (chartType === 'pie') return 'PIE'
  return 'TABLE'
}

export const getCanvasCategoryDisplayName = (name?: string): string => {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) return 'Fane 1'
  if (trimmed.toLowerCase() === 'general') return 'Fane 1'
  return trimmed
}

export const extractCanvasWebsiteIdFromDescription = (description?: string): string | null => {
  if (!description) return null
  const match = description.match(CANVAS_WEBSITE_ID_TOKEN_REGEX)
  const websiteId = match?.[1]?.trim()
  return websiteId || null
}

export const extractCanvasPeriodFromDescription = (description?: string): string | null => {
  if (!description) return null
  const match = description.match(CANVAS_PERIOD_TOKEN_REGEX)
  const period = match?.[1]?.trim()
  return period || null
}

const extractCanvasDateToken = (description: string | undefined, pattern: RegExp): Date | undefined => {
  if (!description) return undefined
  const value = description.match(pattern)?.[1]?.trim()
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export const extractCanvasCustomStartDateFromDescription = (description?: string): Date | undefined =>
  extractCanvasDateToken(description, CANVAS_CUSTOM_START_DATE_TOKEN_REGEX)

export const extractCanvasCustomEndDateFromDescription = (description?: string): Date | undefined =>
  extractCanvasDateToken(description, CANVAS_CUSTOM_END_DATE_TOKEN_REGEX)

export const extractCanvasHideDateFilterFromDescription = (description?: string): boolean => {
  if (!description) return false
  const value = description.match(CANVAS_HIDE_DATE_FILTER_TOKEN_REGEX)?.[1]?.trim().toLowerCase()
  return value === 'true'
}

export const extractCanvasLockedFromDescription = (description?: string): boolean => {
  if (!description) return false
  const value = description.match(CANVAS_LOCKED_TOKEN_REGEX)?.[1]?.trim().toLowerCase()
  return value === 'true'
}

export const buildCanvasDashboardDescription = (
  description: string | undefined,
  websiteId?: string,
  period?: string,
  customStartDate?: Date,
  customEndDate?: Date,
  hideDateFilter?: boolean,
  canvasLocked?: boolean,
): string => {
  const existingCanvasLocked = extractCanvasLockedFromDescription(description)
  const withoutCanvasToken = (description ?? '')
    .replace(/\[canvas\]/gi, ' ')
    .replace(CANVAS_WEBSITE_ID_TOKEN_REGEX, ' ')
    .replace(CANVAS_PERIOD_TOKEN_REGEX, ' ')
    .replace(CANVAS_CUSTOM_START_DATE_TOKEN_REGEX, ' ')
    .replace(CANVAS_CUSTOM_END_DATE_TOKEN_REGEX, ' ')
    .replace(CANVAS_HIDE_DATE_FILTER_TOKEN_REGEX, ' ')
    .replace(CANVAS_LOCKED_TOKEN_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = [CANVAS_DASHBOARD_TOKEN]
  if (websiteId?.trim()) {
    tokens.push(`[websiteId:${websiteId.trim()}]`)
  }
  if (period?.trim()) {
    tokens.push(`[period:${period.trim()}]`)
  }
  if (period?.trim() === 'custom' && customStartDate && customEndDate) {
    tokens.push(`[customStartDate:${customStartDate.toISOString()}]`)
    tokens.push(`[customEndDate:${customEndDate.toISOString()}]`)
  }
  if (hideDateFilter) {
    tokens.push('[hideDateFilter:true]')
  }
  if (canvasLocked ?? existingCanvasLocked) {
    tokens.push('[canvasLocked:true]')
  }
  if (withoutCanvasToken) {
    tokens.push(withoutCanvasToken)
  }
  return tokens.join(' ')
}

export const normalizeInputToTargetUrl = (value: string, websiteDomain?: string): string | null => {
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

export const getComparableUrl = (value: string): string => {
  try {
    const url = new URL(value)
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
    return `${url.origin}${pathname}${url.search}`
  } catch {
    return value
  }
}

export const getFrameLabel = (targetUrl: string): string => {
  try {
    const url = new URL(targetUrl)
    return `${url.hostname}${url.pathname}${url.search}`
  } catch {
    return targetUrl
  }
}

export const parseDashboardTargetUrl = (
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

export const isCanvasDashboardDescription = (description?: string): boolean =>
  (description || '').toLowerCase().split(/\s+/).includes(CANVAS_DASHBOARD_TOKEN)

export const getCanvasPeriodLabel = (period: string, customStartDate?: Date, customEndDate?: Date): string => {
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

export const buildFunnelStepFromUrl = (targetUrl: string): FunnelStep => {
  const { value, query } = splitUrlStepInput(targetUrl)
  return { type: 'url', value, query }
}

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

export const buildConnectionPath = (
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

export const createPreviewProxySrc = (targetUrl: string): string => {
  return `/api/clickmap-preview?url=${encodeURIComponent(targetUrl)}`
}

export const getWebsiteFrameDisplayUrl = (frame: CanvasFrame): string | undefined => {
  if (frame.kind === 'image') {
    return frame.targetUrl
  }

  if (frame.renderWebsite === false) {
    return frame.previewUrl
  }

  return frame.targetUrl
}

export const getWebsiteFrameRenderSrc = (frame: CanvasFrame): string | undefined => {
  if (frame.kind === 'image') {
    return frame.targetUrl
  }

  if (frame.renderWebsite === false) {
    return frame.previewUrl
  }

  return frame.targetUrl ? createPreviewProxySrc(frame.targetUrl) : undefined
}

export const getCanvasFrameVisualizationMode = (
  frame: Pick<CanvasFrame, 'visualizationMode'>,
): VisualizationMode | '' => (isVisualizationMode(frame.visualizationMode) ? frame.visualizationMode : '')

export const getVisualizationModeLabel = (mode: VisualizationMode | ''): string => {
  if (mode === 'clickmap') return 'Klikkkart'
  if (mode === 'heatmap') return 'Varmekart'
  if (mode === 'scrollmap') return 'Scrollkart'
  return ''
}

export const formatCanvasPathLabel = (targetUrl?: string, fallbackText?: string): string => {
  const normalizedPath = targetUrl ? normalizeUrlToPath(targetUrl) : ''
  if (normalizedPath === '/') return '/ (forside)'
  return normalizedPath || fallbackText || targetUrl || ''
}

export const isImagePreviewUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname)
  } catch {
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(value)
  }
}

export const serializeCanvasConfig = (frame: CanvasConfigPayload): string => {
  const json = JSON.stringify(frame)
  const escaped = json.replace(/'/g, "''")
  return `SELECT '${escaped}' AS canvas_config`
}

export const buildCanvasStorageGraphName = (frame: CanvasFrame): string =>
  `canvas:${
    frame.kind === 'text' && Array.isArray(frame.tableHeaders) && frame.tableHeaders.length > 0 ? 'table' : frame.kind
  }:${frame.id}`.slice(0, 200)
export const buildCanvasConnectionStorageGraphName = (connection: CanvasConnection): string =>
  `canvas:connection:${connection.id}`.slice(0, 200)

const isCanvasPayloadKind = (value: unknown): value is CanvasPayloadKind =>
  value === 'website' ||
  value === 'image' ||
  value === 'heading' ||
  value === 'text' ||
  value === 'link' ||
  value === 'sticky' ||
  value === 'section' ||
  value === 'chart' ||
  value === 'sql-editor' ||
  value === 'icon' ||
  value === 'figure' ||
  value === 'drawing' ||
  value === 'connection'

export const isRenderableCanvasFrameKind = (value: unknown): value is CanvasFrame['kind'] =>
  value === 'website' ||
  value === 'image' ||
  value === 'heading' ||
  value === 'text' ||
  value === 'link' ||
  value === 'sticky' ||
  value === 'section' ||
  value === 'chart' ||
  value === 'sql-editor' ||
  value === 'icon' ||
  value === 'figure' ||
  value === 'drawing'

const isCanvasChartType = (value: unknown): value is CanvasChartType =>
  value === 'line' || value === 'bar' || value === 'pie' || value === 'table'

const isCanvasFigureType = (value: unknown): value is CanvasFigureType =>
  typeof value === 'string' && (value === 'square' || value === 'circle' || value === 'line' || value === 'arrow')

const isCanvasSectionLayoutMode = (value: unknown): value is CanvasSectionLayoutMode =>
  value === 'freeform' || value === 'grid'

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isStringMatrix = (value: unknown): value is string[][] =>
  Array.isArray(value) && value.every((row) => isStringArray(row))

export const parseCanvasConfig = (raw: string): CanvasConfigPayload | null => {
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
      stickyColor: typeof parsed.stickyColor === 'string' ? parsed.stickyColor : undefined,
      finalVoteCount: Number.isFinite(parsed.finalVoteCount) ? Number(parsed.finalVoteCount) : undefined,
      finalVoteRank: Number.isFinite(parsed.finalVoteRank) ? Number(parsed.finalVoteRank) : undefined,
      sectionLayout: isCanvasSectionLayoutMode(parsed.sectionLayout) ? parsed.sectionLayout : undefined,
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
      imageAltText: typeof parsed.imageAltText === 'string' ? parsed.imageAltText : undefined,
      chartType: isCanvasChartType(parsed.chartType) ? parsed.chartType : undefined,
      chartSql: typeof parsed.chartSql === 'string' ? parsed.chartSql : undefined,
      sqlQuery: typeof parsed.sqlQuery === 'string' ? parsed.sqlQuery : undefined,
      hideInShare: typeof parsed.hideInShare === 'boolean' ? parsed.hideInShare : undefined,
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

export const parseCsvImportText = (
  input: string,
): { headers: string[]; rows: CanvasCsvImportRow[]; error?: string } => {
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

export const summarizeCategoricalValues = (inputs: string[]): CanvasCategoricalSummaryRow[] => {
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

export const findPrivacyPatternNames = (text: string): string[] => {
  const matches = CSV_IMPORT_PRIVACY_PATTERNS.filter((pattern) => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    return regex.test(text)
  }).map((pattern) => pattern.name)

  return Array.from(new Set(matches))
}

const parseRatingValue = (input: string): number | null => {
  const normalized = input.trim().replace(',', '.')
  if (!normalized) return null
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export const formatRatingValue = (value: number): string =>
  Number.isInteger(value) ? value.toString() : value.toLocaleString('nb-NO', { maximumFractionDigits: 2 })

export const summarizeNumericRatings = (inputs: string[]): CanvasNumericRatingSummary | null => {
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

  const distribution = Array.from(distributionMap.entries())
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

export const buildNumericRatingSummaryText = (summary: CanvasNumericRatingSummary): string => {
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

export const estimateTableFrameHeight = (rowCount: number): number => {
  const visibleRows = Math.max(1, Math.min(CANVAS_TABLE_ROWS_PER_PAGE, rowCount))
  const includesPagination = rowCount > CANVAS_TABLE_ROWS_PER_PAGE
  const estimatedHeight =
    TABLE_FRAME_HEADER_HEIGHT +
    visibleRows * TABLE_FRAME_ROW_HEIGHT +
    TABLE_FRAME_VERTICAL_CHROME +
    (includesPagination ? TABLE_FRAME_PAGINATION_HEIGHT : 0)

  return Math.max(TABLE_FRAME_MIN_HEIGHT, Math.min(TABLE_FRAME_MAX_HEIGHT, estimatedHeight))
}
