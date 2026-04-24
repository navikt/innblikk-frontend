import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'

type CanvasHeadingFrameProps = {
  id: string
  headingText?: string
  label: string
  fontSizePx: number
  headingLevel?: 2 | 3 | 4
  isEditing: boolean
  isInteractionLocked?: boolean
  isLockedByOther?: boolean
  lockOwnerLabel?: string | null
  onChange: (id: string, nextValue: string) => void
  onBlur: (id: string) => void
  onStartEditing: (id: string) => void
}

const CanvasHeadingFrame = ({
  id,
  headingText,
  label,
  fontSizePx,
  headingLevel = 2,
  isEditing,
  isInteractionLocked = false,
  isLockedByOther = false,
  lockOwnerLabel = null,
  onChange,
  onBlur,
  onStartEditing,
}: CanvasHeadingFrameProps) => {
  const headingContent = headingText || label || 'Skriv overskrift'
  const headingValue = headingText || ''
  const headingEditorLabelId = `canvas-heading-editor-label-${id}`
  const headingEditorDescriptionId = `canvas-heading-editor-description-${id}`

  if (isEditing) {
    return (
      <div className="overflow-visible px-4 py-2">
        <span id={headingEditorLabelId} className="sr-only">
          Overskrift
        </span>
        <span id={headingEditorDescriptionId} className="sr-only">
          Nåværende tekst: {headingContent}
        </span>
        <textarea
          value={headingValue}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          lang="nb-NO"
          placeholder="Skriv overskrift"
          aria-labelledby={headingEditorLabelId}
          aria-describedby={headingEditorDescriptionId}
          className="block w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[var(--ax-text-default)] outline-none placeholder:text-[var(--ax-text-subtle)] [font-family:inherit]"
          style={{
            fontSize: `${fontSizePx}px`,
            lineHeight: 1.05,
            fontWeight: 700,
          }}
          rows={1}
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className="relative overflow-visible px-4 py-2">
      {headingLevel === 4 ? (
        <h4 className="m-0">
          {isInteractionLocked ? (
            <span
              className="block w-full whitespace-pre-wrap break-words bg-transparent p-0 text-left text-[var(--ax-text-default)]"
              style={{
                fontSize: `${fontSizePx}px`,
                lineHeight: 1.05,
                fontWeight: 700,
              }}
            >
              {headingContent}
            </span>
          ) : (
            <button
              type="button"
              data-canvas-edit-trigger="true"
              className="m-0 block w-full cursor-text whitespace-pre-wrap break-words bg-transparent p-0 text-left text-[var(--ax-text-default)] [appearance:none]"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onStartEditing(id)}
              aria-description="Trykk Enter for å redigere overskriften"
              style={{
                fontSize: `${fontSizePx}px`,
                lineHeight: 1.05,
                fontWeight: 700,
              }}
            >
              {headingContent}
            </button>
          )}
        </h4>
      ) : headingLevel === 3 ? (
        <h3 className="m-0">
          {isInteractionLocked ? (
            <span
              className="block w-full whitespace-pre-wrap break-words bg-transparent p-0 text-left text-[var(--ax-text-default)]"
              style={{
                fontSize: `${fontSizePx}px`,
                lineHeight: 1.05,
                fontWeight: 700,
              }}
            >
              {headingContent}
            </span>
          ) : (
            <button
              type="button"
              data-canvas-edit-trigger="true"
              className="m-0 block w-full cursor-text whitespace-pre-wrap break-words bg-transparent p-0 text-left text-[var(--ax-text-default)] [appearance:none]"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onStartEditing(id)}
              aria-description="Trykk Enter for å redigere overskriften"
              style={{
                fontSize: `${fontSizePx}px`,
                lineHeight: 1.05,
                fontWeight: 700,
              }}
            >
              {headingContent}
            </button>
          )}
        </h3>
      ) : (
        <h2 className="m-0">
          {isInteractionLocked ? (
            <span
              className="block w-full whitespace-pre-wrap break-words bg-transparent p-0 text-left text-[var(--ax-text-default)]"
              style={{
                fontSize: `${fontSizePx}px`,
                lineHeight: 1.05,
                fontWeight: 700,
              }}
            >
              {headingContent}
            </span>
          ) : (
            <button
              type="button"
              data-canvas-edit-trigger="true"
              className="m-0 block w-full cursor-text whitespace-pre-wrap break-words bg-transparent p-0 text-left text-[var(--ax-text-default)] [appearance:none]"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onStartEditing(id)}
              aria-description="Trykk Enter for å redigere overskriften"
              style={{
                fontSize: `${fontSizePx}px`,
                lineHeight: 1.05,
                fontWeight: 700,
              }}
            >
              {headingContent}
            </button>
          )}
        </h2>
      )}
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} />}
    </div>
  )
}

export default CanvasHeadingFrame
