import type { LucideIcon } from 'lucide-react'
import type { VisualizationMode } from '../../clickmap/model/visualizationMode.ts'
import type { PageMetricRow } from '../../traffic/model/types.ts'

export type CanvasChartType = 'line' | 'bar' | 'pie' | 'table'
export type CanvasFigureType = 'rectangle' | 'circle' | 'line' | 'arrow'
export type CanvasCsvImportStyle = 'sticky' | 'table'
export type CanvasCsvTableMode = 'rows' | 'summary'

export type CanvasPayloadKind =
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

export type CanvasConnectionMetric = {
  percentageOfPrev: number
  dropoffCount: number
  dropoffPercentage: number
  totalConversionPercent: number
  fromCount: number
  toCount: number
}

export type CanvasFrame = {
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

export type CanvasConnection = {
  id: string
  fromFrameId?: string
  toFrameId?: string
  fromGraphId?: number
  toGraphId?: number
  categoryId?: number
  graphId?: number
  queryId?: number
}

export type CanvasPageInsight = {
  requestKey: string
  loading: boolean
  error: string | null
  data: PageMetricRow | null
}

export type CanvasDeleteTarget =
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

export type ConnectionAnchorSide = 'left' | 'right' | 'top' | 'bottom'

export type ConnectionDragState = {
  sourceFrameId: string
  sourceAnchorSide: ConnectionAnchorSide
  pointerX: number
  pointerY: number
  currentTargetFrameId: string | null
}

export type CanvasConnectionVisual = {
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

export type CanvasConfigPayload = {
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

export type CanvasChartOption = {
  id: string
  title: string
  chartType: CanvasChartType
  sql: string
}

export type CanvasFigureOption = {
  id: CanvasFigureType
  label: string
  Icon: LucideIcon
}

export type PendingCanvasFrameDraft = Omit<CanvasFrame, 'id' | 'x' | 'y' | 'categoryId' | 'graphId' | 'queryId'>

export type PendingCsvStickyImport = {
  sectionTitle: string
  noteTexts: string[]
  aggregatedRatingsText?: string
  tableHeaders?: string[]
  tableRows?: string[][]
}

export type CanvasChartReadyMessage = {
  type: 'umami-canvas-chart-ready'
  payload: {
    label?: string
    chartType?: CanvasChartType
    chartSql?: string
    websiteId?: string
  }
}

export type CanvasCsvImportRow = Record<string, string>

export type CanvasRatingDistributionItem = {
  value: number
  count: number
  percentage: number
}

export type CanvasNumericRatingSummary = {
  count: number
  average: number
  median: number
  min: number
  max: number
  distribution: CanvasRatingDistributionItem[]
}

export type CanvasCategoricalSummaryRow = {
  value: string
  count: number
  percentage: number
}

export type CanvasPrivacyPattern = {
  name: string
  regex: RegExp
}

export type CanvasPrivacyFinding = {
  rowIndex: number
  text: string
  patternNames: string[]
}
