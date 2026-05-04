type CanvasGrafbyggerOverlayProps = {
  open: boolean
  topOffsetPx: number
  src: string
}

const CanvasGrafbyggerOverlay = ({ open, topOffsetPx, src }: CanvasGrafbyggerOverlayProps) => {
  if (!open) return null

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 overflow-hidden bg-[var(--ax-bg-default)]"
      style={{ top: `${topOffsetPx}px` }}
    >
      <div className="h-full p-3">
        <div className="h-full overflow-hidden rounded-xl border border-[var(--ax-border-neutral-subtle)] bg-white shadow-sm">
          <iframe
            title="Grafbygger i canvas"
            src={src}
            className="h-full w-full"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  )
}

export default CanvasGrafbyggerOverlay
