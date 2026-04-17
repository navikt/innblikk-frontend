import type { GraphCategoryDto } from '../../../oversikt/model/types.ts'
import type { CanvasFrame } from '../../model/types.ts'

export type CanvasShareRouteContext = {
  projectId: number | null
  dashboardId: number | null
  categoryId: number | null
}

export type CanvasShareLoadResult = {
  frames: CanvasFrame[]
  categories: GraphCategoryDto[]
  dashboardTitle: string
}
