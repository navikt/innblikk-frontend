import { fetchCategories, fetchGraphs, fetchQueries } from '../../oversikt/api/oversiktApi.ts'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'
import type { CanvasConnection, CanvasFrame } from '../model/types.ts'
import {
  CANVAS_DASHBOARD_TOKEN,
  CANVAS_QUERY_NAME,
  isRenderableCanvasFrameKind,
  parseCanvasConfig,
} from '../utils/canvasUtils.ts'
import { isIllustrationPath } from '../ui/image/CanvasImageUtils.ts'

export type CanvasStorageData = {
  categories: GraphCategoryDto[]
  frames: CanvasFrame[]
  connections: CanvasConnection[]
}

const isCanvasStorageGraph = (description?: string): boolean =>
  (description || '').toLowerCase().split(/\s+/).includes(CANVAS_DASHBOARD_TOKEN)

export async function fetchCanvasStorageData(projectId: number, dashboardId: number): Promise<CanvasStorageData> {
  const categories = await fetchCategories(projectId, dashboardId)
  const framesFromStorage: CanvasFrame[] = []
  const connectionsFromStorage: CanvasConnection[] = []

  for (const category of categories) {
    const graphs = await fetchGraphs(projectId, dashboardId, category.id)
    for (const graph of graphs) {
      if (graph.graphType !== 'TEXT') continue
      if (!isCanvasStorageGraph(graph.description)) continue

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

  return {
    categories,
    frames: framesFromStorage,
    connections: connectionsFromStorage,
  }
}
