import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'

type CanvasHeadingFrameProps = {
  id: string
  headingText?: string
  label: string
  fontSizePx: number
  headingLevel?: 2 | 3 | 4
  isEditing: boolean
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
  isLockedByOther = false,
  lockOwnerLabel = null,
  onChange,
  onBlur,
  onStartEditing,
}: CanvasHeadingFrameProps) => {
  const headingContent = headingText || label || 'Skriv overskrift'

  if (isEditing) {
    return (
      <div className="overflow-visible px-4 py-2">
        <textarea
          value={headingText || ''}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          lang="nb-NO"
          placeholder="Skriv overskrift"
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
        <h4
          className="m-0 cursor-text select-text whitespace-pre-wrap break-words text-[var(--ax-text-default)]"
          onClick={() => onStartEditing(id)}
          style={{
            fontSize: `${fontSizePx}px`,
            lineHeight: 1.05,
            fontWeight: 700,
          }}
        >
          {headingContent}
        </h4>
      ) : headingLevel === 3 ? (
        <h3
          className="m-0 cursor-text select-text whitespace-pre-wrap break-words text-[var(--ax-text-default)]"
          onClick={() => onStartEditing(id)}
          style={{
            fontSize: `${fontSizePx}px`,
            lineHeight: 1.05,
            fontWeight: 700,
          }}
        >
          {headingContent}
        </h3>
      ) : (
        <h2
          className="m-0 cursor-text select-text whitespace-pre-wrap break-words text-[var(--ax-text-default)]"
          onClick={() => onStartEditing(id)}
          style={{
            fontSize: `${fontSizePx}px`,
            lineHeight: 1.05,
            fontWeight: 700,
          }}
        >
          {headingContent}
        </h2>
      )}
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} />}
    </div>
  )
}

export default CanvasHeadingFrame
