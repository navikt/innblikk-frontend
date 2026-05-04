import { Button } from '@navikt/ds-react'
import { Minus, Plus } from 'lucide-react'

type CanvasZoomControlsProps = {
  canvasZoom: number
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomIn: () => void
}

const CanvasZoomControls = ({ canvasZoom, onZoomOut, onZoomReset, onZoomIn }: CanvasZoomControlsProps) => (
  <div className="flex items-center gap-0 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-px shadow-sm">
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Minus size={14} />}
      onClick={onZoomOut}
      title="Zoom ut"
      aria-label="Zoom ut"
    />
    <Button
      size="xsmall"
      variant="tertiary-neutral"
      onClick={onZoomReset}
      className="min-w-0 px-2 text-[var(--ax-text-subtle)]"
      title="Tilbakestill zoom"
      aria-label={`${Math.round(canvasZoom * 100)}% Tilbakestill zoom`}
    >
      {Math.round(canvasZoom * 100)}%
    </Button>
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Plus size={14} />}
      onClick={onZoomIn}
      title="Zoom inn"
      aria-label="Zoom inn"
    />
  </div>
)

export default CanvasZoomControls
