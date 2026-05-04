type CanvasImageLikeFrame = {
  kind: string
  targetUrl?: string
  isIllustration?: boolean
}

export const isIllustrationPath = (targetUrl?: string): boolean => Boolean(targetUrl?.startsWith('/illustrasjoner/'))

export const isIllustrationImageFrame = (frame: CanvasImageLikeFrame): boolean =>
  frame.kind === 'image' && (Boolean(frame.isIllustration) || isIllustrationPath(frame.targetUrl))
