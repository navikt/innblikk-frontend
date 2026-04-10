import illustrationData from '../../../../data/nav-illustrasjoner.json'

export type CanvasIllustrationOption = {
  id: string
  path: string
  label: string
  category: string
  subCategory: string
  fileName: string
}

export const CANVAS_ILLUSTRATION_OPTIONS: CanvasIllustrationOption[] = (
  illustrationData as CanvasIllustrationOption[]
).filter(
  (item) =>
    Boolean(item?.path) && !/^\._/.test(item.fileName) && !/\d+@\dx\.(png|jpe?g|webp|avif|svg)$/i.test(item.fileName),
)

export const DEFAULT_CANVAS_ILLUSTRATION_PATH = CANVAS_ILLUSTRATION_OPTIONS[0]?.path ?? ''

export const getCanvasIllustrationOptionByPath = (path?: string | null): CanvasIllustrationOption | null => {
  if (!CANVAS_ILLUSTRATION_OPTIONS.length) return null
  if (!path) return CANVAS_ILLUSTRATION_OPTIONS[0]
  return CANVAS_ILLUSTRATION_OPTIONS.find((item) => item.path === path) ?? CANVAS_ILLUSTRATION_OPTIONS[0]
}
