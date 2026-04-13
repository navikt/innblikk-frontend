import CanvasEditLockOverlay from '../controls/CanvasEditLockOverlay.tsx'

type CanvasHeadingFrameProps = {
  id: string
  headingText?: string
  label: string
  fontSizePx: number
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
  isEditing,
  isLockedByOther = false,
  lockOwnerLabel = null,
  onChange,
  onBlur,
  onStartEditing,
}: CanvasHeadingFrameProps) => {
  if (isEditing) {
    return (
      <div className="overflow-visible bg-transparent dark:bg-transparent px-4 py-2">
        <textarea
          value={headingText || ''}
          onChange={(event) => onChange(id, event.target.value)}
          onBlur={() => onBlur(id)}
          onMouseDown={(event) => event.stopPropagation()}
          lang="nb-NO"
          placeholder="Skriv overskrift"
          className="block w-full resize-none overflow-hidden border-none bg-transparent p-0 text-slate-900 dark:text-white outline-none placeholder:text-slate-500 dark:placeholder:text-slate-400 [font-family:inherit]"
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
    <div className="relative overflow-visible bg-transparent dark:bg-transparent px-4 py-2">
      <h2
        className="m-0 cursor-text select-text whitespace-pre-wrap break-words text-slate-900 dark:text-white"
        onClick={() => onStartEditing(id)}
        style={{
          fontSize: `${fontSizePx}px`,
          lineHeight: 1.05,
          fontWeight: 700,
        }}
      >
        {headingText || label || 'Skriv overskrift'}
      </h2>
      {isLockedByOther && <CanvasEditLockOverlay ownerLabel={lockOwnerLabel} />}
    </div>
  )
}

export default CanvasHeadingFrame
