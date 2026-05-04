import { Lock } from 'lucide-react'
import type { MouseEvent } from 'react'

type CanvasEditLockOverlayProps = {
  ownerLabel?: string | null
  tone?: 'default' | 'sticky'
}

const stopInteraction = (event: MouseEvent<HTMLElement>) => {
  event.preventDefault()
  event.stopPropagation()
}

const CanvasEditLockOverlay = ({ ownerLabel, tone = 'default' }: CanvasEditLockOverlayProps) => {
  const isStickyTone = tone === 'sticky'

  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center ${
        isStickyTone ? 'bg-black/30' : 'bg-black/35'
      }`}
      onMouseDown={stopInteraction}
      onClick={stopInteraction}
      aria-label="Kortet redigeres av en annen bruker"
      role="status"
    >
      <div
        className={`inline-flex max-w-[90%] items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-sm ${
          isStickyTone
            ? 'border-[#d6c57a] bg-[#fff8dd] text-[#6b5d1b]'
            : 'border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] text-[var(--ax-text-default)]'
        }`}
      >
        <Lock size={14} aria-hidden="true" />
        <span className="truncate">{ownerLabel || 'En kollega'} redigerer akkurat nå</span>
      </div>
    </div>
  )
}

export default CanvasEditLockOverlay
