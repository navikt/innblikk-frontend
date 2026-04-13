import { Button } from '@navikt/ds-react'
import { Minus, Plus } from 'lucide-react'

type CanvasZoomControlsProps = {
  canvasZoom: number
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomIn: () => void
}

const CanvasZoomControls = ({ canvasZoom, onZoomOut, onZoomReset, onZoomIn }: CanvasZoomControlsProps) => (
  <div className="flex items-center gap-1 rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
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
      variant="tertiary"
      onClick={onZoomReset}
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
