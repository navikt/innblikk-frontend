import { Button } from '@navikt/ds-react'
import { Trash2 } from 'lucide-react'
import CanvasZoomControls from './CanvasZoomControls.tsx'

type CanvasFloatingControlsProps = {
  isGrafbyggerEmbedded: boolean
  isDotVotingActive: boolean
  selectedFrameCount: number
  onRequestRemoveSelectedFrames: () => void
  canvasZoom: number
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomIn: () => void
}

const CanvasFloatingControls = ({
  isGrafbyggerEmbedded,
  isDotVotingActive,
  selectedFrameCount,
  onRequestRemoveSelectedFrames,
  canvasZoom,
  onZoomOut,
  onZoomReset,
  onZoomIn,
}: CanvasFloatingControlsProps) => (
  <aside aria-label="Canvas-handlinger" className="pointer-events-none fixed bottom-4 right-4 z-30">
    <div className="pointer-events-auto flex items-center gap-2">
      {!isGrafbyggerEmbedded && (
        <>
          {!isDotVotingActive && selectedFrameCount > 0 && (
            <div className="rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-1 shadow-sm">
              <Button
                size="xsmall"
                variant="tertiary"
                onClick={onRequestRemoveSelectedFrames}
                title="Fjern valgte kort"
                icon={<Trash2 size={14} />}
                className="rounded-full px-2"
              >
                Fjern valgte ({selectedFrameCount})
              </Button>
            </div>
          )}
          <CanvasZoomControls
            canvasZoom={canvasZoom}
            onZoomOut={onZoomOut}
            onZoomReset={onZoomReset}
            onZoomIn={onZoomIn}
          />
        </>
      )}
    </div>
  </aside>
)

export default CanvasFloatingControls
