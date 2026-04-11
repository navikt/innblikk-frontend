import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'
import { getCanvasStickyColorOptionById } from './CanvasStickyColorRegistry.ts'

type CanvasStickyFrameProps = {
  id: string
  textContent?: string
  stickyColor?: string
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
  stickyColor,
  isEditing,
  isLockedByOther = false,
  lockOwnerLabel = null,
  onChange,
  onBlur,
  onStartEditing,
}: CanvasStickyFrameProps) => {
  const colorOption = getCanvasStickyColorOptionById(stickyColor)

  if (isEditing) {
    return (
      <div className="h-full overflow-auto p-4 pt-6">
        <textarea
          value={textContent || ''}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          lang="nb-NO"
          placeholder="Skriv Post-it-lapp"
          className="h-full w-full resize-none overflow-auto border-none p-0 text-base leading-7 outline-none"
          style={{
            backgroundColor: colorOption.textareaBackground,
            color: colorOption.text,
          }}
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-auto p-4 pt-6">
      <div
        className="cursor-text whitespace-pre-wrap break-words text-base leading-7"
        style={{ color: colorOption.text }}
        onClick={() => onStartEditing(id)}
      >
        {textContent || 'Skriv Post-it-lapp'}
      </div>
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} tone="sticky" />}
    </div>
  )
}

export default CanvasStickyFrame
