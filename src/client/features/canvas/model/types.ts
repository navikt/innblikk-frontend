import type { LucideIcon } from 'lucide-react'
import type { VisualizationMode } from '../../clickmap/model/visualizationMode.ts'
import type { PageMetricRow } from '../../traffic/model/types.ts'

export type CanvasChartType = 'line' | 'bar' | 'pie' | 'table'
export type CanvasFigureType = 'square' | 'circle' | 'line' | 'arrow'
export type CanvasSectionLayoutMode = 'freeform' | 'grid'
export type CanvasCsvImportStyle = 'sticky' | 'table'
export type CanvasCsvTableMode = 'rows' | 'summary'
export type CanvasCodeLanguage = 'sql' | 'text' | 'react' | 'kotlin' | 'html' | 'css' | 'other'

export type CanvasPayloadKind =
  | 'website'
  | 'image'
  | 'heading'
  | 'text'
  | 'link'
  | 'sticky'
  | 'code-block'
  | 'section'
  | 'chart'
  | 'sql-editor'
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
  kind:
    | 'website'
    | 'image'
    | 'heading'
    | 'text'
    | 'link'
    | 'sticky'
    | 'code-block'
    | 'section'
    | 'chart'
    | 'sql-editor'
    | 'icon'
    | 'figure'
    | 'drawing'
  websiteId?: string
  targetUrl?: string
  previewUrl?: string
  renderWebsite?: boolean
  isInternalDashboard?: boolean
  visualizationMode?: VisualizationMode
  headingText?: string
  headingFontSize?: number
  textContent?: string
  stickyColor?: string
  finalVoteCount?: number
  finalVoteRank?: number
  sectionLayout?: CanvasSectionLayoutMode
  tableHeaders?: string[]
  tableRows?: string[][]
  iconName?: string
  iconRotationDeg?: number
  iconColor?: string
  figureType?: CanvasFigureType
  figureColor?: string
  figureOrientation?: number
  drawingPath?: string
  drawingStrokeStyles?: string
  drawingStrokeWidth?: number
  drawingColor?: string
  drawingRotationDeg?: number
  drawingAltText?: string
  isIllustration?: boolean
  imageRotationDeg?: number
  imageAltText?: string
  chartType?: CanvasChartType
  chartSql?: string
  sqlQuery?: string
  codeLanguage?: CanvasCodeLanguage
  hideInShare?: boolean
  label: string
  x: number
  y: number
  width?: number
  height?: number
  categoryId?: number
  graphId?: number
  queryId?: number
  version?: number
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
      hasVotes?: boolean
      voteCount?: number
    }
  | {
      type: 'section'
      id: string
      label: string
      containedFrameIds: string[]
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
  | {
      type: 'clear-vote-snapshot'
      id: string
      label: string
      voteCount: number
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
  stickyColor?: string
  finalVoteCount?: number
  finalVoteRank?: number
  sectionLayout?: CanvasSectionLayoutMode
  tableHeaders?: string[]
  tableRows?: string[][]
  iconName?: string
  iconRotationDeg?: number
  iconColor?: string
  figureType?: CanvasFigureType
  figureColor?: string
  figureOrientation?: number
  drawingPath?: string
  drawingStrokeStyles?: string
  drawingStrokeWidth?: number
  drawingColor?: string
  drawingRotationDeg?: number
  drawingAltText?: string
  isIllustration?: boolean
  imageRotationDeg?: number
  imageAltText?: string
  chartType?: CanvasChartType
  chartSql?: string
  sqlQuery?: string
  codeLanguage?: CanvasCodeLanguage
  hideInShare?: boolean
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
