import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'

type CanvasStickyFrameProps = {
  id: string
  textContent?: string
  isEditing: boolean
  isLockedByOther?: boolean
  lockOwnerLabel?: string | null
  onChange: (id: string, nextValue: string) => void
  onBlur: (id: string) => void
  onStartEditing: (id: string) => void
}

const CanvasStickyFrame = ({
  id,
  textContent,
  isEditing,
  isLockedByOther = false,
  lockOwnerLabel = null,
  onChange,
  onBlur,
  onStartEditing,
}: CanvasStickyFrameProps) => {
  if (isEditing) {
    return (
      <div className="h-full overflow-auto p-4">
        <textarea
          value={textContent || ''}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          lang="nb-NO"
          placeholder="Skriv Post-it-lapp"
          className="h-full w-full resize-none overflow-auto border-none bg-transparent p-0 text-base leading-7 text-[#4a3d00] outline-none placeholder:text-[#7a6b2a]"
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-auto p-4">
      <div
        className="cursor-text whitespace-pre-wrap break-words text-base leading-7 text-[#4a3d00]"
        onClick={() => onStartEditing(id)}
      >
        {textContent || 'Skriv Post-it-lapp'}
      </div>
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} tone="sticky" />}
    </div>
  )
}

export default CanvasStickyFrame
