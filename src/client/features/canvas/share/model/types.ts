import type { GraphCategoryDto } from '../../../oversikt/model/types.ts'
import type { CanvasFrame } from '../../model/types.ts'
import type { Website } from '../../../../shared/types/website.ts'

export type CanvasShareRouteContext = {
  projectId: number | null
  dashboardId: number | null
  categoryId: number | null
}

export type CanvasShareLoadResult = {
  frames: CanvasFrame[]
  categories: GraphCategoryDto[]
  dashboardTitle: string
  defaultPeriod: string
  defaultCustomStartDate?: Date
  defaultCustomEndDate?: Date
  canvasConfiguredWebsiteId: string | null
  availableWebsites: Website[]
}
