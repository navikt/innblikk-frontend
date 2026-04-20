import type { GraphCategoryDto, GraphDto, QueryDto } from '../../oversikt/model/types.ts'
import type { CanvasConnection, CanvasFrame } from '../model/types.ts'
import { isRenderableCanvasFrameKind, parseCanvasConfig } from '../utils/canvasUtils.ts'
import { isIllustrationPath } from '../ui/image/CanvasImageUtils.ts'

export type CanvasStorageData = {
  categories: GraphCategoryDto[]
  frames: CanvasFrame[]
  connections: CanvasConnection[]
}

type CanvasStorageResponseEntry = {
  categoryId: number
  graph: GraphDto
  query: QueryDto
}

export async function fetchCanvasStorageData(projectId: number, dashboardId: number): Promise<CanvasStorageData> {
  const response = await fetch(`/api/backend/canvas/storage?projectId=${projectId}&dashboardId=${dashboardId}`)
  if (!response.ok) {
    throw new Error(`Kunne ikke hente canvas-data (${response.status})`)
  }
  const payload = (await response.json()) as {
    categories?: GraphCategoryDto[]
    entries?: CanvasStorageResponseEntry[]
  }
  const categories = Array.isArray(payload.categories) ? payload.categories : []
  const entries = Array.isArray(payload.entries) ? payload.entries : []
  const framesFromStorage: CanvasFrame[] = []
  const connectionsFromStorage: CanvasConnection[] = []

  for (const entry of entries) {
    const categoryId = Number(entry?.categoryId)
    const graph = entry?.graph
    const configQuery = entry?.query
    if (!Number.isFinite(categoryId) || !graph || !configQuery) continue

    const parsedConfig = parseCanvasConfig(configQuery.sqlText || '')
    if (!parsedConfig) continue

    if (parsedConfig.kind === 'connection') {
      connectionsFromStorage.push({
        id: `stored-connection-${graph.id}`,
        fromFrameId: parsedConfig.fromFrameId,
        toFrameId: parsedConfig.toFrameId,
        fromGraphId: parsedConfig.fromGraphId,
        toGraphId: parsedConfig.toGraphId,
        categoryId,
        graphId: graph.id,
        queryId: configQuery.id,
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
      stickyColor: parsedConfig.stickyColor,
      finalVoteCount: parsedConfig.finalVoteCount,
      finalVoteRank: parsedConfig.finalVoteRank,
      sectionLayout: parsedConfig.sectionLayout,
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
      drawingAltText: parsedConfig.drawingAltText,
      isIllustration:
        typeof parsedConfig.isIllustration === 'boolean'
          ? parsedConfig.isIllustration
          : parsedConfig.kind === 'image' && isIllustrationPath(parsedConfig.targetUrl),
      imageRotationDeg: parsedConfig.imageRotationDeg,
      imageAltText: parsedConfig.imageAltText,
      chartType: parsedConfig.chartType,
      chartSql: parsedConfig.chartSql,
      sqlQuery: parsedConfig.sqlQuery,
      codeLanguage: parsedConfig.codeLanguage,
      hideInShare: parsedConfig.hideInShare,
      label: parsedConfig.label || graph.name,
      x: parsedConfig.x,
      y: parsedConfig.y,
      width: parsedConfig.width,
      height: parsedConfig.height,
      categoryId,
      graphId: graph.id,
      queryId: configQuery.id,
      refreshNonce: 0,
    })
  }

  return {
    categories,
    frames: framesFromStorage,
    connections: connectionsFromStorage,
  }
}
