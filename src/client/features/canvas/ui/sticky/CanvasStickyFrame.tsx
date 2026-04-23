import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'
import { getCanvasStickyColorOptionById } from './CanvasStickyColorRegistry.ts'

type CanvasStickyFrameProps = {
  id: string
  textContent?: string
  stickyColor?: string
  isEditing: boolean
  isInteractionLocked?: boolean
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
  isInteractionLocked = false,
  isLockedByOther = false,
  lockOwnerLabel = null,
  onChange,
  onBlur,
  onStartEditing,
}: CanvasStickyFrameProps) => {
  const colorOption = getCanvasStickyColorOptionById(stickyColor)
  const stickyText = textContent || 'Skriv Post-it-lapp'
  const stickyEditorLabelId = `canvas-sticky-editor-label-${id}`
  const stickyEditorDescriptionId = `canvas-sticky-editor-description-${id}`

  if (isEditing) {
    return (
      <div className="h-full overflow-auto p-4 pt-10">
        <span id={stickyEditorLabelId} className="sr-only">
          Post-it-lapp
        </span>
        <span id={stickyEditorDescriptionId} className="sr-only">
          Nåværende tekst: {stickyText}
        </span>
        <textarea
          value={textContent || ''}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          lang="nb-NO"
          placeholder="Skriv Post-it-lapp"
          aria-labelledby={stickyEditorLabelId}
          aria-describedby={stickyEditorDescriptionId}
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
    <div className="relative h-full overflow-auto p-4 pt-10">
      {isInteractionLocked ? (
        <p
          className="w-full whitespace-pre-wrap break-words bg-transparent p-0 text-left text-base leading-7"
          style={{ color: colorOption.text }}
        >
          {textContent || 'Skriv Post-it-lapp'}
        </p>
      ) : (
        <div
          data-canvas-edit-trigger="true"
          tabIndex={0}
          className="m-0 block w-full cursor-text whitespace-pre-wrap break-words bg-transparent p-0 text-left text-base leading-7 [appearance:none]"
          style={{ color: colorOption.text }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => onStartEditing(id)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onStartEditing(id)
          }}
          aria-description="Trykk Enter for å redigere lappen"
        >
          {stickyText}
        </div>
      )}
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} tone="sticky" />}
    </div>
  )
}

export default CanvasStickyFrame
